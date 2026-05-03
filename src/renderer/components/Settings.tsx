import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  CalendarEventKindId,
  Category,
  Domain,
  FavoriteTeam,
  Feed,
  GeoInterest,
  GeoType,
  KokoroStatus,
  KokoroVoice,
  Preferences,
  PulseConfig,
  SportsLeague,
  SportsTeam,
  Theme,
  Ticker,
  TtsEngine
} from '../../preload'
import tickerReference from '../../data/tickerReference.json'
import locationReference from '../../data/locationReference.json'
import { GraphUpdatesTab } from './GraphUpdatesTab'

interface TickerRef {
  symbol: string
  name: string
  sector?: string | null
  industry?: string | null
  aliases?: string[]
}

interface LocationRef {
  displayName: string
  type: GeoType
  keywords: string[]
}

const REFERENCE_TICKERS = tickerReference as TickerRef[]
const REFERENCE_LOCATIONS = locationReference as LocationRef[]

type Tab = 'categories' | 'feeds' | 'tickers' | 'locations' | 'teams' | 'graph' | 'preferences'

export function Settings({
  onClose,
  onDataChanged,
  initialTab
}: {
  onClose: () => void
  onDataChanged: () => void
  // Hyperintelligence deep-links into a specific tab when it surfaces a
  // settings snapshot ("your theme is X — [open Settings]"). Unset = default
  // landing tab (categories).
  initialTab?: Tab
}): JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [tickers, setTickers] = useState<Ticker[]>([])
  const [geo, setGeo] = useState<GeoInterest[]>([])

  const reloadAll = useCallback(async (): Promise<void> => {
    const [cats, fs, ts, gs] = await Promise.all([
      window.api.categories.list(),
      window.api.feeds.list(),
      window.api.tickers.list(),
      window.api.geo.list()
    ])
    setCategories(cats)
    setFeeds(fs)
    setTickers(ts)
    setGeo(gs)
    onDataChanged()
  }, [onDataChanged])

  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      // Solid 88% overlay instead of backdrop-blur-sm — the blur filter
      // recomputes per frame against the entire viewport behind it,
      // which surfaces as visible jitter in packaged builds running
      // full-window. Same fix that PeerCompareModal already applied for
      // the same reason. Opacity gives the same "focus this modal"
      // darken effect without the per-frame GPU cost.
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/[0.88] pt-12 pb-8 px-6"
      style={{ isolation: 'isolate' }}
    >
      <div className="bg-surface-1 border border-edge rounded-lg shadow-2xl w-full max-w-3xl max-h-[calc(100vh-80px)] flex flex-col overflow-hidden">
        <header className="h-11 shrink-0 flex items-center gap-3 px-4 border-b border-edge">
          <div className="text-xs tracking-[0.2em] uppercase text-zinc-400 font-medium">Settings</div>
          <div className="flex gap-1 ml-4">
            {(['categories', 'feeds', 'tickers', 'locations', 'teams', 'graph', 'preferences'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-[11px] uppercase tracking-wider rounded ${
                  tab === t
                    ? 'bg-surface-3 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-2'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-[11px] uppercase tracking-wider text-zinc-400 hover:text-zinc-100"
          >
            Close
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {tab === 'categories' && (
            <CategoriesTab
              categories={categories}
              feedCounts={countBy(feeds, 'categoryId')}
              reload={reloadAll}
            />
          )}
          {tab === 'feeds' && (
            <FeedsTab feeds={feeds} categories={categories} reload={reloadAll} />
          )}
          {tab === 'tickers' && <TickersTab tickers={tickers} reload={reloadAll} />}
          {tab === 'locations' && <LocationsTab geo={geo} reload={reloadAll} />}
          {tab === 'teams' && <TeamsTab />}
          {tab === 'graph' && <GraphUpdatesTab />}
          {tab === 'preferences' && <PreferencesTab />}
        </div>
      </div>
    </div>,
    document.body
  )
}

function countBy<K extends keyof Feed>(items: Feed[], key: K): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const f of items) {
    const k = String(f[key])
    acc[k] = (acc[k] ?? 0) + 1
  }
  return acc
}

function CategoriesTab({
  categories,
  feedCounts,
  reload
}: {
  categories: Category[]
  feedCounts: Record<string, number>
  reload: () => Promise<void>
}): JSX.Element {
  const [newName, setNewName] = useState('')
  const [newDomain, setNewDomain] = useState<Domain>('finance')
  const [busy, setBusy] = useState(false)

  const add = async (): Promise<void> => {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      await window.api.categories.create(name, newDomain)
      setNewName('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const byDomain = (d: Domain): Category[] => categories.filter((c) => c.domain === d)

  return (
    <div className="p-5 space-y-6">
      <section>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">Add category</div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Category name"
            className="flex-1 px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
          />
          <select
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value as Domain)}
            className="px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent"
          >
            <option value="finance">Finance</option>
            <option value="general">News</option>
          </select>
          <button
            onClick={add}
            disabled={busy || !newName.trim()}
            className="px-3 py-1.5 text-[11px] uppercase tracking-wider bg-accent/20 text-accent rounded hover:bg-accent/30 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </section>

      {(['finance', 'general'] as const).map((domain) => (
        <section key={domain}>
          <div
            className={`text-[10px] uppercase tracking-[0.18em] mb-2 ${
              domain === 'finance' ? 'text-amber-400' : 'text-blue-400'
            }`}
          >
            {domain === 'finance' ? 'Finance' : 'News'}
          </div>
          <ul className="border border-edge rounded divide-y divide-edge">
            {byDomain(domain).map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                feedCount={feedCounts[String(c.id)] ?? 0}
                reload={reload}
              />
            ))}
            {byDomain(domain).length === 0 && (
              <li className="px-3 py-4 text-sm text-zinc-500 text-center">No categories</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  )
}

function CategoryRow({
  category,
  feedCount,
  reload
}: {
  category: Category
  feedCount: number
  reload: () => Promise<void>
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)

  useEffect(() => setName(category.name), [category.name])

  const saveRename = async (): Promise<void> => {
    setEditing(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name) {
      setName(category.name)
      return
    }
    await window.api.categories.rename(category.id, trimmed)
    await reload()
  }

  const toggleNotif = async (): Promise<void> => {
    await window.api.categories.setNotifications(category.id, !category.notificationsEnabled)
    await reload()
  }

  const flipDomain = async (): Promise<void> => {
    const next: Domain = category.domain === 'finance' ? 'general' : 'finance'
    await window.api.categories.setDomain(category.id, next)
    await reload()
  }

  const remove = async (): Promise<void> => {
    if (feedCount > 0) {
      const ok = window.confirm(
        `Delete "${category.name}"? This will also remove ${feedCount} feed${feedCount === 1 ? '' : 's'} and their articles.`
      )
      if (!ok) return
    }
    await window.api.categories.delete(category.id)
    await reload()
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      {editing ? (
        <input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={saveRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveRename()
            if (e.key === 'Escape') {
              setName(category.name)
              setEditing(false)
            }
          }}
          className="flex-1 px-2 py-1 text-sm bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex-1 text-left text-sm text-zinc-100 hover:text-accent truncate"
          title="Click to rename"
        >
          {category.name}
        </button>
      )}
      <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">{feedCount} feeds</span>
      <button
        onClick={toggleNotif}
        title={category.notificationsEnabled ? 'Notifications on' : 'Notifications off'}
        className={`text-[11px] px-2 py-0.5 rounded transition-colors shrink-0 ${
          category.notificationsEnabled
            ? 'text-accent bg-accent/10 hover:bg-accent/20'
            : 'text-zinc-500 bg-surface-2 hover:text-zinc-300'
        }`}
      >
        {category.notificationsEnabled ? '🔔' : '🔕'}
      </button>
      <button
        onClick={flipDomain}
        className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded text-zinc-400 bg-surface-2 hover:text-zinc-100 shrink-0"
        title="Move to other domain"
      >
        →{category.domain === 'finance' ? 'News' : 'Fin'}
      </button>
      <button
        onClick={remove}
        className="text-[11px] text-zinc-500 hover:text-red-400 px-1 shrink-0"
        title="Delete category"
      >
        ✕
      </button>
    </li>
  )
}

function FeedsTab({
  feeds,
  categories,
  reload
}: {
  feeds: Feed[]
  categories: Category[]
  reload: () => Promise<void>
}): JSX.Element {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>(
    categories[0]?.id ?? ''
  )
  const [probing, setProbing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [filterCategoryId, setFilterCategoryId] = useState<number | 'all'>('all')

  useEffect(() => {
    if (categoryId === '' && categories[0]) setCategoryId(categories[0].id)
  }, [categories, categoryId])

  const probe = async (): Promise<void> => {
    const u = url.trim()
    if (!u || probing) return
    setProbing(true)
    setProbeError(null)
    try {
      const res = await window.api.feeds.probe(u)
      if (res.status === 'ok' && res.title) {
        setTitle(res.title)
      } else {
        setProbeError(res.error ?? 'Could not read feed')
      }
    } finally {
      setProbing(false)
    }
  }

  const add = async (): Promise<void> => {
    const u = url.trim()
    const t = title.trim()
    if (!u || !t || categoryId === '' || adding) return
    setAdding(true)
    try {
      await window.api.feeds.create({ title: t, url: u, categoryId: Number(categoryId) })
      setUrl('')
      setTitle('')
      setProbeError(null)
      await reload()
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : String(err))
    } finally {
      setAdding(false)
    }
  }

  const visibleFeeds =
    filterCategoryId === 'all' ? feeds : feeds.filter((f) => f.categoryId === filterCategoryId)

  return (
    <div className="p-5 space-y-6">
      <section>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">Add feed</div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => url.trim() && !title && void probe()}
              placeholder="Feed URL (RSS / Atom)"
              className="flex-1 px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            />
            <button
              onClick={probe}
              disabled={probing || !url.trim()}
              className="px-3 py-1.5 text-[11px] uppercase tracking-wider bg-surface-2 text-zinc-300 rounded hover:bg-surface-3 disabled:opacity-40"
            >
              {probing ? 'Probing…' : 'Probe'}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Feed title (auto-fills from probe)"
              className="flex-1 px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            />
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
              className="px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.domain === 'finance' ? 'Fin' : 'News'} · {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={add}
              disabled={adding || !url.trim() || !title.trim() || categoryId === ''}
              className="px-3 py-1.5 text-[11px] uppercase tracking-wider bg-accent/20 text-accent rounded hover:bg-accent/30 disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {probeError && <div className="text-[11px] text-red-400">{probeError}</div>}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Feeds</div>
          <select
            value={filterCategoryId}
            onChange={(e) =>
              setFilterCategoryId(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
            className="ml-auto px-2 py-1 text-[11px] bg-surface-2 border border-edge rounded text-zinc-300 focus:outline-none focus:border-accent"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-zinc-500 tabular-nums">{visibleFeeds.length}</span>
        </div>
        <ul className="border border-edge rounded divide-y divide-edge">
          {visibleFeeds.map((f) => (
            <FeedRow key={f.id} feed={f} categories={categories} reload={reload} />
          ))}
          {visibleFeeds.length === 0 && (
            <li className="px-3 py-4 text-sm text-zinc-500 text-center">No feeds</li>
          )}
        </ul>
      </section>
    </div>
  )
}

function FeedRow({
  feed,
  categories,
  reload
}: {
  feed: Feed
  categories: Category[]
  reload: () => Promise<void>
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(feed.title)

  useEffect(() => setTitle(feed.title), [feed.title])

  const saveRename = async (): Promise<void> => {
    setEditing(false)
    const t = title.trim()
    if (!t || t === feed.title) {
      setTitle(feed.title)
      return
    }
    await window.api.feeds.rename(feed.id, t)
    await reload()
  }

  const toggleEnabled = async (): Promise<void> => {
    await window.api.feeds.setEnabled(feed.id, !feed.isEnabled)
    await reload()
  }

  const changeCategory = async (catId: number): Promise<void> => {
    if (catId === feed.categoryId) return
    await window.api.feeds.setCategory(feed.id, catId)
    await reload()
  }

  const remove = async (): Promise<void> => {
    const ok = window.confirm(`Delete feed "${feed.title}" and its articles?`)
    if (!ok) return
    await window.api.feeds.delete(feed.id)
    await reload()
  }

  return (
    <li className={`flex items-center gap-2 px-3 py-2 ${feed.isEnabled ? '' : 'opacity-50'}`}>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveRename()
              if (e.key === 'Escape') {
                setTitle(feed.title)
                setEditing(false)
              }
            }}
            className="w-full px-2 py-1 text-sm bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="block w-full text-left text-sm text-zinc-100 hover:text-accent truncate"
            title="Click to rename"
          >
            {feed.title}
          </button>
        )}
        <div className="text-[11px] text-zinc-500 truncate">{feed.url}</div>
      </div>
      <select
        value={feed.categoryId}
        onChange={(e) => void changeCategory(Number(e.target.value))}
        className="px-2 py-1 text-[11px] bg-surface-2 border border-edge rounded text-zinc-300 focus:outline-none focus:border-accent shrink-0"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.domain === 'finance' ? 'Fin' : 'News'} · {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={toggleEnabled}
        title={feed.isEnabled ? 'Enabled' : 'Disabled'}
        className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${
          feed.isEnabled
            ? 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'
            : 'text-zinc-500 bg-surface-2 hover:text-zinc-300'
        }`}
      >
        {feed.isEnabled ? 'On' : 'Off'}
      </button>
      <button
        onClick={remove}
        className="text-[11px] text-zinc-500 hover:text-red-400 px-1 shrink-0"
        title="Delete feed"
      >
        ✕
      </button>
    </li>
  )
}

function TickersTab({
  tickers,
  reload
}: {
  tickers: Ticker[]
  reload: () => Promise<void>
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [sector, setSector] = useState('')
  const [industry, setIndustry] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existing = useMemo(() => new Set(tickers.map((t) => t.symbol)), [tickers])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: TickerRef[] = []
    for (const t of REFERENCE_TICKERS) {
      if (existing.has(t.symbol)) continue
      const hay =
        `${t.symbol} ${t.name} ${(t.aliases ?? []).join(' ')} ${t.sector ?? ''} ${t.industry ?? ''}`.toLowerCase()
      if (hay.includes(q)) out.push(t)
      if (out.length >= 8) break
    }
    return out
  }, [query, existing])

  const pickReference = (ref: TickerRef): void => {
    setSymbol(ref.symbol)
    setName(ref.name)
    setSector(ref.sector ?? '')
    setIndustry(ref.industry ?? '')
    setQuery('')
    setError(null)
  }

  const clearForm = (): void => {
    setSymbol('')
    setName('')
    setSector('')
    setIndustry('')
    setError(null)
  }

  const add = async (): Promise<void> => {
    const sym = symbol.trim().toUpperCase()
    const nm = name.trim()
    if (!sym || !nm || adding) return
    if (existing.has(sym)) {
      setError(`${sym} is already in the watchlist.`)
      return
    }
    setAdding(true)
    setError(null)
    try {
      await window.api.tickers.create({
        symbol: sym,
        companyName: nm,
        sector: sector.trim() || null,
        industry: industry.trim() || null
      })
      clearForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAdding(false)
    }
  }

  const remove = async (t: Ticker): Promise<void> => {
    const ok = window.confirm(`Remove ${t.symbol} (${t.companyName}) from the watchlist?`)
    if (!ok) return
    await window.api.tickers.delete(t.id)
    await reload()
  }

  // Passive (isActive=0) rows back the Value Chain graph but don't belong in
  // the Settings watchlist list — they're shown/activated from the graph view.
  const watchlist = useMemo(() => tickers.filter((t) => t.isActive), [tickers])

  const grouped = useMemo(() => {
    const by: Record<string, Ticker[]> = {}
    for (const t of watchlist) {
      const key = t.sector ?? 'Uncategorized'
      ;(by[key] ??= []).push(t)
    }
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b))
  }, [watchlist])

  return (
    <div className="p-5 space-y-6">
      <section>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
          Add ticker
        </div>
        <div className="space-y-2">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by symbol, company, or brand (NVDA, TSMC, EUV…)"
              className="w-full px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            />
            {matches.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 top-full mt-1 bg-surface-1 border border-edge rounded shadow-lg max-h-72 overflow-y-auto">
                {matches.map((m) => (
                  <li key={m.symbol}>
                    <button
                      onClick={() => pickReference(m)}
                      className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-baseline gap-2"
                    >
                      <span className="text-[12px] font-semibold text-zinc-100 tabular-nums w-16 shrink-0">
                        {m.symbol}
                      </span>
                      <span className="text-sm text-zinc-300 truncate">{m.name}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">
                        {m.industry ?? m.sector ?? ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Symbol"
              className="px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent tabular-nums uppercase"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Company name"
              className="px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="Sector (optional)"
              className="px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            />
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Industry (optional)"
              className="px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={add}
              disabled={adding || !symbol.trim() || !name.trim()}
              className="px-3 py-1.5 text-[11px] uppercase tracking-wider bg-accent/20 text-accent rounded hover:bg-accent/30 disabled:opacity-40"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
            {(symbol || name || sector || industry) && (
              <button
                onClick={clearForm}
                className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
              >
                Clear
              </button>
            )}
            {error && <span className="text-[11px] text-red-400 ml-auto">{error}</span>}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Watchlist</div>
          <span className="ml-auto text-[11px] text-zinc-500 tabular-nums">{watchlist.length}</span>
        </div>
        {watchlist.length === 0 ? (
          <div className="border border-edge rounded px-3 py-6 text-sm text-zinc-500 text-center">
            No tickers yet. Search above to add one.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([sectorLabel, rows]) => (
              <div key={sectorLabel}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1 px-1">
                  {sectorLabel}
                </div>
                <ul className="border border-edge rounded divide-y divide-edge">
                  {rows.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-[12px] font-semibold text-zinc-100 tabular-nums w-16 shrink-0">
                        {t.symbol}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-100 truncate">{t.companyName}</div>
                        {t.industry && (
                          <div className="text-[11px] text-zinc-500 truncate">{t.industry}</div>
                        )}
                      </div>
                      <button
                        onClick={() => void remove(t)}
                        className="text-[11px] text-zinc-500 hover:text-red-400 px-1 shrink-0"
                        title="Remove ticker"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

const GEO_TYPES: GeoType[] = ['city', 'state', 'country', 'region']

function autoKeywords(name: string): string[] {
  const base = name.trim()
  if (!base) return []
  return [base]
}

function LocationsTab({
  geo,
  reload
}: {
  geo: GeoInterest[]
  reload: () => Promise<void>
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [type, setType] = useState<GeoType>('country')
  const [keywordsText, setKeywordsText] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existing = useMemo(
    () => new Set(geo.map((g) => g.displayName.toLowerCase())),
    [geo]
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: LocationRef[] = []
    for (const loc of REFERENCE_LOCATIONS) {
      if (existing.has(loc.displayName.toLowerCase())) continue
      const hay = `${loc.displayName} ${loc.keywords.join(' ')} ${loc.type}`.toLowerCase()
      if (hay.includes(q)) out.push(loc)
      if (out.length >= 8) break
    }
    return out
  }, [query, existing])

  const pickReference = (ref: LocationRef): void => {
    setDisplayName(ref.displayName)
    setType(ref.type)
    setKeywordsText(ref.keywords.join(', '))
    setQuery('')
    setError(null)
  }

  const clearForm = (): void => {
    setDisplayName('')
    setType('country')
    setKeywordsText('')
    setError(null)
  }

  const add = async (): Promise<void> => {
    const name = displayName.trim()
    if (!name || adding) return
    if (existing.has(name.toLowerCase())) {
      setError(`"${name}" is already in your locations.`)
      return
    }
    const keywords = keywordsText
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    const finalKeywords = keywords.length > 0 ? keywords : autoKeywords(name)
    setAdding(true)
    setError(null)
    try {
      await window.api.geo.create({
        displayName: name,
        type,
        keywords: finalKeywords
      })
      clearForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAdding(false)
    }
  }

  const remove = async (g: GeoInterest): Promise<void> => {
    const ok = window.confirm(`Remove "${g.displayName}" from your locations?`)
    if (!ok) return
    await window.api.geo.delete(g.id)
    await reload()
  }

  const grouped = useMemo(() => {
    const by: Record<GeoType, GeoInterest[]> = {
      city: [],
      state: [],
      country: [],
      region: []
    }
    for (const g of geo) by[g.type].push(g)
    return GEO_TYPES.filter((t) => by[t].length > 0).map((t) => [t, by[t]] as const)
  }, [geo])

  return (
    <div className="p-5 space-y-6">
      <section>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
          Add location
        </div>
        <div className="space-y-2">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries, regions, states, cities (Taiwan, EU, Indiana…)"
              className="w-full px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            />
            {matches.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 top-full mt-1 bg-surface-1 border border-edge rounded shadow-lg max-h-72 overflow-y-auto">
                {matches.map((m) => (
                  <li key={m.displayName}>
                    <button
                      onClick={() => pickReference(m)}
                      className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-baseline gap-2"
                    >
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 w-14 shrink-0">
                        {m.type}
                      </span>
                      <span className="text-sm text-zinc-100 truncate">{m.displayName}</span>
                      <span className="ml-auto text-[10px] text-zinc-500 truncate max-w-[40%]">
                        {m.keywords.slice(1, 4).join(', ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name (e.g., Taiwan)"
              className="px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as GeoType)}
              className="px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent capitalize"
            >
              {GEO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <input
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            placeholder="Matching keywords, comma-separated (Taiwan, Taiwanese, Taipei, ROC)"
            className="w-full px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={add}
              disabled={adding || !displayName.trim()}
              className="px-3 py-1.5 text-[11px] uppercase tracking-wider bg-accent/20 text-accent rounded hover:bg-accent/30 disabled:opacity-40"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
            {(displayName || keywordsText) && (
              <button
                onClick={clearForm}
                className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
              >
                Clear
              </button>
            )}
            <span className="text-[10px] text-zinc-500 ml-2">
              Leave keywords blank to use the display name alone.
            </span>
            {error && <span className="text-[11px] text-red-400 ml-auto">{error}</span>}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Locations</div>
          <span className="ml-auto text-[11px] text-zinc-500 tabular-nums">{geo.length}</span>
        </div>
        {geo.length === 0 ? (
          <div className="border border-edge rounded px-3 py-6 text-sm text-zinc-500 text-center">
            No locations yet. Search above to add one.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([groupType, rows]) => (
              <div key={groupType}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1 px-1">
                  {groupType}s
                </div>
                <ul className="border border-edge rounded divide-y divide-edge">
                  {rows.map((g) => (
                    <LocationRow key={g.id} geo={g} reload={reload} onRemove={() => void remove(g)} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function LocationRow({
  geo,
  reload,
  onRemove
}: {
  geo: GeoInterest
  reload: () => Promise<void>
  onRemove: () => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(geo.keywords.join(', '))

  useEffect(() => setText(geo.keywords.join(', ')), [geo.keywords])

  const save = async (): Promise<void> => {
    setEditing(false)
    const next = text
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    const same =
      next.length === geo.keywords.length && next.every((k, i) => k === geo.keywords[i])
    if (same) return
    const fallback = next.length > 0 ? next : [geo.displayName]
    await window.api.geo.updateKeywords(geo.id, fallback)
    await reload()
  }

  return (
    <li className="flex items-start gap-3 px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-100 truncate">{geo.displayName}</div>
        {editing ? (
          <input
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') {
                setText(geo.keywords.join(', '))
                setEditing(false)
              }
            }}
            className="mt-1 w-full px-2 py-1 text-[11px] bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="block w-full text-left text-[11px] text-zinc-500 hover:text-accent truncate"
            title="Click to edit keywords"
          >
            {geo.keywords.join(', ') || '(no keywords)'}
          </button>
        )}
      </div>
      <button
        onClick={onRemove}
        className="text-[11px] text-zinc-500 hover:text-red-400 px-1 shrink-0 mt-0.5"
        title="Remove location"
      >
        ✕
      </button>
    </li>
  )
}

// ---- Preferences tab ----

// Keys live in the sqlite `preferences` table. We split them into two scopes
// so the Preferences and Flash-narration (Reels) subsections each get their
// own APPLY button — changes in one don't force a commit of the other.
const CORE_PREF_KEYS: (keyof Preferences)[] = [
  'pollIntervalMin',
  'digestIntervalMin',
  'quietHoursEnabled',
  'quietHoursStart',
  'quietHoursEnd',
  'density',
  'theme',
  'favoriteTeamAlertsEnabled',
  'launchAtLogin',
  'notificationDailyCap',
  'notifyArticlesEnabled',
  'notifyStocksEnabled',
  'notifySportsEnabled',
  'notifyFilingsEnabled',
  'notifyMacroEnabled',
  'stockDailyMovePct',
  'stockGapOpenPct'
]
const REELS_PREF_KEYS: (keyof Preferences)[] = [
  'ttsEngine',
  'ttsVoice',
  'mediaPipelineEnabled'
]
const AI_PREF_KEYS: (keyof Preferences)[] = [
  'aiProvider',
  'anthropicApiKey',
  'fredApiKey',
  'semanticScholarApiKey'
]

function PreferencesTab(): JSX.Element {
  // `prefs` = last known committed state from the DB.
  // `draft` = user's uncommitted edits. APPLY sends the diff to the main
  // process; Reset snaps draft back to prefs. We never mutate prefs directly.
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [draft, setDraft] = useState<Preferences | null>(null)
  const [coreStatus, setCoreStatus] = useState<ApplyStatus>(null)
  const [reelsStatus, setReelsStatus] = useState<ApplyStatus>(null)
  const [aiStatus, setAiStatus] = useState<ApplyStatus>(null)

  useEffect(() => {
    void window.api.prefs.get().then((p) => {
      setPrefs(p)
      setDraft(p)
    })
  }, [])

  const patch = <K extends keyof Preferences>(key: K, value: Preferences[K]): void => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
    // Any edit invalidates the "applied" / "failed" status stripe so the
    // user doesn't see a stale confirmation while actively editing.
    setCoreStatus(null)
    setReelsStatus(null)
  }

  const diffKeys = (scope: (keyof Preferences)[]): (keyof Preferences)[] => {
    if (!prefs || !draft) return []
    return scope.filter((k) => prefs[k] !== draft[k])
  }

  const applyScope = async (
    scope: (keyof Preferences)[],
    setStatus: (s: ApplyStatus) => void
  ): Promise<void> => {
    if (!draft) return
    const changed = diffKeys(scope)
    if (changed.length === 0) return
    setStatus('applying')
    try {
      for (const k of changed) {
        await window.api.prefs.set(k, draft[k] as string | number | boolean)
      }
      await window.api.prefs.apply()
      const fresh = await window.api.prefs.get()
      setPrefs(fresh)
      setDraft(fresh)
      setStatus('applied')
    } catch {
      setStatus('failed')
    }
  }

  const resetScope = (scope: (keyof Preferences)[]): void => {
    setDraft((prev) => {
      if (!prev || !prefs) return prev
      const next = { ...prev }
      for (const k of scope) {
        ;(next[k] as Preferences[typeof k]) = prefs[k]
      }
      return next
    })
    setCoreStatus(null)
    setReelsStatus(null)
  }

  if (!prefs || !draft) return <div className="p-6 text-sm text-zinc-500">Loading…</div>

  const coreDirty = diffKeys(CORE_PREF_KEYS).length
  const reelsDirty = diffKeys(REELS_PREF_KEYS).length
  const aiDirty = diffKeys(AI_PREF_KEYS).length

  return (
    <div className="p-6 space-y-8 max-w-lg">
      <PrefSection title="Polling">
        <PrefRow label="Feed poll interval (minutes)">
          <NumberInput
            value={draft.pollIntervalMin}
            min={1}
            max={60}
            onChange={(v) => patch('pollIntervalMin', v)}
          />
        </PrefRow>
      </PrefSection>

      <PrefSection title="Notifications">
        <PrefRow label="Digest interval (minutes)">
          <NumberInput
            value={draft.digestIntervalMin}
            min={5}
            max={120}
            onChange={(v) => patch('digestIntervalMin', v)}
          />
        </PrefRow>
        <PrefRow label="Daily cap (across all categories)">
          <NumberInput
            value={draft.notificationDailyCap}
            min={0}
            max={50}
            onChange={(v) => patch('notificationDailyCap', v)}
          />
        </PrefRow>
        <div className="text-[11px] text-zinc-500 leading-relaxed pl-1">
          Total OS notifications per rolling 24h. 0 disables notifications
          entirely. Default 5 keeps signal high; bump up if you want to be
          more in-the-loop.
        </div>
        <PrefRow label="Articles (breaking news, digests)">
          <ToggleSwitch
            checked={draft.notifyArticlesEnabled}
            onChange={(v) => patch('notifyArticlesEnabled', v)}
          />
        </PrefRow>
        <PrefRow label="Stocks (price moves, analyst alerts)">
          <ToggleSwitch
            checked={draft.notifyStocksEnabled}
            onChange={(v) => patch('notifyStocksEnabled', v)}
          />
        </PrefRow>
        {draft.notifyStocksEnabled && (
          <>
            <PrefRow label="Daily move threshold (±%)">
              <NumberInput
                value={draft.stockDailyMovePct}
                min={0.5}
                max={30}
                onChange={(v) => patch('stockDailyMovePct', v)}
              />
            </PrefRow>
            <PrefRow label="Gap-at-open threshold (±%)">
              <NumberInput
                value={draft.stockGapOpenPct}
                min={0.5}
                max={20}
                onChange={(v) => patch('stockGapOpenPct', v)}
              />
            </PrefRow>
            <div className="text-[11px] text-zinc-500 leading-relaxed pl-1">
              Daily move covers regular session AND pre/after-hours
              (separate alerts per session). 52-week-high/low touches and
              gap-at-open also fire when their thresholds are met.
            </div>
          </>
        )}
        <PrefRow label="Sports (HRs, goals, NBA milestones)">
          <ToggleSwitch
            checked={draft.notifySportsEnabled}
            onChange={(v) => patch('notifySportsEnabled', v)}
          />
        </PrefRow>
        <PrefRow label="SEC filings (8-K, Form 4 large insider)">
          <ToggleSwitch
            checked={draft.notifyFilingsEnabled}
            onChange={(v) => patch('notifyFilingsEnabled', v)}
          />
        </PrefRow>
        <PrefRow label="Macro (VIX spikes, rate moves)">
          <ToggleSwitch
            checked={draft.notifyMacroEnabled}
            onChange={(v) => patch('notifyMacroEnabled', v)}
          />
        </PrefRow>
        <PrefRow label="Quiet hours">
          <ToggleSwitch
            checked={draft.quietHoursEnabled}
            onChange={(v) => patch('quietHoursEnabled', v)}
          />
        </PrefRow>
        {draft.quietHoursEnabled && (
          <div className="flex items-center gap-3 pl-1">
            <TimeInput value={draft.quietHoursStart} onChange={(v) => patch('quietHoursStart', v)} />
            <span className="text-zinc-500 text-xs">to</span>
            <TimeInput value={draft.quietHoursEnd} onChange={(v) => patch('quietHoursEnd', v)} />
          </div>
        )}
        <div className="text-[11px] text-zinc-500 leading-relaxed pl-1">
          Quiet hours suppress non-urgent notifications. Urgent alerts
          (game scores, breaking news, big intraday moves) still come
          through.
        </div>
      </PrefSection>

      <PrefSection title="Display">
        <PrefRow label="Density">
          <select
            value={draft.density}
            onChange={(e) => patch('density', e.target.value as Preferences['density'])}
            className="bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </PrefRow>
        <div className="pt-1">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Theme</div>
          <ThemePicker value={draft.theme} onChange={(t) => patch('theme', t)} />
        </div>
      </PrefSection>

      <PrefSection title="Sports alerts">
        <PrefRow label="Favorite team alerts">
          <ToggleSwitch
            checked={draft.favoriteTeamAlertsEnabled}
            onChange={(v) => patch('favoriteTeamAlertsEnabled', v)}
          />
        </PrefRow>
        <div className="text-[11px] text-zinc-500 leading-relaxed pl-1">
          Notifies you when a favorite team&apos;s game starts and when it finishes. Manage teams in the
          Teams tab; quiet hours still apply.
        </div>
      </PrefSection>

      <PrefSection title="System">
        <PrefRow label="Launch at login">
          <ToggleSwitch
            checked={draft.launchAtLogin}
            onChange={(v) => patch('launchAtLogin', v)}
          />
        </PrefRow>
      </PrefSection>

      <ApplyBar
        label="Preferences"
        dirtyCount={coreDirty}
        status={coreStatus}
        onApply={() => void applyScope(CORE_PREF_KEYS, setCoreStatus)}
        onReset={() => resetScope(CORE_PREF_KEYS)}
      />

      <PrefSection title="AI provider">
        <div className="text-[11px] text-zinc-500 leading-relaxed pl-1 mb-2">
          Chooses the model that generates company value chains and sector
          classifications. Claude (Anthropic API, your key) produces
          substantially better chains than local Ollama but costs ~$0.02 per
          generation. Local Ollama stays free and private.
        </div>
        <PrefRow label="Provider">
          <select
            value={draft.aiProvider}
            onChange={(e) =>
              patch('aiProvider', e.target.value as Preferences['aiProvider'])
            }
            className="bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent"
          >
            <option value="auto">Auto (Claude if key is set, else Ollama)</option>
            <option value="claude">Claude (requires API key)</option>
            <option value="ollama">Ollama only (local, free)</option>
          </select>
        </PrefRow>
        <PrefRow label="Anthropic API key">
          <input
            type="password"
            value={draft.anthropicApiKey}
            onChange={(e) => patch('anthropicApiKey', e.target.value)}
            placeholder="sk-ant-..."
            autoComplete="off"
            spellCheck={false}
            className="w-[320px] bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent font-mono"
          />
        </PrefRow>
        <div className="text-[11px] text-zinc-500 leading-relaxed pl-1">
          Key is stored locally in pulse.db and never transmitted anywhere
          except the Anthropic API. Revokable any time at
          console.anthropic.com.{' '}
          {draft.anthropicApiKey &&
            !draft.anthropicApiKey.startsWith('sk-ant-') && (
              <span className="text-amber-300">
                ⚠ Anthropic keys typically start with &ldquo;sk-ant-&rdquo; —
                double-check what you pasted.
              </span>
            )}
        </div>
        <PrefRow label="FRED API key">
          <input
            type="password"
            value={draft.fredApiKey}
            onChange={(e) => patch('fredApiKey', e.target.value)}
            placeholder="32-char hex"
            autoComplete="off"
            spellCheck={false}
            className="w-[320px] bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent font-mono"
          />
        </PrefRow>
        <div className="text-[11px] text-zinc-500 leading-relaxed pl-1">
          Free key powers the Macro Panel (rates, inflation, labor,
          volatility series from Federal Reserve Economic Data). Sign up at
          fredaccount.stlouisfed.org → My Account → API Keys. No charges
          ever; ~120 requests/min limit, well under our 9-series daily
          refresh.
        </div>
        <PrefRow label="Semantic Scholar key">
          <input
            type="password"
            value={draft.semanticScholarApiKey}
            onChange={(e) => patch('semanticScholarApiKey', e.target.value)}
            placeholder="s2k-..."
            autoComplete="off"
            spellCheck={false}
            className="w-[320px] bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent font-mono"
          />
        </PrefRow>
        <div className="text-[11px] text-zinc-500 leading-relaxed pl-1">
          Free key powers the Research tab’s Semantic Scholar searches
          with a dedicated 1 RPS lane. Without it, requests share an
          anonymous pool that 429s during peak hours. Request one at
          semanticscholar.org/product/api#api-key-form — usually approved
          within a day. No charges.
          {draft.semanticScholarApiKey &&
            !draft.semanticScholarApiKey.startsWith('s2k-') && (
              <span className="text-amber-300">
                {' '}⚠ Semantic Scholar keys typically start with
                &ldquo;s2k-&rdquo; — double-check what you pasted.
              </span>
            )}
        </div>
      </PrefSection>

      <ApplyBar
        label="AI provider"
        dirtyCount={aiDirty}
        status={aiStatus}
        onApply={() => void applyScope(AI_PREF_KEYS, setAiStatus)}
        onReset={() => resetScope(AI_PREF_KEYS)}
      />

      <CalendarPrefSection />

      <ReelsPrefSection
        engine={draft.ttsEngine}
        voice={draft.ttsVoice}
        mediaPipelineEnabled={draft.mediaPipelineEnabled}
        committedMediaPipelineEnabled={prefs.mediaPipelineEnabled}
        dirtyCount={reelsDirty}
        status={reelsStatus}
        onPatch={(k, v) => patch(k, v as Preferences[typeof k])}
        onApply={() => void applyScope(REELS_PREF_KEYS, setReelsStatus)}
        onReset={() => resetScope(REELS_PREF_KEYS)}
      />
    </div>
  )
}

type ApplyStatus = null | 'applying' | 'applied' | 'failed'

function ApplyBar({
  label,
  dirtyCount,
  status,
  onApply,
  onReset
}: {
  label: string
  dirtyCount: number
  status: ApplyStatus
  onApply: () => void
  onReset: () => void
}): JSX.Element {
  const hasChanges = dirtyCount > 0
  const applying = status === 'applying'
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-edge bg-surface-1 px-4 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        {hasChanges ? (
          <span className="text-amber-300/90">
            {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}
          </span>
        ) : status === 'applied' ? (
          <span className="text-teal-300">{label} saved</span>
        ) : status === 'failed' ? (
          <span className="text-rose-300">Save failed — try again</span>
        ) : (
          <span>{label} · no changes</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={!hasChanges || applying}
          className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.16em] bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge hover:bg-surface-3 disabled:opacity-40"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={!hasChanges || applying}
          className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.16em] bg-teal-500/25 text-teal-100 ring-1 ring-inset ring-teal-500/50 hover:bg-teal-500/35 disabled:opacity-40"
        >
          {applying ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </div>
  )
}

interface EventKindMeta {
  id: CalendarEventKindId
  label: string
  description: string
}

const EVENT_KINDS: EventKindMeta[] = [
  {
    id: 'earnings',
    label: 'Earnings',
    description: 'Upcoming earnings dates for tickers in your watchlist.'
  },
  {
    id: 'dividends',
    label: 'Ex-dividend dates',
    description: 'Next ex-dividend date for tickers in your watchlist.'
  },
  {
    id: 'stockSplits',
    label: 'Stock splits',
    description: 'Upcoming splits for tickers in your watchlist.'
  },
  {
    id: 'ipos',
    label: 'IPOs',
    description: 'Upcoming IPOs listing on US exchanges (market-wide).'
  },
  {
    id: 'fedMeetings',
    label: 'Fed meetings',
    description: 'FOMC rate decisions and Fed policy events.'
  },
  {
    id: 'econReleases',
    label: 'Economic releases',
    description: 'CPI, NFP, GDP, retail sales, jobless claims, PCE, and similar macro data.'
  },
  {
    id: 'games',
    label: 'Favorite team games',
    description: 'Scheduled games for teams you follow in Sports.'
  },
  {
    id: 'launches',
    label: 'Space launches',
    description: 'Upcoming rocket launches from Launch Library 2.'
  },
  {
    id: 'worldEvents',
    label: 'World events',
    description:
      'Significant world events from the last few days, curated from Wikipedia’s Current Events Portal.'
  }
]

function CalendarPrefSection(): JSX.Element {
  // Same pattern as PreferencesTab: `config` is the committed copy, `draft`
  // is the editable one. The PulseConfig JSON file is rewritten atomically
  // only when the user clicks APPLY.
  const [config, setConfig] = useState<PulseConfig | null>(null)
  const [draft, setDraft] = useState<PulseConfig | null>(null)
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>(null)
  const [ioStatus, setIoStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.config.get().then((c) => {
      setConfig(c)
      setDraft(c)
    })
  }, [])

  const patchWindow = (v: number): void => {
    setDraft((prev) =>
      prev ? { ...prev, calendar: { ...prev.calendar, windowDays: v } } : prev
    )
    setApplyStatus(null)
  }

  const patchKind = (id: CalendarEventKindId, enabled: boolean): void => {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          eventKinds: {
            ...prev.calendar.eventKinds,
            [id]: { enabled }
          }
        }
      }
    })
    setApplyStatus(null)
  }

  const dirtyCount = ((): number => {
    if (!config || !draft) return 0
    let n = 0
    if (config.calendar.windowDays !== draft.calendar.windowDays) n++
    for (const k of Object.keys(draft.calendar.eventKinds) as CalendarEventKindId[]) {
      if (draft.calendar.eventKinds[k].enabled !== config.calendar.eventKinds[k].enabled) n++
    }
    return n
  })()

  const doApply = async (): Promise<void> => {
    if (!draft || dirtyCount === 0) return
    setApplyStatus('applying')
    try {
      // Build a minimal patch — only send fields that actually changed.
      const patch: { calendar: { windowDays?: number; eventKinds?: Partial<Record<CalendarEventKindId, { enabled: boolean }>> } } = {
        calendar: {}
      }
      if (config && config.calendar.windowDays !== draft.calendar.windowDays) {
        patch.calendar.windowDays = draft.calendar.windowDays
      }
      const kindPatch: Partial<Record<CalendarEventKindId, { enabled: boolean }>> = {}
      if (config) {
        for (const k of Object.keys(draft.calendar.eventKinds) as CalendarEventKindId[]) {
          if (draft.calendar.eventKinds[k].enabled !== config.calendar.eventKinds[k].enabled) {
            kindPatch[k] = { enabled: draft.calendar.eventKinds[k].enabled }
          }
        }
      }
      if (Object.keys(kindPatch).length > 0) patch.calendar.eventKinds = kindPatch
      const next = await window.api.config.update(patch)
      setConfig(next)
      setDraft(next)
      setApplyStatus('applied')
    } catch {
      setApplyStatus('failed')
    }
  }

  const doReset = (): void => {
    if (!config) return
    setDraft(config)
    setApplyStatus(null)
  }

  const doExport = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setIoStatus(null)
    try {
      const result = await window.api.config.export()
      if (result.ok) setIoStatus(`Exported to ${result.path}`)
      else if (!result.canceled) setIoStatus(`Export failed: ${result.error ?? 'unknown'}`)
    } finally {
      setBusy(false)
    }
  }

  const doImport = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setIoStatus(null)
    try {
      const result = await window.api.config.import()
      if (result.ok) {
        setConfig(result.config)
        setDraft(result.config)
        setApplyStatus(null)
        setIoStatus('Imported preferences applied.')
      } else if (!result.canceled) {
        setIoStatus(`Import failed: ${result.error ?? 'unknown'}`)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!config || !draft)
    return (
      <PrefSection title="Calendar">
        <div className="text-xs text-zinc-500">Loading…</div>
      </PrefSection>
    )

  return (
    <div className="space-y-3">
      <PrefSection title="Calendar">
        <PrefRow label="Window (days)">
          <NumberInput
            value={draft.calendar.windowDays}
            min={1}
            max={30}
            onChange={(v) => patchWindow(v)}
          />
        </PrefRow>
        <div className="pt-1 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Event kinds</div>
          {EVENT_KINDS.map((kind) => {
            const enabled = draft.calendar.eventKinds[kind.id]?.enabled ?? false
            return (
              <div key={kind.id} className="flex items-start justify-between gap-4 py-1">
                <div className="min-w-0">
                  <div className="text-sm text-zinc-200">{kind.label}</div>
                  <div className="text-[11px] text-zinc-500 leading-relaxed">{kind.description}</div>
                </div>
                <ToggleSwitch checked={enabled} onChange={(v) => patchKind(kind.id, v)} />
              </div>
            )
          })}
        </div>
        <div className="pt-3 flex items-center gap-2">
          <button
            onClick={doExport}
            disabled={busy}
            className="px-3 py-1.5 rounded-md bg-surface-2 border border-edge text-[11px] font-medium text-zinc-200 hover:bg-surface-3 disabled:opacity-50"
          >
            Export preferences…
          </button>
          <button
            onClick={doImport}
            disabled={busy}
            className="px-3 py-1.5 rounded-md bg-surface-2 border border-edge text-[11px] font-medium text-zinc-200 hover:bg-surface-3 disabled:opacity-50"
          >
            Import preferences…
          </button>
        </div>
        {ioStatus && <div className="text-[11px] text-zinc-400 pt-1 break-all">{ioStatus}</div>}
        <div className="text-[11px] text-zinc-500 leading-relaxed pt-1">
          Saved as <code className="text-zinc-400">pulse-preferences.json</code> in your app data folder.
        </div>
      </PrefSection>
      <ApplyBar
        label="Calendar"
        dirtyCount={dirtyCount}
        status={applyStatus}
        onApply={() => void doApply()}
        onReset={doReset}
      />
    </div>
  )
}

function ReelsPrefSection({
  engine,
  voice,
  mediaPipelineEnabled,
  committedMediaPipelineEnabled,
  dirtyCount,
  status,
  onPatch,
  onApply,
  onReset
}: {
  engine: TtsEngine
  voice: string
  mediaPipelineEnabled: boolean
  committedMediaPipelineEnabled: boolean
  dirtyCount: number
  status: ApplyStatus
  onPatch: (key: keyof Preferences, value: string | number | boolean) => void
  onApply: () => void
  onReset: () => void
}): JSX.Element {
  const [kokoro, setKokoro] = useState<KokoroStatus>({ state: 'idle' })
  const [voices, setVoices] = useState<KokoroVoice[]>([])
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.api.reels.getKokoroStatus().then(setKokoro)
    void window.api.reels.listKokoroVoices().then(setVoices)
    const unsub = window.api.reels.onKokoroStatus(setKokoro)
    return unsub
  }, [])

  const rebuild = async (): Promise<void> => {
    setRebuilding(true)
    setRebuildMsg('Rebuilding flash audio…')
    try {
      const n = await window.api.reels.rebuildAudio()
      setRebuildMsg(n > 0 ? `Rebuilt ${n} flashes.` : 'Nothing to rebuild.')
    } catch (err) {
      setRebuildMsg(err instanceof Error ? err.message : 'Rebuild failed')
    } finally {
      setRebuilding(false)
    }
  }

  const statusLabel = kokoroStatusLabel(kokoro)
  const statusTone = kokoroStatusTone(kokoro)

  // Cold toggle — a toggle committed in a prior session shows no banner, only
  // pending unsaved toggles or flips relative to the committed value do. We
  // never try to tear the pipeline down mid-run: flipping it off warms a hint
  // and takes effect on the next launch.
  const pipelineRestartRequired = mediaPipelineEnabled !== committedMediaPipelineEnabled

  return (
    <div className="space-y-3">
      <PrefSection title="Reels &amp; narration pipeline">
        <PrefRow label="Enable reels + audio narration">
          <ToggleSwitch
            checked={mediaPipelineEnabled}
            onChange={(v) => onPatch('mediaPipelineEnabled', v)}
          />
        </PrefRow>
        <div className="text-[11px] text-zinc-500 leading-relaxed pl-1">
          Turn off to save battery on laptops — Kokoro, Piper, video generation,
          and ffmpeg workers will not launch at startup. New reels won&apos;t be
          generated until you turn it back on.
        </div>
        {pipelineRestartRequired && (
          <div className="text-[11px] text-amber-300 leading-relaxed pl-1">
            Restart Pulse after applying for this change to take effect.
          </div>
        )}
      </PrefSection>
      <PrefSection title="Flash narration">
        <PrefRow label="TTS engine">
          <select
            value={engine}
            onChange={(e) => onPatch('ttsEngine', e.target.value as TtsEngine)}
            className="bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent"
          >
            <option value="kokoro">Kokoro-82M (neural, best)</option>
            <option value="piper">Piper (neural, fallback)</option>
            <option value="say">macOS say (system)</option>
          </select>
        </PrefRow>

        {engine === 'kokoro' && (
          <PrefRow label="Voice">
            <select
              value={voice}
              onChange={(e) => onPatch('ttsVoice', e.target.value)}
              disabled={voices.length === 0}
              className="bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent disabled:opacity-50 max-w-[260px]"
            >
              {voices.length === 0 ? (
                <option>{voice}</option>
              ) : (
                voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))
              )}
            </select>
          </PrefRow>
        )}

        <div className="flex items-center justify-between pl-1">
          <div className="flex items-center gap-2 text-[11px]">
            <span className={`h-1.5 w-1.5 rounded-full ${statusTone}`} />
            <span className="text-zinc-500 uppercase tracking-wider">Kokoro:</span>
            <span className="text-zinc-300">{statusLabel}</span>
          </div>
          <button
            onClick={() => void rebuild()}
            disabled={rebuilding}
            className="px-3 py-1 text-[11px] uppercase tracking-wider rounded border border-edge bg-surface-2 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 disabled:opacity-50"
          >
            {rebuilding ? 'Rebuilding…' : 'Rebuild all audio'}
          </button>
        </div>
        {rebuildMsg && <div className="text-[11px] text-zinc-500 pl-1">{rebuildMsg}</div>}
        <div className="text-[11px] text-zinc-500 leading-relaxed pl-1">
          Kokoro is the primary TTS. Piper and macOS say are automatic fallbacks
          when Kokoro is unavailable. Changing voice applies to new flashes — use
          Rebuild to re-synthesize existing ones.
        </div>
      </PrefSection>
      <ApplyBar
        label="Flash narration"
        dirtyCount={dirtyCount}
        status={status}
        onApply={onApply}
        onReset={onReset}
      />
    </div>
  )
}

function kokoroStatusLabel(s: KokoroStatus): string {
  switch (s.state) {
    case 'idle':
      return 'idle'
    case 'unsupported':
      return `unavailable (${s.reason})`
    case 'checking-python':
      return 'checking python…'
    case 'creating-venv':
      return 'creating venv…'
    case 'installing-deps':
      return 'installing dependencies…'
    case 'starting-worker':
      return 'starting worker…'
    case 'loading-model':
      return 'loading model…'
    case 'ready':
      return 'ready'
    case 'failed':
      return `failed (${s.reason})`
  }
}

function kokoroStatusTone(s: KokoroStatus): string {
  if (s.state === 'ready') return 'bg-emerald-400'
  if (s.state === 'failed' || s.state === 'unsupported') return 'bg-rose-500'
  if (s.state === 'idle') return 'bg-zinc-500'
  return 'bg-amber-400 animate-pulse'
}

function TeamsTab(): JSX.Element {
  const [leagues, setLeagues] = useState<SportsLeague[]>([])
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null)
  const [teamsByLeague, setTeamsByLeague] = useState<Record<string, SportsTeam[]>>({})
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteTeam[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    void window.api.sports.listLeagues().then((ls) => {
      setLeagues(ls)
      if (ls.length > 0) setSelectedLeagueId((prev) => prev ?? ls[0].id)
    })
    void window.api.favoriteTeams.list().then(setFavorites)
  }, [])

  useEffect(() => {
    if (!selectedLeagueId) return
    if (teamsByLeague[selectedLeagueId]) return
    setLoadingTeams(true)
    void window.api.sports
      .listTeams(selectedLeagueId)
      .then((teams) => setTeamsByLeague((prev) => ({ ...prev, [selectedLeagueId]: teams })))
      .finally(() => setLoadingTeams(false))
  }, [selectedLeagueId, teamsByLeague])

  const reloadFavorites = async (): Promise<void> => {
    setFavorites(await window.api.favoriteTeams.list())
  }

  const favoriteIds = useMemo(() => {
    const byLeague: Record<string, Set<string>> = {}
    for (const f of favorites) {
      const set = byLeague[f.leagueId] ?? (byLeague[f.leagueId] = new Set())
      set.add(f.teamId)
    }
    return byLeague
  }, [favorites])

  const selectedLeague = leagues.find((l) => l.id === selectedLeagueId)
  const teams = selectedLeagueId ? teamsByLeague[selectedLeagueId] ?? [] : []
  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return teams
    return teams.filter((t) =>
      [t.displayName, t.name, t.location, t.abbreviation, t.shortName]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q))
    )
  }, [teams, query])

  const addFavorite = async (team: SportsTeam): Promise<void> => {
    if (!selectedLeagueId) return
    await window.api.favoriteTeams.add({
      leagueId: selectedLeagueId,
      teamId: team.id,
      teamName: team.displayName,
      abbreviation: team.abbreviation,
      logoURL: team.logoURL
    })
    await reloadFavorites()
  }

  const removeFavorite = async (id: number): Promise<void> => {
    await window.api.favoriteTeams.delete(id)
    await reloadFavorites()
  }

  const toggleAlerts = async (fav: FavoriteTeam): Promise<void> => {
    await window.api.favoriteTeams.setAlerts(fav.id, !fav.alertsEnabled)
    await reloadFavorites()
  }

  const groupedFavorites = useMemo(() => {
    const byLeague = new Map<string, FavoriteTeam[]>()
    for (const f of favorites) {
      const arr = byLeague.get(f.leagueId) ?? []
      arr.push(f)
      byLeague.set(f.leagueId, arr)
    }
    return byLeague
  }, [favorites])

  return (
    <div className="p-5 space-y-6">
      <section>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
          Your favorite teams
        </div>
        {favorites.length === 0 && (
          <div className="text-sm text-zinc-500 px-3 py-4 border border-dashed border-edge rounded">
            No favorites yet. Pick a league and add teams below.
          </div>
        )}
        {favorites.length > 0 && (
          <ul className="border border-edge rounded divide-y divide-edge">
            {[...groupedFavorites.entries()].map(([lid, favs]) => {
              const league = leagues.find((l) => l.id === lid)
              return (
                <li key={lid} className="px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-orange-400/90 mb-2">
                    {league?.shortName ?? lid.toUpperCase()}
                  </div>
                  <ul className="space-y-1.5">
                    {favs.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center gap-3 px-2 py-1.5 rounded bg-surface-2/60"
                      >
                        {f.logoURL && (
                          <img src={f.logoURL} alt="" className="w-5 h-5 object-contain" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-100 truncate">{f.teamName}</div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                            {f.abbreviation}
                          </div>
                        </div>
                        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500 mr-1">
                          Alerts
                          <ToggleSwitch
                            checked={f.alertsEnabled}
                            onChange={() => void toggleAlerts(f)}
                          />
                        </label>
                        <button
                          onClick={() => void removeFavorite(f.id)}
                          className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-red-300 px-2 py-1"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">Add a team</div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {leagues.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setSelectedLeagueId(l.id)
                setQuery('')
              }}
              className={`px-2.5 py-1 text-[11px] uppercase tracking-wider rounded ${
                selectedLeagueId === l.id
                  ? 'bg-accent/20 text-accent'
                  : 'bg-surface-2 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {l.shortName}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${selectedLeague?.shortName ?? ''} teams…`}
          className="w-full px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent mb-3"
        />
        {loadingTeams && (
          <div className="text-sm text-zinc-500 px-3 py-3">Loading teams…</div>
        )}
        {!loadingTeams && filteredTeams.length === 0 && (
          <div className="text-sm text-zinc-500 px-3 py-3">No teams match.</div>
        )}
        {!loadingTeams && filteredTeams.length > 0 && (
          <ul className="border border-edge rounded divide-y divide-edge max-h-80 overflow-y-auto">
            {filteredTeams.map((t) => {
              const isFav = favoriteIds[selectedLeagueId ?? '']?.has(t.id) ?? false
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2/40"
                >
                  {t.logoURL && (
                    <img src={t.logoURL} alt="" className="w-6 h-6 object-contain" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-100 truncate">{t.displayName}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      {t.abbreviation}
                      {t.location && t.location !== t.displayName && (
                        <span> · {t.location}</span>
                      )}
                    </div>
                  </div>
                  <button
                    disabled={isFav}
                    onClick={() => void addFavorite(t)}
                    className={`px-2.5 py-1 text-[11px] uppercase tracking-wider rounded ${
                      isFav
                        ? 'bg-surface-2 text-zinc-500 cursor-not-allowed'
                        : 'bg-accent/20 text-accent hover:bg-accent/30'
                    }`}
                  >
                    {isFav ? 'Added' : 'Add'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function PrefSection({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <h3 className="text-[10px] font-semibold tracking-[0.18em] uppercase text-zinc-400 mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

// Each theme's preview is a fixed 3-swatch triplet (background / accent /
// highlight). We render without relying on the actual theme variables because
// the picker lives inside Settings, which itself follows the active theme —
// we need static previews so all 7 options are visually distinguishable.
const THEME_OPTIONS: Array<{
  value: Theme
  label: string
  hint: string
  swatches: [string, string, string]
}> = [
  { value: 'system', label: 'System', hint: 'Follow macOS', swatches: ['#1a1a1a', '#ffffff', '#3b82f6'] },
  { value: 'default', label: 'Default', hint: 'Pulse dark', swatches: ['#0a0b0d', '#171a1f', '#f59e0b'] },
  { value: 'light', label: 'Light', hint: 'Daylight', swatches: ['#ffffff', '#eef0f3', '#2563eb'] },
  { value: 'fiesta', label: 'Fiesta', hint: 'Red heat', swatches: ['#14060a', '#300e12', '#ef4444'] },
  { value: 'zazu', label: 'Zazu', hint: 'Jungle', swatches: ['#06140e', '#0e2c1e', '#22c55e'] },
  { value: 'ocean', label: 'Ocean', hint: 'Deep blue', swatches: ['#050e1c', '#0a1e36', '#38bdf8'] },
  { value: 'casino', label: 'Casino', hint: 'Black & gold', swatches: ['#06060422', '#18140a', '#eab308'] }
]

function ThemePicker({
  value,
  onChange
}: {
  value: Theme
  onChange: (t: Theme) => void
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {THEME_OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex flex-col items-start gap-2 p-2.5 rounded-md border text-left transition-colors ${
              active
                ? 'border-accent bg-surface-2'
                : 'border-edge bg-surface-1 hover:bg-surface-2'
            }`}
          >
            <div className="flex gap-1 w-full">
              {opt.swatches.map((c, i) => (
                <span
                  key={i}
                  className="flex-1 h-8 rounded-sm border border-black/20"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="w-full">
              <div className={`text-[12px] font-medium ${active ? 'text-zinc-100' : 'text-zinc-200'}`}>
                {opt.label}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">{opt.hint}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function PrefRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-zinc-300">{label}</span>
      {children}
    </div>
  )
}

function NumberInput({
  value,
  min,
  max,
  onChange
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (Number.isFinite(n) && n >= min && n <= max) onChange(n)
      }}
      className="w-16 bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 text-right outline-none focus:border-accent tabular-nums"
    />
  )
}

function TimeInput({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent"
    />
  )
}

function ToggleSwitch({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-surface-3'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}
