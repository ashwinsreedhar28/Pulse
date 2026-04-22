// User-facing configuration stored as a versioned JSON file under userData.
// This is separate from the sqlite `preferences` table — that holds internal
// app state (polling intervals, cache hints, TTS voice), while this file is
// the user's portable feature-level preferences that Hyperintelligence will
// eventually mutate via chat. Exporting/importing moves this file only.
//
// Invariants:
//   - Atomic writes (write-to-tmp + rename) so partial failures can't leave
//     the renderer or Hyperintelligence reading a half-written file.
//   - Reads always merge the loaded file over CURRENT_DEFAULTS so adding a
//     new field in a later slice doesn't require a migration script; missing
//     fields silently fill in with defaults.
//   - The `version` field is reserved — if we ever need a true migration
//     (renamed field, structural change), bump it and gate on the old value.

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const CONFIG_VERSION = 1
export const CONFIG_FILENAME = 'pulse-preferences.json'

export type CalendarEventKindId =
  | 'earnings'
  | 'games'
  | 'launches'
  | 'dividends'
  | 'ipos'
  | 'stockSplits'
  | 'fedMeetings'
  | 'econReleases'
  | 'worldEvents'

export interface CalendarEventKindConfig {
  enabled: boolean
}

export interface PulseConfig {
  version: number
  calendar: {
    windowDays: number
    eventKinds: Record<CalendarEventKindId, CalendarEventKindConfig>
  }
}

// Defaults: the three original kinds + fedMeetings start ON because they are
// low-volume and high-signal. Dividends, IPOs, splits, and general econ
// releases default OFF so the strip doesn't overflow for a fresh install.
const DEFAULTS: PulseConfig = {
  version: CONFIG_VERSION,
  calendar: {
    windowDays: 7,
    eventKinds: {
      earnings: { enabled: true },
      games: { enabled: true },
      launches: { enabled: true },
      dividends: { enabled: false },
      ipos: { enabled: false },
      stockSplits: { enabled: false },
      fedMeetings: { enabled: true },
      econReleases: { enabled: false },
      worldEvents: { enabled: true }
    }
  }
}

function configPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILENAME)
}

let cached: PulseConfig | null = null
let writeLock: Promise<void> = Promise.resolve()

// Shallow-merge any subset onto defaults so files written by older versions
// of the app still parse cleanly. Does not deep-merge arbitrary objects —
// only the fields we know about are pulled through.
function normalize(raw: unknown): PulseConfig {
  const base: PulseConfig = {
    version: CONFIG_VERSION,
    calendar: {
      windowDays: DEFAULTS.calendar.windowDays,
      eventKinds: { ...DEFAULTS.calendar.eventKinds }
    }
  }
  if (!raw || typeof raw !== 'object') return base
  const src = raw as Partial<PulseConfig>
  if (src.calendar && typeof src.calendar === 'object') {
    if (typeof src.calendar.windowDays === 'number' && Number.isFinite(src.calendar.windowDays)) {
      base.calendar.windowDays = Math.max(1, Math.min(30, Math.floor(src.calendar.windowDays)))
    }
    if (src.calendar.eventKinds && typeof src.calendar.eventKinds === 'object') {
      for (const key of Object.keys(base.calendar.eventKinds) as CalendarEventKindId[]) {
        const incoming = (src.calendar.eventKinds as Record<string, unknown>)[key]
        if (incoming && typeof incoming === 'object') {
          const enabled = (incoming as { enabled?: unknown }).enabled
          if (typeof enabled === 'boolean') {
            base.calendar.eventKinds[key] = { enabled }
          }
        }
      }
    }
  }
  return base
}

async function readFromDisk(): Promise<PulseConfig> {
  try {
    const raw = await fs.readFile(configPath(), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    return normalize(parsed)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // First launch — write defaults so the file is discoverable for
      // manual inspection and Hyperintelligence has something to read.
      await writeToDiskAtomic(DEFAULTS)
      return { ...DEFAULTS, calendar: structuredClone(DEFAULTS.calendar) }
    }
    console.warn(
      '[config] read failed, falling back to defaults:',
      err instanceof Error ? err.message : err
    )
    return { ...DEFAULTS, calendar: structuredClone(DEFAULTS.calendar) }
  }
}

async function writeToDiskAtomic(config: PulseConfig): Promise<void> {
  const target = configPath()
  const tmp = target + '.tmp'
  const payload = JSON.stringify(config, null, 2)
  await fs.writeFile(tmp, payload, 'utf-8')
  await fs.rename(tmp, target)
}

export async function loadConfig(): Promise<PulseConfig> {
  if (cached) return cached
  cached = await readFromDisk()
  return cached
}

// Replaces the entire calendar.eventKinds map or individual fields — the
// caller sends a sparse patch; we merge onto the current config and persist.
export interface ConfigPatch {
  calendar?: {
    windowDays?: number
    eventKinds?: Partial<Record<CalendarEventKindId, { enabled: boolean }>>
  }
}

export async function updateConfig(patch: ConfigPatch): Promise<PulseConfig> {
  const current = await loadConfig()
  const next: PulseConfig = {
    version: CONFIG_VERSION,
    calendar: {
      windowDays: current.calendar.windowDays,
      eventKinds: { ...current.calendar.eventKinds }
    }
  }
  if (patch.calendar) {
    if (
      typeof patch.calendar.windowDays === 'number' &&
      Number.isFinite(patch.calendar.windowDays)
    ) {
      next.calendar.windowDays = Math.max(
        1,
        Math.min(30, Math.floor(patch.calendar.windowDays))
      )
    }
    if (patch.calendar.eventKinds) {
      for (const key of Object.keys(next.calendar.eventKinds) as CalendarEventKindId[]) {
        const incoming = patch.calendar.eventKinds[key]
        if (incoming && typeof incoming.enabled === 'boolean') {
          next.calendar.eventKinds[key] = { enabled: incoming.enabled }
        }
      }
    }
  }
  // Serialize writes so two rapid updates can't race to the same tmp file.
  writeLock = writeLock.then(() => writeToDiskAtomic(next)).catch((err) => {
    console.warn('[config] write failed:', err instanceof Error ? err.message : err)
  })
  await writeLock
  cached = next
  return next
}

export async function exportConfigTo(destPath: string): Promise<void> {
  const current = await loadConfig()
  const payload = JSON.stringify(current, null, 2)
  await fs.writeFile(destPath, payload, 'utf-8')
}

export async function importConfigFrom(srcPath: string): Promise<PulseConfig> {
  const raw = await fs.readFile(srcPath, 'utf-8')
  const parsed = JSON.parse(raw) as unknown
  const next = normalize(parsed)
  writeLock = writeLock.then(() => writeToDiskAtomic(next)).catch((err) => {
    console.warn('[config] import write failed:', err instanceof Error ? err.message : err)
  })
  await writeLock
  cached = next
  return next
}
