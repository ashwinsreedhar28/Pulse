// Orchestrator for the "Generate value chain" button on the stock detail
// page. Pulls every grounding source we have for a ticker — company
// profile, latest 10-K Item 1, recent news — and hands them to the
// generateCompanyValueChain Ollama prompt, then resolves the returned
// node symbols to real tickers via companyNameResolver so links back to
// ticker detail pages work for the ones we can verify.

import { BrowserWindow } from 'electron'
import { JSDOM, VirtualConsole } from 'jsdom'

import { getDb } from '../database/connection'
import {
  getCompanyValueChain,
  getEdgesMentioningSymbol,
  listCompanyValueChainSymbols,
  setCompanyValueChain,
  type CompanyValueChain,
  type CompanyValueChainNode
} from '../database/companyValueChains'
import { getTickerBySymbol, listTickers } from '../database/tickers'
import { getFilingsForSymbol, lookupCik, type SecFiling } from '../database/secFilings'
import { resolveCompanyName } from './companyNameResolver'
import { ensureCompanyProfile, getCompanyProfile } from './companyProfileService'
import { generateCompanyValueChain as routedGenerate } from './aiClient'
import type { GeneratedValueChain } from './ollamaService'
import { buildPrimaryDocUrl } from './secService'
import { forceRefreshFilings } from './secFilingsService'
import {
  ensureTickerSectorsClassified,
  getPrimarySectorForSymbol,
  getSector
} from './sectorService'
import { absorbGeneratedChain } from './chainAbsorberService'

const UA = 'Pulse Desktop (ashwin.sreedhar2003@gmail.com)'
const FETCH_TIMEOUT_MS = 30_000

function isAnnualReport(filing: SecFiling): boolean {
  return filing.formType === '10-K' || filing.formType === '10-K/A'
}

async function fetchTenKExcerpt(symbol: string): Promise<string | null> {
  const filings = getFilingsForSymbol(symbol, 10).filter(isAnnualReport)
  const latest = filings[0]
  if (!latest) return null
  const url = buildPrimaryDocUrl(latest.cik, latest.accessionNumber, latest.primaryDocument)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html, application/xhtml+xml, text/plain'
      },
      signal: controller.signal
    })
    if (!res.ok) return null
    const html = await res.text()
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('error', () => {})
    virtualConsole.on('jsdomError', () => {})
    const dom = new JSDOM(html, { virtualConsole })
    const doc = dom.window.document
    for (const el of Array.from(doc.querySelectorAll('script, style, noscript'))) {
      el.remove()
    }
    const text = (doc.body?.textContent ?? '')
      .replace(/ /g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text.length < 500) return null
    // Slice to Item 1 (Business) — concentrated value-chain info lives
    // there. Fallback to the first 6k chars when the marker isn't present.
    const m = /item\s+1\.\s*business/i.exec(text)
    if (m) {
      const start = Math.max(0, m.index - 200)
      return text.slice(start, Math.min(text.length, start + 6000))
    }
    return text.slice(0, 6000)
  } catch (err) {
    console.warn(
      `[companyChain] 10-K fetch failed for ${symbol}:`,
      err instanceof Error ? err.message : err
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Quick pull of the 6 most recent articles tagged to this symbol. Keeps the
// grounding context concise; we're feeding this into a fairly long prompt
// already.
function fetchRecentNews(
  symbol: string
): Array<{ title: string; summary: string | null }> {
  return getDb()
    .prepare<[string, number], { title: string; summary: string | null }>(
      `SELECT a.title, a.summary
         FROM articles a
         JOIN article_ticker_matches m ON m.articleId = a.id
        WHERE m.symbol = ?
        ORDER BY a.publishedAt DESC
        LIMIT ?`
    )
    .all(symbol.toUpperCase(), 6)
}

function broadcastUpdated(symbol: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('companyChain:updated', symbol.toUpperCase())
    }
  }
}

// Resolve Ollama-named companies to real tickers so the detail-page links
// work. Model-emitted symbols come in two flavors:
//   - Ticker-shaped ("KO", "CCEP"): try to verify via the resolver.
//   - Underscore labels ("SUEZ_WATER"): derive a search key from the name
//     field instead and see if the resolver matches it.
// Unresolvable nodes still render — they just carry kind='unverified' so
// the UI can flag them as inferred rather than grounded.
function resolveNodes(
  rawNodes: GeneratedValueChain['nodes'],
  focusSymbol: string
): CompanyValueChainNode[] {
  const out: CompanyValueChainNode[] = []
  for (const n of rawNodes) {
    // Focus node is always treated as a verified ticker.
    if (n.symbol === focusSymbol) {
      out.push({
        symbol: n.symbol,
        stage: n.stage,
        name: n.name,
        blurb: n.blurb,
        kind: 'ticker'
      })
      continue
    }
    const tickerLike = /^[A-Z]{1,5}(\.[A-Z]{1,3})?$/.test(n.symbol)
    // "Both agree" path: when the model emits a ticker-shaped symbol and
    // the resolver independently arrives at the same symbol from the
    // company name, that's a two-source convergence — strongest form of
    // verification. Accept at any resolver score because the convergence
    // itself is the signal. The isTicker flag from Ollama is ignored here
    // because the model often hedges and sets it to false even when both
    // sides clearly agree (observed for BAC, WFC, C etc.).
    if (tickerLike) {
      const resolved = resolveCompanyName(n.name)
      if (resolved && resolved.symbol === n.symbol) {
        out.push({
          symbol: n.symbol,
          stage: n.stage,
          name: n.name,
          blurb: n.blurb,
          kind: 'ticker'
        })
        continue
      }
      // Second chance: when the model's name IS just the ticker symbol
      // (e.g., {symbol: "UPS", name: "UPS"}), the resolver has nothing to
      // go on — "ups" normalized doesn't match "united parcel service".
      // Verify directly against the SEC ticker map: if a real filer with
      // that symbol exists, trust the model's claim. The tickerLike shape
      // guard keeps placeholder labels (PRIVATE_LABEL_MFG, BBBY_DC) out.
      if (n.name.trim().toUpperCase() === n.symbol && lookupCik(n.symbol)) {
        out.push({
          symbol: n.symbol,
          stage: n.stage,
          name: n.name,
          blurb: n.blurb,
          kind: 'ticker'
        })
        continue
      }
      // Third chance: resolver found NOTHING (not a different ticker, just
      // null) AND the model's claimed symbol exists in sec_cik_map. The
      // typical case is {symbol: TSM, name: "TSMC"} — "tsmc" doesn't
      // normalize to anything SEC carries, so resolver returns null. But
      // TSM IS a real filer, so trusting the claim is safe. We explicitly
      // guard on resolved===null so that when the resolver DOES find a
      // different canonical (e.g., SCHL + "Schlumberger Limited" → SLB),
      // we fall through to the name-only path below and adopt the
      // resolver's correction rather than the model's (wrong) ticker.
      if (!resolved && lookupCik(n.symbol)) {
        out.push({
          symbol: n.symbol,
          stage: n.stage,
          name: n.name,
          blurb: n.blurb,
          kind: 'ticker'
        })
        continue
      }
    }
    // Name-only path: the model's ticker disagrees with the resolver (or
    // isn't ticker-shaped), but the name alone resolves. Accept the
    // resolver's symbol in place of the model's.
    const resolved = resolveCompanyName(n.name)
    // 0.75 = word-boundary match with multi-candidate disambiguation
    // ("Siemens AG" → SMERY, "Coherent" → COHR, "Kioxia" → KXIAY,
    // "CATL" → CYATY, "Alps Alpine" → ALPS). 0.8+ = exact normalize hit
    // or acronym match. Originally we gated at 0.8 which left the 0.75
    // word-boundary hits stranded — regen logs showed a dozen of them.
    // 0.75 stays safe because word-boundary requires a whole-word match,
    // not fuzzy overlap.
    if (resolved && resolved.score >= 0.75) {
      out.push({
        symbol: resolved.symbol,
        stage: n.stage,
        name: n.name,
        blurb: n.blurb,
        kind: 'ticker'
      })
      continue
    }
    // Fall through: keep as unverified node. Log what fell through so the
    // user can spot systematic classifier gaps (e.g. a legacy-name the
    // model keeps emitting that deserves a NAME_ALIASES entry).
    console.log(
      `[companyChain] unverified node: claimed=${n.symbol} name="${n.name}"` +
        (resolved ? ` (resolver: ${resolved.symbol}@${resolved.score.toFixed(2)})` : ' (resolver: miss)')
    )
    out.push({
      symbol: n.symbol,
      stage: n.stage,
      name: n.name,
      blurb: n.blurb,
      kind: 'unverified'
    })
  }
  return out
}

// Claude (and Ollama) frequently emit edges that reference companies using
// slightly different symbol strings than the nodes array uses — "MACOM" in
// edges vs "MTSI" in nodes, "AMKOR" vs "AMKR", "ASE" vs "ASX", "SMSN" vs
// "SSNLF", "INFINEON" vs "IFNNY". The downstream absorber requires BOTH
// endpoints to exist in the chain's node list, so these mismatches cause
// every edge touching the renamed entity to silently drop — leaving the
// node stranded with zero connections in the unified Value Chain + Diagram
// views. We canonicalize here: build an alias index from node names, then
// rewrite edges. Drops edges whose endpoints we still can't resolve.
type ChainEdge = {
  from: string
  to: string
  relationship: 'supplier' | 'customer' | 'competitor' | 'partner'
  note: string | null
  source: 'filings' | 'news' | 'profile' | 'model' | null
}

// Re-frame a foreign edge relative to a specific focus. The source chain
// stored the edge as "from does X to to"; the generator prompt wants
// "counterparty does X to/from focus" so it doesn't have to back-compute.
// supplier/customer flip when the focus is on the `to` side of the source
// edge; competitor/partner are symmetric and pass through unchanged.
function relToFocus(
  focusIsFromSide: boolean,
  rel: 'supplier' | 'customer' | 'competitor' | 'partner'
): 'supplies-focus' | 'buys-from-focus' | 'competes-with-focus' | 'partners-with-focus' {
  if (rel === 'competitor') return 'competes-with-focus'
  if (rel === 'partner') return 'partners-with-focus'
  // supplier: source-chain says "from supplies to". If focus is `to`, then
  // the counterparty (`from`) supplies focus. If focus is `from`, then
  // counterparty (`to`) BUYS FROM focus.
  if (rel === 'supplier') {
    return focusIsFromSide ? 'buys-from-focus' : 'supplies-focus'
  }
  // customer: source-chain says "from is customer of to". If focus is
  // `from`, counterparty (`to`) supplies focus. If focus is `to`,
  // counterparty (`from`) buys from focus.
  return focusIsFromSide ? 'supplies-focus' : 'buys-from-focus'
}

function canonicalizeEdges(
  rawEdges: ChainEdge[],
  resolvedNodes: CompanyValueChainNode[],
  // Pre-resolver Claude/Ollama output, aligned by index with resolvedNodes.
  // When the resolver rewrites a symbol (e.g. MMC → MRSH because SEC's
  // current ticker for Marsh McLennan is MRSH), Claude's edges typically
  // keep referencing the pre-rename symbol it learned from. We register
  // those originals as aliases so the edge still lands on the resolved node.
  originalNodes: Array<{ symbol: string; name: string }>
): ChainEdge[] {
  const symbolByAlias = new Map<string, string>()
  // Identity mapping for every node symbol. Even unverified nodes
  // participate so edges pointing at placeholder labels still render in
  // the per-ticker view (absorber will filter them later if needed).
  for (const n of resolvedNodes) {
    const sym = n.symbol.toUpperCase()
    symbolByAlias.set(sym, sym)
  }
  // Claimed-symbol aliases: when the resolver picked a different ticker
  // than Claude emitted, map Claude's original symbol onto the resolved
  // one. Covers the "Claude knows a company by its retired/uncommon
  // ticker" pattern — most visible with Marsh McLennan (Claude says MMC,
  // SEC current is MRSH), but also showed up during earlier debugging for
  // dozens of pre-rebrand references.
  for (let i = 0; i < resolvedNodes.length && i < originalNodes.length; i++) {
    const resolved = resolvedNodes[i].symbol.toUpperCase()
    const claimed = originalNodes[i].symbol.trim().toUpperCase()
    if (claimed && claimed !== resolved && !symbolByAlias.has(claimed)) {
      symbolByAlias.set(claimed, resolved)
    }
  }
  // Name-derived aliases. Only for ticker-kind nodes — unverified labels
  // have non-commercial names like "End Consumers" that would create
  // spurious matches on common words.
  for (const n of resolvedNodes) {
    if (n.kind !== 'ticker') continue
    const sym = n.symbol.toUpperCase()
    const nameUpper = n.name.trim().toUpperCase()
    const firstWord = nameUpper.split(/[\s,.&/]+/).filter(Boolean)[0] ?? ''
    // First-word alias: "MACOM Technology Solutions" → MACOM → MTSI.
    // Skip words shorter than 3 chars (IBM, SAP would cause confusion
    // with identity lookup; they already resolve via node.symbol).
    if (firstWord.length >= 3 && !symbolByAlias.has(firstWord)) {
      symbolByAlias.set(firstWord, sym)
    }
    // Full-name-without-punctuation alias: "AMKOR TECHNOLOGY" →
    // "AMKORTECHNOLOGY" → AMKR. Catches cases like edges using the full
    // company name instead of the ticker.
    const fullKey = nameUpper.replace(/[^A-Z0-9]/g, '')
    if (fullKey.length >= 3 && !symbolByAlias.has(fullKey)) {
      symbolByAlias.set(fullKey, sym)
    }
  }

  const out: ChainEdge[] = []
  let dropped = 0
  for (const edge of rawEdges) {
    const from = edge.from.toUpperCase()
    const to = edge.to.toUpperCase()
    const canonicalFrom =
      symbolByAlias.get(from) ?? symbolByAlias.get(from.replace(/[^A-Z0-9]/g, ''))
    const canonicalTo =
      symbolByAlias.get(to) ?? symbolByAlias.get(to.replace(/[^A-Z0-9]/g, ''))
    if (!canonicalFrom || !canonicalTo || canonicalFrom === canonicalTo) {
      dropped += 1
      continue
    }
    out.push({
      from: canonicalFrom,
      to: canonicalTo,
      relationship: edge.relationship,
      note: edge.note,
      source: edge.source
    })
  }
  if (dropped > 0) {
    console.log(
      `[companyChain] canonicalize: dropped ${dropped} edge(s) whose endpoints ` +
        `couldn't be matched to any node (placeholder labels or out-of-list refs)`
    )
  }
  return out
}

// Main entrypoint. Idempotent per-symbol: if a ready chain already exists,
// callers can force=true to regenerate; otherwise return the cached row.
export async function generateCompanyChain(input: {
  symbol: string
  companyName: string
  force?: boolean
}): Promise<CompanyValueChain | null> {
  const sym = input.symbol.trim().toUpperCase()
  if (!sym) return null
  const existing = getCompanyValueChain(sym)
  if (!input.force && existing?.status === 'ready' && existing.graph) {
    return existing.graph
  }

  // Mark pending so concurrent generate clicks coalesce.
  setCompanyValueChain({
    symbol: sym,
    status: 'pending',
    graph: existing?.graph ?? null,
    sourceContext: 'Gathering context…'
  })
  broadcastUpdated(sym)

  // Fresh-searched tickers may not have any cached grounding yet: no profile
  // generated (ensureCompanyProfile is fire-and-forget on passive creation),
  // no SEC filings pulled (SEC scheduler hasn't fired for this symbol). We
  // proactively bootstrap both in parallel so the prompt has real material
  // to ground on instead of relying on mistral's priors alone.
  console.log(`[companyChain] preparing grounding context for ${sym}`)
  await Promise.all([
    ensureCompanyProfile(sym, input.companyName).catch((err) => {
      console.warn(
        `[companyChain] ensureCompanyProfile failed for ${sym}:`,
        err instanceof Error ? err.message : err
      )
      return null
    }),
    // Don't await filings hard — if SEC is rate-limited the profile is
    // usually enough. Race a 12-second ceiling so the generate click
    // doesn't stall on a slow EDGAR fetch.
    Promise.race([
      forceRefreshFilings(sym).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 12_000))
    ])
  ])

  // Now gather what landed during the warm-up (plus whatever was already in
  // cache from prior sessions).
  const profile = getCompanyProfile(sym)
  const [tenKExcerpt, news] = await Promise.all([
    fetchTenKExcerpt(sym),
    Promise.resolve(fetchRecentNews(sym))
  ])

  // Record what sources we fed so the UI can show provenance.
  const sources: string[] = []
  if (profile) sources.push('company profile')
  if (tenKExcerpt) sources.push('10-K Item 1')
  if (news.length > 0) sources.push(`${news.length} recent article${news.length === 1 ? '' : 's'}`)
  const contextLabel = sources.length > 0 ? sources.join(' + ') : 'model priors only'

  // Classify the ticker into the unified sector catalog so the generated
  // chain can eventually be absorbed into the right bucket. Best-effort —
  // we don't fail generation if the classifier misfires. Force-regenerate
  // of the chain also forces re-classification; otherwise idempotent.
  try {
    const cls = await ensureTickerSectorsClassified({
      symbol: sym,
      companyName: input.companyName,
      profileDescription: profile?.description ?? null,
      tenKExcerpt,
      force: input.force ?? false
    })
    if (cls) {
      console.log(
        `[companyChain] classified ${sym} as ${cls.primary.sectorId}` +
          (cls.secondary.length > 0
            ? ` + ${cls.secondary.length} secondary (${cls.secondary.map((s) => s.sectorId).join(', ')})`
            : '')
      )
    }
  } catch (err) {
    console.warn(
      `[companyChain] sector classification failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
  }

  // Look up the focus's classified sector so we can feed the generator the
  // canonical stage list for that sector. Prevents stage-name drift across
  // chains (two banks with two different stage-ordering conventions).
  // Falls back to undefined → generator uses free-form stage naming.
  const focusSectorAssignment = getPrimarySectorForSymbol(sym)
  const sectorCatalogEntry = focusSectorAssignment
    ? getSector(focusSectorAssignment.sectorId)
    : null
  const canonicalStages =
    sectorCatalogEntry?.stages && sectorCatalogEntry.stages.length > 0
      ? sectorCatalogEntry.stages
      : undefined

  // Cross-chain corroboration: every edge in OTHER stored chains that
  // mentions this symbol on either side. Feeds the generator a "here's
  // what neighboring chains already claim about you" context block so
  // regens converge toward graph-wide consistency instead of re-deriving
  // edges in isolation. We DON'T pass the focus's own prior chain — that
  // would anchor Claude on any mistakes in the previous output (e.g. the
  // IP-licensing inversions we just fixed would have been self-reinforced).
  const crossChain = getEdgesMentioningSymbol(sym, 30).map((m) => ({
    sourceFocus: m.sourceFocus,
    counterparty: m.from === sym ? m.to : m.from,
    // Normalize direction relative to the focus so the prompt can describe
    // it as "Y supplies/buys-from [focus]" without the model having to
    // back-compute the perspective. Supplier/customer flip depending on
    // whether the focus is the from or to side of the source edge.
    relationshipTowardFocus: relToFocus(m.from === sym, m.relationship),
    note: m.note
  }))

  const { result: generated, provider } = await routedGenerate({
    symbol: sym,
    companyName: input.companyName,
    profileDescription: profile?.description ?? null,
    tenKExcerpt,
    newsSnippets: news,
    canonicalStages,
    sectorName: sectorCatalogEntry?.name,
    crossChainMentions: crossChain
  })

  // Stamp the generated-by provider into the provenance string so the
  // detail-page card can show "Claude · profile + 10-K" vs "Ollama · profile",
  // and we can spot regressions by reading the saved chain later.
  const providerLabel = provider === 'claude' ? 'Claude' : 'local Ollama'
  const sourceContext = `${providerLabel} · ${contextLabel}`

  if (!generated || generated.nodes.length === 0 || generated.stages.length === 0) {
    setCompanyValueChain({
      symbol: sym,
      status: generated === null ? 'offline' : 'error',
      graph: existing?.graph ?? null,
      sourceContext
    })
    broadcastUpdated(sym)
    return existing?.graph ?? null
  }

  const resolvedNodes = resolveNodes(generated.nodes, sym)
  const canonicalEdges = canonicalizeEdges(generated.edges, resolvedNodes, generated.nodes)
  const graph: CompanyValueChain = {
    focus: sym,
    stages: generated.stages,
    nodes: resolvedNodes,
    edges: canonicalEdges
  }

  setCompanyValueChain({
    symbol: sym,
    status: 'ready',
    graph,
    sourceContext
  })

  // Absorb the chain into the unified overlay tables so the sector-wide
  // renderer (Phase 4) can see it. Non-fatal: absorption failure doesn't
  // invalidate the per-ticker chain that just got saved.
  try {
    const absorbed = absorbGeneratedChain(sym, graph)
    if (absorbed.skipped) {
      console.log(`[companyChain] skipped absorption for ${sym}: ${absorbed.skipped}`)
    } else if (absorbed.nodesAdded > 0 || absorbed.edgesAdded > 0) {
      console.log(
        `[companyChain] absorbed into ${absorbed.sectorId}: ` +
          `+${absorbed.nodesAdded} node(s), +${absorbed.edgesAdded} edge(s)`
      )
    }
  } catch (err) {
    console.warn(
      `[companyChain] absorption failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
  }

  broadcastUpdated(sym)
  return graph
}

export function readCompanyChain(symbol: string): ReturnType<typeof getCompanyValueChain> {
  return getCompanyValueChain(symbol)
}

export interface RegenerateAllProgress {
  total: number
  completed: number
  currentSymbol: string | null
  succeeded: number
  failed: number
  running: boolean
}

// Bulk regenerate state. Only one run can be in flight at a time — the
// classifier + generator are heavy enough (30-60s per ticker) that parallel
// runs would drown Ollama's two-concurrent limit and pile up other
// requests behind them. A second Start click while running is a no-op.
let regenRunning = false
let regenProgress: RegenerateAllProgress = {
  total: 0,
  completed: 0,
  currentSymbol: null,
  succeeded: 0,
  failed: 0,
  running: false
}

function broadcastRegenProgress(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('chainRegen:progress', regenProgress)
    }
  }
}

export function getRegenerateAllProgress(): RegenerateAllProgress {
  return regenProgress
}

// Regenerate every ticker that already has a company_value_chains row.
// This is the "I added pipeline improvements, refresh all existing chains
// so they pick them up" button. Runs sequentially — Ollama's 2-concurrent
// cap makes parallel runs counterproductive, and keeping order stable
// makes the progress UI easier to read.
//
// `skipIfGeneratedWithinMs` lets callers cheapen a re-run by skipping
// chains whose generatedAt is newer than that window. Manual button
// callers pass 0 (regen everything). Auto-on-boot callers pass a real
// window (e.g. 20h) so a partial run that hit the Claude cap yesterday
// only retries the stragglers tomorrow instead of re-burning the
// already-fresh chains.
export async function regenerateAllChains(
  opts: { skipIfGeneratedWithinMs?: number } = {}
): Promise<RegenerateAllProgress> {
  if (regenRunning) return regenProgress
  regenRunning = true
  // Expanded scope: "regenerate all" now means every ticker the user has
  // expressed interest in — union of (a) tickers that already have a chain
  // (refresh them with the latest classifier / prompt / model) and
  // (b) active watchlist tickers that have never been generated (give them
  // a chain so they participate in the unified graph). Passive tickers
  // (chain-absorbed counterparties in someone else's chain) are NOT in
  // scope — they already appear via inheritance and would multiply cost.
  const existingChainSymbols = new Set(listCompanyValueChainSymbols())
  const watchlist = listTickers().filter((t) => t.isActive)
  const symbolSet = new Set<string>([
    ...existingChainSymbols,
    ...watchlist.map((t) => t.symbol.toUpperCase())
  ])
  let symbols = [...symbolSet].sort()

  // Skip-fresh filter: when a window is provided, drop any symbol whose
  // stored chain was generated more recently than the window. Never-
  // generated symbols always pass (null generatedAt), so new watchlist
  // additions still get their first chain even under an aggressive skip.
  if (opts.skipIfGeneratedWithinMs && opts.skipIfGeneratedWithinMs > 0) {
    const cutoff = Date.now() - opts.skipIfGeneratedWithinMs
    const beforeCount = symbols.length
    symbols = symbols.filter((sym) => {
      const row = getCompanyValueChain(sym)
      if (!row || row.generatedAt === null) return true
      return row.generatedAt < cutoff
    })
    const skipped = beforeCount - symbols.length
    if (skipped > 0) {
      console.log(
        `[companyChain] regenerate-all: skipped ${skipped} chain(s) regenerated within ${Math.round(opts.skipIfGeneratedWithinMs / 3600_000)}h — ${symbols.length} to process`
      )
    }
  }
  // Build a companyName lookup so every symbol in the run has a usable
  // prompt input even if it was only in the existingChainSymbols set
  // (covers the rare case where a chain exists but the tickers row was
  // wiped or the name is empty — fall back to the symbol itself).
  const nameBySymbol = new Map<string, string>()
  for (const t of listTickers()) {
    nameBySymbol.set(t.symbol.toUpperCase(), t.companyName || t.symbol)
  }

  regenProgress = {
    total: symbols.length,
    completed: 0,
    currentSymbol: null,
    succeeded: 0,
    failed: 0,
    running: true
  }
  broadcastRegenProgress()

  for (const sym of symbols) {
    regenProgress = { ...regenProgress, currentSymbol: sym }
    broadcastRegenProgress()
    const companyName = nameBySymbol.get(sym) ?? getTickerBySymbol(sym)?.companyName ?? sym
    try {
      await generateCompanyChain({ symbol: sym, companyName, force: true })
      regenProgress = { ...regenProgress, succeeded: regenProgress.succeeded + 1 }
    } catch (err) {
      console.warn(
        `[companyChain] regenerate-all: ${sym} failed —`,
        err instanceof Error ? err.message : err
      )
      regenProgress = { ...regenProgress, failed: regenProgress.failed + 1 }
    }
    regenProgress = { ...regenProgress, completed: regenProgress.completed + 1 }
    broadcastRegenProgress()
  }

  regenProgress = { ...regenProgress, currentSymbol: null, running: false }
  regenRunning = false
  broadcastRegenProgress()
  return regenProgress
}

// ---- on-boot auto-regeneration ---------------------------------------------
//
// Fires once per launch (behind a timestamp throttle) so the user doesn't
// have to remember to click Regenerate All after every pipeline change.
// Two guards protect against cap burn:
//
//   1. A throttle window: don't fire if the last auto-run completed less
//      than AUTO_REGEN_THROTTLE_MS ago. Back-to-back restarts during
//      active development don't re-burn Claude calls.
//   2. A per-chain skip window inside regenerateAllChains: chains already
//      regenerated within AUTO_REGEN_SKIP_MS are skipped. A partial run
//      that hit yesterday's cap picks up only the stragglers today.
//
// The last-run timestamp lives in the preferences KV store so it survives
// restarts.

const AUTO_REGEN_THROTTLE_MS = 20 * 60 * 60 * 1000 // 20 hours
const AUTO_REGEN_SKIP_MS = 20 * 60 * 60 * 1000 // 20 hours — matches so
// chains from the previous auto-run age out of the skip window right as
// the next auto-run becomes eligible. Stragglers (failed yesterday due to
// cap) have null/stale generatedAt and always refresh.
const AUTO_REGEN_BOOT_DELAY_MS = 3 * 60 * 1000 // 3 minutes after startup
// — let feed polling, stocks scheduler, and financials backfill clear
// first so they don't compete for Claude bandwidth.

export async function maybeAutoRegenerateOnBoot(): Promise<void> {
  // Late-imported to avoid circular-dependency headaches with preferences.
  const { getDb } = await import('../database/connection')
  const db = getDb()
  const row = db
    .prepare<[], { value: string }>(
      `SELECT value FROM preferences WHERE key = '_lastAutoRegenAt'`
    )
    .get()
  const lastRun = row ? Number(row.value) : 0
  const now = Date.now()
  if (Number.isFinite(lastRun) && now - lastRun < AUTO_REGEN_THROTTLE_MS) {
    const hoursAgo = Math.round((now - lastRun) / 3600_000)
    console.log(
      `[companyChain] auto-regen skipped — last run was ${hoursAgo}h ago ` +
        `(throttle: ${Math.round(AUTO_REGEN_THROTTLE_MS / 3600_000)}h)`
    )
    return
  }
  console.log(
    `[companyChain] auto-regen starting — will skip chains < ${Math.round(AUTO_REGEN_SKIP_MS / 3600_000)}h old`
  )
  try {
    await regenerateAllChains({ skipIfGeneratedWithinMs: AUTO_REGEN_SKIP_MS })
  } finally {
    // Record the stamp even if the run partially failed (Claude cap, etc.).
    // Prevents a failing run from re-firing every restart.
    db
      .prepare<[string, string]>(
        `INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)`
      )
      .run('_lastAutoRegenAt', String(Date.now()))
  }
}

// Called from main/index.ts after the boot-storm window. Fire-and-forget —
// the caller doesn't await; errors inside bubble to maybeAutoRegenerateOnBoot
// and are caught at the timer callback.
export function scheduleAutoRegenerateOnBoot(): void {
  setTimeout(() => {
    void maybeAutoRegenerateOnBoot().catch((err) => {
      console.warn(
        '[companyChain] auto-regen failed:',
        err instanceof Error ? err.message : err
      )
    })
  }, AUTO_REGEN_BOOT_DELAY_MS)
}
