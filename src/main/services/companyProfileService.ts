import { getDb } from '../database/connection'
import { listTickers } from '../database/tickers'
import { describeCompany } from './ollamaService'

export interface CompanyProfile {
  symbol: string
  description: string
  generatedAt: number
}

interface ProfileRow {
  symbol: string
  description: string
  generatedAt: number
}

const inflight = new Map<string, Promise<CompanyProfile | null>>()

export function getCompanyProfile(symbol: string): CompanyProfile | null {
  const db = getDb()
  const row = db
    .prepare<[string], ProfileRow>(
      `SELECT symbol, description, generatedAt FROM company_profiles WHERE symbol = ?`
    )
    .get(symbol.toUpperCase())
  return row ?? null
}

function saveProfile(symbol: string, description: string): CompanyProfile {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    `INSERT INTO company_profiles (symbol, description, generatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET description = excluded.description, generatedAt = excluded.generatedAt`
  ).run(symbol.toUpperCase(), description, now)
  return { symbol: symbol.toUpperCase(), description, generatedAt: now }
}

export async function ensureCompanyProfile(
  symbol: string,
  companyName: string
): Promise<CompanyProfile | null> {
  const sym = symbol.toUpperCase()
  const cached = getCompanyProfile(sym)
  if (cached) return cached

  const existing = inflight.get(sym)
  if (existing) return existing

  const p = (async () => {
    const desc = await describeCompany(sym, companyName)
    if (!desc) return null
    return saveProfile(sym, desc)
  })().finally(() => {
    inflight.delete(sym)
  })
  inflight.set(sym, p)
  return p
}

export async function regenerateCompanyProfile(
  symbol: string,
  companyName: string
): Promise<CompanyProfile | null> {
  const sym = symbol.toUpperCase()
  const desc = await describeCompany(sym, companyName)
  if (!desc) return null
  return saveProfile(sym, desc)
}

// Warm the cache for every active ticker so opening the stock detail page
// never waits on Ollama. Bounded concurrency = 1 because the Ollama queue
// is serialized at the service layer anyway, and this is strictly background
// work that shouldn't compete with interactive requests. `ensureCompanyProfile`
// is idempotent + dedupes via the `inflight` map, so a user navigating into a
// stock page mid-prefetch simply awaits the in-flight promise we started.
let prefetching = false

export async function prefetchAllCompanyProfiles(): Promise<void> {
  if (prefetching) return
  prefetching = true
  try {
    const tickers = listTickers().filter((t) => t.isActive)
    for (const t of tickers) {
      if (getCompanyProfile(t.symbol)) continue
      try {
        await ensureCompanyProfile(t.symbol, t.companyName ?? t.symbol)
      } catch (err) {
        console.warn(
          '[companyProfile] prefetch failed:',
          t.symbol,
          err instanceof Error ? err.message : err
        )
      }
    }
  } finally {
    prefetching = false
  }
}
