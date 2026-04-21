import { app, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from '../database/connection'
import {
  deleteReel,
  deleteReelsOlderThan,
  insertReel,
  listReelArticleIds,
  listReels,
  updateReelAudio,
  updateReelKeyframes,
  updateReelVideoClips,
  type Reel
} from '../database/reels'
import { checkOllamaHealth } from './ollamaService'
import {
  getKokoroStatus,
  hasKokoroBeenReady,
  isKokoroReady,
  onKokoroReady,
  synthesizeWithKokoro,
  waitForKokoroReady
} from './kokoroService'
import { isPiperReady, synthesizeWithPiper } from './piperService'
import { generateKeyframe, isVideoGenReady } from './videoGenService'
import { extractClipsForReel } from './videoClipService'
import { isMediaToolsReady } from './mediaToolsService'
import { getPreferences } from '../database/preferences'

const OLLAMA_BASE = process.env['PULSE_OLLAMA_URL'] ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env['PULSE_OLLAMA_MODEL'] ?? 'mistral:7b'
const SCRIPT_TIMEOUT_MS = 45_000
// Ranked preference list. First entry that actually exists on the system wins.
// Premium/Enhanced voices sound noticeably more human; users who download them
// in System Settings → Spoken Content will automatically get upgraded output.
const TTS_VOICE_PREFERENCES = [
  'Ava (Premium)',
  'Ava (Enhanced)',
  'Zoe (Premium)',
  'Allison (Enhanced)',
  'Evan (Enhanced)',
  'Samantha (Enhanced)',
  'Serena (Premium)',
  'Tom (Enhanced)',
  'Samantha'
]
const TTS_RATE_WPM = 175
const REEL_MAX = 20
const REEL_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MIN_GEN_INTERVAL_MS = 6 * 60 * 60 * 1000

let scheduler: ReturnType<typeof setInterval> | null = null
let generating = false

function reelsDir(): string {
  return join(app.getPath('userData'), 'reels')
}

async function ensureReelsDir(): Promise<void> {
  await fs.mkdir(reelsDir(), { recursive: true })
}

export function getReelsDir(): string {
  return reelsDir()
}

interface CandidateArticle {
  id: number
  title: string
  summary: string | null
  url: string
  imageURL: string | null
  publishedAt: number | null
  domain: 'finance' | 'general'
  urgencyScore: number | null
}

function pickCandidates(limit: number): CandidateArticle[] {
  // Favor recent, scored, image-bearing articles. Fall back to any recent article.
  const cutoff = Date.now() - 48 * 60 * 60 * 1000
  const withImage = getDb()
    .prepare<[number, number], CandidateArticle>(
      `SELECT id, title, summary, url, imageURL, publishedAt, domain, urgencyScore
       FROM articles
       WHERE publishedAt > ?
         AND imageURL IS NOT NULL
         AND length(coalesce(summary, '')) > 40
       ORDER BY coalesce(urgencyScore, 0) DESC, publishedAt DESC
       LIMIT ?`
    )
    .all(cutoff, limit * 2)
  if (withImage.length >= limit) return withImage.slice(0, limit)
  const withoutImage = getDb()
    .prepare<[number, number], CandidateArticle>(
      `SELECT id, title, summary, url, imageURL, publishedAt, domain, urgencyScore
       FROM articles
       WHERE publishedAt > ?
         AND length(coalesce(summary, '')) > 40
       ORDER BY coalesce(urgencyScore, 0) DESC, publishedAt DESC
       LIMIT ?`
    )
    .all(cutoff, limit * 2)
  const seen = new Set(withImage.map((a) => a.id))
  for (const a of withoutImage) {
    if (seen.has(a.id)) continue
    withImage.push(a)
    if (withImage.length >= limit) break
  }
  return withImage.slice(0, limit)
}

function sanitizeForTts(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/"/g, '')
    .trim()
    .slice(0, 900)
}

// Strip subscription prompts, paywall boilerplate, newsletter CTAs, and
// byline/credit cruft that publishers tack onto RSS summaries. These phrases
// leak straight into the Ollama prompt and sometimes into the generated
// narration ("Subscribe today for unlimited access…"), which makes the audio
// sound like an ad read. Run this on both the raw article input AND the
// generated script as a belt-and-suspenders filter.
function scrubPromotional(text: string): string {
  if (!text) return ''
  let t = text
  // Remove whole sentences that are clearly promo, paywall, or CTA.
  const promoSentence =
    /[^.!?]*\b(?:subscribe|subscription|subscriber[- ]only|become a (?:member|subscriber)|sign up (?:for|to)(?! (?:a|the) (?:meeting|hearing|trial))|sign (?:in|up) to|create (?:an|a free) account|log in to (?:read|continue)|unlimited (?:access|digital)|continue reading|read (?:the full|more) (?:story|article) (?:at|on|in|with|here)|this (?:article|story|content) is (?:for|available to|exclusive to|reserved for)|enjoy(?:ing)? (?:this|our) (?:article|coverage|story|newsletter)|get (?:our|the|unlimited) (?:newsletter|digital|daily|weekly)|join (?:our|the) (?:newsletter|mailing list)|follow us on|download (?:our|the) app|support (?:our|independent|quality) journalism|donate (?:today|now)|paywall|free trial|limited[- ]time offer|already a (?:subscriber|member))\b[^.!?]*[.!?]/gi
  t = t.replace(promoSentence, ' ')
  // Remove trailing byline/credit fragments: "— Reuters", "By Jane Doe", "(AP)", etc.
  t = t
    .replace(/\b(?:photo|image|video|graphic)s?\s*(?:credit|courtesy|by|:)[^.!?]*[.!?]?/gi, ' ')
    .replace(/\(\s*(?:AP|AFP|Reuters|Bloomberg|CNN|BBC|PA|ANI|PTI|Xinhua|dpa)\s*\)/gi, ' ')
    .replace(/\bClick (?:here|the link)[^.!?]*[.!?]?/gi, ' ')
  // Collapse whitespace left by removals.
  return t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim()
}

// Reshape a sanitized script into something that reads more naturally out of a
// neural TTS. Kokoro and Piper both honor commas, em-dashes, and ellipses with
// micro-pauses — the stock Ollama output is almost all periods, which lands as
// a choppy staccato. This pass:
//   - Normalizes ASCII-unfriendly punctuation into speakable equivalents.
//   - Demotes some sentence breaks into commas/em-dashes so two short facts
//     read as one flowing thought.
//   - Softens "percent/dollars" / numeric-heavy phrasing for better prosody.
//   - Caps length so the worker doesn't stall on runaway prompts.
function humanizeScript(text: string): string {
  let t = text
    // Replace curly quotes, fancy dashes, and ellipses with TTS-safe variants.
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '')
    .replace(/\u2026/g, '...')
    .replace(/\s*[\u2013\u2014]\s*/g, ' — ')
    // Collapse whitespace.
    .replace(/\s+/g, ' ')
    .trim()

  // Merge pairs of extremely short sentences into one clause separated by a
  // comma, so bullet-style writing ("Revenue rose. Profits flat. Guidance cut.")
  // becomes a single breath-group. We only merge when the second fragment is
  // also short to avoid runaway sentences.
  t = t.replace(/([^.?!]{4,40})\. ([a-z][^.?!]{4,40})\. /g, '$1, $2. ')

  // Promote a solitary conjunction after a period into an em-dash, which Kokoro
  // reads with a more natural beat than ". And" does.
  t = t.replace(/\. (But|And|Yet|Still|However)\b/g, ' — $1')

  // Softer pronunciation of % and $ without changing meaning.
  t = t
    .replace(/(\d)%/g, '$1 percent')
    .replace(/\$(\d)/g, '$1 dollars')

  // Collapse double-em-dashes or spaced-out punctuation the replacements may
  // have produced.
  t = t.replace(/\s{2,}/g, ' ').replace(/ — — /g, ' — ').trim()
  return t.slice(0, 900)
}

// Inject prosody hints so macOS `say` sounds less robotic.
// [[slnc N]] = silence for N ms. Inserting deliberate pauses after sentence
// boundaries and commas gives the reading a news-anchor cadence instead of a
// breathless monotone. Pitch bookending ([[pbas +N]]) adds a subtle down-inflection
// on sentence ends so the voice doesn't sound queried.
function addProsody(text: string): string {
  const trimmed = text.trim()
  // Treat ! and ? with a shorter final pause, periods with a longer one.
  return trimmed
    .replace(/([.?!])\s+/g, '$1 [[slnc 260]] ')
    .replace(/,\s+/g, ', [[slnc 110]] ')
    .replace(/;\s+/g, '; [[slnc 140]] ')
    .replace(/:\s+/g, ': [[slnc 120]] ')
}

let cachedVoice: string | null = null
let voiceProbePromise: Promise<string> | null = null

async function listInstalledVoices(): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawn('/usr/bin/say', ['-v', '?'], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout?.on('data', (d) => {
      out += d.toString()
    })
    child.on('close', () => {
      const names = out
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        // Format: "Name        lang_LOCALE    # Example."
        .map((line) => {
          const m = line.match(/^(.+?)\s{2,}[a-z]{2}_[A-Z]{2}/)
          return m ? m[1].trim() : null
        })
        .filter((n): n is string => !!n)
      resolve(names)
    })
    child.on('error', () => resolve([]))
    setTimeout(() => {
      child.kill('SIGKILL')
      resolve([])
    }, 5_000)
  })
}

async function resolveVoice(): Promise<string> {
  const override = process.env['PULSE_REEL_VOICE']
  if (override) return override
  if (cachedVoice) return cachedVoice
  if (!voiceProbePromise) {
    voiceProbePromise = (async () => {
      const installed = new Set(await listInstalledVoices())
      for (const candidate of TTS_VOICE_PREFERENCES) {
        if (installed.has(candidate)) return candidate
      }
      return 'Samantha'
    })().then((v) => {
      cachedVoice = v
      console.log(`[reel] using TTS voice: ${v}`)
      return v
    })
  }
  return voiceProbePromise
}

interface ScriptWithBeats {
  script: string
  beats: string[]
  visualPrompts: string[]
}

async function generateScript(article: CandidateArticle): Promise<ScriptWithBeats | null> {
  const ok = await checkOllamaHealth()
  if (!ok) return fallbackScript(article)
  const system =
    `You are a news scriptwriter for a 20-second vertical video briefing. ` +
    `Given a headline and summary, produce THREE aligned outputs: ` +
    `(1) "script": a 45-70 word narration that opens with the most important fact, ` +
    `flows naturally when read aloud by a neural TTS voice, and ends with the ` +
    `implication. Vary sentence length: mix one or two longer clauses with shorter ` +
    `beats. Use commas and em-dashes for breathing room. Avoid a staccato of short ` +
    `sentences. Do not include filler phrases, speaker cues, or the word "briefing". ` +
    `(2) "beats": 3-5 on-screen caption beats in order, each 3-8 words, covering the arc ` +
    `of the narration (hook → fact → context → implication). ` +
    `(3) "visuals": one cinematic image prompt per beat, IN THE SAME ORDER. Each prompt is ` +
    `1-2 sentences describing a photorealistic still that would appear behind that beat ` +
    `in a TV news segment. Include subject, setting, lighting, composition. No text, no ` +
    `logos, no captions in the image. No celebrities. Tone: serious, editorial. ` +
    `CRITICAL: Ignore any subscription prompts, paywall notices, newsletter signups, ` +
    `"read more", "click here", social follows, bylines, photo credits, or promotional ` +
    `language that may appear in the summary. Narrate ONLY the actual news facts. ` +
    `Never reference the publication, subscribing, logging in, or the reader. ` +
    `Respond in JSON only: {"script": "...", "beats": ["..."], "visuals": ["..."]}`
  const cleanTitle = scrubPromotional(article.title) || article.title
  const cleanSummary = scrubPromotional(article.summary ?? '')
  const user =
    `Headline: ${cleanTitle}\nSummary: ${cleanSummary}\n` +
    `Domain: ${article.domain === 'finance' ? 'business/markets' : 'world/general news'}`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SCRIPT_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          stream: false,
          format: 'json'
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      if (res.status === 404) {
        console.warn(
          `[reel] ollama model '${OLLAMA_MODEL}' not installed; ` +
            `using plain-text fallback script. Run \`ollama pull ${OLLAMA_MODEL}\` for AI briefings.`
        )
      }
      return fallbackScript(article)
    }
    const body = (await res.json()) as { message?: { content?: string } }
    const content = body.message?.content
    if (!content) return fallbackScript(article)
    const parsed = JSON.parse(content) as {
      script?: unknown
      beats?: unknown
      visuals?: unknown
    }
    if (typeof parsed.script !== 'string' || parsed.script.length < 30) {
      return fallbackScript(article)
    }
    const beats = Array.isArray(parsed.beats)
      ? (parsed.beats as unknown[])
          .filter((b): b is string => typeof b === 'string' && b.length > 0)
          .map((b) => scrubPromotional(sanitizeForTts(b)).slice(0, 80))
          .filter((b) => b.length > 0)
          .slice(0, 6)
      : []
    const visuals = Array.isArray(parsed.visuals)
      ? (parsed.visuals as unknown[])
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
          .map((v) => v.replace(/["\r\n\t]+/g, ' ').trim().slice(0, 400))
      : []
    const cleanedScript = humanizeScript(scrubPromotional(sanitizeForTts(parsed.script)))
    if (cleanedScript.length < 30) return fallbackScript(article)
    const finalBeats = beats.length > 0 ? beats : deriveBeats(cleanedScript)
    const finalVisuals = padVisuals(visuals, finalBeats, article)
    return {
      script: cleanedScript,
      beats: finalBeats,
      visualPrompts: finalVisuals
    }
  } catch (err) {
    console.warn('[reel] script generation failed:', err instanceof Error ? err.message : err)
    return fallbackScript(article)
  }
}

// Abbreviations / initials that commonly cause a naive sentence splitter to
// mis-segment: "Judge Troy L. Nunley" should stay as one sentence, not split
// at "L.". Same for "Mr.", "Inc.", etc.
const ABBREV_TOKENS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'sr', 'jr',
  'inc', 'corp', 'co', 'ltd', 'llc',
  'sen', 'rep', 'gov', 'gen', 'lt', 'col', 'capt', 'sgt',
  'vs', 'etc', 'no', 'pp'
])

function isInitialOrAbbrev(tokenWithPeriod: string): boolean {
  const bare = tokenWithPeriod.replace(/[.,;:]+$/, '').toLowerCase()
  if (bare.length === 1) return true // single letter like "L"
  return ABBREV_TOKENS.has(bare)
}

function deriveBeats(script: string): string[] {
  // Split on period/!/? followed by whitespace and a capital letter, then
  // re-merge any segments where the preceding piece ended on an initial or
  // abbreviation. This is cheaper than a proper NLP tokenizer and handles the
  // common cases ("Judge Troy L. Nunley", "Mr. Smith", "Inc. announced").
  const rawParts = script
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const merged: string[] = []
  for (const part of rawParts) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1]
      const lastToken = prev.split(/\s+/).pop() ?? ''
      if (lastToken.endsWith('.') && isInitialOrAbbrev(lastToken)) {
        merged[merged.length - 1] = `${prev} ${part}`
        continue
      }
    }
    merged.push(part)
  }
  return merged.slice(0, 5).map((s) => s.slice(0, 110))
}

// Shared visual style appended to every SDXL prompt so keyframes read as a
// single editorial piece rather than clip art. Encourages composition + lighting
// cues the Turbo model reliably renders at 4 steps.
// Kept short so CLIP's 77-token budget leaves room for the per-beat prompt.
const STYLE_SUFFIX =
  ', editorial news photo, dramatic lighting, 35mm grain, shallow depth of field'

function applyStyleSuffix(prompt: string): string {
  const trimmed = prompt.replace(/\s+$/, '').replace(/[.,;:\s]+$/, '')
  return `${trimmed}${STYLE_SUFFIX}`.slice(0, 480)
}

// Derive a generic cinematic prompt from an article when Ollama doesn't give
// us one (or gives fewer than we need). Keeps tone consistent across beats.
function deriveVisualPrompt(article: CandidateArticle, beat: string): string {
  const subject = beat || article.title
  const setting =
    article.domain === 'finance'
      ? 'trading floor, glass office tower, dusk skyline'
      : 'city street, press conference, documentary still'
  return applyStyleSuffix(`${subject}. Scene: ${setting}. Serious editorial tone. No text, no logos`)
}

function padVisuals(
  visuals: string[],
  beats: string[],
  article: CandidateArticle
): string[] {
  const out: string[] = []
  for (let i = 0; i < beats.length; i++) {
    const v = visuals[i]
    out.push(v && v.length > 20 ? applyStyleSuffix(v) : deriveVisualPrompt(article, beats[i]))
  }
  return out
}

function fallbackScript(article: CandidateArticle): ScriptWithBeats | null {
  const cleanSummary = scrubPromotional(article.summary ?? '')
  const body = sanitizeForTts(`${article.title}. ${cleanSummary}`)
  if (body.length < 40) return null
  const script = humanizeScript(body.slice(0, 700))
  const beats = deriveBeats(script)
  const visualPrompts = beats.map((b) => deriveVisualPrompt(article, b))
  return { script, beats, visualPrompts }
}

function runCmd(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stderr })
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: -1, stderr })
    })
  })
}

async function wavToM4a(wav: string, m4a: string, label: string): Promise<boolean> {
  const convert = await runCmd(
    '/usr/bin/afconvert',
    ['-f', 'm4af', '-d', 'aac', wav, m4a],
    30_000
  )
  await fs.unlink(wav).catch(() => undefined)
  if (convert.code !== 0) {
    console.warn(`[reel] afconvert (${label}) failed:`, convert.stderr.slice(0, 200))
    return false
  }
  return true
}

// Accept an m4a as valid only if afinfo reports a plausible duration. This
// catches the case where a prior stage wrote a truncated/corrupt WAV and
// afconvert silently produced a 0-duration m4a that fails to decode in
// <audio>. We retry down the fallback chain when this trips.
async function verifyAudioFile(m4a: string): Promise<number | null> {
  const durationMs = await readDurationMs(m4a)
  if (durationMs == null || durationMs < 800) {
    console.warn('[reel] audio verification failed:', m4a, 'duration:', durationMs)
    await fs.unlink(m4a).catch(() => undefined)
    return null
  }
  return durationMs
}

async function synthesizeAudio(
  script: string,
  articleId: number,
  // Nonce busts the browser's audio cache when we rewrite a reel's voiceover.
  // Initial generation passes null so the URL stays clean; rebuild paths pass
  // a timestamp so <audio src> sees a new URL and reloads.
  nonce: number | null = null
): Promise<{
  file: string
  durationMs: number | null
} | null> {
  await ensureReelsDir()
  const baseName = nonce == null ? `${articleId}` : `${articleId}-v${nonce}`
  const m4a = join(reelsDir(), `${baseName}.m4a`)
  const prefs = getPreferences()
  const engine = prefs.ttsEngine
  const voice = prefs.ttsVoice || 'am_michael'

  // Tier 1: Kokoro-82M — highest quality, broadcast-ready neural voice.
  // If Kokoro is the chosen engine but still warming up, wait up to 90s so the
  // first reels in a batch don't silently fall through to Piper and leave the
  // playlist with mixed voices. Only pay this cost on startup — once Kokoro
  // has ever been ready, a transient not-ready means genuine failure so we
  // short-circuit to the fallback immediately.
  if (engine === 'kokoro') {
    if (!isKokoroReady() && !hasKokoroBeenReady()) {
      const s = getKokoroStatus().state
      if (s !== 'failed' && s !== 'unsupported') {
        // 3min covers dep install + first-run model download + prewarm on a
        // fresh machine. After the first ready, hasKokoroBeenReady() short-
        // circuits this so subsequent not-ready states fall through quickly.
        console.log('[reel] waiting up to 180s for Kokoro to finish loading')
        await waitForKokoroReady(180_000)
      }
    }
    if (isKokoroReady()) {
      const wav = join(reelsDir(), `${baseName}.wav`)
      const ok = await synthesizeWithKokoro(script, wav, voice)
      if (ok && (await wavToM4a(wav, m4a, 'kokoro wav'))) {
        const durationMs = await verifyAudioFile(m4a)
        if (durationMs != null) return { file: `${baseName}.m4a`, durationMs }
      }
      console.warn('[reel] kokoro synthesis failed, falling back to piper')
    }
  }

  // Tier 2: Piper neural TTS.
  if ((engine === 'kokoro' || engine === 'piper') && isPiperReady()) {
    const wav = join(reelsDir(), `${baseName}.wav`)
    const res = await synthesizeWithPiper(script, wav)
    if (res && (await wavToM4a(wav, m4a, 'piper wav'))) {
      const durationMs = await verifyAudioFile(m4a)
      if (durationMs != null) return { file: `${baseName}.m4a`, durationMs }
    }
    console.warn('[reel] piper synthesis failed, falling back to say')
  }

  // Fallback: macOS `say` with best available voice + prosody hints.
  const aiff = join(reelsDir(), `${baseName}.aiff`)
  const sayVoice = await resolveVoice()
  const spokenText = addProsody(script)
  const args = ['-v', sayVoice, '-r', String(TTS_RATE_WPM), '-o', aiff, spokenText]

  let say = await runCmd('/usr/bin/say', args, 30_000)
  if (say.code !== 0) {
    console.warn(
      `[reel] say failed with voice ${sayVoice}, retrying with Samantha:`,
      say.stderr.slice(0, 200)
    )
    cachedVoice = 'Samantha'
    say = await runCmd(
      '/usr/bin/say',
      ['-v', 'Samantha', '-r', String(TTS_RATE_WPM), '-o', aiff, spokenText],
      30_000
    )
  }
  if (say.code !== 0) {
    console.warn('[reel] say failed:', say.stderr.slice(0, 200))
    return null
  }

  const convert = await runCmd(
    '/usr/bin/afconvert',
    ['-f', 'm4af', '-d', 'aac', aiff, m4a],
    30_000
  )
  if (convert.code !== 0) {
    console.warn('[reel] afconvert failed:', convert.stderr.slice(0, 200))
    await fs.unlink(aiff).catch(() => undefined)
    return null
  }
  await fs.unlink(aiff).catch(() => undefined)

  const durationMs = await verifyAudioFile(m4a)
  if (durationMs == null) return null
  return { file: `${baseName}.m4a`, durationMs }
}

async function readDurationMs(file: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn('/usr/bin/afinfo', [file], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout?.on('data', (d) => {
      out += d.toString()
    })
    child.on('close', () => {
      const m = out.match(/estimated duration:\s*([\d.]+)\s*sec/i)
      if (!m) return resolve(null)
      const secs = parseFloat(m[1])
      resolve(Number.isFinite(secs) ? Math.round(secs * 1000) : null)
    })
    child.on('error', () => resolve(null))
    setTimeout(() => {
      child.kill('SIGKILL')
      resolve(null)
    }, 5_000)
  })
}

async function synthesizeKeyframes(
  articleId: number,
  prompts: string[]
): Promise<string[]> {
  if (!isVideoGenReady() || prompts.length === 0) return []
  await ensureReelsDir()
  const out: string[] = []
  for (let i = 0; i < prompts.length; i++) {
    const file = `${articleId}-${i}.jpg`
    const full = join(reelsDir(), file)
    // Deterministic-per-beat seed so a reel's imagery stays stable across
    // regenerations of the same article.
    const seed = (articleId * 97 + i * 13) % 2_000_000
    const ok = await generateKeyframe(prompts[i], full, seed)
    if (ok) out.push(file)
  }
  return out
}

async function synthesizeVideoClips(
  articleId: number,
  articleURL: string,
  beatCount: number
): Promise<string[]> {
  if (!isMediaToolsReady() || beatCount <= 0) return []
  await ensureReelsDir()
  try {
    return await extractClipsForReel(articleId, articleURL, beatCount, reelsDir())
  } catch (err) {
    console.warn('[reel] video clip extraction failed:', err instanceof Error ? err.message : err)
    return []
  }
}

async function generateReelForArticle(article: CandidateArticle): Promise<Reel | null> {
  const result = await generateScript(article)
  if (!result) return null
  const audio = await synthesizeAudio(result.script, article.id)
  if (!audio) return null
  const keyframes = await synthesizeKeyframes(article.id, result.visualPrompts)
  // Video clips are an optional upgrade — pipeline still produces a valid reel
  // with just keyframes (or just the procedural fallback) if extraction fails.
  const videoClips = await synthesizeVideoClips(
    article.id,
    article.url,
    result.beats.length
  )
  const id = insertReel({
    articleId: article.id,
    script: result.script,
    beats: result.beats,
    keyframes,
    videoClips,
    audioFile: audio.file,
    durationMs: audio.durationMs
  })
  return listReels(REEL_MAX * 2).find((r) => r.id === id) ?? null
}

// Extract video clips for reels that were created before Homebrew finished
// installing yt-dlp/ffmpeg. Keeps the first reel of a cold-start session from
// being stuck with only AI keyframes when the article had a usable video.
export async function backfillReelVideoClips(): Promise<number> {
  if (!isMediaToolsReady()) return 0
  const all = listReels(REEL_MAX * 2).filter((r) => r.videoClips.length === 0)
  let done = 0
  for (const reel of all) {
    const clips = await synthesizeVideoClips(
      reel.articleId,
      reel.articleURL,
      reel.beats.length
    )
    if (clips.length > 0) {
      updateReelVideoClips(reel.id, clips)
      done++
      broadcastReelsUpdated()
    }
  }
  return done
}

// Regenerate keyframes for an existing reel when the video worker comes online
// after the reel was initially created.
export async function backfillReelKeyframes(): Promise<number> {
  if (!isVideoGenReady()) return 0
  const all = listReels(REEL_MAX * 2).filter((r) => r.keyframes.length === 0)
  let done = 0
  for (const reel of all) {
    const article = getDb()
      .prepare<[number], CandidateArticle>(
        `SELECT id, title, summary, url, imageURL, publishedAt, domain, urgencyScore
         FROM articles WHERE id = ?`
      )
      .get(reel.articleId)
    if (!article) continue
    const prompts = padVisuals([], reel.beats, article)
    const keyframes = await synthesizeKeyframes(reel.articleId, prompts)
    if (keyframes.length > 0) {
      updateReelKeyframes(reel.id, keyframes)
      done++
      broadcastReelsUpdated()
    }
  }
  return done
}

export async function runReelGeneration(force = false): Promise<number> {
  if (generating && !force) return 0
  generating = true
  try {
    const existing = listReelArticleIds()
    const want = Math.max(0, REEL_MAX - existing.size)
    if (want === 0) return 0
    const candidates = pickCandidates(want * 3).filter((c) => !existing.has(c.id))
    if (candidates.length === 0) return 0
    let made = 0
    for (const c of candidates) {
      if (made >= want) break
      try {
        const reel = await generateReelForArticle(c)
        if (reel) {
          made++
          broadcastReelsUpdated()
        }
      } catch (err) {
        console.warn('[reel] generation error:', err instanceof Error ? err.message : err)
      }
    }
    return made
  } finally {
    generating = false
  }
}

async function unlinkReelFile(name: string): Promise<void> {
  const full = join(reelsDir(), name)
  if (existsSync(full)) await fs.unlink(full).catch(() => undefined)
}

export async function pruneOldReels(): Promise<void> {
  const cutoff = Date.now() - REEL_AGE_MS
  const groups = deleteReelsOlderThan(cutoff)
  for (const g of groups) {
    await unlinkReelFile(g.audioFile)
    for (const kf of g.keyframes) await unlinkReelFile(kf)
    for (const vc of g.videoClips) await unlinkReelFile(vc)
  }
}

export async function deleteReelById(id: number): Promise<void> {
  const files = deleteReel(id)
  if (!files) return
  await unlinkReelFile(files.audioFile)
  for (const kf of files.keyframes) await unlinkReelFile(kf)
  for (const vc of files.videoClips) await unlinkReelFile(vc)
  broadcastReelsUpdated()
}

// User-initiated: turn a specific article into a flash. Bypasses the
// candidate picker (so short summaries / no-image articles can still become
// flashes) but refuses if that article already has one.
export type GenerateForArticleResult =
  | { ok: true; reelId: number }
  | { ok: false; reason: string }

export async function generateReelFromArticleId(
  articleId: number
): Promise<GenerateForArticleResult> {
  if (listReelArticleIds().has(articleId)) {
    return { ok: false, reason: 'already-exists' }
  }
  const article = getDb()
    .prepare<[number], CandidateArticle>(
      `SELECT id, title, summary, url, imageURL, publishedAt, domain, urgencyScore
       FROM articles WHERE id = ?`
    )
    .get(articleId)
  if (!article) return { ok: false, reason: 'not-found' }
  try {
    const reel = await generateReelForArticle(article)
    if (!reel) return { ok: false, reason: 'generation-failed' }
    broadcastReelsUpdated()
    return { ok: true, reelId: reel.id }
  } catch (err) {
    console.warn('[reel] generateFromArticleId error:', err instanceof Error ? err.message : err)
    return { ok: false, reason: 'generation-failed' }
  }
}

// Re-synthesize audio for a single reel. The UI calls this when an audio file
// fails to decode (corrupt or encoded with an old pipeline) so the briefing
// self-heals on the next play attempt.
export async function rebuildReelAudio(id: number): Promise<boolean> {
  const reel = listReels(REEL_MAX * 2).find((r) => r.id === id)
  if (!reel) return false
  const prevFile = reel.audioFile
  const audio = await synthesizeAudio(reel.script, reel.articleId, Date.now())
  if (!audio) return false
  updateReelAudio(reel.id, audio.file, audio.durationMs)
  if (prevFile && prevFile !== audio.file) {
    await unlinkReelFile(prevFile)
  }
  broadcastReelsUpdated()
  return true
}

// Re-synthesize audio for every existing reel using the current voice /
// prosody settings. Keeps the scripts and beats intact — only the voiceover
// file is replaced. Useful after the user installs a premium voice or we
// upgrade the TTS pipeline.
let rebuilding = false
export async function rebuildAllReelAudio(): Promise<number> {
  if (rebuilding) return 0
  rebuilding = true
  try {
    const all = listReels(REEL_MAX * 2)
    // Invalidate any cached voice probe so a newly installed voice is picked up.
    cachedVoice = null
    voiceProbePromise = null
    let done = 0
    // Single nonce per rebuild batch is fine — each reel has a distinct
    // articleId so filenames still don't collide, and sharing the timestamp
    // keeps the disk writes easy to reason about.
    const nonce = Date.now()
    for (const reel of all) {
      try {
        const prevFile = reel.audioFile
        const audio = await synthesizeAudio(reel.script, reel.articleId, nonce)
        if (!audio) continue
        updateReelAudio(reel.id, audio.file, audio.durationMs)
        if (prevFile && prevFile !== audio.file) {
          await unlinkReelFile(prevFile)
        }
        done++
        broadcastReelsUpdated()
      } catch (err) {
        console.warn('[reel] rebuild error:', err instanceof Error ? err.message : err)
      }
    }
    return done
  } finally {
    rebuilding = false
  }
}

function broadcastReelsUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('reels:updated')
  }
}

let kokoroReadyUnsub: (() => void) | null = null
let kokoroUpgradePending = false

export function startReelScheduler(): void {
  if (scheduler) return
  void pruneOldReels()
  void runReelGeneration()
  scheduler = setInterval(() => {
    void pruneOldReels()
    void runReelGeneration()
  }, MIN_GEN_INTERVAL_MS)
  // When Kokoro comes online after reels were generated with a fallback, rebuild
  // their audio once so the user gets a consistent voice across the playlist.
  // We guard with `kokoroUpgradePending` so multiple ready-events during a
  // session don't trigger rebuild storms.
  if (!kokoroReadyUnsub) {
    kokoroReadyUnsub = onKokoroReady(() => {
      if (getPreferences().ttsEngine !== 'kokoro') return
      if (kokoroUpgradePending) return
      kokoroUpgradePending = true
      setTimeout(() => {
        void rebuildAllReelAudio()
          .catch((err) => console.warn('[reel] post-ready rebuild failed:', err))
          .finally(() => {
            kokoroUpgradePending = false
          })
      }, 2_000)
    })
  }
}

export function stopReelScheduler(): void {
  if (scheduler) {
    clearInterval(scheduler)
    scheduler = null
  }
  if (kokoroReadyUnsub) {
    kokoroReadyUnsub()
    kokoroReadyUnsub = null
  }
}
