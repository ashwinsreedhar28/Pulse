import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import {
  getFfmpegPath,
  getFfprobePath,
  getYtDlpPath,
  isMediaToolsReady
} from './mediaToolsService'

// Pulls a video source from an article URL and cuts it into muted vertical
// clips, one per narration beat. Falls through cleanly (returns []) whenever
// the URL has no usable video, yt-dlp can't handle the host, or ffmpeg
// detects too few distinct scenes.

const CLIP_DURATION_SEC = 3.5
const CLIP_W = 720
const CLIP_H = 1280
const SCENE_THRESHOLD = 0.3
const MAX_SOURCE_DURATION_SEC = 600
const HTML_FETCH_TIMEOUT_MS = 15_000
const YTDLP_TIMEOUT_MS = 90_000
const FFMPEG_TIMEOUT_MS = 120_000

const IFRAME_HOST_PATTERNS: Array<{ re: RegExp; toWatchable: (src: string) => string | null }> = [
  {
    re: /youtube\.com\/embed\/([\w-]{6,})/i,
    toWatchable: (src) => {
      const m = src.match(/youtube\.com\/embed\/([\w-]{6,})/i)
      return m ? `https://www.youtube.com/watch?v=${m[1]}` : null
    }
  },
  {
    re: /youtube-nocookie\.com\/embed\/([\w-]{6,})/i,
    toWatchable: (src) => {
      const m = src.match(/youtube-nocookie\.com\/embed\/([\w-]{6,})/i)
      return m ? `https://www.youtube.com/watch?v=${m[1]}` : null
    }
  },
  {
    re: /player\.vimeo\.com\/video\/(\d+)/i,
    toWatchable: (src) => {
      const m = src.match(/player\.vimeo\.com\/video\/(\d+)/i)
      return m ? `https://vimeo.com/${m[1]}` : null
    }
  },
  {
    re: /players\.brightcove\.net/i,
    toWatchable: (src) => src
  },
  {
    re: /cdn\.jwplayer\.com|content\.jwplatform\.com/i,
    toWatchable: (src) => src
  },
  {
    re: /player\.ooyala\.com|cf\.dash\.castr\.com|dailymotion\.com\/embed/i,
    toWatchable: (src) => src
  },
  {
    re: /twitter\.com\/i\/videos|x\.com\/i\/videos/i,
    toWatchable: (src) => src
  }
]

export async function extractClipsForReel(
  articleId: number,
  articleURL: string,
  beatCount: number,
  outDir: string
): Promise<string[]> {
  if (!isMediaToolsReady()) return []
  if (beatCount <= 0) return []
  const ytDlp = getYtDlpPath()
  const ffmpeg = getFfmpegPath()
  const ffprobe = getFfprobePath()
  if (!ytDlp || !ffmpeg || !ffprobe) return []

  const sourcePath = await downloadSourceVideo(articleId, articleURL, outDir, ytDlp)
  if (!sourcePath) return []

  try {
    const duration = await probeDuration(sourcePath, ffprobe)
    if (duration == null || duration < CLIP_DURATION_SEC) return []

    const scenes = await detectScenes(sourcePath, ffmpeg)
    // Synthesize a first-scene marker at 0 so we always have one anchor.
    const starts = pickClipStarts(scenes, duration, beatCount)
    if (starts.length === 0) return []

    const clipFiles: string[] = []
    for (let i = 0; i < starts.length; i++) {
      const outFile = `${articleId}-clip-${i}.mp4`
      const full = join(outDir, outFile)
      const ok = await extractClip(sourcePath, starts[i], full, ffmpeg)
      if (ok) clipFiles.push(outFile)
    }
    return clipFiles
  } finally {
    await fs.unlink(sourcePath).catch(() => undefined)
    // Also clean up any yt-dlp leftovers (.part, alternate ext) for this article.
    await cleanupSourceArtifacts(articleId, outDir).catch(() => undefined)
  }
}

async function downloadSourceVideo(
  articleId: number,
  articleURL: string,
  outDir: string,
  ytDlp: string
): Promise<string | null> {
  await fs.mkdir(outDir, { recursive: true }).catch(() => undefined)
  // 1. Direct yt-dlp on the article URL (it has extractors for many news sites).
  const direct = await tryYtDlp(articleURL, articleId, outDir, ytDlp)
  if (direct) return direct

  // 2. Scrape the HTML for embedded video sources.
  const embedUrls = await scrapeVideoUrls(articleURL)
  for (const url of embedUrls) {
    const got = await tryYtDlp(url, articleId, outDir, ytDlp)
    if (got) return got
  }
  return null
}

async function tryYtDlp(
  url: string,
  articleId: number,
  outDir: string,
  ytDlp: string
): Promise<string | null> {
  const template = join(outDir, `${articleId}-src.%(ext)s`)
  const code = await runOnce(
    ytDlp,
    [
      '--no-playlist',
      '--no-warnings',
      '--quiet',
      '--no-part',
      '--no-progress',
      '--match-filter',
      `duration <= ${MAX_SOURCE_DURATION_SEC}`,
      '--max-filesize',
      '150M',
      '-f',
      'best[height<=1280]/best[height<=720]/best',
      '-o',
      template,
      url
    ],
    YTDLP_TIMEOUT_MS
  )
  if (code !== 0) return null
  return findSourceArtifact(articleId, outDir)
}

async function findSourceArtifact(articleId: number, outDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(outDir)
    const prefix = `${articleId}-src.`
    for (const e of entries) {
      if (e.startsWith(prefix)) {
        const full = join(outDir, e)
        const stat = await fs.stat(full).catch(() => null)
        if (stat && stat.size > 32 * 1024) return full
      }
    }
  } catch {
    /* no-op */
  }
  return null
}

async function cleanupSourceArtifacts(articleId: number, outDir: string): Promise<void> {
  const entries = await fs.readdir(outDir).catch(() => [])
  const prefix = `${articleId}-src.`
  await Promise.all(
    entries
      .filter((e) => e.startsWith(prefix))
      .map((e) => fs.unlink(join(outDir, e)).catch(() => undefined))
  )
}

async function scrapeVideoUrls(articleURL: string): Promise<string[]> {
  const html = await fetchHtml(articleURL)
  if (!html) return []
  const found = new Set<string>()
  const base = new URL(articleURL)

  const addMaybe = (raw: string | null | undefined): void => {
    if (!raw) return
    let abs: string
    try {
      abs = new URL(raw, base).toString()
    } catch {
      return
    }
    if (!/^https?:/i.test(abs)) return
    found.add(abs)
  }

  // og:video, og:video:url, og:video:secure_url
  for (const m of html.matchAll(
    /<meta\s+(?:[^>]*?\s)?property=["']og:video(?::url|:secure_url)?["'][^>]*?content=["']([^"']+)["']/gi
  )) {
    addMaybe(m[1])
  }
  // twitter:player:stream
  for (const m of html.matchAll(
    /<meta\s+(?:[^>]*?\s)?name=["']twitter:player:stream["'][^>]*?content=["']([^"']+)["']/gi
  )) {
    addMaybe(m[1])
  }
  // <video src=...>
  for (const m of html.matchAll(/<video\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    addMaybe(m[1])
  }
  // <source src=...> inside video tags
  for (const m of html.matchAll(/<source\b[^>]*\bsrc=["']([^"']+\.(?:mp4|m3u8|webm))[^"']*["']/gi)) {
    addMaybe(m[1])
  }
  // JSON-LD VideoObject contentUrl / embedUrl
  for (const m of html.matchAll(/"(?:contentUrl|embedUrl)"\s*:\s*"([^"]+)"/gi)) {
    addMaybe(m[1])
  }
  // iframes: map to canonical watch URL where we can.
  for (const m of html.matchAll(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    const src = m[1]
    for (const pat of IFRAME_HOST_PATTERNS) {
      if (pat.re.test(src)) {
        const canonical = pat.toWatchable(src)
        if (canonical) addMaybe(canonical)
        break
      }
    }
  }

  return Array.from(found).slice(0, 6)
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), HTML_FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Pulse/1.0'
        }
      })
      if (!res.ok) return null
      const ct = res.headers.get('content-type') ?? ''
      if (ct && !/text\/html|application\/xhtml/i.test(ct)) return null
      return await res.text()
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

async function probeDuration(srcPath: string, ffprobe: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(
      ffprobe,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        srcPath
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    let out = ''
    child.stdout?.on('data', (d) => {
      out += d.toString()
    })
    child.on('close', () => {
      const n = parseFloat(out.trim())
      resolve(Number.isFinite(n) ? n : null)
    })
    child.on('error', () => resolve(null))
    setTimeout(() => {
      child.kill('SIGKILL')
      resolve(null)
    }, 10_000)
  })
}

async function detectScenes(srcPath: string, ffmpeg: string): Promise<number[]> {
  // Use the scene filter with showinfo to dump timestamps for every detected cut.
  // Output lands on stderr; each line that matters contains "pts_time:N.NN".
  return new Promise((resolve) => {
    const child = spawn(
      ffmpeg,
      [
        '-hide_banner',
        '-i',
        srcPath,
        '-filter:v',
        `select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
        '-an',
        '-f',
        'null',
        '-'
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    )
    const times: number[] = []
    let buf = ''
    child.stderr?.on('data', (d) => {
      buf += d.toString()
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx)
        buf = buf.slice(idx + 1)
        const m = line.match(/pts_time:([\d.]+)/)
        if (m) {
          const t = parseFloat(m[1])
          if (Number.isFinite(t)) times.push(t)
        }
      }
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), FFMPEG_TIMEOUT_MS)
    child.on('close', () => {
      clearTimeout(timer)
      resolve(times)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve([])
    })
  })
}

// Pick `want` scene-start timestamps that are spread across the source so each
// clip is visually distinct. Always include t=0 as the first anchor — scene
// detection skips the very first frame by design.
export function pickClipStarts(
  sceneTimes: number[],
  duration: number,
  want: number
): number[] {
  if (want <= 0 || duration <= 0) return []
  // Only keep scenes that leave room for a full clip.
  const usable = sceneTimes.filter((t) => t >= 0 && t + CLIP_DURATION_SEC <= duration)
  const anchors = new Set<number>()
  if (duration >= CLIP_DURATION_SEC) anchors.add(0)
  for (const t of usable) anchors.add(Number(t.toFixed(2)))
  const sorted = Array.from(anchors).sort((a, b) => a - b)
  if (sorted.length === 0) return []
  if (sorted.length <= want) return sorted

  // Evenly sample `want` anchors across the sorted list, but keep at least
  // 2.5s between picks so consecutive clips aren't near-duplicates.
  const picks: number[] = []
  const step = (sorted.length - 1) / (want - 1)
  for (let i = 0; i < want; i++) {
    const idx = Math.round(i * step)
    const cand = sorted[idx]
    if (picks.length === 0 || cand - picks[picks.length - 1] >= 2.5) {
      picks.push(cand)
    }
  }
  return picks
}

async function extractClip(
  srcPath: string,
  startSec: number,
  outPath: string,
  ffmpeg: string
): Promise<boolean> {
  // `-ss` before `-i` does a fast keyframe seek. We re-encode anyway so the
  // slight imprecision is fine and saves a lot of decode time on long sources.
  await fs.mkdir(dirname(outPath), { recursive: true }).catch(() => undefined)
  const code = await runOnce(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      startSec.toFixed(2),
      '-i',
      srcPath,
      '-t',
      CLIP_DURATION_SEC.toFixed(2),
      '-vf',
      `scale=w=${CLIP_W}:h=${CLIP_H}:force_original_aspect_ratio=increase,crop=${CLIP_W}:${CLIP_H},setsar=1`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-an',
      '-movflags',
      '+faststart',
      '-y',
      outPath
    ],
    FFMPEG_TIMEOUT_MS
  )
  if (code !== 0) {
    await fs.unlink(outPath).catch(() => undefined)
    return false
  }
  return existsSync(outPath)
}

function runOnce(cmd: string, args: string[], timeoutMs: number): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'ignore'] })
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
