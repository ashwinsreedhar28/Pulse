// Seeds a broad per-sector ticker universe.
//
// Coverage was extremely lopsided: Information Technology had 106 assigned
// symbols and every other GICS sector had between 0 and 23, with 359 ticker
// rows carrying no sector at all. That skews everything built on top —
// sector filters in the market graph, cross-sector edge detection, and the
// size buckets in the event study all silently described a semiconductor
// watchlist rather than a market.
//
// Symbols are added PASSIVE (isActive = 0). They exist to give the graph and
// sector views real breadth; they are not watchlist entries, do not generate
// per-ticker RSS feeds, and do not trigger notifications.
//
// Safe to run repeatedly: existing rows are never modified, existing sector
// assignments are never overwritten, and an active ticker is never demoted.
//
// This is only viable because stocksScheduler now bounds its fan-out
// (MAX_SYMBOLS_PER_TICK). Before that it polled every ticker row every tick,
// so adding ~1,100 symbols would have pushed Yahoo from ~500 to ~1,600
// requests/minute — well past the rate limit, where fetchQuoteOne returns an
// empty quote and prices simply go blank app-wide.

import universe from '../../data/sectorUniverse.json'
import { getDb } from '../database/connection'

interface SeedResult {
  tickersAdded: number
  assignmentsAdded: number
  bySector: Record<string, number>
}

export function seedSectorUniverse(): SeedResult {
  const db = getDb()
  const now = Date.now()
  const entries = Object.entries(universe as Record<string, string[]>)

  // Only seed sectors that actually exist in the catalog, so a rename there
  // surfaces as a skipped sector rather than orphaned assignment rows.
  const known = new Set(
    db
      .prepare<[], { id: string }>(`SELECT id FROM sectors`)
      .all()
      .map((r) => r.id)
  )

  const insertTicker = db.prepare(
    `INSERT OR IGNORE INTO tickers (symbol, companyName, isActive, addedAt)
     VALUES (?, ?, 0, ?)`
  )
  // OR IGNORE, not upsert: a symbol already assigned to a sector — especially
  // one the user or the classifier chose — must win over this static list.
  const insertAssignment = db.prepare(
    `INSERT OR IGNORE INTO ticker_sectors
       (symbol, sectorId, isPrimary, confidence, source, assignedAt)
     VALUES (?, ?, 1, 0.6, 'sector_universe_seed', ?)`
  )
  const hasPrimary = db.prepare<[string], { n: number }>(
    `SELECT COUNT(*) AS n FROM ticker_sectors WHERE symbol = ? AND isPrimary = 1`
  )

  let tickersAdded = 0
  let assignmentsAdded = 0
  const bySector: Record<string, number> = {}

  const run = db.transaction(() => {
    for (const [sectorId, symbols] of entries) {
      if (!known.has(sectorId)) {
        console.warn(`[sector-universe] unknown sector '${sectorId}' — skipped`)
        continue
      }
      let n = 0
      for (const raw of symbols) {
        const symbol = raw.trim().toUpperCase()
        if (!symbol) continue
        // companyName is required and not in the seed list. The symbol is an
        // honest placeholder; companyNameResolver and the Yahoo profile path
        // fill in the real name when the ticker is first touched.
        tickersAdded += insertTicker.run(symbol, symbol, now).changes
        // Don't add a second primary for a symbol that already has one.
        if ((hasPrimary.get(symbol)?.n ?? 0) > 0) continue
        const added = insertAssignment.run(symbol, sectorId, now).changes
        assignmentsAdded += added
        n += added
      }
      bySector[sectorId] = n
    }
  })
  run()

  return { tickersAdded, assignmentsAdded, bySector }
}

// Per-top-level-sector counts, walking the sector tree so subsector
// assignments roll up. Backs the seeding log and is useful for spotting
// coverage gaps.
export function sectorCoverage(): Array<{ sectorId: string; name: string; count: number }> {
  return getDb()
    .prepare<[], { sectorId: string; name: string; count: number }>(
      `WITH RECURSIVE up(sid, top) AS (
         SELECT id, id FROM sectors WHERE parentId IS NULL
         UNION ALL
         SELECT s.id, up.top FROM sectors s JOIN up ON s.parentId = up.sid
       )
       SELECT sec.id AS sectorId, sec.name AS name,
              COUNT(DISTINCT ts.symbol) AS count
         FROM sectors sec
         LEFT JOIN up ON up.top = sec.id
         LEFT JOIN ticker_sectors ts ON ts.sectorId = up.sid
        WHERE sec.parentId IS NULL
        GROUP BY sec.id
        ORDER BY count DESC`
    )
    .all()
}
