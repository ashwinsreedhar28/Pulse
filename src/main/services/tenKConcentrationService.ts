// 10-K customer-concentration extraction. Unlike the news-co-occurrence
// source (probabilistic, inference-based), this reads the filer's own legal
// disclosure. When a 10-K says "Apple accounted for 22% of net revenues"
// that's a stated fact — we extract, resolve the name to a ticker, and
// auto-commit the supplier→customer edge at high baseline confidence.
//
// Flow:
//   1. Pick the latest unprocessed 10-K from sec_filings for a symbol.
//   2. Fetch its primary document and extract body text (jsdom).
//   3. Slice to sections typically carrying concentration disclosures:
//      Item 1 (Business), Item 1A (Risk Factors), Item 7 (MD&A).
//   4. Hand the slice to extractCustomerConcentration (Ollama).
//   5. Resolve each named customer to a ticker via companyNameResolver.
//   6. Write graph_candidates rows — accepted for resolved pairs,
//      rejected (with reason) for the rest so the audit log stays honest.
//   7. Commit accepted edges to graph_edge_overrides.
//
// Dedupe: we check graph_candidates for prior evidence containing the 10-K's
// accession number; one processed marker per filing keeps us from rerunning
// the same extraction. Weekly sweep cadence, triggered alongside the SEC
// filings refresh so new 10-Ks get picked up within a day of filing.

import { BrowserWindow } from 'electron'
import { JSDOM, VirtualConsole } from 'jsdom'

import graph from '../../data/supplyChainGraph.json'
import { getDb } from '../database/connection'
import {
  insertCandidate,
  type EdgePayload,
  type EvidenceRef
} from '../database/graphCandidates'
import { upsertEdgeOverrideWithConsensus } from '../database/graphOverrides'
import {
  hasNodeOverride,
  upsertNodeOverride
} from '../database/graphNodeOverrides'
import { getFilingsForSymbol, type SecFiling } from '../database/secFilings'
import { listTickers } from '../database/tickers'
import { resolveCompanyNames } from './companyNameResolver'
import {
  classifyNewNode,
  extractCustomerConcentration,
  type CustomerConcentrationEntry
} from './ollamaService'
import { buildPrimaryDocUrl } from './secService'

const UA = 'Pulse Desktop (ashwin.sreedhar2003@gmail.com)'
const FETCH_TIMEOUT_MS = 30_000
const SOURCE = 'sec_10k_concentration'

// Static graph's node + stage sets — cached on module load since the JSON
// is imported at compile time. Node-discovery checks against these to
// decide "is this symbol new?".
interface StaticNode {
  symbol: string
  stage: string
  sector: string
  name?: string
}
interface StaticStage {
  id: string
  label: string
}
interface StaticGraphShape {
  nodes: StaticNode[]
  stages: StaticStage[]
}
const STATIC_GRAPH = graph as StaticGraphShape
const STATIC_NODE_SYMBOLS = new Set(
  STATIC_GRAPH.nodes.map((n) => n.symbol.toUpperCase())
)

// Min confidence from classifyNewNode to auto-commit a node override. Below
// this we log the discovery as a rejected candidate (audit log stays honest)
// and skip the node + the edge that referenced it.
const MIN_NODE_CLASSIFIER_CONFIDENCE = 0.55

// Ensure a discovered customer symbol has a node override so the renderer
// can place it. Returns true when the symbol is already placeable (either
// in the static graph or already overridden), false when the classifier
// rejected it — in which case the caller should NOT commit the edge either.
async function ensureNodePlacement(input: {
  symbol: string
  companyName: string
  supportingQuote: string
  evidence: EvidenceRef[]
}): Promise<boolean> {
  const sym = input.symbol.toUpperCase()
  if (STATIC_NODE_SYMBOLS.has(sym)) return true
  if (hasNodeOverride(sym)) return true

  const classification = await classifyNewNode({
    symbol: sym,
    companyName: input.companyName,
    context: input.supportingQuote,
    stages: STATIC_GRAPH.stages
  })

  if (
    !classification ||
    classification.stage === 'unclear' ||
    classification.confidence < MIN_NODE_CLASSIFIER_CONFIDENCE
  ) {
    // Log the discovery as a rejected node candidate so the audit UI surfaces
    // what we tried to add. No override written → the dependent edge won't
    // commit either, keeping the graph tidy.
    insertCandidate({
      kind: 'node',
      symbol: sym,
      payload: {
        stage: classification?.stage ?? 'unclear',
        sector: classification?.sector ?? 'other',
        name: input.companyName,
        blurb: classification?.blurb ?? ''
      },
      evidence: input.evidence,
      confidence: classification?.confidence ?? 0,
      source: SOURCE,
      status: 'rejected',
      reviewNote: classification
        ? `Node classifier below threshold (${classification.confidence.toFixed(2)}, stage "${classification.stage}")`
        : 'Node classifier unavailable'
    })
    return false
  }

  upsertNodeOverride({
    symbol: sym,
    stage: classification.stage,
    sector: classification.sector,
    name: input.companyName,
    blurb: classification.blurb,
    source: SOURCE,
    acceptedAt: Date.now()
  })
  insertCandidate({
    kind: 'node',
    symbol: sym,
    payload: {
      stage: classification.stage,
      sector: classification.sector,
      name: input.companyName,
      blurb: classification.blurb
    },
    evidence: input.evidence,
    confidence: classification.confidence,
    source: SOURCE,
    status: 'accepted',
    reviewNote: `Node classifier accepted (${classification.confidence.toFixed(2)})`
  })
  return true
}

// Sweep cadence — 10-Ks are filed annually per symbol, so checking once a
// week for new ones is plenty. Each symbol is also gated by the dedupe
// check so we only Ollama-invoke on filings we haven't processed.
const SWEEP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

// Per-sweep cap on Ollama calls. Each extraction takes ~10-20 seconds on
// a local mistral:7b; 8 per sweep bounds runtime to ~2 min.
const MAX_EXTRACTIONS_PER_SWEEP = 8

// Min share-of-revenue threshold for auto-accepting a resolved customer.
// Lower than the news gate because the filer has disclosed this themselves;
// 5% matches what SEC Reg S-K Item 101 treats as "material concentration".
const MIN_SHARE_FOR_AUTO_ACCEPT = 0.05

// When the 10-K names a customer with >=10% share and we resolve the name,
// we weight the edge confidence even higher so D1 (visual thickness) can
// distinguish "key customer" from "mentioned customer".
const MATERIAL_SHARE_THRESHOLD = 0.1

export function isAnnualReport(filing: SecFiling): boolean {
  return filing.formType === '10-K' || filing.formType === '10-K/A'
}

// Has this 10-K already been through the pipeline? Evidence JSON carries
// the accession number as a filing ref; a cheap LIKE scan on the candidates
// table tells us whether we already committed (or rejected) a marker row
// for it.
function alreadyProcessed(symbol: string, accessionNumber: string): boolean {
  const row = getDb()
    .prepare<[string, string, string, string, string], { n: number }>(
      `SELECT 1 AS n FROM graph_candidates
        WHERE source = ?
          AND (fromSymbol = ? OR toSymbol = ? OR symbol = ?)
          AND evidenceJson LIKE ?`
    )
    .get(
      SOURCE,
      symbol.toUpperCase(),
      symbol.toUpperCase(),
      symbol.toUpperCase(),
      `%${accessionNumber}%`
    )
  return !!row
}

async function fetchPrimaryDoc(url: string): Promise<string> {
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function extractBodyText(html: string): string {
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('error', () => {})
  virtualConsole.on('jsdomError', () => {})
  const dom = new JSDOM(html, { virtualConsole })
  const doc = dom.window.document
  for (const el of Array.from(doc.querySelectorAll('script, style, noscript'))) {
    el.remove()
  }
  const text = (doc.body?.textContent ?? doc.documentElement.textContent ?? '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

// Slice the full 10-K text to the sections most likely to contain customer
// concentration: Item 1 (Business), Item 1A (Risk Factors), Item 7 (MD&A).
// Falls back to the full body if none of the markers are found (edge case:
// filers who use non-standard headings, older filings, exhibits-only docs).
function sliceRelevantSections(bodyText: string): string {
  const markers = [
    /item\s+1\.\s*business/i,
    /item\s+1a\.\s*risk\s+factors/i,
    /item\s+7\.\s*management'?s\s+discussion/i,
    /customers?/i,
    /concentration\s+of\s+credit/i,
    /significant\s+customer/i
  ]
  const slices: string[] = []
  for (const rx of markers) {
    const m = rx.exec(bodyText)
    if (!m) continue
    // Grab a ~4000-char window starting from the match. That's enough to
    // cover a typical concentration paragraph plus a bit of context without
    // blowing past the Ollama context budget.
    const start = Math.max(0, m.index - 200)
    const end = Math.min(bodyText.length, m.index + 4000)
    slices.push(bodyText.slice(start, end))
  }
  if (slices.length === 0) {
    // Fallback: take the first 12k chars. The Business section typically
    // sits near the top of a 10-K so this captures customer disclosures
    // even for filers with non-standard section headings.
    return bodyText.slice(0, 12000)
  }
  // Dedup overlap: if two markers produced near-identical windows, prefer
  // the first hit and drop duplicates.
  const joined = [...new Set(slices)].join('\n\n---\n\n')
  return joined.slice(0, 14000)
}

function filingEvidence(filing: SecFiling, accessionNumber: string): EvidenceRef {
  return {
    kind: 'filing',
    id: accessionNumber,
    title: `${filing.formType} filed ${new Date(filing.filedAt).toISOString().slice(0, 10)}`,
    url: buildPrimaryDocUrl(filing.cik, filing.accessionNumber, filing.primaryDocument),
    publishedAt: filing.filedAt
  }
}

function broadcastUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('graph:updated')
    }
  }
}

// Process a single 10-K for a single symbol. Idempotent — alreadyProcessed
// guards re-work. Returns the summary so the caller can report per-symbol
// outcomes in aggregate.
export async function processTenK(input: {
  symbol: string
  companyName: string
  filing: SecFiling
}): Promise<{ accepted: number; rejected: number; alreadyProcessed?: true } | null> {
  const { symbol, companyName, filing } = input
  if (!isAnnualReport(filing)) return null
  if (alreadyProcessed(symbol, filing.accessionNumber)) {
    return { accepted: 0, rejected: 0, alreadyProcessed: true }
  }

  const url = buildPrimaryDocUrl(filing.cik, filing.accessionNumber, filing.primaryDocument)
  let html: string
  try {
    html = await fetchPrimaryDoc(url)
  } catch (err) {
    console.warn(
      `[10-K] fetch failed for ${symbol} ${filing.accessionNumber}:`,
      err instanceof Error ? err.message : err
    )
    // Mark the filing as processed with an error status so the retry sweep
    // doesn't loop. Evidence carries the accession for dedupe.
    insertCandidate({
      kind: 'edge',
      fromSymbol: symbol,
      toSymbol: null,
      payload: { relationship: 'unclear', note: '' } satisfies EdgePayload,
      evidence: [filingEvidence(filing, filing.accessionNumber)],
      confidence: 0,
      source: SOURCE,
      status: 'rejected',
      reviewNote: `Primary doc fetch failed: ${err instanceof Error ? err.message : String(err)}`
    })
    return { accepted: 0, rejected: 1 }
  }

  const bodyText = extractBodyText(html)
  if (bodyText.length < 500) {
    insertCandidate({
      kind: 'edge',
      fromSymbol: symbol,
      toSymbol: null,
      payload: { relationship: 'unclear', note: '' } satisfies EdgePayload,
      evidence: [filingEvidence(filing, filing.accessionNumber)],
      confidence: 0,
      source: SOURCE,
      status: 'rejected',
      reviewNote: 'Primary doc too short to extract — likely a non-HTML exhibit'
    })
    return { accepted: 0, rejected: 1 }
  }
  const relevantText = sliceRelevantSections(bodyText)

  const result = await extractCustomerConcentration({
    symbol,
    companyName,
    bodyText: relevantText
  })
  if (!result) {
    insertCandidate({
      kind: 'edge',
      fromSymbol: symbol,
      toSymbol: null,
      payload: { relationship: 'unclear', note: '' } satisfies EdgePayload,
      evidence: [filingEvidence(filing, filing.accessionNumber)],
      confidence: 0,
      source: SOURCE,
      status: 'rejected',
      reviewNote: 'Ollama extraction failed or unavailable'
    })
    return { accepted: 0, rejected: 1 }
  }

  // Diversified / no-concentration disclosure: write one marker row so the
  // filing counts as processed. Nothing to accept.
  if (result.disclosureType === 'diversified' || result.customers.length === 0) {
    insertCandidate({
      kind: 'edge',
      fromSymbol: symbol,
      toSymbol: null,
      payload: { relationship: 'unclear', note: '' } satisfies EdgePayload,
      evidence: [filingEvidence(filing, filing.accessionNumber)],
      confidence: 0,
      source: SOURCE,
      status: 'rejected',
      reviewNote:
        result.disclosureType === 'diversified'
          ? 'Filing states no single customer is material (10%+)'
          : `Disclosure type "${result.disclosureType}" — no named customers extracted`
    })
    return { accepted: 0, rejected: 1 }
  }

  // Resolve customer names to ticker symbols in one batch (single index read).
  const resolutions = resolveCompanyNames(result.customers.map((c) => c.name))

  let accepted = 0
  let rejected = 0

  for (const customer of result.customers) {
    const resolved = resolutions.get(customer.name)
    const baseEvidence: EvidenceRef[] = [filingEvidence(filing, filing.accessionNumber)]

    if (!resolved) {
      // Log unresolved customer as a rejected marker so the audit UI shows
      // what the filing named even when we couldn't map it to a ticker.
      insertCandidate({
        kind: 'edge',
        fromSymbol: symbol,
        toSymbol: null,
        payload: {
          relationship: 'supplier',
          note: customerEdgeNote(customer)
        } satisfies EdgePayload,
        evidence: baseEvidence,
        confidence: 0,
        source: SOURCE,
        status: 'rejected',
        reviewNote: `Could not resolve "${customer.name}" to a known ticker`
      })
      rejected++
      continue
    }

    // filerSymbol → resolvedSymbol is the supplier relationship: the filer
    // supplies the named customer.
    const fromSymbol = symbol.toUpperCase()
    const toSymbol = resolved.symbol

    if (fromSymbol === toSymbol) {
      // Defensive — don't loop a company onto itself if the resolver picks
      // the filer by accident.
      rejected++
      continue
    }

    // Confidence = product of name-match score and material-share signal.
    // A 1.0 resolver score + 20% stated share gets ~0.95. A 0.8 resolver
    // score with no stated share gets 0.72.
    const shareComponent =
      customer.revenueSharePct !== null
        ? Math.min(1, 0.6 + customer.revenueSharePct * 2) // 10% share → 0.8
        : 0.7
    const confidence = Math.min(1, resolved.score * shareComponent)

    const material =
      customer.revenueSharePct !== null && customer.revenueSharePct >= MATERIAL_SHARE_THRESHOLD

    // Auto-accept when the name match is strong and the filing either states
    // a material share or explicitly calls out the customer in its
    // concentration disclosure.
    const shouldAccept =
      resolved.score >= 0.8 &&
      (customer.revenueSharePct === null ||
        customer.revenueSharePct >= MIN_SHARE_FOR_AUTO_ACCEPT)

    if (!shouldAccept) {
      insertCandidate({
        kind: 'edge',
        fromSymbol,
        toSymbol,
        payload: {
          relationship: 'supplier',
          note: customerEdgeNote(customer)
        } satisfies EdgePayload,
        evidence: baseEvidence,
        confidence,
        source: SOURCE,
        status: 'rejected',
        reviewNote: `Below threshold (resolver ${resolved.score.toFixed(2)}, share ${customer.revenueSharePct ?? 'unknown'})`
      })
      rejected++
      continue
    }

    // Auto-discover the customer as a node when it's not yet in the graph.
    // If the node classifier can't place it with enough confidence, drop
    // the edge too — a dangling edge adds noise without helping anyone.
    const placeable = await ensureNodePlacement({
      symbol: toSymbol,
      companyName: resolved.matchedName,
      supportingQuote: customer.quote,
      evidence: baseEvidence
    })
    if (!placeable) {
      insertCandidate({
        kind: 'edge',
        fromSymbol,
        toSymbol,
        payload: {
          relationship: 'supplier',
          note: customerEdgeNote(customer)
        } satisfies EdgePayload,
        evidence: baseEvidence,
        confidence,
        source: SOURCE,
        status: 'rejected',
        reviewNote: 'Skipped — customer ticker could not be placed as a graph node'
      })
      rejected++
      continue
    }

    insertCandidate({
      kind: 'edge',
      fromSymbol,
      toSymbol,
      payload: {
        relationship: 'supplier',
        note: customerEdgeNote(customer)
      } satisfies EdgePayload,
      evidence: baseEvidence,
      confidence,
      source: SOURCE,
      status: 'accepted',
      reviewNote: `Named customer disclosure (resolver ${resolved.score.toFixed(2)}${material ? ', material share' : ''})`
    })

    const consensus = upsertEdgeOverrideWithConsensus({
      fromSymbol,
      toSymbol,
      relationship: 'supplier',
      note: customerEdgeNote(customer),
      weight: confidence,
      source: SOURCE,
      acceptedAt: Date.now()
    })
    // When the 10-K confirms an edge news already added, update the
    // reviewNote on this accept so the audit log reflects the consensus.
    if (consensus.consensus) {
      // No additional DB call needed — the audit row we already wrote will
      // get its note amended on next read; for now the review_note reflects
      // the 10-K judgement and the overlay row carries the combined sources.
    }
    accepted++
  }

  if (accepted > 0) broadcastUpdated()
  return { accepted, rejected }
}

function customerEdgeNote(customer: CustomerConcentrationEntry): string {
  if (customer.revenueSharePct !== null) {
    const pct = (customer.revenueSharePct * 100).toFixed(0)
    return `Disclosed customer (~${pct}% of revenue): ${customer.quote.slice(0, 120)}`.slice(0, 180)
  }
  return `Named customer: ${customer.quote.slice(0, 150)}`.slice(0, 180)
}

// Called from secFilingsService after a filings sweep. Finds the newest
// unprocessed 10-K for a watchlist symbol and kicks extraction. Same
// fire-and-forget shape as processRecentEarnings.
export async function processRecentTenKs(
  symbol: string,
  companyName: string
): Promise<void> {
  const filings = getFilingsForSymbol(symbol, 20).filter(isAnnualReport)
  const latest = filings[0]
  if (!latest) return
  void processTenK({ symbol, companyName, filing: latest })
}

// Weekly sweep across every watchlist ticker. Iterates sequentially (not
// parallel) because each extraction streams through the local Ollama, and
// stacking inference calls makes the UI unresponsive on modest hardware.
async function sweep(): Promise<void> {
  const tickers = listTickers().filter((t) => t.isActive)
  if (tickers.length === 0) return

  let done = 0
  for (const t of tickers) {
    if (done >= MAX_EXTRACTIONS_PER_SWEEP) break
    const filings = getFilingsForSymbol(t.symbol, 20).filter(isAnnualReport)
    const latest = filings[0]
    if (!latest) continue
    if (alreadyProcessed(t.symbol, latest.accessionNumber)) continue
    try {
      const result = await processTenK({
        symbol: t.symbol,
        companyName: t.companyName ?? t.symbol,
        filing: latest
      })
      if (result && !result.alreadyProcessed) done++
    } catch (err) {
      console.warn(
        `[10-K] sweep failed for ${t.symbol}:`,
        err instanceof Error ? err.message : err
      )
    }
  }
}

let timer: NodeJS.Timeout | null = null
let started = false

export function startTenKConcentrationScheduler(): void {
  if (started) return
  started = true
  // Defer the initial sweep until 10 minutes after boot so the SEC filings
  // scheduler has had a chance to populate 10-Ks for any newly-added
  // tickers before we try to process them.
  setTimeout(() => {
    void sweep().catch((err) => {
      console.warn('[10-K] sweep failed:', err instanceof Error ? err.message : err)
    })
  }, 10 * 60 * 1000)
  timer = setInterval(() => {
    void sweep().catch((err) => {
      console.warn('[10-K] sweep failed:', err instanceof Error ? err.message : err)
    })
  }, SWEEP_INTERVAL_MS)
}

export function stopTenKConcentrationScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}

// On-demand trigger for the audit UI's "Run 10-K scan now" button. Returns
// aggregate counts so the UI can show a toast-style summary.
export async function runTenKScanNow(): Promise<{
  processed: number
  accepted: number
  rejected: number
  skipped: number
}> {
  const tickers = listTickers().filter((t) => t.isActive)
  let processed = 0
  let accepted = 0
  let rejected = 0
  let skipped = 0

  for (const t of tickers) {
    const filings = getFilingsForSymbol(t.symbol, 20).filter(isAnnualReport)
    const latest = filings[0]
    if (!latest) {
      skipped++
      continue
    }
    if (alreadyProcessed(t.symbol, latest.accessionNumber)) {
      skipped++
      continue
    }
    try {
      const result = await processTenK({
        symbol: t.symbol,
        companyName: t.companyName ?? t.symbol,
        filing: latest
      })
      if (!result) {
        skipped++
        continue
      }
      processed++
      accepted += result.accepted
      rejected += result.rejected
    } catch (err) {
      console.warn(
        `[10-K] manual run failed for ${t.symbol}:`,
        err instanceof Error ? err.message : err
      )
      skipped++
    }
  }
  return { processed, accepted, rejected, skipped }
}
