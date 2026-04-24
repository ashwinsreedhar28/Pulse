import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Article,
  Category,
  Domain,
  FeedFinderCandidate,
  FeedFinderResult,
  HyperChatMeta,
  HyperQaResult,
  HyperResponse,
  SettingsProposal,
  SettingsRejection,
  SettingsTab
} from '../../preload'

// A Hyperintelligence turn is one exchange in a chat. User turns are plain
// text; assistant turns carry a discriminated `response` payload that says
// which handler produced it (feed finder, article search, general Q&A,
// settings inspector). Older chats saved before the router existed have no
// `response` — they use the legacy `cards` field instead and we still
// render those correctly.
interface Turn {
  id: number
  role: 'user' | 'assistant'
  text: string
  // Legacy fields — present in chats saved before the multi-intent router.
  // Kept around so old recents still render without a migration.
  status?: FeedFinderResult['status']
  cards?: CardState[]
  // New: discriminated response payload. Present in new assistant turns.
  response?: HyperResponse
  // For 'feeds' responses we materialize card state here so probe progress
  // + "Added" toggles can update without losing the original payload.
  feedCards?: CardState[]
  // For 'settings-proposal' turns: null until the user acts, then captures
  // the applied/cancelled state so the card locks in after either choice.
  proposalState?: 'pending' | 'applied' | 'cancelled' | 'failed'
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
    'Ask me anything. I can find new feeds, search articles in your feed, answer general questions, or tell you about your settings.'
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

function buildFeedCards(payload: FeedFinderResult, categories: Category[]): CardState[] {
  return payload.candidates.map((c) => ({
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
}

export function Hyperintelligence({
  onClose,
  onFeedsChanged,
  onOpenURL,
  onOpenArticle,
  onOpenSettings
}: {
  onClose: () => void
  onFeedsChanged: () => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
  onOpenArticle: (id: number) => void
  onOpenSettings: (tab?: SettingsTab) => void
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

  // Debounced autosave. We persist a chat if the user has had a real
  // exchange — either feed-finder cards landed (legacy) or any new-style
  // assistant response arrived. Meta-only exchanges that produce zero
  // content still get skipped, the same protection introduced when we
  // added the feed-finder redirect.
  useEffect(() => {
    const hasUserTurn = turns.some((t) => t.role === 'user')
    if (!hasUserTurn) return
    const hasContent = turns.some(
      (t) => (t.cards?.length ?? 0) > 0 || (t.feedCards?.length ?? 0) > 0 || !!t.response
    )
    if (!hasContent && currentChatId == null) return
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

  const loadChat = useCallback(
    async (id: number): Promise<void> => {
      if (id === currentChatId) return
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
    },
    [currentChatId]
  )

  const updateFeedCard = useCallback(
    (turnId: number, url: string, patch: Partial<CardState>): void => {
      setTurns((prev) =>
        prev.map((t) => {
          if (t.id !== turnId) return t
          // Patch whichever card array this turn is using. New turns store in
          // feedCards; legacy turns store in cards.
          if (t.feedCards) {
            return {
              ...t,
              feedCards: t.feedCards.map((c) => (c.url === url ? { ...c, ...patch } : c))
            }
          }
          if (t.cards) {
            return {
              ...t,
              cards: t.cards.map((c) => (c.url === url ? { ...c, ...patch } : c))
            }
          }
          return t
        })
      )
    },
    []
  )

  const probeFeedCards = useCallback(
    (turnId: number, cards: CardState[]) => {
      for (const card of cards) {
        void (async (): Promise<void> => {
          try {
            const probe = await window.api.feedFinder.probe(card.url)
            if (probe.status === 'ok') {
              updateFeedCard(turnId, card.url, {
                probeStatus: 'verified',
                resolvedTitle: probe.title?.trim() || card.title,
                description: probe.description ?? null,
                homepageURL: probe.homepageURL ?? null
              })
            } else {
              updateFeedCard(turnId, card.url, {
                probeStatus: 'dead',
                probeError: probe.error ?? 'Unreachable'
              })
            }
          } catch {
            updateFeedCard(turnId, card.url, {
              probeStatus: 'dead',
              probeError: 'Probe failed'
            })
          }
        })()
      }
    },
    [updateFeedCard]
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
      const result: HyperResponse = await window.api.hyper.ask(trimmed)
      let feedCards: CardState[] | undefined
      if (result.kind === 'feeds') {
        feedCards = buildFeedCards(result.payload, categories)
      }
      setTurns((prev) => [
        ...prev,
        {
          id: assistantTurnId,
          role: 'assistant',
          text: result.reply,
          response: result,
          feedCards,
          // Mirror status for older renderers / back-compat parsing.
          status: result.kind === 'feeds' ? result.payload.status : undefined,
          // Settings proposals start pending — the user clicks APPLY/Cancel
          // on the card and we advance this state so the buttons lock in.
          proposalState: result.kind === 'settings-proposal' ? 'pending' : undefined
        }
      ])
      setBusy(false)
      if (feedCards && feedCards.length > 0) {
        probeFeedCards(assistantTurnId, feedCards)
      }
    } catch {
      setTurns((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', text: 'Something went wrong. Try again.' }
      ])
      setBusy(false)
    }
  }, [input, busy, categories, probeFeedCards])

  const addOne = async (turnId: number, card: CardState): Promise<void> => {
    if (card.added || card.adding) return
    updateFeedCard(turnId, card.url, { adding: true })
    try {
      await window.api.feedFinder.add({
        title: card.resolvedTitle || card.title,
        url: card.url,
        categoryName: card.chosenCategory,
        domain: card.chosenDomain
      })
      updateFeedCard(turnId, card.url, { added: true, adding: false })
      setCategories(await window.api.categories.list())
      onFeedsChanged()
    } catch {
      updateFeedCard(turnId, card.url, { adding: false })
    }
  }

  const applyProposal = async (turnId: number, proposal: SettingsProposal): Promise<void> => {
    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, proposalState: 'pending' } : t))
    )
    try {
      await window.api.hyper.applySettings(proposal.change)
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, proposalState: 'applied' } : t))
      )
    } catch {
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, proposalState: 'failed' } : t))
      )
    }
  }

  const cancelProposal = (turnId: number): void => {
    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, proposalState: 'cancelled' } : t))
    )
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
              onChangeFeedCard={(url, patch) => updateFeedCard(t.id, url, patch)}
              onAddFeed={(c) => void addOne(t.id, c)}
              onOpenURL={onOpenURL}
              onOpenArticle={onOpenArticle}
              onOpenSettings={onOpenSettings}
              onApplyProposal={(p) => void applyProposal(t.id, p)}
              onCancelProposal={() => cancelProposal(t.id)}
            />
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
              Thinking…
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
            placeholder="Find feeds, search your articles, ask a question, or check a setting…"
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
  onChangeFeedCard,
  onAddFeed,
  onOpenURL,
  onOpenArticle,
  onOpenSettings,
  onApplyProposal,
  onCancelProposal
}: {
  turn: Turn
  categories: Category[]
  onChangeFeedCard: (url: string, patch: Partial<CardState>) => void
  onAddFeed: (c: CardState) => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
  onOpenArticle: (id: number) => void
  onOpenSettings: (tab?: SettingsTab) => void
  onApplyProposal: (p: SettingsProposal) => void
  onCancelProposal: () => void
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
  // Pick card list — new turns use feedCards, legacy chats use cards.
  const feedCards = turn.feedCards ?? turn.cards
  return (
    <div className="space-y-3">
      {turn.text && <div className="text-[13px] leading-[1.6] text-zinc-200">{turn.text}</div>}

      {/* Feed finder result */}
      {feedCards && feedCards.length > 0 && (
        <div className="space-y-2">
          {feedCards.map((c) => (
            <CandidateCard
              key={c.url}
              card={c}
              categories={categories}
              onChange={(patch) => onChangeFeedCard(c.url, patch)}
              onAdd={() => onAddFeed(c)}
              onOpenURL={onOpenURL}
            />
          ))}
        </div>
      )}

      {/* Article search result */}
      {turn.response?.kind === 'articles' && turn.response.payload.articles.length > 0 && (
        <div className="space-y-2">
          {turn.response.payload.articles.map((a) => (
            <ArticleHitCard key={a.id} article={a} onOpen={() => onOpenArticle(a.id)} />
          ))}
        </div>
      )}

      {/* General Q&A result */}
      {turn.response?.kind === 'qa' && turn.response.payload.source !== 'none' && (
        <QAAnswerCard qa={turn.response.payload} onOpenURL={onOpenURL} />
      )}

      {/* Settings inspector result */}
      {turn.response?.kind === 'settings' && turn.response.payload.status === 'ok' && (
        <div className="space-y-2">
          {turn.response.payload.snapshots.map((s) => (
            <SettingsSnapshotCard
              key={s.descriptor.key}
              snapshot={s}
              onOpen={() => onOpenSettings(s.descriptor.tab)}
            />
          ))}
        </div>
      )}

      {/* Settings write proposal — APPLY/Cancel buttons */}
      {turn.response?.kind === 'settings-proposal' && (
        <SettingsProposalCard
          proposal={turn.response.payload}
          state={turn.proposalState ?? 'pending'}
          onApply={() => {
            if (turn.response?.kind !== 'settings-proposal') return
            onApplyProposal(turn.response.payload)
          }}
          onCancel={onCancelProposal}
          onOpenSettings={() => {
            if (turn.response?.kind !== 'settings-proposal') return
            onOpenSettings(turn.response.payload.descriptor.tab)
          }}
        />
      )}

      {/* Settings write rejection — couldn't parse or value out of range */}
      {turn.response?.kind === 'settings-rejection' && (
        <SettingsRejectionCard
          rejection={turn.response.payload}
          onOpenSettings={() => {
            if (turn.response?.kind !== 'settings-rejection') return
            onOpenSettings(turn.response.payload.descriptor.tab)
          }}
        />
      )}
    </div>
  )
}

function ArticleHitCard({
  article,
  onOpen
}: {
  article: Article
  onOpen: () => void
}): JSX.Element {
  const date = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      })
    : ''
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-lg border border-edge bg-surface-1 hover:bg-surface-2 px-4 py-3 transition-colors"
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1">
        <span>{article.feedTitle}</span>
        {date && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="tabular-nums">{date}</span>
          </>
        )}
        {article.isBookmarked && (
          <span className="text-amber-300/80">• bookmarked</span>
        )}
      </div>
      <div className="text-[13px] font-semibold text-zinc-100 leading-snug">{article.title}</div>
      {article.summary && (
        <div className="mt-1 text-[12px] text-zinc-400 line-clamp-2">{article.summary}</div>
      )}
    </button>
  )
}

function QAAnswerCard({
  qa,
  onOpenURL
}: {
  qa: HyperQaResult
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
}): JSX.Element {
  return (
    <div className="rounded-lg border border-edge bg-surface-1 px-4 py-3">
      <div className="text-[13.5px] leading-[1.7] text-zinc-100 whitespace-pre-wrap">
        {qa.answer}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {qa.source === 'wikipedia' ? (
          <>
            <span>Wikipedia</span>
            {qa.sourceURL && (
              <>
                <span className="text-zinc-700">·</span>
                <button
                  type="button"
                  onClick={() =>
                    qa.sourceURL && onOpenURL(qa.sourceURL, qa.sourceTitle ?? 'Wikipedia')
                  }
                  className="text-teal-300 hover:text-teal-200"
                >
                  Open {qa.sourceTitle ?? 'article'}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <span>{qa.provider === 'claude' ? 'Claude' : 'Local AI'}</span>
            {!qa.confident && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-amber-300/80">low confidence</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SettingsSnapshotCard({
  snapshot,
  onOpen
}: {
  snapshot: {
    descriptor: { label: string; tab: SettingsTab }
    value: string
    note?: string
  }
  onOpen: () => void
}): JSX.Element {
  return (
    <div className="rounded-lg border border-edge bg-surface-1 px-4 py-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-0.5">
          {snapshot.descriptor.label}
        </div>
        <div className="text-[13px] font-semibold text-zinc-100">{snapshot.value}</div>
        {snapshot.note && <div className="text-[11px] text-zinc-500 mt-1">{snapshot.note}</div>}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] px-3 py-1 rounded-full bg-teal-500/20 text-teal-200 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/30"
      >
        Open Settings
      </button>
    </div>
  )
}

function SettingsProposalCard({
  proposal,
  state,
  onApply,
  onCancel,
  onOpenSettings
}: {
  proposal: SettingsProposal
  state: 'pending' | 'applied' | 'cancelled' | 'failed'
  onApply: () => void
  onCancel: () => void
  onOpenSettings: () => void
}): JSX.Element {
  const locked = state !== 'pending'
  return (
    <div className="rounded-lg border border-edge bg-surface-1 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
        {proposal.descriptor.label}
      </div>
      <div className="flex items-center gap-3 text-[13px] text-zinc-100">
        <span className="px-2 py-0.5 rounded bg-surface-2 text-zinc-300 text-[12px]">
          {proposal.currentValueDisplay}
        </span>
        <span className="text-zinc-500">→</span>
        <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-100 text-[12px] font-semibold ring-1 ring-inset ring-teal-500/40">
          {proposal.proposedValueDisplay}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {state === 'pending' && (
          <>
            <button
              type="button"
              onClick={onApply}
              className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.16em] bg-teal-500/25 text-teal-100 ring-1 ring-inset ring-teal-500/50 hover:bg-teal-500/35"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.16em] bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge hover:bg-surface-3"
            >
              Cancel
            </button>
          </>
        )}
        {state === 'applied' && (
          <span className="text-[11px] uppercase tracking-[0.16em] text-teal-300">Applied</span>
        )}
        {state === 'cancelled' && (
          <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Cancelled</span>
        )}
        {state === 'failed' && (
          <span className="text-[11px] uppercase tracking-[0.16em] text-rose-300">
            Apply failed — try in Settings
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onOpenSettings}
          className="text-[11px] uppercase tracking-[0.16em] text-zinc-400 hover:text-zinc-200"
          disabled={locked && state !== 'failed'}
        >
          {locked && state !== 'failed' ? '' : 'Open Settings'}
        </button>
      </div>
    </div>
  )
}

function SettingsRejectionCard({
  rejection,
  onOpenSettings
}: {
  rejection: SettingsRejection
  onOpenSettings: () => void
}): JSX.Element {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-amber-300/80 mb-1">
        {rejection.descriptor.label}
      </div>
      <div className="text-[13px] text-zinc-200">{rejection.reason}</div>
      {rejection.allowedValues.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {rejection.allowedValues.map((v) => (
            <span
              key={v}
              className="px-2 py-0.5 rounded bg-surface-2 text-zinc-300 text-[11px]"
            >
              {v}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="text-[11px] uppercase tracking-[0.16em] text-teal-300 hover:text-teal-200"
        >
          Open Settings
        </button>
      </div>
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
  onAdd,
  onOpenURL
}: {
  card: CardState
  categories: Category[]
  onChange: (patch: Partial<CardState>) => void
  onAdd: () => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
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
          <button
            type="button"
            onClick={() =>
              onOpenURL(
                card.homepageURL ?? card.url,
                card.resolvedTitle || card.title,
                card.description ?? null
              )
            }
            className="text-[11px] text-zinc-500 hover:text-zinc-300 truncate block max-w-full text-left"
          >
            {card.url}
          </button>
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
