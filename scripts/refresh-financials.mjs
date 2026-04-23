#!/usr/bin/env node
// One-shot backfill for ticker_financials. Mirrors the logic in
// src/main/services/yahooFinanceService.ts (quoteSummary handshake) + the
// upsert in src/main/database/tickerFinancials.ts, but uses the system
// sqlite3 CLI so we don't have to rebuild better-sqlite3 against Node ABI.
//
// Usage: node scripts/refresh-financials.mjs [--all]
//   default: only refresh active watchlist tickers
//   --all:   refresh every row in `tickers` (active + passive graph nodes)

import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const CONSENT_URL = 'https://fc.yahoo.com/'
const CRUMB_URL = 'https://query2.finance.yahoo.com/v1/test/getcrumb'
const SUMMARY_URL = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/'
const MODULES =
  'cashflowStatementHistoryQuarterly,incomeStatementHistoryQuarterly,price'
const DELAY_MS = 800
const HANDSHAKE_RETRIES = 6
const HANDSHAKE_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000, 900_000]
// Skip symbols fetched within this window (matches REFRESH_INTERVAL_MS in the
// running app). Avoids re-burning crumbs on symbols the scheduler already did.
const SKIP_IF_FRESHER_THAN_MS = 3 * 24 * 60 * 60 * 1000

const DB_PATH = path.join(
  os.homedir(),
  'Library/Application Support/pulse/pulse.db'
)

const ALL = process.argv.includes('--all')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function sh(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('/usr/bin/sqlite3', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => {
      if (code === 0) resolve(out.trim())
      else reject(new Error(`sqlite3 exit ${code}: ${err.trim()}`))
    })
    if (input) p.stdin.write(input)
    p.stdin.end()
  })
}

async function listTickers() {
  const where = ALL ? '' : 'WHERE isActive = 1'
  const q = `SELECT symbol FROM tickers ${where} ORDER BY symbol;`
  const out = await sh([DB_PATH, q])
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
}

async function listFreshSymbols() {
  const cutoff = Date.now() - SKIP_IF_FRESHER_THAN_MS
  const q = `SELECT symbol FROM ticker_financials GROUP BY symbol HAVING MAX(fetchedAt) >= ${cutoff};`
  const out = await sh([DB_PATH, q])
  return new Set(
    out.split('\n').map((s) => s.trim().toUpperCase()).filter(Boolean)
  )
}

let cookie = null
let crumb = null

async function handshakeOnce() {
  const consent = await fetch(CONSENT_URL, {
    headers: { 'User-Agent': UA, Accept: 'text/html' }
  })
  const raw =
    consent.headers.getSetCookie?.() ??
    [consent.headers.get('set-cookie')].filter(Boolean)
  const c = raw.map((x) => x.split(';')[0]).filter(Boolean).join('; ')
  if (!c) throw new Error('no cookie from consent')
  const cr = await fetch(CRUMB_URL, {
    headers: { 'User-Agent': UA, Cookie: c, Accept: 'text/plain' }
  })
  if (!cr.ok) throw new Error(`crumb HTTP ${cr.status}`)
  const txt = (await cr.text()).trim()
  if (!txt) throw new Error('empty crumb')
  cookie = c
  crumb = txt
}

// Yahoo's getcrumb endpoint is aggressively rate-limited per IP. Back off
// exponentially on 429 — the running Pulse app is also contesting for crumbs,
// and multiple short retries just deepen the cooldown.
async function handshake() {
  for (let attempt = 0; attempt <= HANDSHAKE_RETRIES; attempt++) {
    try {
      await handshakeOnce()
      console.log(`[auth] crumb=${crumb.slice(0, 8)}… cookie=${cookie.length}b (attempt ${attempt + 1})`)
      return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt === HANDSHAKE_RETRIES) throw err
      const wait = HANDSHAKE_BACKOFF_MS[attempt] ?? 900_000
      console.warn(`[auth] ${msg} — backing off ${Math.round(wait / 1000)}s before retry ${attempt + 2}`)
      await sleep(wait)
    }
  }
}

function raw(f) {
  if (!f || typeof f.raw !== 'number' || !Number.isFinite(f.raw)) return null
  return f.raw
}

async function fetchQuarterly(symbol) {
  if (!crumb || !cookie) await handshake()
  const url = `${SUMMARY_URL}${encodeURIComponent(symbol)}?modules=${MODULES}&crumb=${encodeURIComponent(crumb)}`
  let res = await fetch(url, {
    headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' }
  })
  if (res.status === 401) {
    cookie = null
    crumb = null
    await handshake()
    const url2 = `${SUMMARY_URL}${encodeURIComponent(symbol)}?modules=${MODULES}&crumb=${encodeURIComponent(crumb)}`
    res = await fetch(url2, {
      headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' }
    })
  }
  if (!res.ok) throw new Error(`quoteSummary HTTP ${res.status}`)
  const json = await res.json()
  const result = json?.quoteSummary?.result?.[0]
  if (!result) return []
  const cf = result.cashflowStatementHistoryQuarterly?.cashflowStatements ?? []
  const is = result.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? []
  const currency = result.price?.currency ?? null

  const incomeByDate = new Map()
  for (const e of is) {
    const d = e.endDate?.raw
    if (typeof d === 'number' && Number.isFinite(d)) incomeByDate.set(d, e)
  }
  const cashByDate = new Map()
  for (const e of cf) {
    const d = e.endDate?.raw
    if (typeof d === 'number' && Number.isFinite(d)) cashByDate.set(d, e)
  }
  const all = new Set([...cashByDate.keys(), ...incomeByDate.keys()])
  const out = []
  for (const d of all) {
    const income = incomeByDate.get(d)
    const cash = cashByDate.get(d)
    out.push({
      endDate: d * 1000,
      revenue: raw(income?.totalRevenue),
      netIncome: raw(income?.netIncome) ?? raw(cash?.netIncome),
      grossProfit: raw(income?.grossProfit),
      operatingCashFlow: raw(cash?.totalCashFromOperatingActivities),
      capex: raw(cash?.capitalExpenditures),
      currency
    })
  }
  out.sort((a, b) => b.endDate - a.endDate)
  return out
}

function esc(s) {
  if (s === null || s === undefined) return 'NULL'
  return `'${String(s).replace(/'/g, "''")}'`
}
function num(n) {
  return n === null || n === undefined || !Number.isFinite(n) ? 'NULL' : String(n)
}

async function upsertRows(symbol, rows) {
  if (rows.length === 0) return 0
  const now = Date.now()
  const lines = []
  lines.push('BEGIN;')
  for (const r of rows) {
    const fcf =
      r.operatingCashFlow !== null && r.capex !== null
        ? r.operatingCashFlow - Math.abs(r.capex)
        : null
    lines.push(
      `INSERT INTO ticker_financials
       (symbol, periodEnd, periodType, revenue, operatingCashFlow, capex, freeCashFlow, netIncome, grossProfit, currency, fetchedAt)
       VALUES (${esc(symbol.toUpperCase())}, ${num(r.endDate)}, 'Q',
               ${num(r.revenue)}, ${num(r.operatingCashFlow)}, ${num(r.capex)},
               ${num(fcf)}, ${num(r.netIncome)}, ${num(r.grossProfit)},
               ${esc(r.currency)}, ${num(now)})
       ON CONFLICT(symbol, periodEnd) DO UPDATE SET
         revenue = excluded.revenue,
         operatingCashFlow = excluded.operatingCashFlow,
         capex = excluded.capex,
         freeCashFlow = excluded.freeCashFlow,
         netIncome = excluded.netIncome,
         grossProfit = excluded.grossProfit,
         currency = COALESCE(excluded.currency, ticker_financials.currency),
         fetchedAt = excluded.fetchedAt;`
    )
  }
  lines.push('COMMIT;')
  await sh([DB_PATH], lines.join('\n'))
  return rows.length
}

async function main() {
  const allSymbols = await listTickers()
  const fresh = await listFreshSymbols()
  const symbols = allSymbols.filter((s) => !fresh.has(s.toUpperCase()))
  console.log(
    `[financials-refresh] db=${DB_PATH}\n[financials-refresh] ${allSymbols.length} total (${ALL ? 'all' : 'active only'}), ${fresh.size} fresh (skipping), ${symbols.length} to fetch`
  )
  if (symbols.length === 0) return
  await handshake()

  let ok = 0
  let empty = 0
  let failed = 0
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i]
    try {
      const rows = await fetchQuarterly(sym)
      if (rows.length === 0) {
        empty++
        console.log(`  [${i + 1}/${symbols.length}] ${sym} — no quarters returned`)
      } else {
        await upsertRows(sym, rows)
        ok++
        const r0 = rows[0]
        const rev = r0.revenue !== null ? `rev=${(r0.revenue / 1e9).toFixed(2)}B` : 'rev=?'
        const ocf =
          r0.operatingCashFlow !== null
            ? `ocf=${(r0.operatingCashFlow / 1e9).toFixed(2)}B`
            : 'ocf=?'
        console.log(
          `  [${i + 1}/${symbols.length}] ${sym} — ${rows.length}Q upserted (latest ${rev} ${ocf})`
        )
      }
    } catch (err) {
      failed++
      console.warn(
        `  [${i + 1}/${symbols.length}] ${sym} — FAIL: ${err instanceof Error ? err.message : err}`
      )
    }
    await sleep(DELAY_MS)
  }
  console.log(
    `\n[financials-refresh] done — ok=${ok} empty=${empty} failed=${failed}`
  )
}

main().catch((err) => {
  console.error('[financials-refresh] fatal:', err)
  process.exit(1)
})
