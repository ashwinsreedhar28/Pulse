// Sector catalog sync + backfill. Source of truth for the sector tree is
// src/data/sectorCatalog.json; this service mirrors it into the `sectors`
// table on boot and backfills ticker_sectors / override sectorIds the first
// time it runs after migration v35.

import { getDb } from '../database/connection'
import sectorCatalog from '../../data/sectorCatalog.json'
import supplyChainGraph from '../../data/supplyChainGraph.json'
import { classifyTickerSectors as routedClassify } from './aiClient'
import type { TickerSectorClassification } from './ollamaService'

export type SectorStage = {
  id: string
  name: string
  // v3+: optional legacy stage IDs so pre-v3 stored chains can map onto a
  // renamed / re-namespaced stage. Not used by the DB (ticker_sectors only
  // references sectorId), but exposed here so the renderer can resolve
  // legacy stage labels when rendering old company_value_chains rows.
  legacyIds?: string[]
}

export type Sector = {
  id: string
  parentId: string | null
  name: string
  description: string | null
  stages: SectorStage[]
}

export type TickerSector = {
  symbol: string
  sectorId: string
  isPrimary: boolean
  confidence: number | null
  source: string
  assignedAt: number
}

type CatalogEntry = {
  id: string
  parentId?: string
  // v3: sub-sector short-id used as the prefix for all of its stage ids
  // (e.g. shortId='semi' → stage ids like 'semi.foundry'). Informational
  // only — the actual prefix lives on each stage id, not derived at runtime.
  shortId?: string
  name: string
  description?: string
  stages?: SectorStage[]
  legacyIds?: string[]
}

type CatalogFile = {
  version: number
  description?: string
  sectors: CatalogEntry[]
}

type StaticGraphNode = { symbol: string; stage: string; sector: string; name: string; blurb: string }

const catalog = sectorCatalog as CatalogFile
const staticGraph = supplyChainGraph as { nodes: StaticGraphNode[] }

// Map from old supplyChainGraph.json `sector` values → new sectorId. Built
// once from the catalog's legacyIds field so the mapping lives with the
// catalog rather than being duplicated here.
function buildLegacyIdMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of catalog.sectors) {
    if (!entry.legacyIds) continue
    for (const legacy of entry.legacyIds) {
      map.set(legacy, entry.id)
    }
  }
  return map
}

// Map from pre-v3 stage ids (e.g. "tier1", "hyperscalers", "dc-power") to
// their v3 namespaced equivalents (autos.tier1, cloud.hyperscalers,
// indelec.dc-power). Built from every stage's legacyIds field across the
// catalog. Used to remap graph_node_overrides.stage and older stored-chain
// stage IDs so the Value Chain grid renders v3 columns rather than a
// mixed bag of old and new labels.
function buildLegacyStageMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of catalog.sectors) {
    if (!entry.stages) continue
    for (const stage of entry.stages) {
      if (!stage.legacyIds) continue
      for (const legacy of stage.legacyIds) {
        // First entry wins on collision — legacy stage names are supposed
        // to be globally unique across the old catalog so this rarely
        // matters, but deterministic fallback beats non-determinism.
        if (!map.has(legacy)) map.set(legacy, stage.id)
      }
    }
  }
  return map
}

// Upsert every catalog entry into the sectors table. Idempotent — reruns on
// every boot, but only writes rows that changed (version bump or new entry).
// Top-level sectors must be inserted before their children to satisfy the
// parentId FK, so we sort parents-first.
export function syncSectorCatalog(): void {
  const db = getDb()
  const now = Date.now()
  const version = catalog.version

  const sorted = [...catalog.sectors].sort((a, b) => {
    if (!a.parentId && b.parentId) return -1
    if (a.parentId && !b.parentId) return 1
    return 0
  })

  const stmt = db.prepare<
    [string, string | null, string, string | null, string | null, number, number]
  >(`
    INSERT INTO sectors (id, parentId, name, description, stagesJson, catalogVersion, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      parentId = excluded.parentId,
      name = excluded.name,
      description = excluded.description,
      stagesJson = excluded.stagesJson,
      catalogVersion = excluded.catalogVersion,
      updatedAt = excluded.updatedAt
    WHERE sectors.catalogVersion < excluded.catalogVersion
       OR sectors.name != excluded.name
       OR COALESCE(sectors.description, '') != COALESCE(excluded.description, '')
       OR COALESCE(sectors.stagesJson, '') != COALESCE(excluded.stagesJson, '')
       OR COALESCE(sectors.parentId, '') != COALESCE(excluded.parentId, '')
  `)

  const tx = db.transaction((entries: CatalogEntry[]) => {
    for (const entry of entries) {
      stmt.run(
        entry.id,
        entry.parentId ?? null,
        entry.name,
        entry.description ?? null,
        entry.stages && entry.stages.length > 0 ? JSON.stringify(entry.stages) : null,
        version,
        now
      )
    }
  })
  tx(sorted)
}

// Seed ticker_sectors from the hand-curated supplyChainGraph.json nodes.
// Only runs if the table is empty — we don't want to overwrite later
// classifier-assigned rows. Every static-graph node becomes a primary-sector
// row under the sub-sector that its old `sector` string maps to.
export function backfillTickerSectorsFromStaticGraph(): number {
  const db = getDb()
  const count = db.prepare(`SELECT COUNT(*) AS n FROM ticker_sectors`).get() as { n: number }
  if (count.n > 0) return 0

  const legacyMap = buildLegacyIdMap()
  const now = Date.now()
  const insert = db.prepare<[string, string, number, number | null, string, number]>(`
    INSERT OR IGNORE INTO ticker_sectors (symbol, sectorId, isPrimary, confidence, source, assignedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  let inserted = 0
  const tx = db.transaction(() => {
    for (const node of staticGraph.nodes) {
      const sectorId = legacyMap.get(node.sector)
      if (!sectorId) continue
      const res = insert.run(node.symbol.toUpperCase(), sectorId, 1, null, 'legacy_static_graph', now)
      if (res.changes > 0) inserted += 1
    }
  })
  tx()
  return inserted
}

// Backfill sectorId on graph_node_overrides rows that still have it null.
// The legacy `sector` text column (e.g. 'semi', 'cloud') maps via legacyIds
// from the catalog. Rows that don't match any legacy id are left null for a
// future pass.
export function backfillOverrideSectorIds(): { nodes: number; edges: number } {
  const db = getDb()
  const legacyMap = buildLegacyIdMap()
  let nodeCount = 0
  let edgeCount = 0

  const nodeRows = db
    .prepare<[], { symbol: string; sector: string | null }>(
      `SELECT symbol, sector FROM graph_node_overrides WHERE sectorId IS NULL`
    )
    .all()

  const updateNode = db.prepare<[string, string]>(
    `UPDATE graph_node_overrides SET sectorId = ? WHERE symbol = ?`
  )

  for (const row of nodeRows) {
    if (!row.sector) continue
    const sectorId = legacyMap.get(row.sector)
    if (!sectorId) continue
    updateNode.run(sectorId, row.symbol)
    nodeCount += 1
  }

  // Edges: infer sectorId from the primary sector of the `fromSymbol` side
  // (i.e., the supplier / source end). If neither endpoint is classified,
  // leave it null.
  const edgeRows = db
    .prepare<[], { fromSymbol: string; toSymbol: string }>(
      `SELECT fromSymbol, toSymbol FROM graph_edge_overrides WHERE sectorId IS NULL`
    )
    .all()

  const primaryForSymbol = db.prepare<[string], { sectorId: string }>(
    `SELECT sectorId FROM ticker_sectors WHERE symbol = ? AND isPrimary = 1 LIMIT 1`
  )
  const updateEdge = db.prepare<[string, string, string]>(
    `UPDATE graph_edge_overrides SET sectorId = ? WHERE fromSymbol = ? AND toSymbol = ?`
  )

  for (const edge of edgeRows) {
    const fromSector = primaryForSymbol.get(edge.fromSymbol)
    const sectorId = fromSector?.sectorId ?? primaryForSymbol.get(edge.toSymbol)?.sectorId ?? null
    if (!sectorId) continue
    updateEdge.run(sectorId, edge.fromSymbol, edge.toSymbol)
    edgeCount += 1
  }

  return { nodes: nodeCount, edges: edgeCount }
}

// Remap existing sector assignments that point at sector ids which no longer
// exist in the catalog. Runs after syncSectorCatalog so the DB's current-
// catalog set reflects v3 before we remap. For each stale sectorId:
//   - Check every v3 entry's legacyIds; if one matches, rewrite the row.
//   - Otherwise leave as-is; those will fail the FK check on further writes
//     until re-classified. (Unlikely to happen in practice — our curated
//     catalog has kept every v2 id covered either as a direct id or a
//     legacyId mapping.)
// Specifically annotates the source on rewritten rows with a `_v3legacy`
// suffix so we can tell which were auto-migrated vs freshly classified.
export function migrateStaleSectorIdsToV3(): void {
  const db = getDb()
  const legacyMap = buildLegacyIdMap()
  if (legacyMap.size === 0) return

  const currentIds = new Set(catalog.sectors.map((s) => s.id))

  // ticker_sectors rows whose sectorId is no longer in the catalog.
  const stale = db
    .prepare<[], { symbol: string; sectorId: string; source: string }>(
      `SELECT symbol, sectorId, source FROM ticker_sectors`
    )
    .all()
    .filter((r) => !currentIds.has(r.sectorId))
  if (stale.length > 0) {
    const update = db.prepare<[string, string, string, string]>(
      `UPDATE ticker_sectors SET sectorId = ?, source = ?
        WHERE symbol = ? AND sectorId = ?`
    )
    const tx = db.transaction(() => {
      let remapped = 0
      let dropped = 0
      for (const row of stale) {
        const newId = legacyMap.get(row.sectorId)
        if (!newId) {
          dropped += 1
          continue
        }
        const newSource = row.source.endsWith('_v3legacy')
          ? row.source
          : `${row.source}_v3legacy`
        update.run(newId, newSource, row.symbol, row.sectorId)
        remapped += 1
      }
      console.log(
        `[sectors] v3 migration: remapped ${remapped} ticker_sectors row(s), ` +
          `${dropped} unmapped (will classify on next pass)`
      )
    })
    tx()
    // Any row that couldn't be remapped would violate the FK if we tried
    // to delete the orphan sector rows below. Leave the orphans; they're
    // harmless except taking up a handful of bytes.
  }

  // graph_node_overrides.sectorId (no FK, plain TEXT). Same remap logic,
  // minus the source annotation — these rows carry an override source
  // (e.g. chain_gen_AMD) that we don't want to rewrite.
  const staleNodes = db
    .prepare<[], { symbol: string; sectorId: string }>(
      `SELECT symbol, sectorId FROM graph_node_overrides WHERE sectorId IS NOT NULL`
    )
    .all()
    .filter((r) => !currentIds.has(r.sectorId))
  if (staleNodes.length > 0) {
    const upd = db.prepare<[string, string]>(
      `UPDATE graph_node_overrides SET sectorId = ? WHERE symbol = ?`
    )
    let count = 0
    for (const r of staleNodes) {
      const newId = legacyMap.get(r.sectorId)
      if (!newId) continue
      upd.run(newId, r.symbol)
      count += 1
    }
    if (count > 0) {
      console.log(`[sectors] v3 migration: remapped ${count} graph_node_overrides sectorId(s)`)
    }
  }

  // graph_edge_overrides.sectorId (plain TEXT, same treatment). Unique on
  // (fromSymbol, toSymbol, relationship).
  const staleEdges = db
    .prepare<
      [],
      { fromSymbol: string; toSymbol: string; relationship: string; sectorId: string }
    >(
      `SELECT fromSymbol, toSymbol, relationship, sectorId
         FROM graph_edge_overrides WHERE sectorId IS NOT NULL`
    )
    .all()
    .filter((r) => !currentIds.has(r.sectorId))
  if (staleEdges.length > 0) {
    const upd = db.prepare<[string, string, string, string]>(
      `UPDATE graph_edge_overrides SET sectorId = ?
        WHERE fromSymbol = ? AND toSymbol = ? AND relationship = ?`
    )
    let count = 0
    for (const r of staleEdges) {
      const newId = legacyMap.get(r.sectorId)
      if (!newId) continue
      upd.run(newId, r.fromSymbol, r.toSymbol, r.relationship)
      count += 1
    }
    if (count > 0) {
      console.log(`[sectors] v3 migration: remapped ${count} graph_edge_overrides sectorId(s)`)
    }
  }

  // Stage-ID migration. graph_node_overrides.stage stores the string
  // that drives which column a tile renders in on the Value Chain grid.
  // Pre-v3 entries like "tier1", "hyperscalers", "dc-power" need to
  // become "autos.tier1", "cloud.hyperscalers", "indelec.dc-power" so
  // the "all sectors" view groups them under the v3 column rather than
  // a legacy bin collision with other sub-sectors' same-named stages.
  const stageMap = buildLegacyStageMap()
  if (stageMap.size > 0) {
    const allNewStageIds = new Set<string>()
    for (const entry of catalog.sectors) {
      if (!entry.stages) continue
      for (const s of entry.stages) allNewStageIds.add(s.id)
    }
    const staleStageRows = db
      .prepare<[], { symbol: string; stage: string }>(
        `SELECT symbol, stage FROM graph_node_overrides WHERE stage IS NOT NULL`
      )
      .all()
      .filter((r) => !allNewStageIds.has(r.stage))
    if (staleStageRows.length > 0) {
      const upd = db.prepare<[string, string]>(
        `UPDATE graph_node_overrides SET stage = ? WHERE symbol = ?`
      )
      let count = 0
      for (const r of staleStageRows) {
        const newStage = stageMap.get(r.stage)
        if (!newStage) continue
        upd.run(newStage, r.symbol)
        count += 1
      }
      if (count > 0) {
        console.log(
          `[sectors] v3 migration: remapped ${count} graph_node_overrides stage(s) to namespaced form`
        )
      }
    }

    // Stored per-ticker chains (company_value_chains.graphJson) carry a
    // stages[] array + every node's stage field. Rewrite each stage id
    // that's still in legacy form so the per-ticker detail view renders
    // v3 columns without the user having to regenerate every chain.
    // Edge cases (stage id the model invented that isn't in legacyIds)
    // stay as-is; regeneration fixes those individually.
    const chainRows = db
      .prepare<[], { symbol: string; graphJson: string }>(
        `SELECT symbol, graphJson FROM company_value_chains WHERE graphJson IS NOT NULL`
      )
      .all()
    const updChain = db.prepare<[string, string]>(
      `UPDATE company_value_chains SET graphJson = ? WHERE symbol = ?`
    )
    let chainCount = 0
    for (const row of chainRows) {
      try {
        const g = JSON.parse(row.graphJson) as {
          stages?: Array<{ id: string; label: string }>
          nodes?: Array<{ stage: string }>
        }
        let touched = false
        if (Array.isArray(g.stages)) {
          for (const s of g.stages) {
            const mapped = stageMap.get(s.id)
            if (mapped && mapped !== s.id) {
              s.id = mapped
              touched = true
            }
          }
        }
        if (Array.isArray(g.nodes)) {
          for (const n of g.nodes) {
            const mapped = stageMap.get(n.stage)
            if (mapped && mapped !== n.stage) {
              n.stage = mapped
              touched = true
            }
          }
        }
        if (touched) {
          updChain.run(JSON.stringify(g), row.symbol)
          chainCount += 1
        }
      } catch {
        // Malformed JSON — skip; regeneration will produce fresh output.
      }
    }
    if (chainCount > 0) {
      console.log(
        `[sectors] v3 migration: rewrote stage ids in ${chainCount} stored chain(s)`
      )
    }
  }
}

export function bootstrapSectorCatalog(): void {
  syncSectorCatalog()
  // Remap before backfill so any existing rows pointing at retired v2 ids
  // land on their v3 replacements first; backfill then only fills the
  // never-populated rows.
  migrateStaleSectorIdsToV3()
  const seeded = backfillTickerSectorsFromStaticGraph()
  if (seeded > 0) {
    console.log(`[sectors] seeded ${seeded} ticker_sectors rows from static graph`)
  }
  const back = backfillOverrideSectorIds()
  if (back.nodes > 0 || back.edges > 0) {
    console.log(
      `[sectors] backfilled sectorId on ${back.nodes} node override(s) + ${back.edges} edge override(s)`
    )
  }
}

// ----- Query helpers --------------------------------------------------------

function rowToSector(row: {
  id: string
  parentId: string | null
  name: string
  description: string | null
  stagesJson: string | null
}): Sector {
  let stages: SectorStage[] = []
  if (row.stagesJson) {
    try {
      const parsed = JSON.parse(row.stagesJson)
      if (Array.isArray(parsed)) stages = parsed
    } catch {
      // Malformed row — treat as no stages rather than crashing.
    }
  }
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    description: row.description,
    stages
  }
}

export function getSector(id: string): Sector | null {
  const row = getDb()
    .prepare<
      [string],
      { id: string; parentId: string | null; name: string; description: string | null; stagesJson: string | null }
    >(`SELECT id, parentId, name, description, stagesJson FROM sectors WHERE id = ?`)
    .get(id)
  return row ? rowToSector(row) : null
}

export function listSectors(): Sector[] {
  return getDb()
    .prepare<
      [],
      { id: string; parentId: string | null; name: string; description: string | null; stagesJson: string | null }
    >(`SELECT id, parentId, name, description, stagesJson FROM sectors ORDER BY parentId NULLS FIRST, name`)
    .all()
    .map(rowToSector)
}

export function listTopLevelSectors(): Sector[] {
  return getDb()
    .prepare<
      [],
      { id: string; parentId: string | null; name: string; description: string | null; stagesJson: string | null }
    >(`SELECT id, parentId, name, description, stagesJson FROM sectors WHERE parentId IS NULL ORDER BY name`)
    .all()
    .map(rowToSector)
}

export function listChildSectors(parentId: string): Sector[] {
  return getDb()
    .prepare<
      [string],
      { id: string; parentId: string | null; name: string; description: string | null; stagesJson: string | null }
    >(`SELECT id, parentId, name, description, stagesJson FROM sectors WHERE parentId = ? ORDER BY name`)
    .all(parentId)
    .map(rowToSector)
}

export function getSectorsForSymbol(symbol: string): TickerSector[] {
  return getDb()
    .prepare<
      [string],
      {
        symbol: string
        sectorId: string
        isPrimary: number
        confidence: number | null
        source: string
        assignedAt: number
      }
    >(
      `SELECT symbol, sectorId, isPrimary, confidence, source, assignedAt
         FROM ticker_sectors
        WHERE symbol = ?
        ORDER BY isPrimary DESC, assignedAt DESC`
    )
    .all(symbol.toUpperCase())
    .map((r) => ({
      symbol: r.symbol,
      sectorId: r.sectorId,
      isPrimary: r.isPrimary === 1,
      confidence: r.confidence,
      source: r.source,
      assignedAt: r.assignedAt
    }))
}

export function getPrimarySectorForSymbol(symbol: string): TickerSector | null {
  const rows = getSectorsForSymbol(symbol)
  return rows.find((r) => r.isPrimary) ?? null
}

export function listSymbolsInSector(sectorId: string): string[] {
  return getDb()
    .prepare<[string], { symbol: string }>(
      `SELECT symbol FROM ticker_sectors WHERE sectorId = ? ORDER BY isPrimary DESC, symbol`
    )
    .all(sectorId)
    .map((r) => r.symbol)
}

// ----- Classifier integration ----------------------------------------------

// Max secondary sectors we keep from the classifier. Upper bound, not a
// target — covers Amazon (ecom + cloud + media + logistics = 4 secondaries)
// while clipping pathological conglomerates like Berkshire.
const MAX_SECONDARY_SECTORS = 5
// Confidence floor for keeping a secondary. Primary bypasses the floor —
// the classifier must pick one primary even if it's uncertain.
const SECONDARY_CONFIDENCE_FLOOR = 0.6

// Render the in-memory catalog for the classifier prompt. Hierarchical,
// with two-space indent per nesting level, `(id)` suffix for exact-match
// lookup, and optional short description. Top-level sectors without
// descriptions still render so the model sees the full tree.
export function renderSectorCatalogForPrompt(): string {
  const topLevel = catalog.sectors.filter((s) => !s.parentId)
  const childrenByParent = new Map<string, CatalogEntry[]>()
  for (const entry of catalog.sectors) {
    if (!entry.parentId) continue
    const bucket = childrenByParent.get(entry.parentId) ?? []
    bucket.push(entry)
    childrenByParent.set(entry.parentId, bucket)
  }

  const lines: string[] = []
  const pushEntry = (entry: CatalogEntry, depth: number): void => {
    const indent = '  '.repeat(depth)
    const desc = entry.description ? ` — ${entry.description}` : ''
    lines.push(`${indent}- ${entry.name} (${entry.id})${desc}`)
    const children = childrenByParent.get(entry.id) ?? []
    for (const child of children) pushEntry(child, depth + 1)
  }
  for (const top of topLevel) pushEntry(top, 0)
  return lines.join('\n')
}

// Full set of valid sector ids the classifier is allowed to return.
export function listValidSectorIds(): string[] {
  return catalog.sectors.map((s) => s.id)
}

// Write classifier output to ticker_sectors. Idempotent — replaces any
// prior classifier-assigned rows (source='ollama_classify') and the
// legacy backfill (source='legacy_static_graph'), then inserts the new
// primary + filtered secondaries. Legacy rows are wiped because the
// classifier's assignment is strictly more informed.
function persistClassification(
  symbol: string,
  classification: TickerSectorClassification
): void {
  const db = getDb()
  const now = Date.now()
  const sym = symbol.toUpperCase()

  const secondaries = classification.secondary
    .filter((s) => s.confidence >= SECONDARY_CONFIDENCE_FLOOR)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_SECONDARY_SECTORS)

  const del = db.prepare<[string]>(
    `DELETE FROM ticker_sectors
      WHERE symbol = ?
        AND source IN ('legacy_static_graph', 'ollama_classify')`
  )
  const insert = db.prepare<[string, string, number, number, string, number]>(
    `INSERT OR REPLACE INTO ticker_sectors
       (symbol, sectorId, isPrimary, confidence, source, assignedAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  const tx = db.transaction(() => {
    del.run(sym)
    insert.run(
      sym,
      classification.primary.sectorId,
      1,
      classification.primary.confidence,
      'ollama_classify',
      now
    )
    for (const sec of secondaries) {
      insert.run(sym, sec.sectorId, 0, sec.confidence, 'ollama_classify', now)
    }
  })
  tx()
}

// Returns true if this ticker has already been run through the Ollama
// classifier (as opposed to just having a legacy backfill row).
export function hasClassifierAssignment(symbol: string): boolean {
  const row = getDb()
    .prepare<[string], { n: number }>(
      `SELECT COUNT(*) AS n FROM ticker_sectors
        WHERE symbol = ? AND source = 'ollama_classify'`
    )
    .get(symbol.toUpperCase())
  return (row?.n ?? 0) > 0
}

// Classify a ticker and persist results. Callers that already have
// grounding context (profile, 10-K excerpt) pass it in; the classifier
// is much stronger with real text than priors alone.
//
// - force=false (default) returns early if the ticker already has
//   classifier-assigned sectors.
// - Returns the classification on success, null on Ollama offline /
//   malformed output / empty inputs.
export async function ensureTickerSectorsClassified(input: {
  symbol: string
  companyName: string
  profileDescription?: string | null
  tenKExcerpt?: string | null
  force?: boolean
}): Promise<TickerSectorClassification | null> {
  const sym = input.symbol.trim().toUpperCase()
  if (!sym) return null
  if (!input.force && hasClassifierAssignment(sym)) return null

  const { result } = await routedClassify({
    symbol: sym,
    companyName: input.companyName,
    profileDescription: input.profileDescription ?? null,
    tenKExcerpt: input.tenKExcerpt ?? null,
    sectorCatalogPrompt: renderSectorCatalogForPrompt(),
    validSectorIds: listValidSectorIds()
  })
  if (!result) return null
  persistClassification(sym, result)
  return result
}

// Sector with content counts — used for dynamic tab rendering in the
// unified value-chain UI. A sector "has content" if at least one ticker is
// assigned to it (primary or secondary) OR any of its descendant sectors
// do. Top-level sectors roll up their children's counts so the UI can
// decide which GICS tops to surface.
export interface SectorWithContent extends Sector {
  tickerCount: number
  // When parentId is null (top-level): aggregated count across descendants.
  descendantTickerCount: number
}

export function listSectorsWithContent(): SectorWithContent[] {
  const db = getDb()
  // Count symbols in ticker_sectors (classified primaries) plus symbols
  // tagged on graph_node_overrides (absorbed from generated chains). A
  // sector can legitimately have content from EITHER source — if a ticker
  // lands via absorption without an explicit classifier pass, we still
  // want its sector tab to appear. Union-dedupe via a Set per sectorId
  // so the same symbol coming from both sources counts once.
  const rows = db
    .prepare<[], { sectorId: string; symbol: string }>(
      `SELECT sectorId, symbol FROM ticker_sectors
       UNION
       SELECT sectorId, symbol FROM graph_node_overrides WHERE sectorId IS NOT NULL`
    )
    .all()
  const bySector = new Map<string, Set<string>>()
  for (const r of rows) {
    const bucket = bySector.get(r.sectorId) ?? new Set<string>()
    bucket.add(r.symbol.toUpperCase())
    bySector.set(r.sectorId, bucket)
  }
  const directCount = new Map<string, number>()
  for (const [sid, symbols] of bySector) directCount.set(sid, symbols.size)

  const sectors = listSectors()
  const childrenBy = new Map<string, Sector[]>()
  for (const s of sectors) {
    if (!s.parentId) continue
    const bucket = childrenBy.get(s.parentId) ?? []
    bucket.push(s)
    childrenBy.set(s.parentId, bucket)
  }

  // Depth-first sum of ticker counts under a given sector id. Top-level
  // sectors surface a rolled-up number; leaves just return their direct count.
  const descendantTotal = (id: string): number => {
    let total = directCount.get(id) ?? 0
    for (const child of childrenBy.get(id) ?? []) {
      total += descendantTotal(child.id)
    }
    return total
  }

  return sectors.map((s) => ({
    ...s,
    tickerCount: directCount.get(s.id) ?? 0,
    descendantTickerCount: descendantTotal(s.id)
  }))
}

// Map of symbol → primary sectorId. Used in the unified renderer for
// cross-sector edge detection (compare top-level ancestors of the two
// endpoints) and sector-tab filtering. One query, one pass — cheaper than
// per-symbol getPrimarySectorForSymbol() in a hot loop.
export function buildPrimarySectorIndex(): Record<string, string> {
  const rows = getDb()
    .prepare<[], { symbol: string; sectorId: string }>(
      `SELECT symbol, sectorId FROM ticker_sectors WHERE isPrimary = 1`
    )
    .all()
  const out: Record<string, string> = {}
  for (const r of rows) out[r.symbol] = r.sectorId
  return out
}

// Walk a sector up to its GICS-11 top-level parent. Used by cross-sector
// link detection — two symbols are in different top-levels iff their
// primary sectors resolve to different root ids.
export function getTopLevelAncestor(sectorId: string): string | null {
  let current: string | null = sectorId
  const visited = new Set<string>()
  while (current) {
    if (visited.has(current)) return null // cycle guard
    visited.add(current)
    const row = getDb()
      .prepare<[string], { parentId: string | null }>(`SELECT parentId FROM sectors WHERE id = ?`)
      .get(current)
    if (!row) return null
    if (!row.parentId) return current
    current = row.parentId
  }
  return null
}
