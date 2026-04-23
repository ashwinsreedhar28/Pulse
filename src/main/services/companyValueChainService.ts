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
  setCompanyValueChain,
  type CompanyValueChain,
  type CompanyValueChainNode
} from '../database/companyValueChains'
import { getFilingsForSymbol, type SecFiling } from '../database/secFilings'
import { resolveCompanyName } from './companyNameResolver'
import { getCompanyProfile } from './companyProfileService'
import {
  generateCompanyValueChain as ollamaGenerate,
  type GeneratedValueChain
} from './ollamaService'
import { buildPrimaryDocUrl } from './secService'

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
    if (n.isTicker && tickerLike) {
      // Verify the ticker against Pulse's ticker + SEC maps via the name
      // resolver. Accept when either symbol == returned symbol or the name
      // matches. Otherwise downgrade to unverified.
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
    }
    // Try to resolve by name even if symbol didn't match. This catches cases
    // where the model's ticker is slightly off but the name is right.
    const resolved = resolveCompanyName(n.name)
    if (resolved && resolved.score >= 0.95) {
      out.push({
        symbol: resolved.symbol,
        stage: n.stage,
        name: n.name,
        blurb: n.blurb,
        kind: 'ticker'
      })
      continue
    }
    // Fall through: keep as unverified node.
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

  // Gather grounding material in parallel.
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
  const sourceContext = sources.length > 0 ? sources.join(' + ') : 'Ollama prior only'

  const generated = await ollamaGenerate({
    symbol: sym,
    companyName: input.companyName,
    profileDescription: profile?.description ?? null,
    tenKExcerpt,
    newsSnippets: news
  })

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
  const graph: CompanyValueChain = {
    focus: sym,
    stages: generated.stages,
    nodes: resolvedNodes,
    // Edges stay as-is — they reference node symbols that we preserved.
    edges: generated.edges
  }

  setCompanyValueChain({
    symbol: sym,
    status: 'ready',
    graph,
    sourceContext
  })
  broadcastUpdated(sym)
  return graph
}

export function readCompanyChain(symbol: string): ReturnType<typeof getCompanyValueChain> {
  return getCompanyValueChain(symbol)
}
