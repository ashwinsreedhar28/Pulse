import { getDb } from './connection'
import type { Domain } from './categories'

export interface Reel {
  id: number
  articleId: number
  script: string
  beats: string[]
  keyframes: string[]
  videoClips: string[]
  audioFile: string
  durationMs: number | null
  createdAt: number
  articleTitle: string
  articleSummary: string | null
  articleURL: string
  articleImageURL: string | null
  feedTitle: string
  domain: Domain
  publishedAt: number | null
}

interface ReelRow {
  id: number
  articleId: number
  script: string
  beats: string
  keyframes: string
  videoClips: string
  audioFile: string
  durationMs: number | null
  createdAt: number
  articleTitle: string
  articleSummary: string | null
  articleURL: string
  articleImageURL: string | null
  feedTitle: string
  domain: Domain
  publishedAt: number | null
}

function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((b): b is string => typeof b === 'string')
    }
  } catch {
    /* empty */
  }
  return []
}

function toReel(row: ReelRow): Reel {
  return {
    id: row.id,
    articleId: row.articleId,
    script: row.script,
    beats: parseJsonStringArray(row.beats),
    keyframes: parseJsonStringArray(row.keyframes),
    videoClips: parseJsonStringArray(row.videoClips),
    audioFile: row.audioFile,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    articleTitle: row.articleTitle,
    articleSummary: row.articleSummary,
    articleURL: row.articleURL,
    articleImageURL: row.articleImageURL,
    feedTitle: row.feedTitle,
    domain: row.domain,
    publishedAt: row.publishedAt
  }
}

const LIST_SQL = `
  SELECT
    r.id, r.articleId, r.script, r.beats, r.keyframes, r.videoClips,
    r.audioFile, r.durationMs, r.createdAt,
    a.title AS articleTitle,
    a.summary AS articleSummary,
    a.url AS articleURL,
    a.imageURL AS articleImageURL,
    a.domain AS domain,
    a.publishedAt AS publishedAt,
    f.title AS feedTitle
  FROM reels r
  JOIN articles a ON a.id = r.articleId
  JOIN feeds f ON f.id = a.feedId
  ORDER BY r.createdAt DESC
`

export function listReels(limit = 50): Reel[] {
  const rows = getDb()
    .prepare<[number], ReelRow>(`${LIST_SQL} LIMIT ?`)
    .all(limit)
  return rows.map(toReel)
}

export function countReels(): number {
  const row = getDb().prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM reels`).get()
  return row?.c ?? 0
}

export function getReelByArticleId(articleId: number): Reel | null {
  const row = getDb()
    .prepare<[number], ReelRow>(
      LIST_SQL.replace('ORDER BY r.createdAt DESC', 'WHERE r.articleId = ?')
    )
    .get(articleId)
  return row ? toReel(row) : null
}

export interface InsertReelInput {
  articleId: number
  script: string
  beats: string[]
  keyframes: string[]
  videoClips: string[]
  audioFile: string
  durationMs: number | null
}

export function insertReel(input: InsertReelInput): number {
  const res = getDb()
    .prepare(
      `INSERT INTO reels (articleId, script, beats, keyframes, videoClips, audioFile, durationMs, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.articleId,
      input.script,
      JSON.stringify(input.beats),
      JSON.stringify(input.keyframes),
      JSON.stringify(input.videoClips),
      input.audioFile,
      input.durationMs,
      Date.now()
    )
  return Number(res.lastInsertRowid)
}

export function updateReelKeyframes(id: number, keyframes: string[]): void {
  getDb()
    .prepare(`UPDATE reels SET keyframes = ? WHERE id = ?`)
    .run(JSON.stringify(keyframes), id)
}

export function updateReelVideoClips(id: number, videoClips: string[]): void {
  getDb()
    .prepare(`UPDATE reels SET videoClips = ? WHERE id = ?`)
    .run(JSON.stringify(videoClips), id)
}

export interface ReelFiles {
  audioFile: string
  keyframes: string[]
  videoClips: string[]
}

export function deleteReel(id: number): ReelFiles | null {
  const row = getDb()
    .prepare<[number], { audioFile: string; keyframes: string; videoClips: string }>(
      `SELECT audioFile, keyframes, videoClips FROM reels WHERE id = ?`
    )
    .get(id)
  getDb().prepare(`DELETE FROM reels WHERE id = ?`).run(id)
  if (!row) return null
  return {
    audioFile: row.audioFile,
    keyframes: parseJsonStringArray(row.keyframes),
    videoClips: parseJsonStringArray(row.videoClips)
  }
}

export function deleteReelsOlderThan(cutoff: number): ReelFiles[] {
  const rows = getDb()
    .prepare<[number], { audioFile: string; keyframes: string; videoClips: string }>(
      `SELECT audioFile, keyframes, videoClips FROM reels WHERE createdAt < ?`
    )
    .all(cutoff)
  getDb().prepare(`DELETE FROM reels WHERE createdAt < ?`).run(cutoff)
  return rows.map((r) => ({
    audioFile: r.audioFile,
    keyframes: parseJsonStringArray(r.keyframes),
    videoClips: parseJsonStringArray(r.videoClips)
  }))
}

export function listReelArticleIds(): Set<number> {
  const rows = getDb().prepare<[], { articleId: number }>(`SELECT articleId FROM reels`).all()
  return new Set(rows.map((r) => r.articleId))
}

export function updateReelAudio(
  id: number,
  audioFile: string,
  durationMs: number | null
): void {
  getDb()
    .prepare(`UPDATE reels SET audioFile = ?, durationMs = ? WHERE id = ?`)
    .run(audioFile, durationMs, id)
}
