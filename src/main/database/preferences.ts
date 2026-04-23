import { getDb } from './connection'

export type TtsEngine = 'kokoro' | 'piper' | 'say'
export type Theme = 'system' | 'default' | 'light' | 'fiesta' | 'zazu' | 'ocean' | 'casino'

export const THEME_CHOICES: Theme[] = ['system', 'default', 'light', 'fiesta', 'zazu', 'ocean', 'casino']

export interface Preferences {
  pollIntervalMin: number
  digestIntervalMin: number
  quietHoursStart: string
  quietHoursEnd: string
  quietHoursEnabled: boolean
  launchAtLogin: boolean
  density: 'compact' | 'comfortable'
  favoriteTeamAlertsEnabled: boolean
  ttsEngine: TtsEngine
  ttsVoice: string
  theme: Theme
  mediaPipelineEnabled: boolean
}

const DEFAULTS: Preferences = {
  pollIntervalMin: 5,
  digestIntervalMin: 30,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  quietHoursEnabled: false,
  launchAtLogin: false,
  density: 'comfortable',
  favoriteTeamAlertsEnabled: true,
  ttsEngine: 'kokoro',
  ttsVoice: 'am_michael',
  theme: 'default',
  mediaPipelineEnabled: true
}

export function getPreferences(): Preferences {
  const db = getDb()
  const rows = db
    .prepare<[], { key: string; value: string }>(`SELECT key, value FROM preferences`)
    .all()
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    pollIntervalMin: clamp(Number(map.get('pollIntervalMin') ?? DEFAULTS.pollIntervalMin), 1, 60),
    digestIntervalMin: clamp(Number(map.get('digestIntervalMin') ?? DEFAULTS.digestIntervalMin), 5, 120),
    quietHoursStart: map.get('quietHoursStart') ?? DEFAULTS.quietHoursStart,
    quietHoursEnd: map.get('quietHoursEnd') ?? DEFAULTS.quietHoursEnd,
    quietHoursEnabled: map.get('quietHoursEnabled') === 'true',
    launchAtLogin: map.get('launchAtLogin') === 'true',
    density: (map.get('density') as Preferences['density']) ?? DEFAULTS.density,
    favoriteTeamAlertsEnabled:
      map.get('favoriteTeamAlertsEnabled') === undefined
        ? DEFAULTS.favoriteTeamAlertsEnabled
        : map.get('favoriteTeamAlertsEnabled') === 'true',
    ttsEngine: normalizeEngine(map.get('ttsEngine')),
    ttsVoice: map.get('ttsVoice') ?? DEFAULTS.ttsVoice,
    theme: normalizeTheme(map.get('theme')),
    mediaPipelineEnabled:
      map.get('mediaPipelineEnabled') === undefined
        ? DEFAULTS.mediaPipelineEnabled
        : map.get('mediaPipelineEnabled') === 'true'
  }
}

function normalizeEngine(raw: string | undefined): TtsEngine {
  if (raw === 'kokoro' || raw === 'piper' || raw === 'say') return raw
  return DEFAULTS.ttsEngine
}

function normalizeTheme(raw: string | undefined): Theme {
  if (raw && (THEME_CHOICES as string[]).includes(raw)) return raw as Theme
  return DEFAULTS.theme
}

export function setPreference(key: keyof Preferences, value: string | number | boolean): void {
  getDb()
    .prepare(`INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)`)
    .run(key, String(value))
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min))
}
