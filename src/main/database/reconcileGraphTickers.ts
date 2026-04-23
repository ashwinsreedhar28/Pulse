import type { Database } from 'better-sqlite3'
import graph from '../../data/supplyChainGraph.json'

interface GraphNode {
  symbol: string
  name?: string
  sector?: string
}
interface GraphShape {
  nodes: GraphNode[]
}

// Known-delisted or merged tickers. Migration v26 deleted JNPR after HPE
// closed the acquisition — re-seeding it here would re-break quote polling.
// Keep this list narrow; prefer fixing the graph JSON for longer-term drops.
const DELISTED = new Set<string>(['JNPR'])

// Ensures every symbol referenced in supplyChainGraph.json has a row in the
// `tickers` table so the stocks scheduler polls a quote for it and the detail
// page has somewhere to land. Runs every boot after migrations — new symbols
// added to the graph JSON land automatically without authoring a migration.
//
// Rows are inserted with isActive=0 (passive) matching the convention
// established in the v22/v24/v25 seed waves: polled for quotes, but not in
// the user's watchlist until they promote it.
export function reconcileGraphTickers(db: Database): void {
  const g = graph as GraphShape
  const insert = db.prepare(
    `INSERT OR IGNORE INTO tickers (symbol, companyName, sector, industry, isActive, addedAt)
     VALUES (?, ?, ?, ?, 0, ?)`
  )
  const now = Date.now()
  let added = 0
  const apply = db.transaction((): void => {
    for (const n of g.nodes) {
      if (DELISTED.has(n.symbol)) continue
      const res = insert.run(n.symbol, n.name ?? n.symbol, n.sector ?? null, null, now)
      if (res.changes > 0) added++
    }
  })
  apply()
  if (added > 0) {
    console.log(`[db] reconcileGraphTickers: added ${added} missing ticker row(s)`)
  }
}
