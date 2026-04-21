import { app, BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

// Manages the Python Kokoro TTS worker. Mirrors the lifecycle of
// videoGenService — spawn on launch, health-poll until ready, kill on quit.
// Kokoro-82M is CPU-bound so it doesn't compete with SDXL-Turbo on MPS.

const WORKER_PORT = 5112
const WORKER_HOST = '127.0.0.1'
const BASE_URL = `http://${WORKER_HOST}:${WORKER_PORT}`

// Pinned so `pip install` is reproducible. numpy<2 matches the videoGen venv
// convention; phonemizer pulls espeak-ng at runtime but is pulled transitively
// by kokoro so we don't list it here.
const PY_DEPS = ['numpy<2', 'soundfile==0.12.1', 'kokoro==0.9.4']

// Curated set of Kokoro voices tuned for news narration. Kokoro ships more,
// but these are the ones that read long editorial copy without artifacts.
// Prefix: a = American English, b = British English; f = female, m = male.
export const KOKORO_VOICES = [
  { id: 'af_heart', label: 'Heart — warm American female (default)' },
  { id: 'af_bella', label: 'Bella — bright American female' },
  { id: 'af_nicole', label: 'Nicole — measured American female' },
  { id: 'af_sarah', label: 'Sarah — crisp American female' },
  { id: 'af_sky', label: 'Sky — airy American female' },
  { id: 'am_adam', label: 'Adam — neutral American male' },
  { id: 'am_michael', label: 'Michael — anchor-style American male' },
  { id: 'am_puck', label: 'Puck — expressive American male' },
  { id: 'am_onyx', label: 'Onyx — deep American male' },
  { id: 'am_fenrir', label: 'Fenrir — gravelly American male' },
  { id: 'bf_emma', label: 'Emma — poised British female' },
  { id: 'bf_isabella', label: 'Isabella — rich British female' },
  { id: 'bf_alice', label: 'Alice — youthful British female' },
  { id: 'bm_george', label: 'George — classic British male' },
  { id: 'bm_daniel', label: 'Daniel — reporter-style British male' },
  { id: 'bm_fable', label: 'Fable — storyteller British male' }
] as const

export type KokoroVoiceId = (typeof KOKORO_VOICES)[number]['id']

export type KokoroStatus =
  | { state: 'idle' }
  | { state: 'unsupported'; reason: string }
  | { state: 'checking-python' }
  | { state: 'creating-venv' }
  | { state: 'installing-deps'; line?: string }
  | { state: 'starting-worker' }
  | { state: 'loading-model' }
  // 'warming-model' runs a throwaway synthesis to force HuggingFace to cache
  // the weights on disk so the first real request doesn't cold-start.
  | { state: 'warming-model' }
  | { state: 'ready' }
  | { state: 'failed'; reason: string }

let status: KokoroStatus = { state: 'idle' }
let setupPromise: Promise<boolean> | null = null
let worker: ChildProcess | null = null
let workerExitHandled = false
let shuttingDown = false
let workerRestartAttempts = 0
const MAX_WORKER_RESTARTS = 2
let everReady = false
const readyListeners = new Set<() => void>()

function setStatus(next: KokoroStatus): void {
  const prev = status
  const wasBusy = isKokoroBusy()
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('kokoro:status', status)
  }
  if (next.state === 'ready' && prev.state !== 'ready') {
    everReady = true
    for (const cb of readyListeners) {
      try {
        cb()
      } catch (err) {
        console.warn('[kokoro] ready listener threw:', err)
      }
    }
  }
  if (wasBusy && !isKokoroBusy()) {
    for (const cb of Array.from(settleListeners)) {
      settleListeners.delete(cb)
      try {
        cb()
      } catch (err) {
        console.warn('[kokoro] settle listener threw:', err)
      }
    }
  }
}

const settleListeners = new Set<() => void>()
// Fires once when Kokoro transitions out of a busy state (reaches
// ready / failed / unsupported / idle). Feed poller subscribes so it can
// run a deferred first poll as soon as cold start finishes.
export function onKokoroSettled(cb: () => void): () => void {
  if (!isKokoroBusy()) {
    queueMicrotask(cb)
    return () => undefined
  }
  settleListeners.add(cb)
  return () => {
    settleListeners.delete(cb)
  }
}

// Called by reelService so it can wait before falling back to Piper and so it
// can rebuild earlier reels once Kokoro comes online after the first batch.
export function onKokoroReady(cb: () => void): () => void {
  readyListeners.add(cb)
  if (status.state === 'ready') {
    queueMicrotask(cb)
  }
  return () => {
    readyListeners.delete(cb)
  }
}

export function hasKokoroBeenReady(): boolean {
  return everReady
}

export async function waitForKokoroReady(timeoutMs: number): Promise<boolean> {
  if (status.state === 'ready') return true
  if (status.state === 'failed' || status.state === 'unsupported') return false
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const unsub = onKokoroReady(() => {
      unsub()
      clearTimeout(timer)
      resolve(true)
    })
    const timer = setTimeout(() => {
      unsub()
      resolve(status.state === 'ready')
    }, Math.max(0, deadline - Date.now()))
  })
}

export function getKokoroStatus(): KokoroStatus {
  return status
}

export function isKokoroReady(): boolean {
  return status.state === 'ready'
}

// True while Kokoro is actively installing deps, loading the worker, or
// warming the model. Used by the feed poller to yield I/O during heavy
// cold-start work.
export function isKokoroBusy(): boolean {
  switch (status.state) {
    case 'checking-python':
    case 'creating-venv':
    case 'installing-deps':
    case 'starting-worker':
    case 'loading-model':
    case 'warming-model':
      return true
    default:
      return false
  }
}

function envRoot(): string {
  return join(app.getPath('userData'), 'kokoro-env')
}
function venvPy(): string {
  return join(envRoot(), 'bin', 'python3')
}
function venvPip(): string {
  return join(envRoot(), 'bin', 'pip')
}
function depsSentinel(): string {
  return join(envRoot(), '.deps_ok.v1')
}
function workerScript(): string {
  if (!app.isPackaged) {
    return join(app.getAppPath(), 'scripts', 'reels_kokoro_worker.py')
  }
  return join(process.resourcesPath, 'scripts', 'reels_kokoro_worker.py')
}

// Kokoro requires Python ≥3.10 and currently publishes wheels for 3.10-3.12
// only. The macOS Command Line Tools Python is 3.9, and Homebrew's
// `/opt/homebrew/bin/python3` can symlink to a different version depending on
// what the user installed last — so we can't trust a candidate by path alone.
// Probe each one and pick the first that falls inside the supported range.
const PY_MIN_MAJOR = 3
const PY_MIN_MINOR = 10
const PY_MAX_MINOR = 12

function probePythonVersion(bin: string): Promise<[number, number] | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, ['-c', 'import sys;print(sys.version_info.major,sys.version_info.minor)'], {
      stdio: ['ignore', 'pipe', 'ignore']
    })
    let out = ''
    child.stdout?.on('data', (d) => {
      out += d.toString()
    })
    child.on('close', () => {
      const m = out.trim().split(/\s+/)
      const maj = Number(m[0])
      const min = Number(m[1])
      if (!Number.isFinite(maj) || !Number.isFinite(min)) return resolve(null)
      resolve([maj, min])
    })
    child.on('error', () => resolve(null))
    setTimeout(() => {
      child.kill('SIGKILL')
      resolve(null)
    }, 3_000)
  })
}

async function detectSystemPython(): Promise<string | null> {
  const candidates = [
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3.11',
    '/opt/homebrew/bin/python3.10',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3.12',
    '/usr/local/bin/python3.11',
    '/usr/local/bin/python3.10',
    '/usr/local/bin/python3'
  ]
  for (const c of candidates) {
    if (!existsSync(c)) continue
    const version = await probePythonVersion(c)
    if (!version) continue
    const [maj, min] = version
    if (maj !== PY_MIN_MAJOR) continue
    if (min < PY_MIN_MINOR || min > PY_MAX_MINOR) continue
    console.log(`[kokoro] using ${c} (python ${maj}.${min})`)
    return c
  }
  return null
}

function runStreaming(
  cmd: string,
  args: string[],
  onLine: (line: string) => void,
  timeoutMs = 15 * 60_000
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const push = (buf: Buffer): void => {
      for (const line of buf.toString().split('\n')) {
        if (line.trim()) onLine(line.trim())
      }
    }
    child.stdout?.on('data', push)
    child.stderr?.on('data', push)
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code ?? -1)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(-1)
    })
  })
}

async function createVenv(systemPython: string): Promise<boolean> {
  setStatus({ state: 'creating-venv' })
  const code = await runStreaming(systemPython, ['-m', 'venv', envRoot()], () => undefined)
  return code === 0 && existsSync(venvPy())
}

async function installDeps(): Promise<boolean> {
  setStatus({ state: 'installing-deps' })
  const upgrade = await runStreaming(
    venvPip(),
    ['install', '--upgrade', 'pip', 'wheel'],
    (line) => setStatus({ state: 'installing-deps', line })
  )
  if (upgrade !== 0) return false
  const code = await runStreaming(
    venvPip(),
    ['install', ...PY_DEPS],
    (line) => setStatus({ state: 'installing-deps', line })
  )
  if (code !== 0) return false
  await fs.writeFile(depsSentinel(), new Date().toISOString(), 'utf-8')
  return true
}

async function waitForHealth(totalMs = 10 * 60_000): Promise<boolean> {
  const deadline = Date.now() + totalMs
  let firstContact = false
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`)
      if (res.ok) {
        const body = (await res.json()) as { status?: string; error?: string }
        if (!firstContact) {
          firstContact = true
          setStatus({ state: 'loading-model' })
        }
        if (body.status === 'ready') {
          // Caller (spawnWorker) drives the transition to 'ready' via
          // prewarmModel so we only fire ready-listeners once.
          return true
        }
        if (body.status === 'failed') {
          setStatus({ state: 'failed', reason: body.error ?? 'model load failed' })
          return false
        }
      }
    } catch {
      // worker not up yet
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  setStatus({ state: 'failed', reason: 'worker timed out' })
  return false
}

async function spawnWorker(): Promise<boolean> {
  if (worker && !worker.killed) return true
  const py = venvPy()
  const script = workerScript()
  if (!existsSync(py) || !existsSync(script)) {
    setStatus({
      state: 'failed',
      reason: !existsSync(py) ? 'venv python missing' : 'worker script missing'
    })
    return false
  }
  setStatus({ state: 'starting-worker' })
  const child = spawn(py, [script], {
    cwd: envRoot(),
    env: { ...process.env, PULSE_KOKORO_PORT: String(WORKER_PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout?.on('data', (b) => process.stdout.write(`[kokoro] ${b}`))
  child.stderr?.on('data', (b) => process.stderr.write(`[kokoro] ${b}`))
  child.on('exit', (code) => {
    if (workerExitHandled) return
    workerExitHandled = true
    console.warn(`[kokoro] worker exited ${code}`)
    worker = null
    // Auto-restart on unexpected exits (not our own stopKokoro). This handles
    // the case where the worker OOMs mid-batch or python crashes — reels
    // would otherwise fall through to Piper for the rest of the session.
    if (!shuttingDown && workerRestartAttempts < MAX_WORKER_RESTARTS) {
      workerRestartAttempts++
      console.log(
        `[kokoro] restarting worker (attempt ${workerRestartAttempts}/${MAX_WORKER_RESTARTS})`
      )
      setTimeout(() => {
        void (async () => {
          setupPromise = null
          await ensureKokoroReady()
        })()
      }, 2_000)
      return
    }
    if (status.state !== 'failed') {
      setStatus({ state: 'failed', reason: `worker exited (${code})` })
    }
  })
  worker = child
  workerExitHandled = false
  const healthy = await waitForHealth()
  if (healthy) {
    // Reset restart counter on clean ready — subsequent crashes get a fresh budget.
    workerRestartAttempts = 0
    await prewarmModel()
  }
  return healthy
}

// Fire a throwaway synthesis to force HuggingFace to download the Kokoro
// weights and warm the python-side graph. Without this, the first user-facing
// reel generation pays ~20-60s of cold-start while the model streams down.
// We don't fail if this times out — the worker is still usable; the user just
// eats the cold start on their first real request.
async function prewarmModel(): Promise<void> {
  setStatus({ state: 'warming-model' })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180_000)
  try {
    const res = await fetch(`${BASE_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Pulse is ready.', voice: 'am_michael' }),
      signal: controller.signal
    })
    if (res.ok) {
      // Drain body so the worker doesn't keep the connection half-open.
      await res.arrayBuffer().catch(() => undefined)
      console.log('[kokoro] prewarm complete — model weights cached')
    } else {
      console.warn('[kokoro] prewarm returned', res.status)
    }
  } catch (err) {
    console.warn('[kokoro] prewarm skipped:', err instanceof Error ? err.message : err)
  } finally {
    clearTimeout(timer)
    // Whether prewarm succeeded or not, the worker itself is alive. Flipping to
    // 'ready' now unblocks the reel scheduler and the rebuild-on-ready hook.
    setStatus({ state: 'ready' })
  }
}

export function ensureKokoroReady(): Promise<boolean> {
  if (setupPromise && status.state !== 'failed') return setupPromise
  setupPromise = (async () => {
    if (process.platform !== 'darwin') {
      setStatus({ state: 'unsupported', reason: `${process.platform} not supported` })
      return false
    }
    try {
      setStatus({ state: 'checking-python' })
      const sys = await detectSystemPython()
      if (!sys) {
        setStatus({
          state: 'unsupported',
          reason:
            'Python 3.10–3.12 not found. Install via `brew install python@3.12`, then restart Pulse.'
        })
        return false
      }

      if (!existsSync(venvPy())) {
        const ok = await createVenv(sys)
        if (!ok) {
          setStatus({ state: 'failed', reason: 'venv creation failed' })
          return false
        }
      } else {
        console.log('[kokoro] reusing cached venv at', envRoot())
      }

      if (!existsSync(depsSentinel())) {
        const ok = await installDeps()
        if (!ok) {
          setStatus({ state: 'failed', reason: 'dependency install failed' })
          return false
        }
      } else {
        console.log('[kokoro] deps already installed (sentinel present)')
      }

      return spawnWorker()
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setStatus({ state: 'failed', reason })
      return false
    }
  })()
  return setupPromise
}

export function stopKokoro(): void {
  shuttingDown = true
  if (worker && !worker.killed) {
    workerExitHandled = true
    worker.kill('SIGTERM')
    worker = null
  }
  setupPromise = null
  if (status.state === 'ready') setStatus({ state: 'idle' })
}

async function attemptSynthesis(text: string, outWav: string, voice: string): Promise<boolean> {
  // 60s gives long scripts headroom on cold pipeline while still catching hangs.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const res = await fetch(`${BASE_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
      signal: controller.signal
    })
    if (!res.ok) {
      console.warn('[kokoro] tts failed:', res.status, await res.text().catch(() => ''))
      return false
    }
    // Guard against the worker returning JSON error bodies with 200 by checking
    // the content-type. Anything other than audio/wav is a malformed response
    // and we'd rather fall through than write garbage bytes to disk.
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('audio/')) {
      console.warn('[kokoro] unexpected content-type:', contentType)
      return false
    }
    const buf = Buffer.from(await res.arrayBuffer())
    // A real WAV starts with RIFF/WAVE and is ~30 KB+ for even short narration.
    // Reject short/empty payloads explicitly so downstream afconvert doesn't
    // produce a valid-looking but silent m4a.
    if (buf.length < 4_000 || buf.slice(0, 4).toString('ascii') !== 'RIFF') {
      console.warn('[kokoro] payload failed WAV sanity check:', buf.length, 'bytes')
      return false
    }
    await fs.writeFile(outWav, buf)
    return true
  } catch (err) {
    console.warn('[kokoro] tts error:', err instanceof Error ? err.message : err)
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function synthesizeWithKokoro(
  text: string,
  outWav: string,
  voice: string
): Promise<boolean> {
  if (!isKokoroReady()) return false
  // One retry with a short backoff handles transient worker stalls (GC pauses,
  // brief socket resets) without blowing up into a long fallback chain. If the
  // worker is genuinely wedged the auto-restart on exit will pick it up.
  if (await attemptSynthesis(text, outWav, voice)) return true
  if (!isKokoroReady()) return false
  await new Promise((r) => setTimeout(r, 400))
  return attemptSynthesis(text, outWav, voice)
}
