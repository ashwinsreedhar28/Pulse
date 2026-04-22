// Write-path companion to settingsInspectorService. Given a free-text
// Hyperintelligence message like "change theme to green" or "turn on quiet
// hours", this module:
//   1) parses the instruction into a target phrase + value phrase
//   2) resolves the target to a writable SettingsDescriptor
//   3) validates the value against the descriptor's schema
//   4) returns either a Proposal (caller surfaces an APPLY button), a
//      Rejection (with allowed values for the user), or None (no write
//      intent detected — caller should fall back to the read inspector)
//
// Actual commits are gated behind an explicit applySettingsChange call — we
// never touch state from proposeSettingsChange. The renderer shows the
// before→after diff first and only then calls applySettingsChange.

import {
  describeSettingForDescriptor,
  getSettingsRegistry,
  matchSettingsByKeywords,
  type SettingsDescriptor,
  type SettingsTab,
  type WritableSchema
} from './settingsInspectorService'
import { setPreference, type Preferences } from '../database/preferences'
import { updateConfig } from './configFileService'

export interface SettingsProposalDescriptor {
  key: string
  label: string
  tab: SettingsTab
}

export type SettingsChange =
  | {
      kind: 'pref'
      key: keyof Preferences
      value: string | number | boolean
    }
  | { kind: 'calendarWindow'; days: number }

export interface SettingsProposal {
  descriptor: SettingsProposalDescriptor
  currentValueDisplay: string
  proposedValueDisplay: string
  change: SettingsChange
  reply: string
}

export interface SettingsRejection {
  descriptor: SettingsProposalDescriptor
  requestedValue: string
  reason: string
  allowedValues: string[]
  reply: string
}

export type ProposeResult =
  | { kind: 'proposal'; proposal: SettingsProposal }
  | { kind: 'rejection'; rejection: SettingsRejection }
  | { kind: 'none' }

// ---- Instruction parsing ----

interface ParsedInstruction {
  targetPhrase: string
  valuePhrase: string
}

// "set/change/update/make X to/into/as/be Y"
const SET_TO_PATTERN =
  /\b(?:set|change|update|make|switch|put|adjust)\s+(?:my\s+|the\s+)?(.+?)\s+(?:to|into|=|:|as|be|become)\s+(.+?)[.?!]?$/i

// "turn on/off X"
const TURN_ON_OFF_PATTERN = /\bturn\s+(on|off)\s+(?:my\s+|the\s+)?(.+?)[.?!]?$/i

// "enable/disable/activate/deactivate X"
const ENABLE_DISABLE_PATTERN =
  /\b(enable|disable|activate|deactivate)\s+(?:my\s+|the\s+)?(.+?)[.?!]?$/i

function parseInstruction(message: string): ParsedInstruction | null {
  const setTo = message.match(SET_TO_PATTERN)
  if (setTo) {
    return {
      targetPhrase: setTo[1].trim(),
      valuePhrase: stripLeadingFiller(setTo[2].trim())
    }
  }
  const turnOnOff = message.match(TURN_ON_OFF_PATTERN)
  if (turnOnOff) {
    return { targetPhrase: turnOnOff[2].trim(), valuePhrase: turnOnOff[1] }
  }
  const enableDisable = message.match(ENABLE_DISABLE_PATTERN)
  if (enableDisable) {
    const verb = enableDisable[1].toLowerCase()
    const value = verb === 'enable' || verb === 'activate' ? 'on' : 'off'
    return { targetPhrase: enableDisable[2].trim(), valuePhrase: value }
  }
  return null
}

// Strip leading "be ", "is ", "equal to " from the captured value so
// "to be green" yields "green" rather than "be green".
function stripLeadingFiller(s: string): string {
  return s.replace(/^(be|is|equal\s+to)\s+/i, '').trim()
}

// ---- Value parsing per schema ----

interface ValueOk {
  ok: true
  value: string | number | boolean
}
interface ValueErr {
  ok: false
  reason: string
  allowedValues: string[]
}

function parseValue(valuePhrase: string, schema: WritableSchema): ValueOk | ValueErr {
  const lower = valuePhrase.toLowerCase()

  if (schema.valueType === 'boolean') {
    if (/^(off|false|no|disable|disabled|turn\s+off)\b/.test(lower)) {
      return { ok: true, value: false }
    }
    if (/^(on|true|yes|enable|enabled|turn\s+on)\b/.test(lower)) {
      return { ok: true, value: true }
    }
    return {
      ok: false,
      reason: 'Say "on" or "off".',
      allowedValues: ['on', 'off']
    }
  }

  if (schema.valueType === 'enum') {
    for (const allowed of schema.allowedValues ?? []) {
      const re = new RegExp(`\\b${escapeRegex(allowed)}\\b`, 'i')
      if (re.test(valuePhrase)) return { ok: true, value: allowed }
    }
    const aliases = schema.aliases ?? {}
    for (const [canonical, aliasList] of Object.entries(aliases)) {
      for (const alias of aliasList) {
        const re = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i')
        if (re.test(valuePhrase)) return { ok: true, value: canonical }
      }
    }
    return {
      ok: false,
      reason: `Allowed values: ${(schema.allowedValues ?? []).join(', ')}.`,
      allowedValues: schema.allowedValues ?? []
    }
  }

  if (schema.valueType === 'number') {
    const m = valuePhrase.match(/-?\d+(?:\.\d+)?/)
    if (!m) {
      return {
        ok: false,
        reason: `Include a number${schema.unit ? ` in ${schema.unit}` : ''}.`,
        allowedValues:
          schema.min !== undefined && schema.max !== undefined
            ? [`${schema.min}–${schema.max}${schema.unit ? ' ' + schema.unit : ''}`]
            : []
      }
    }
    const num = Number(m[0])
    if (schema.min !== undefined && num < schema.min) {
      return {
        ok: false,
        reason: `Must be at least ${schema.min}${schema.unit ? ' ' + schema.unit : ''}.`,
        allowedValues: [`${schema.min}–${schema.max}${schema.unit ? ' ' + schema.unit : ''}`]
      }
    }
    if (schema.max !== undefined && num > schema.max) {
      return {
        ok: false,
        reason: `Must be at most ${schema.max}${schema.unit ? ' ' + schema.unit : ''}.`,
        allowedValues: [`${schema.min}–${schema.max}${schema.unit ? ' ' + schema.unit : ''}`]
      }
    }
    return { ok: true, value: num }
  }

  // Time parsing is intentionally unsupported at this stage — quiet-hours
  // bounds are more natural to edit in the Settings panel.
  return { ok: false, reason: 'Unsupported value type.', allowedValues: [] }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---- Target resolution ----

function resolveWritableTarget(targetPhrase: string): SettingsDescriptor | null {
  const matches = matchSettingsByKeywords(targetPhrase)
  // Prefer the longest-keyword match that also happens to be writable.
  const writable = matches.find((d) => d.writable !== undefined)
  if (writable) return writable
  // No keyword hit — try a substring sweep across the whole registry so
  // phrases like "my UI color" still resolve to `theme` via the 'color'
  // keyword (matchSettingsByKeywords already handles this), but if the user
  // misspells or uses an unusual phrasing we fail clean.
  return null
}

// ---- Change builder ----

function buildChange(desc: SettingsDescriptor, value: string | number | boolean): SettingsChange {
  if (desc.key === 'calendarWindow') {
    return { kind: 'calendarWindow', days: value as number }
  }
  return {
    kind: 'pref',
    key: desc.key as keyof Preferences,
    value
  }
}

function formatProposedDisplay(
  desc: SettingsDescriptor,
  value: string | number | boolean
): string {
  const schema = desc.writable
  if (!schema) return String(value)
  if (schema.valueType === 'boolean') return value ? 'on' : 'off'
  if (schema.valueType === 'number') {
    return `${value}${schema.unit ? ' ' + schema.unit : ''}`
  }
  return String(value)
}

// ---- Public: propose ----

export async function proposeSettingsChange(message: string): Promise<ProposeResult> {
  const parsed = parseInstruction(message)
  if (!parsed) return { kind: 'none' }

  const target = resolveWritableTarget(parsed.targetPhrase)
  if (!target || !target.writable) return { kind: 'none' }

  const valueResult = parseValue(parsed.valuePhrase, target.writable)
  const descriptor: SettingsProposalDescriptor = {
    key: target.key,
    label: target.label,
    tab: target.tab
  }
  if (!valueResult.ok) {
    const allowedText =
      valueResult.allowedValues.length > 0
        ? ` Allowed: ${valueResult.allowedValues.join(', ')}.`
        : ''
    return {
      kind: 'rejection',
      rejection: {
        descriptor,
        requestedValue: parsed.valuePhrase,
        reason: valueResult.reason,
        allowedValues: valueResult.allowedValues,
        reply: `I can't set **${target.label.toLowerCase()}** to "${parsed.valuePhrase}". ${valueResult.reason}${allowedText}`
      }
    }
  }

  const currentSnapshot = await describeSettingForDescriptor(target)
  const proposedDisplay = formatProposedDisplay(target, valueResult.value)

  // No-op guard: don't ask the user to apply a change that matches the
  // current value — we'd just be making work.
  if (currentSnapshot.value.toLowerCase() === proposedDisplay.toLowerCase()) {
    return {
      kind: 'rejection',
      rejection: {
        descriptor,
        requestedValue: parsed.valuePhrase,
        reason: `It's already set to **${currentSnapshot.value}**.`,
        allowedValues: [],
        reply: `Your ${target.label.toLowerCase()} is already **${currentSnapshot.value}**.`
      }
    }
  }

  return {
    kind: 'proposal',
    proposal: {
      descriptor,
      currentValueDisplay: currentSnapshot.value,
      proposedValueDisplay: proposedDisplay,
      change: buildChange(target, valueResult.value),
      reply: `Change **${target.label.toLowerCase()}** from **${currentSnapshot.value}** to **${proposedDisplay}**? Press APPLY to confirm.`
    }
  }
}

// ---- Public: apply ----

export async function applySettingsChange(change: SettingsChange): Promise<void> {
  if (change.kind === 'pref') {
    setPreference(change.key, change.value)
    return
  }
  if (change.kind === 'calendarWindow') {
    await updateConfig({ calendar: { windowDays: change.days } })
    return
  }
}

// Exposed for callers that want to enumerate writable descriptors (e.g.,
// a Settings-page help tooltip). Not currently used but keeps the registry
// as the single source of truth without duplicating iteration logic.
export function listWritableDescriptors(): SettingsDescriptor[] {
  return getSettingsRegistry().filter((d) => d.writable !== undefined)
}
