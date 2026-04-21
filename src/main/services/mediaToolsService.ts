import { BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

// Ensures `yt-dlp` and `ffmpeg` are available. If Homebrew is present and the
// binaries are missing, install them via `brew install yt-dlp ffmpeg`. Exposes
// a busy/settle pattern that matches kokoroService / videoGenService so the
// feed poller yields during first-run installs.

const BREW_CANDIDATES = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']
const YTDLP_CANDIDATES = [
  '/opt/homebrew/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
  '/opt/homebrew/opt/yt-dlp/bin/yt-dlp'
]
const FFMPEG_CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']
const FFPROBE_CANDIDATES = ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe']

export type MediaToolsStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'installing'; line?: string }
  | { state: 'ready' }
  | { state: 'unavailable'; reason: string }
  | { state: 'failed'; reason: string }

interface ResolvedPaths {
  ytDlp: string
  ffmpeg: string
  ffprobe: string
}

let status: MediaToolsStatus = { state: 'idle' }
let setupPromise: Promise<boolean> | null = null
let resolved: ResolvedPaths | null = null

function setStatus(next: MediaToolsStatus): void {
  const wasBusy = isMediaToolsBusy()
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('mediaTools:status', status)
  }
  if (wasBusy && !isMediaToolsBusy()) fireSettled()
}

export function getMediaToolsStatus(): MediaToolsStatus {
  return status
}

export function isMediaToolsReady(): boolean {
  return status.state === 'ready' && resolved !== null
}

export function isMediaToolsBusy(): boolean {
  return status.state === 'checking' || status.state === 'installing'
}

const settleListeners = new Set<() => void>()
export function onMediaToolsSettled(cb: () => void): () => void {
  if (!isMediaToolsBusy()) {
    queueMicrotask(cb)
    return () => undefined
  }
  settleListeners.add(cb)
  return () => {
    settleListeners.delete(cb)
  }
}
function fireSettled(): void {
  for (const cb of Array.from(settleListeners)) {
    settleListeners.delete(cb)
    try {
      cb()
    } catch (err) {
      console.warn('[mediaTools] settle listener threw:', err)
    }
  }
}

export function getYtDlpPath(): string | null {
  return resolved?.ytDlp ?? null
}
export function getFfmpegPath(): string | null {
  return resolved?.ffmpeg ?? null
}
export function getFfprobePath(): string | null {
  return resolved?.ffprobe ?? null
}

function findExisting(candidates: string[]): string | null {
  for (const p of candidates) if (existsSync(p)) return p
  return null
}

function runStreaming(
  cmd: string,
  args: string[],
  onLine: (line: string) => void,
  timeoutMs: number
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

function resolveAll(): ResolvedPaths | null {
  const ytDlp = findExisting(YTDLP_CANDIDATES)
  const ffmpeg = findExisting(FFMPEG_CANDIDATES)
  const ffprobe = findExisting(FFPROBE_CANDIDATES)
  if (ytDlp && ffmpeg && ffprobe) return { ytDlp, ffmpeg, ffprobe }
  return null
}

export function ensureMediaTools(): Promise<boolean> {
  if (setupPromise) return setupPromise
  setupPromise = (async () => {
    if (process.platform !== 'darwin') {
      setStatus({
        state: 'unavailable',
        reason: `${process.platform} not supported for Homebrew auto-install`
      })
      return false
    }
    setStatus({ state: 'checking' })

    const alreadyThere = resolveAll()
    if (alreadyThere) {
      resolved = alreadyThere
      setStatus({ state: 'ready' })
      return true
    }

    const brew = findExisting(BREW_CANDIDATES)
    if (!brew) {
      setStatus({
        state: 'unavailable',
        reason:
          'Homebrew not found. Install from https://brew.sh, then restart Pulse to enable video clips.'
      })
      return false
    }

    const missing: string[] = []
    if (!findExisting(YTDLP_CANDIDATES)) missing.push('yt-dlp')
    if (!findExisting(FFMPEG_CANDIDATES) || !findExisting(FFPROBE_CANDIDATES)) {
      missing.push('ffmpeg')
    }

    setStatus({ state: 'installing', line: `brew install ${missing.join(' ')}` })
    console.log(`[mediaTools] installing: ${missing.join(' ')}`)
    const code = await runStreaming(
      brew,
      ['install', ...missing],
      (line) => setStatus({ state: 'installing', line }),
      10 * 60_000
    )
    if (code !== 0) {
      setStatus({ state: 'failed', reason: `brew install failed (${code})` })
      return false
    }

    const afterInstall = resolveAll()
    if (!afterInstall) {
      setStatus({
        state: 'failed',
        reason: 'brew install reported success but binaries not found on PATH'
      })
      return false
    }
    resolved = afterInstall
    setStatus({ state: 'ready' })
    return true
  })()
  return setupPromise
}
