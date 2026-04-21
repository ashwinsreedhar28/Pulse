import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Category,
  Domain,
  FeedFinderCandidate,
  FeedFinderResult,
  HyperChatMeta
} from '../../preload'

interface Turn {
  id: number
  role: 'user' | 'assistant'
  text: string
  status?: FeedFinderResult['status']
  cards?: CardState[]
}

type ProbeStatus = 'verifying' | 'verified' | 'dead'

interface CardState extends FeedFinderCandidate {
  probeStatus: ProbeStatus
  resolvedTitle: string
  description: string | null
  homepageURL: string | null
  probeError: string | null
  added: boolean
  adding: boolean
  chosenCategory: string
  chosenDomain: Domain
}

const WELCOME_TURN: Turn = {
  id: 0,
  role: 'assistant',
  text:
    'Tell me a topic, publisher, or angle you want more coverage on. ' +
    "I'll suggest RSS feeds and verify each one in the background."
}

function initialTurns(): Turn[] {
  return [WELCOME_TURN]
}

function deriveChatTitle(turns: Turn[]): string {
  const firstUser = turns.find((t) => t.role === 'user')
  if (!firstUser) return 'New chat'
  const text = firstUser.text.trim().replace(/\s+/g, ' ')
  return text.length > 48 ? `${text.slice(0, 47)}…` : text
}

function maxTurnId(turns: Turn[]): number {
  return turns.reduce((max, t) => (t.id > max ? t.id : max), 0)
}

function guessDomain(category: string, known: Category[]): Domain {
  const match = known.find((c) => c.name.toLowerCase() === category.trim().toLowerCase())
  if (match) return match.domain
  const lc = category.toLowerCase()
  const financeHints = ['semi', 'chip', 'finance', 'stock', 'market', 'econ', 'defense', 'mining']
  return financeHints.some((h) => lc.includes(h)) ? 'finance' : 'general'
}

export function Hyperintelligence({
  onClose,
  onFeedsChanged
}: {
  onClose: () => void
  onFeedsChanged: () => void
}): JSX.Element {
  const [turns, setTurns] = useState<Turn[]>(initialTurns)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [chatList, setChatList] = useState<HyperChatMeta[]>([])
  const [currentChatId, setCurrentChatId] = useState<number | null>(null)
  const nextIdRef = useRef(1)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void window.api.categories.list().then(setCategories)
    void window.api.hyperChats.list().then(setChatList)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  // Debounced autosave — anything that mutates turns (new question, probe
  // result landing, feed added) gets persisted. Saving too often with probe
  // updates would be wasteful, so we coalesce within 400ms.
  useEffect(() => {
    const hasUserTurn = turns.some((t) => t.role === 'user')
    if (!hasUserTurn) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void (async (): Promise<void> => {
        const id = await window.api.hyperChats.save({
          id: currentChatId,
          title: deriveChatTitle(turns),
          turns
        })
        if (currentChatId == null) setCurrentChatId(id)
        const list = await window.api.hyperChats.list()
        setChatList(list)
      })()
    }, 400)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [turns, currentChatId])

  const nextId = (): number => nextIdRef.current++

  const newChat = useCallback((): void => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    setTurns(initialTurns())
    setCurrentChatId(null)
    nextIdRef.current = 1
    setInput('')
    setBusy(false)
  }, [])

  const loadChat = useCallback(async (id: number): Promise<void> => {
    if (id === currentChatId) return
    // Flush any pending save for the current chat before switching.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const chat = await window.api.hyperChats.get(id)
    if (!chat) return
    const loaded = (chat.turns as Turn[]) ?? []
    const restored = loaded.length > 0 ? loaded : initialTurns()
    setTurns(restored)
    setCurrentChatId(id)
    nextIdRef.current = maxTurnId(restored) + 1
    setInput('')
    setBusy(false)
  }, [currentChatId])

  const updateCard = useCallback(
    (turnId: number, url: string, patch: Partial<CardState>): void => {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId && t.cards
            ? {
                ...t,
                cards: t.cards.map((c) => (c.url === url ? { ...c, ...patch } : c))
              }
            : t
        )
      )
    },
    []
  )

  const submit = useCallback(async (): Promise<void> => {
    const trimmed = input.trim()
    if (trimmed.length === 0 || busy) return
    const userTurn: Turn = { id: nextId(), role: 'user', text: trimmed }
    setTurns((prev) => [...prev, userTurn])
    setInput('')
    setBusy(true)
    const assistantTurnId = nextId()
    try {
      const result = await window.api.feedFinder.ask(trimmed)
      const cards: CardState[] = result.candidates.map((c) => ({
        ...c,
        probeStatus: 'verifying',
        resolvedTitle: c.title,
        description: null,
        homepageURL: null,
        probeError: null,
        added: c.alreadySubscribed,
        adding: false,
        chosenCategory: c.category || 'General',
        chosenDomain: guessDomain(c.category || 'General', categories)
      }))
      const text =
        result.status === 'ollama-offline'
          ? 'Local AI is offline — start Ollama to enable feed suggestions.'
          : result.status === 'no-candidates'
            ? result.reply || 'No matching feeds came to mind. Try a broader topic or a publisher name.'
            : result.reply || `Here are ${cards.length} candidate${cards.length === 1 ? '' : 's'}. Verifying…`
      setTurns((prev) => [
        ...prev,
        { id: assistantTurnId, role: 'assistant', text, status: result.status, cards }
      ])
      setBusy(false)

      // Fire probes in parallel; each card updates independently when its probe lands.
      for (const card of cards) {
        void (async (): Promise<void> => {
          try {
            const probe = await window.api.feedFinder.probe(card.url)
            if (probe.status === 'ok') {
              updateCard(assistantTurnId, card.url, {
                probeStatus: 'verified',
                resolvedTitle: probe.title?.trim() || card.title,
                description: probe.description ?? null,
                homepageURL: probe.homepageURL ?? null
              })
            } else {
              updateCard(assistantTurnId, card.url, {
                probeStatus: 'dead',
                probeError: probe.error ?? 'Unreachable'
              })
            }
          } catch {
            updateCard(assistantTurnId, card.url, {
              probeStatus: 'dead',
              probeError: 'Probe failed'
            })
          }
        })()
      }
    } catch {
      setTurns((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', text: 'Something went wrong. Try again.' }
      ])
      setBusy(false)
    }
  }, [input, busy, categories, updateCard])

  const addOne = async (turnId: number, card: CardState): Promise<void> => {
    if (card.added || card.adding) return
    updateCard(turnId, card.url, { adding: true })
    try {
      await window.api.feedFinder.add({
        title: card.resolvedTitle || card.title,
        url: card.url,
        categoryName: card.chosenCategory,
        domain: card.chosenDomain
      })
      updateCard(turnId, card.url, { added: true, adding: false })
      setCategories(await window.api.categories.list())
      onFeedsChanged()
    } catch {
      updateCard(turnId, card.url, { adding: false })
    }
  }

  return (
    <section className="h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden">
      <header className="h-11 shrink-0 flex items-center gap-3 px-4 border-b border-edge bg-surface-1/60">
        <button
          onClick={onClose}
          className="text-[11px] text-zinc-400 hover:text-zinc-100"
          title="Back"
        >
          ← Back
        </button>
        <span className="text-[11px] uppercase tracking-widest text-zinc-300">
          Hyperintelligence
        </span>
        <span className="text-[10px] uppercase tracking-[0.22em] text-teal-300/80 ml-1">
          feed finder
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={currentChatId ?? ''}
            onChange={(e) => {
              const v = e.target.value
              if (v) void loadChat(Number(v))
            }}
            className="text-[11px] bg-surface-2 rounded px-2 py-1 text-zinc-300 ring-1 ring-inset ring-edge outline-none max-w-[220px]"
            title="Recent chats"
          >
            <option value="" disabled>
              {chatList.length === 0 ? 'No past chats' : 'Recent chats…'}
            </option>
            {chatList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button
            onClick={newChat}
            className="text-[11px] font-semibold uppercase tracking-[0.16em] px-2.5 py-1 rounded bg-teal-500/15 text-teal-200 ring-1 ring-inset ring-teal-500/30 hover:bg-teal-500/25"
            title="Start a new chat"
          >
            + New
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <div className="max-w-[760px] mx-auto space-y-4">
          {turns.map((t) => (
            <TurnView
              key={t.id}
              turn={t}
              categories={categories}
              onChangeCard={(url, patch) => updateCard(t.id, url, patch)}
              onAdd={(c) => void addOne(t.id, c)}
            />
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
              Asking local AI…
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-edge bg-surface-1/60 px-6 py-3">
        <div className="max-w-[760px] mx-auto flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
            rows={1}
            placeholder="e.g. EUV lithography news, local Indiana politics, ESA missions…"
            className="flex-1 resize-none bg-surface-2 rounded-md px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-500 outline-none ring-1 ring-inset ring-edge focus:ring-teal-500/40"
          />
          <button
            onClick={() => void submit()}
            disabled={busy || input.trim().length === 0}
            className="px-3 py-2 rounded-md text-[11px] font-semibold uppercase tracking-[0.16em] bg-teal-500/20 text-teal-200 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/30 disabled:opacity-40"
          >
            Ask
          </button>
        </div>
      </div>
    </section>
  )
}

function TurnView({
  turn,
  categories,
  onChangeCard,
  onAdd
}: {
  turn: Turn
  categories: Category[]
  onChangeCard: (url: string, patch: Partial<CardState>) => void
  onAdd: (c: CardState) => void
}): JSX.Element {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="rounded-2xl rounded-br-sm px-4 py-2 bg-teal-500/15 text-teal-100 text-[13px] max-w-[85%]">
          {turn.text}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="text-[13px] leading-[1.6] text-zinc-200">{turn.text}</div>
      {turn.cards && turn.cards.length > 0 && (
        <div className="space-y-2">
          {turn.cards.map((c) => (
            <CandidateCard
              key={c.url}
              card={c}
              categories={categories}
              onChange={(patch) => onChangeCard(c.url, patch)}
              onAdd={() => onAdd(c)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProbeBadge({ status }: { status: ProbeStatus }): JSX.Element {
  if (status === 'verifying') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-zinc-500">
        <span className="h-1 w-1 rounded-full bg-teal-400 animate-pulse" />
        verifying
      </span>
    )
  }
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-emerald-300">
        <span className="h-1 w-1 rounded-full bg-emerald-400" />
        live
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-red-300/80">
      <span className="h-1 w-1 rounded-full bg-red-400" />
      unreachable
    </span>
  )
}

function CandidateCard({
  card,
  categories,
  onChange,
  onAdd
}: {
  card: CardState
  categories: Category[]
  onChange: (patch: Partial<CardState>) => void
  onAdd: () => void
}): JSX.Element {
  const dimmed = card.probeStatus === 'dead'
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        dimmed ? 'border-edge/60 bg-surface-1/60 opacity-80' : 'border-edge bg-surface-1'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-zinc-100 truncate">
              {card.resolvedTitle || card.title}
            </span>
            <ProbeBadge status={card.probeStatus} />
            {card.alreadySubscribed && (
              <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                already subscribed
              </span>
            )}
          </div>
          <a
            href={card.homepageURL ?? card.url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-zinc-500 hover:text-zinc-300 truncate block max-w-full"
          >
            {card.url}
          </a>
          {card.reason && (
            <div className="mt-1.5 text-[12px] text-zinc-400">{card.reason}</div>
          )}
          {card.description && card.probeStatus === 'verified' && (
            <div className="mt-1 text-[11px] text-zinc-500 line-clamp-2">{card.description}</div>
          )}
          {card.probeStatus === 'dead' && (
            <div className="mt-1 text-[11px] text-red-400/80">
              {card.probeError || 'Feed appears unreachable.'}
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <input
              value={card.chosenCategory}
              onChange={(e) => onChange({ chosenCategory: e.target.value })}
              list="hyper-category-suggestions"
              className="w-[140px] text-[11px] bg-surface-2 rounded px-2 py-1 text-zinc-200 outline-none ring-1 ring-inset ring-edge"
              placeholder="Category"
              disabled={card.added}
            />
            <select
              value={card.chosenDomain}
              onChange={(e) => onChange({ chosenDomain: e.target.value as Domain })}
              className="text-[10px] bg-surface-2 rounded px-1.5 py-1 text-zinc-300 ring-1 ring-inset ring-edge"
              disabled={card.added}
            >
              <option value="finance">Finance</option>
              <option value="general">News</option>
            </select>
          </div>
          <button
            onClick={onAdd}
            disabled={card.added || card.adding}
            className={`text-[11px] font-semibold uppercase tracking-[0.16em] px-3 py-1 rounded-full ${
              card.added
                ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30'
                : dimmed
                  ? 'bg-surface-2 text-zinc-400 ring-1 ring-inset ring-edge hover:bg-surface-2/80'
                  : 'bg-teal-500/20 text-teal-200 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/30 disabled:opacity-50'
            }`}
            title={dimmed ? 'Add anyway — feed may come back online' : 'Add feed'}
          >
            {card.added ? 'Added' : card.adding ? 'Adding…' : dimmed ? 'Add anyway' : 'Add'}
          </button>
        </div>
      </div>
      <datalist id="hyper-category-suggestions">
        {categories.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </div>
  )
}
