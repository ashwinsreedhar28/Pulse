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
  // FRED (Federal Reserve Economic Data) API key. Free tier, no charges,
  // ~120 requests/min — plenty for our 9-series daily refresh. Empty
  // string disables the macro panel (renders an "add key in Settings"
  // hint instead of empty data).
  fredApiKey: string
  // Notification system (Phase 1+ — central dispatcher with dedup/cap).
  // Total daily cap across ALL categories. Default 5 keeps notifications
  // signal-only on first run; user can crank up in Settings.
  notificationDailyCap: number
  // Per-category enable flags. Disabling a category stops the dispatcher
  // from firing OS notifications for that source — the source still runs
  // (it might be needed for other features) but its notify call is a no-op.
  notifyArticlesEnabled: boolean
  notifyStocksEnabled: boolean // covers price moves + analyst alerts (Phase 2)
  notifySportsEnabled: boolean // covers HRs / goals / NBA milestones (Phase 3)
  notifyFilingsEnabled: boolean // covers SEC 8-K / Form 4 (Phase 4)
  notifyMacroEnabled: boolean // VIX spike / DGS10 moves (Phase 4)
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
  anthropicApiKey: '',
  fredApiKey: '',
  notificationDailyCap: 5,
  notifyArticlesEnabled: true,
  notifyStocksEnabled: true,
  notifySportsEnabled: true,
  notifyFilingsEnabled: true,
  notifyMacroEnabled: true
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
    anthropicApiKey: (map.get('anthropicApiKey') ?? DEFAULTS.anthropicApiKey).trim(),
    fredApiKey: (map.get('fredApiKey') ?? DEFAULTS.fredApiKey).trim(),
    // Notification preferences. Booleans default to true so existing users
    // don't silently lose notifications when these keys land. Cap clamps
    // 0..50 — 0 disables notifications entirely without needing a master
    // toggle, 50 caps a single very-noisy day.
    notificationDailyCap: clamp(
      Number(map.get('notificationDailyCap') ?? DEFAULTS.notificationDailyCap),
      0,
      50
    ),
    notifyArticlesEnabled: boolPref(map.get('notifyArticlesEnabled'), DEFAULTS.notifyArticlesEnabled),
    notifyStocksEnabled: boolPref(map.get('notifyStocksEnabled'), DEFAULTS.notifyStocksEnabled),
    notifySportsEnabled: boolPref(map.get('notifySportsEnabled'), DEFAULTS.notifySportsEnabled),
    notifyFilingsEnabled: boolPref(map.get('notifyFilingsEnabled'), DEFAULTS.notifyFilingsEnabled),
    notifyMacroEnabled: boolPref(map.get('notifyMacroEnabled'), DEFAULTS.notifyMacroEnabled)
  }
}

function boolPref(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback
  return raw === 'true'
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

// Allowed preference keys, derived from DEFAULTS so this stays in sync as
// new preferences are added. The `preferences` table is shared with internal
// counters (e.g. _claudeUsageDate / _claudeUsageCount via getClaudeUsageState)
// that MUST NOT be writable from the renderer; the whitelist gates that.
export const PREFERENCE_KEYS: ReadonlySet<keyof Preferences> = new Set(
  Object.keys(DEFAULTS) as Array<keyof Preferences>
)

export function isPreferenceKey(key: string): key is keyof Preferences {
  return PREFERENCE_KEYS.has(key as keyof Preferences)
}

export function setPreference(key: keyof Preferences, value: string | number | boolean): void {
  // Enforce the whitelist at the writer boundary — defense against any
  // caller (renderer-bridged or future internal) that fabricates a key
  // outside the typed surface. Internal counters use their own bespoke
  // setters (setClaudeUsageState etc.), not this one.
  if (!isPreferenceKey(key)) {
    throw new Error(`setPreference: unknown key "${key}"`)
  }
  getDb()
    .prepare(`INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)`)
    .run(key, String(value))
}

// Claude daily-call counter persistence. Kept out of the Preferences interface
// because it's internal usage-tracking state, not a user-tunable setting.
// Uses the same key-value `preferences` table so no schema migration is
// needed. Date format: 'YYYY-MM-DD' (UTC).
export interface ClaudeUsageState {
  date: string
  count: number
}

export function getClaudeUsageState(): ClaudeUsageState | null {
  const db = getDb()
  const rows = db
    .prepare<[], { key: string; value: string }>(
      `SELECT key, value FROM preferences WHERE key IN ('_claudeUsageDate', '_claudeUsageCount')`
    )
    .all()
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const date = map.get('_claudeUsageDate')
  const countRaw = map.get('_claudeUsageCount')
  if (!date || countRaw === undefined) return null
  const count = Number(countRaw)
  if (!Number.isFinite(count) || count < 0) return null
  return { date, count: Math.floor(count) }
}

export function setClaudeUsageState(state: ClaudeUsageState): void {
  const db = getDb()
  const stmt = db.prepare(`INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)`)
  const tx = db.transaction(() => {
    stmt.run('_claudeUsageDate', state.date)
    stmt.run('_claudeUsageCount', String(state.count))
  })
  tx()
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min))
}
