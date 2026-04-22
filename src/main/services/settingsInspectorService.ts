// Settings descriptor registry — shared between the read-only inspector and
// the write proposer in settingsWriteService. Each descriptor knows:
//   - how the user talks about the setting (keywords)
//   - which Settings tab to deep-link into for manual edits
//   - whether it can be written from Hyperintelligence, and if so the value
//     shape (enum/boolean/number/time) + bounds so we can validate proposals
//     and surface allowed values in rejection messages.
//
// The read path (inspectSettings) was the original Phase-1 feature; the write
// path lives in settingsWriteService and reuses this registry as its source
// of truth so adding a new writable setting is a one-file change.

import { getPreferences } from '../database/preferences'
import { loadConfig } from './configFileService'
import { listFavoriteTeams } from '../database/favoriteTeams'

export type SettingsTab =
  | 'categories'
  | 'feeds'
  | 'tickers'
  | 'locations'
  | 'teams'
  | 'preferences'

export type WritableValueType = 'enum' | 'boolean' | 'number' | 'time'

export interface WritableSchema {
  valueType: WritableValueType
  // For enums: canonical values exactly as stored. For booleans: omit.
  allowedValues?: string[]
  // Accepted aliases per canonical value (lowercased). Used to parse
  // "green" → "fiesta" or "dark" → "default".
  aliases?: Record<string, string[]>
  // For numbers: inclusive bounds + unit hint for display.
  min?: number
  max?: number
  unit?: string
}

export interface SettingsDescriptor {
  key: string
  label: string
  tab: SettingsTab
  // Plain-English keywords to match against the user's question before
  // involving Ollama. Lowercased on both sides for matching.
  keywords: string[]
  // Absent → read-only from Hyperintelligence (Phase 1 behavior). Present →
  // the write proposer can generate a SettingsProposal for this key.
  writable?: WritableSchema
}

export interface SettingsSnapshot {
  descriptor: SettingsDescriptor
  value: string
  note?: string
}

const REGISTRY: SettingsDescriptor[] = [
  {
    key: 'theme',
    label: 'Theme',
    tab: 'preferences',
    keywords: [
      'theme',
      'appearance',
      'dark mode',
      'light mode',
      'color scheme',
      'color',
      'colour',
      'ui color',
      'ui colour',
      'skin',
      'palette'
    ],
    writable: {
      valueType: 'enum',
      allowedValues: ['system', 'default', 'light', 'fiesta', 'zazu', 'ocean', 'casino'],
      // Aliases map color/mode words to the theme whose accent matches. See
      // THEME_OPTIONS in Settings.tsx: fiesta=red, zazu=green, ocean=blue,
      // casino=gold. Keep this table in sync with that swatch list.
      aliases: {
        default: ['dark', 'dark mode', 'default dark'],
        light: ['light', 'light mode', 'white', 'bright'],
        system: ['system', 'auto', 'automatic', 'os', 'match system'],
        fiesta: ['fiesta', 'red', 'crimson', 'fire'],
        zazu: ['zazu', 'green', 'jungle', 'lime', 'forest'],
        ocean: ['ocean', 'blue', 'navy', 'water', 'sky'],
        casino: ['casino', 'gold', 'yellow', 'amber', 'black and gold']
      }
    }
  },
  {
    key: 'density',
    label: 'Density',
    tab: 'preferences',
    keywords: ['density', 'compact', 'spacing', 'layout', 'comfortable'],
    writable: {
      valueType: 'enum',
      allowedValues: ['compact', 'comfortable'],
      aliases: {
        compact: ['compact', 'tight', 'dense', 'small'],
        comfortable: ['comfortable', 'cozy', 'roomy', 'spacious', 'default']
      }
    }
  },
  {
    key: 'quietHoursEnabled',
    label: 'Quiet hours',
    tab: 'preferences',
    keywords: ['quiet hours', 'quiet', 'do not disturb', 'dnd', 'notifications at night'],
    writable: { valueType: 'boolean' }
  },
  {
    key: 'pollIntervalMin',
    label: 'Feed poll interval',
    tab: 'preferences',
    keywords: ['poll', 'polling', 'fetch interval', 'refresh rate', 'how often'],
    writable: { valueType: 'number', min: 1, max: 60, unit: 'min' }
  },
  {
    key: 'digestIntervalMin',
    label: 'Digest interval',
    tab: 'preferences',
    keywords: ['digest', 'summary interval'],
    writable: { valueType: 'number', min: 5, max: 120, unit: 'min' }
  },
  {
    key: 'launchAtLogin',
    label: 'Launch at login',
    tab: 'preferences',
    keywords: ['launch at login', 'start at login', 'startup', 'boot', 'autostart'],
    writable: { valueType: 'boolean' }
  },
  {
    key: 'favoriteTeamAlertsEnabled',
    label: 'Favorite-team alerts',
    tab: 'preferences',
    keywords: ['team alerts', 'sports alerts', 'favorite teams', 'game alerts'],
    writable: { valueType: 'boolean' }
  },
  {
    key: 'ttsEngine',
    label: 'Text-to-speech engine',
    tab: 'preferences',
    keywords: ['tts', 'text to speech', 'voice engine', 'narration engine', 'tts engine'],
    writable: {
      valueType: 'enum',
      allowedValues: ['kokoro', 'piper', 'say'],
      aliases: {
        say: ['system', 'macos', 'apple', 'native']
      }
    }
  },
  {
    key: 'ttsVoice',
    label: 'Text-to-speech voice',
    tab: 'preferences',
    keywords: ['voice', 'narration voice', 'tts voice']
  },
  {
    key: 'calendarWindow',
    label: 'Calendar lookahead window',
    tab: 'preferences',
    keywords: ['calendar window', 'calendar days', 'how many days ahead', 'calendar lookahead'],
    writable: { valueType: 'number', min: 1, max: 30, unit: 'days' }
  },
  {
    key: 'calendarKinds',
    label: 'Calendar event kinds',
    tab: 'preferences',
    keywords: [
      'calendar events',
      'event kinds',
      'ipos in calendar',
      'fed meetings in calendar',
      'dividends in calendar',
      'splits in calendar',
      'world events',
      'wikipedia events',
      'news events',
      'significant events'
    ]
  },
  {
    key: 'favoriteTeams',
    label: 'Favorite teams',
    tab: 'teams',
    keywords: ['favorite teams', 'my teams', 'add a team', 'remove a team']
  },
  {
    key: 'feeds',
    label: 'Feeds',
    tab: 'feeds',
    keywords: ['feeds', 'rss feeds', 'subscriptions', 'unsubscribe', 'remove feed', 'add feed']
  },
  {
    key: 'categories',
    label: 'Categories',
    tab: 'categories',
    keywords: ['categories', 'folders', 'rename category']
  },
  {
    key: 'tickers',
    label: 'Watchlist tickers',
    tab: 'tickers',
    keywords: ['tickers', 'watchlist', 'stocks', 'symbols']
  },
  {
    key: 'locations',
    label: 'Geo interests',
    tab: 'locations',
    keywords: ['locations', 'geo', 'geography', 'places', 'cities']
  }
]

// Exposed for settingsWriteService so it doesn't duplicate the registry.
export function getSettingsRegistry(): readonly SettingsDescriptor[] {
  return REGISTRY
}

// Fast keyword preflight. Returns descriptors whose keywords appear in the
// question, sorted by most-specific-first (longer keyword = stronger match).
// If this returns something confident we skip the Ollama routing call.
export function matchSettingsByKeywords(question: string): SettingsDescriptor[] {
  const q = question.toLowerCase()
  const scored: { descriptor: SettingsDescriptor; score: number }[] = []
  for (const desc of REGISTRY) {
    let best = 0
    for (const kw of desc.keywords) {
      if (q.includes(kw)) best = Math.max(best, kw.length)
    }
    if (best > 0) scored.push({ descriptor: desc, score: best })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.descriptor)
}

function formatHHMM(prefHH: string): string {
  return prefHH
}

async function describeSetting(desc: SettingsDescriptor): Promise<SettingsSnapshot> {
  const prefs = getPreferences()
  switch (desc.key) {
    case 'theme':
      return { descriptor: desc, value: prefs.theme }
    case 'density':
      return { descriptor: desc, value: prefs.density }
    case 'quietHoursEnabled':
      return {
        descriptor: desc,
        value: prefs.quietHoursEnabled
          ? `${formatHHMM(prefs.quietHoursStart)} → ${formatHHMM(prefs.quietHoursEnd)}`
          : 'off'
      }
    case 'pollIntervalMin':
      return { descriptor: desc, value: `${prefs.pollIntervalMin} min` }
    case 'digestIntervalMin':
      return { descriptor: desc, value: `${prefs.digestIntervalMin} min` }
    case 'launchAtLogin':
      return { descriptor: desc, value: prefs.launchAtLogin ? 'on' : 'off' }
    case 'favoriteTeamAlertsEnabled':
      return {
        descriptor: desc,
        value: prefs.favoriteTeamAlertsEnabled ? 'on' : 'off'
      }
    case 'ttsEngine':
      return { descriptor: desc, value: prefs.ttsEngine }
    case 'ttsVoice':
      return { descriptor: desc, value: prefs.ttsVoice }
    case 'calendarWindow': {
      const cfg = await loadConfig()
      return { descriptor: desc, value: `${cfg.calendar.windowDays} days` }
    }
    case 'calendarKinds': {
      const cfg = await loadConfig()
      const on = Object.entries(cfg.calendar.eventKinds)
        .filter(([, v]) => v.enabled)
        .map(([k]) => k)
      return {
        descriptor: desc,
        value: on.length > 0 ? on.join(', ') : 'none enabled'
      }
    }
    case 'favoriteTeams': {
      const teams = listFavoriteTeams()
      return {
        descriptor: desc,
        value: teams.length > 0 ? `${teams.length} team${teams.length === 1 ? '' : 's'}` : 'none'
      }
    }
    case 'feeds':
    case 'categories':
    case 'tickers':
    case 'locations':
      return {
        descriptor: desc,
        value: 'managed in Settings',
        note: 'Lists are managed directly in the Settings tab.'
      }
    default:
      return { descriptor: desc, value: 'unknown' }
  }
}

export async function describeSettingForDescriptor(
  desc: SettingsDescriptor
): Promise<SettingsSnapshot> {
  return describeSetting(desc)
}

export interface InspectSettingsResult {
  status: 'ok' | 'no-match'
  question: string
  snapshots: SettingsSnapshot[]
  reply: string
}

export async function inspectSettings(question: string): Promise<InspectSettingsResult> {
  const matches = matchSettingsByKeywords(question)
  if (matches.length === 0) {
    return {
      status: 'no-match',
      question,
      snapshots: [],
      reply:
        "I couldn't tell which preference you meant. Try naming it — e.g. theme, quiet hours, poll interval, calendar events."
    }
  }
  const top = matches.slice(0, 3)
  const snapshots = await Promise.all(top.map(describeSetting))
  const reply =
    snapshots.length === 1
      ? `Your ${snapshots[0].descriptor.label.toLowerCase()} is currently set to **${snapshots[0].value}**. Open Settings to change it.`
      : `Here are the preferences that matched your question. Open Settings to change any of them.`
  return { status: 'ok', question, snapshots, reply }
}
