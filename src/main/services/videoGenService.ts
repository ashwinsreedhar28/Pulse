import { app, BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

// Manages the Python SDXL-Turbo worker that generates keyframes for reels.
// On app start:
//   1. If a venv exists with required packages, just spawn the worker.
//   2. Otherwise create the venv and install deps in the background. No UI
//      blocking — a small status pill in the Reels panel surfaces progress.
// Image generation is called from reelService at reel-creation time. Missing
// worker → reel falls back to the procedural scene stack.

const WORKER_PORT = 7878
const WORKER_HOST = '127.0.0.1'
const BASE_URL = `http://${WORKER_HOST}:${WORKER_PORT}`

// Pinned versions chosen for MPS + SDXL-Turbo compatibility on Apple Silicon.
// huggingface_hub is pinned below 1.0 for diffusers compat.
// numpy<2 is required because torch 2.2.2 was compiled against NumPy 1.x ABI;
// without this pin, pip pulls numpy 2.x and torch spews "_ARRAY_API not found"
// warnings (and some modules crash outright).
const PY_DEPS = [
  'numpy<2',
  'torch==2.2.2',
  'diffusers==0.27.2',
  'transformers==4.39.3',
  'accelerate==0.29.2',
  'safetensors==0.4.3',
  'huggingface_hub==0.23.5',
  'Pillow==10.3.0'
]

export type VideoGenStatus =
  | { state: 'idle' }
  | { state: 'unsupported'; reason: string }
  | { state: 'checking-python' }
  | { state: 'creating-venv' }
  | { state: 'installing-deps'; line?: string }
  | { state: 'downloading-model'; pct?: number }
  | { state: 'starting-worker' }
  | { state: 'loading-model' }
  | { state: 'ready' }
  | { state: 'failed'; reason: string }

let status: VideoGenStatus = { state: 'idle' }
let setupPromise: Promise<boolean> | null = null
let worker: ChildProcess | null = null
let workerExitHandled = false
// Auto-shutdown timer. Fires 10 min after the last successful /generate and
// releases the ~3GB PyTorch process so it isn't resident when the user isn't
// making reels. Reset on each generate.
const IDLE_SHUTDOWN_MS = 10 * 60 * 1000
let idleShutdownTimer: NodeJS.Timeout | null = null
function bumpIdleShutdown(): void {
  if (idleShutdownTimer) clearTimeout(idleShutdownTimer)
  idleShutdownTimer = setTimeout(() => {
    if (status.state === 'ready') {
      console.log('[videogen] idle shutdown — releasing worker after 10 min')
      stopVideoGen()
    }
  }, IDLE_SHUTDOWN_MS)
}

function setStatus(next: VideoGenStatus): void {
  const wasBusy = isVideoGenBusy()
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('videoGen:status', status)
  }
  if (wasBusy && !isVideoGenBusy()) fireVideoGenSettled()
}

export function getVideoGenStatus(): VideoGenStatus {
  return status
}

export function isVideoGenReady(): boolean {
  return status.state === 'ready'
}

// True while the SDXL worker is setting up: creating a venv, installing pip
// deps, downloading weights, or loading the model. The feed poller checks
// this so it can yield I/O during cold start.
export function isVideoGenBusy(): boolean {
  switch (status.state) {
    case 'checking-python':
    case 'creating-venv':
    case 'installing-deps':
    case 'downloading-model':
    case 'starting-worker':
    case 'loading-model':
      return true
    default:
      return false
  }
}

// Subscribe once; fires when videoGen transitions out of a busy state
// (reaches ready / failed / idle / unsupported). Feed poller uses this to
// run a deferred first poll as soon as cold start settles.
const videoGenSettleListeners = new Set<() => void>()
export function onVideoGenSettled(cb: () => void): () => void {
  if (!isVideoGenBusy()) {
    queueMicrotask(cb)
    return () => undefined
  }
  videoGenSettleListeners.add(cb)
  return () => {
    videoGenSettleListeners.delete(cb)
  }
}
function fireVideoGenSettled(): void {
  for (const cb of Array.from(videoGenSettleListeners)) {
    videoGenSettleListeners.delete(cb)
    try {
      cb()
    } catch (err) {
      console.warn('[videogen] settle listener threw:', err)
    }
  }
}

function envRoot(): string {
  return join(app.getPath('userData'), 'reels-env')
}
function venvPy(): string {
  return join(envRoot(), 'bin', 'python3')
}
function venvPip(): string {
  return join(envRoot(), 'bin', 'pip')
}
// Bump the suffix when PY_DEPS changes so existing installs reinstall.
function depsSentinel(): string {
  return join(envRoot(), '.deps_ok.v2')
}
function workerScript(): string {
  // In dev the script is at repo_root/scripts/reels_video_worker.py. In a
  // packaged build electron-builder should include it via extraResources.
  if (!app.isPackaged) {
    return join(app.getAppPath(), 'scripts', 'reels_video_worker.py')
  }
  return join(process.resourcesPath, 'scripts', 'reels_video_worker.py')
}

// torch 2.2.2 wheels exist for 3.10–3.12 on arm64 macOS but NOT for 3.13.
// `/opt/homebrew/bin/python3` and `/usr/bin/python3` can symlink to 3.9 on
// some machines, which triggers a multiprocessing resource_tracker semaphore
// leak warning on shutdown. Probe each candidate's actual version instead of
// trusting the path.
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

function isSupportedPy(v: [number, number] | null): boolean {
  if (!v) return false
  const [maj, min] = v
  return maj === PY_MIN_MAJOR && min >= PY_MIN_MINOR && min <= PY_MAX_MINOR
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
    '/usr/local/bin/python3',
    '/usr/bin/python3'
  ]
  for (const c of candidates) {
    if (!existsSync(c)) continue
    const v = await probePythonVersion(c)
    if (!isSupportedPy(v)) continue
    console.log(`[videogen] using ${c} (python ${v![0]}.${v![1]})`)
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
  const code = await runStreaming(
    systemPython,
    ['-m', 'venv', envRoot()],
    () => undefined
  )
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
          setStatus({ state: 'ready' })
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
    env: {
      ...process.env,
      PULSE_REELS_PORT: String(WORKER_PORT),
      // Silences the HuggingFace tokenizers fork-after-parallelism warning
      // which is the proximate cause of the "leaked semaphore" message on
      // shutdown with CPython's multiprocessing resource_tracker.
      TOKENIZERS_PARALLELISM: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout?.on('data', (b) => process.stdout.write(`[videogen] ${b}`))
  child.stderr?.on('data', (b) => process.stderr.write(`[videogen] ${b}`))
  child.on('exit', (code) => {
    if (workerExitHandled) return
    workerExitHandled = true
    console.warn(`[videogen] worker exited ${code}`)
    worker = null
    if (status.state !== 'failed') {
      setStatus({ state: 'failed', reason: `worker exited (${code})` })
    }
  })
  worker = child
  workerExitHandled = false
  return waitForHealth()
}

// Install-only path: create the venv and install deps but do not spawn the
// Python worker. Called at app startup so the reels subsystem is ready to
// spin up instantly the first time the user wants one — without keeping a
// 3GB PyTorch process resident for the whole session. Cheap after first run
// (fast-paths once the sentinel and venv exist).
let installPromise: Promise<boolean> | null = null
export function ensureVideoGenInstalled(): Promise<boolean> {
  if (installPromise) return installPromise
  installPromise = (async () => {
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
          reason: 'Python 3 not found. Install via `brew install python@3.11`.'
        })
        return false
      }

      // If a pre-existing venv was built with an unsupported Python (e.g. 3.9
      // from /opt/homebrew/bin/python3 before we added version probing), its
      // multiprocessing resource_tracker leaks semaphores at shutdown. Nuke
      // and rebuild rather than leaving the warning in place.
      if (existsSync(venvPy())) {
        const v = await probePythonVersion(venvPy())
        if (!isSupportedPy(v)) {
          console.warn(
            `[videogen] venv python is ${v ? `${v[0]}.${v[1]}` : 'unknown'}; ` +
              `rebuilding with ${sys}`
          )
          await fs.rm(envRoot(), { recursive: true, force: true })
        }
      }

      if (!existsSync(venvPy())) {
        const ok = await createVenv(sys)
        if (!ok) {
          setStatus({ state: 'failed', reason: 'venv creation failed' })
          return false
        }
      }

      if (!existsSync(depsSentinel())) {
        const ok = await installDeps()
        if (!ok) {
          setStatus({ state: 'failed', reason: 'dependency install failed' })
          return false
        }
      }

      // Install complete; worker stays cold until ensureVideoGenReady().
      setStatus({ state: 'idle' })
      return true
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setStatus({ state: 'failed', reason })
      return false
    }
  })()
  return installPromise
}

export function ensureVideoGenReady(): Promise<boolean> {
  if (setupPromise) return setupPromise
  setupPromise = (async () => {
    const installed = await ensureVideoGenInstalled()
    if (!installed) return false
    // Model weights download happens inside the worker on first /generate —
    // that's when huggingface_hub caches them to ~/.cache/huggingface.
    return spawnWorker()
  })()
  return setupPromise
}

export function stopVideoGen(): void {
  if (worker && !worker.killed) {
    workerExitHandled = true
    worker.kill('SIGTERM')
    worker = null
  }
  setupPromise = null
  if (status.state === 'ready') setStatus({ state: 'idle' })
}

export async function generateKeyframe(
  prompt: string,
  outPath: string,
  seed?: number
): Promise<boolean> {
  // Lazy spawn: if the worker isn't running, start it on first keyframe
  // request. Idempotent — awaits the existing setupPromise if a previous
  // caller already started the spawn. First call on a cold worker will wait
  // for model load (~30s) and weight download on fresh installs.
  if (!isVideoGenReady()) {
    const ok = await ensureVideoGenReady()
    if (!ok || !isVideoGenReady()) return false
  }
  try {
    const res = await fetch(`${BASE_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, seed })
    })
    if (!res.ok) {
      console.warn('[videogen] generate failed:', res.status, await res.text().catch(() => ''))
      return false
    }
    const buf = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(outPath, buf)
    bumpIdleShutdown()
    return true
  } catch (err) {
    console.warn('[videogen] generate error:', err instanceof Error ? err.message : err)
    return false
  }
}
