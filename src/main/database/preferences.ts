import { getDb } from './connection'

export type TtsEngine = 'kokoro' | 'piper' | 'say'
export type Theme = 'system' | 'default' | 'light' | 'fiesta' | 'zazu' | 'ocean' | 'casino'
// AI provider for the Ollama-style prompts. "auto" prefers Claude when an
// API key is set, falls back to local Ollama. "ollama" / "claude" force a
// specific provider — useful for A/B comparison while debugging.
export type AiProvider = 'auto' | 'ollama' | 'claude'

export const THEME_CHOICES: Theme[] = ['system', 'default', 'light', 'fiesta', 'zazu', 'ocean', 'casino']
export const AI_PROVIDER_CHOICES: AiProvider[] = ['auto', 'ollama', 'claude']

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
  // Cloud AI routing. aiProvider drives which model family handles
  // value-chain generation + sector classification; anthropicApiKey stores
  // the user's own key (never shipped, never logged, lives in the local
  // pulse.db). Empty key + provider=claude falls back to ollama with a
  // console warning.
  aiProvider: AiProvider
  anthropicApiKey: string
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
  mediaPipelineEnabled: true,
  aiProvider: 'auto',
  anthropicApiKey: ''
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
        : map.get('mediaPipelineEnabled') === 'true',
    aiProvider: normalizeAiProvider(map.get('aiProvider')),
    anthropicApiKey: (map.get('anthropicApiKey') ?? DEFAULTS.anthropicApiKey).trim()
  }
}

function normalizeAiProvider(raw: string | undefined): AiProvider {
  if (raw === 'auto' || raw === 'ollama' || raw === 'claude') return raw
  return DEFAULTS.aiProvider
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
