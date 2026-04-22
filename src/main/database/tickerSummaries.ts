import { getDb } from './connection'

export interface TickerSummary {
  tickerId: number
  summary: string | null
  articleCount: number
  // Headlines the LLM judged materially about the ticker. Null means the
  // judgment never ran (Ollama offline, transient failure, or pre-v22 row).
  relevantCount: number | null
  generatedAt: number
  lastArticleAt: number | null
}

export function getTickerSummary(tickerId: number): TickerSummary | null {
  const row = getDb()
    .prepare<[number], TickerSummary>(
      `SELECT tickerId, summary, articleCount, relevantCount, generatedAt, lastArticleAt
       FROM ticker_summaries WHERE tickerId = ?`
    )
    .get(tickerId)
  return row ?? null
}

export function upsertTickerSummary(s: TickerSummary): void {
  getDb()
    .prepare(
      `INSERT INTO ticker_summaries
         (tickerId, summary, articleCount, relevantCount, generatedAt, lastArticleAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(tickerId) DO UPDATE SET
         summary = excluded.summary,
         articleCount = excluded.articleCount,
         relevantCount = excluded.relevantCount,
         generatedAt = excluded.generatedAt,
         lastArticleAt = excluded.lastArticleAt`
    )
    .run(
      s.tickerId,
      s.summary,
      s.articleCount,
      s.relevantCount,
      s.generatedAt,
      s.lastArticleAt
    )
}
