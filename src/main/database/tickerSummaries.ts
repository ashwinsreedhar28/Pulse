import { getDb } from './connection'

export interface TickerSummary {
  tickerId: number
  summary: string | null
  articleCount: number
  generatedAt: number
  lastArticleAt: number | null
}

export function getTickerSummary(tickerId: number): TickerSummary | null {
  const row = getDb()
    .prepare<[number], TickerSummary>(
      `SELECT tickerId, summary, articleCount, generatedAt, lastArticleAt
       FROM ticker_summaries WHERE tickerId = ?`
    )
    .get(tickerId)
  return row ?? null
}

export function upsertTickerSummary(s: TickerSummary): void {
  getDb()
    .prepare(
      `INSERT INTO ticker_summaries (tickerId, summary, articleCount, generatedAt, lastArticleAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tickerId) DO UPDATE SET
         summary = excluded.summary,
         articleCount = excluded.articleCount,
         generatedAt = excluded.generatedAt,
         lastArticleAt = excluded.lastArticleAt`
    )
    .run(s.tickerId, s.summary, s.articleCount, s.generatedAt, s.lastArticleAt)
}
