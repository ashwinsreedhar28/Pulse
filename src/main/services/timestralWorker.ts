// Long-lived Python worker (scripts/timestral_worker.py) for BigQuery news
// volume and, later, Timestral forecasts. JSON lines over stdio; one request
// at a time on the Python side. Spawned lazily, respawned after an exit.
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { createInterface } from 'readline'
import { app } from 'electron'

export function timestralPython(): string {
  return process.env.PULSE_TIMESTRAL_PYTHON || join(homedir(), '.venvs', 'timestral', 'bin', 'python')
}

function workerScript(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'scripts', 'timestral_worker.py')
    : join(app.getAppPath(), 'scripts', 'timestral_worker.py')
}

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

let child: ChildProcessWithoutNullStreams | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function ensureWorker(): ChildProcessWithoutNullStreams {
  if (child && child.exitCode === null && !child.killed) return child
  const py = timestralPython()
  const script = workerScript()
  if (!existsSync(py)) throw new Error(`Timestral Python not found at ${py} (set PULSE_TIMESTRAL_PYTHON)`)
  if (!existsSync(script)) throw new Error(`Timestral worker script not found at ${script}`)
  const c = spawn(py, ['-u', script], { stdio: ['pipe', 'pipe', 'pipe'] })
  createInterface({ input: c.stdout }).on('line', (line) => {
    let msg: { id?: number; ok?: boolean; result?: unknown; error?: string }
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    const id = msg.id
    const p = typeof id === 'number' ? pending.get(id) : undefined
    if (!p || typeof id !== 'number') return
    pending.delete(id)
    clearTimeout(p.timer)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.error ?? 'worker error'))
  })
  createInterface({ input: c.stderr }).on('line', (line) => console.warn('[timestral-worker]', line))
  c.on('exit', (code) => {
    for (const [id, p] of pending) {
      clearTimeout(p.timer)
      p.reject(new Error(`timestral worker exited (${code})`))
      pending.delete(id)
    }
    if (child === c) child = null
  })
  child = c
  return c
}

export function callWorker<T>(op: string, params: Record<string, unknown>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let c: ChildProcessWithoutNullStreams
    try {
      c = ensureWorker()
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
      return
    }
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`timestral worker ${op} timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
    c.stdin.write(JSON.stringify({ id, op, ...params }) + '\n')
  })
}

export function stopTimestralWorker(): void {
  if (child) {
    child.kill()
    child = null
  }
}
