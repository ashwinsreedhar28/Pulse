import { app, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

// Piper: a free, local neural TTS that produces genuinely human-sounding
// narration. This service downloads the standalone macOS binary and one voice
// model on first run, then exposes a synthesize() call that reelService can
// use in place of macOS `say`.

const PIPER_VERSION = '2023.11.14-2'
const PIPER_RELEASE_BASE = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}`

// Voice chosen for news-anchor cadence. `ryan-high` is a 22kHz male US-English
// voice trained on expressive reading — notably better than the 16kHz medium
// tiers for broadcast-style delivery.
const VOICE_NAME = 'en_US-ryan-high'
const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high'

export type PiperStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'downloading'; pct: number; stage: string }
  | { state: 'extracting' }
  | { state: 'ready' }
  | { state: 'failed'; reason: string }
  | { state: 'unsupported'; reason: string }

let status: PiperStatus = { state: 'idle' }
let setupPromise: Promise<boolean> | null = null

function piperRoot(): string {
  return join(app.getPath('userData'), 'piper')
}
function piperBin(): string {
  return join(piperRoot(), 'piper', 'piper')
}
function voiceDir(): string {
  return join(piperRoot(), 'voices')
}
function voicePath(): string {
  return join(voiceDir(), `${VOICE_NAME}.onnx`)
}
function voiceConfigPath(): string {
  return join(voiceDir(), `${VOICE_NAME}.onnx.json`)
}

export function getPiperStatus(): PiperStatus {
  return status
}

function setStatus(next: PiperStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('piper:status', status)
  }
}

export function isPiperReady(): boolean {
  return (
    status.state === 'ready' &&
    existsSync(piperBin()) &&
    existsSync(voicePath()) &&
    existsSync(voiceConfigPath())
  )
}

function piperReleaseAsset(): string | null {
  const platform = process.platform
  const arch = process.arch
  if (platform !== 'darwin') return null
  if (arch === 'arm64') return 'piper_macos_aarch64.tar.gz'
  if (arch === 'x64') return 'piper_macos_x64.tar.gz'
  return null
}

async function download(url: string, dest: string, stage: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`download ${stage} failed: HTTP ${res.status}`)
  }
  const total = Number(res.headers.get('content-length') ?? '0')
  let received = 0
  await fs.mkdir(join(dest, '..'), { recursive: true })
  const fileStream = createWriteStream(dest)
  const nodeStream = Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>)
  nodeStream.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (total > 0) {
      const pct = Math.min(100, Math.round((received / total) * 100))
      setStatus({ state: 'downloading', pct, stage })
    }
  })
  try {
    await pipeline(nodeStream, fileStream)
  } catch (err) {
    await fs.unlink(dest).catch(() => undefined)
    throw err
  }
  // Validate size if the server told us one. A truncated tarball silently
  // passes pipeline() but blows up tar at extract time, which is what we just
  // got burned by on this machine.
  if (total > 0) {
    const stat = await fs.stat(dest)
    if (stat.size !== total) {
      await fs.unlink(dest).catch(() => undefined)
      throw new Error(
        `download ${stage} truncated: expected ${total} bytes, got ${stat.size}`
      )
    }
  }
}

async function extractTarGz(archive: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const child = spawn('/usr/bin/tar', ['-xzf', archive, '-C', destDir], {
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let err = ''
    child.stderr?.on('data', (d) => {
      err += d.toString()
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar exited ${code}: ${err.slice(0, 200)}`))
    })
    child.on('error', reject)
  })
}

export async function ensurePiperReady(): Promise<boolean> {
  // If a previous attempt failed, allow a fresh retry on the next call
  // rather than returning the cached failed promise forever.
  if (setupPromise && status.state !== 'failed') return setupPromise
  setupPromise = (async () => {
    const asset = piperReleaseAsset()
    if (!asset) {
      setStatus({ state: 'unsupported', reason: `no piper build for ${process.platform}/${process.arch}` })
      return false
    }
    try {
      setStatus({ state: 'checking' })
      await fs.mkdir(piperRoot(), { recursive: true })
      await fs.mkdir(voiceDir(), { recursive: true })

      // 1. Binary
      if (!existsSync(piperBin())) {
        const archive = join(piperRoot(), asset)
        // Always start with a fresh archive — a corrupt/truncated leftover
        // from a failed previous attempt would otherwise trap us in a loop.
        if (existsSync(archive)) {
          await fs.unlink(archive).catch(() => undefined)
        }
        await download(`${PIPER_RELEASE_BASE}/${asset}`, archive, 'piper binary')
        setStatus({ state: 'extracting' })
        try {
          await extractTarGz(archive, piperRoot())
        } catch (err) {
          // Delete the bad archive so a future retry re-downloads from scratch.
          await fs.unlink(archive).catch(() => undefined)
          throw err
        }
        await fs.unlink(archive).catch(() => undefined)
        if (!existsSync(piperBin())) {
          throw new Error('piper binary missing after extract')
        }
        await fs.chmod(piperBin(), 0o755).catch(() => undefined)
      }

      // 2. Voice model
      if (!existsSync(voicePath())) {
        await download(`${VOICE_BASE}/${VOICE_NAME}.onnx`, voicePath(), 'voice model')
      }
      if (!existsSync(voiceConfigPath())) {
        await download(
          `${VOICE_BASE}/${VOICE_NAME}.onnx.json`,
          voiceConfigPath(),
          'voice config'
        )
      }

      setStatus({ state: 'ready' })
      console.log('[piper] ready at', piperBin())
      return true
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.warn('[piper] setup failed:', reason)
      setStatus({ state: 'failed', reason })
      return false
    }
  })()
  return setupPromise
}

export interface PiperSynthesisResult {
  wavPath: string
}

// Synthesize to raw WAV. reelService will run afconvert → M4A afterward.
export async function synthesizeWithPiper(
  text: string,
  outWav: string
): Promise<PiperSynthesisResult | null> {
  if (!isPiperReady()) return null
  return new Promise((resolve) => {
    const child = spawn(
      piperBin(),
      [
        '--model',
        voicePath(),
        '--config',
        voiceConfigPath(),
        '--output_file',
        outWav,
        '--length_scale',
        '1.05',
        '--sentence_silence',
        '0.35'
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    )
    let err = ''
    child.stderr?.on('data', (d) => {
      err += d.toString()
    })
    const timeout = setTimeout(() => child.kill('SIGKILL'), 60_000)
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0 || !existsSync(outWav)) {
        console.warn('[piper] synth failed:', err.slice(0, 200))
        resolve(null)
        return
      }
      resolve({ wavPath: outWav })
    })
    child.on('error', (e) => {
      clearTimeout(timeout)
      console.warn('[piper] spawn error:', e.message)
      resolve(null)
    })
    child.stdin?.end(text)
  })
}
