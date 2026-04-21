import type { Ticker } from '../database/tickers'
import tickerReference from '../../data/tickerReference.json'

interface TickerRef {
  symbol: string
  name: string
  aliases?: string[]
}
const tickerRefBySymbol = new Map<string, TickerRef>(
  (tickerReference as TickerRef[]).map((t) => [t.symbol.toUpperCase(), t])
)

export function buildTickerTerms(ticker: Ticker): string[] {
  const ref = tickerRefBySymbol.get(ticker.symbol.toUpperCase())
  const terms = new Set<string>()
  terms.add(ticker.symbol)
  if (ticker.companyName) terms.add(ticker.companyName)
  const stripped = (ticker.companyName ?? '')
    .replace(
      /\b(Inc\.?|Corp\.?|Corporation|Holdings?|Ltd\.?|Technologies|Technology|Company|Co\.?|PLC|N\.?V\.?|S\.?A\.?)\b/gi,
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (stripped.length >= 3 && stripped.toLowerCase() !== (ticker.companyName ?? '').toLowerCase()) {
    terms.add(stripped)
  }
  if (ref?.aliases) ref.aliases.forEach((a) => terms.add(a))
  return Array.from(terms)
}
