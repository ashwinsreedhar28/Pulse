import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KokoroStatus, PiperStatus, Reel, VideoGenStatus } from '../../preload'

type ReelFilter = 'all' | 'finance' | 'news' | 'urgent'

export function Reels({
  onClose,
  onOpenArticle
}: {
  onClose: () => void
  onOpenArticle: (articleId: number) => void
}): JSX.Element {
  const [reels, setReels] = useState<Reel[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const [filter, setFilter] = useState<ReelFilter>('all')
  const [muted, setMuted] = useState(false)
  const [kokoro, setKokoro] = useState<KokoroStatus>({ state: 'idle' })
  const [piper, setPiper] = useState<PiperStatus>({ state: 'idle' })
  const [video, setVideo] = useState<VideoGenStatus>({ state: 'idle' })
  const [refilling, setRefilling] = useState(false)

  const reload = useCallback(async (): Promise<void> => {
    const data = await window.api.reels.list(50)
    setReels(data)
    setLoading(false)
  }, [])

  const refill = useCallback(async (): Promise<void> => {
    if (refilling) return
    setRefilling(true)
    try {
      await window.api.reels.generate()
    } finally {
      setRefilling(false)
    }
  }, [refilling])

  useEffect(() => {
    void reload()
    const unsub = window.api.reels.onUpdated(() => void reload())
    return unsub
  }, [reload])

  useEffect(() => {
    void window.api.reels.getKokoroStatus().then(setKokoro)
    void window.api.reels.getPiperStatus().then(setPiper)
    void window.api.reels.getVideoGenStatus().then(setVideo)
    const unKokoro = window.api.reels.onKokoroStatus(setKokoro)
    const unPiper = window.api.reels.onPiperStatus(setPiper)
    const unVideo = window.api.reels.onVideoGenStatus(setVideo)
    return () => {
      unKokoro()
      unPiper()
      unVideo()
    }
  }, [])

  // Filter reels in place; active idx is an index into the filtered list.
  const filtered = useMemo(() => {
    if (filter === 'all') return reels
    if (filter === 'finance') return reels.filter((r) => r.domain === 'finance')
    if (filter === 'news') return reels.filter((r) => r.domain === 'general')
    return reels.filter((r) => {
      const body = `${r.articleTitle} ${r.script}`.toLowerCase()
      return /breaking|urgent|alert|emergency/.test(body)
    })
  }, [reels, filter])

  // Reset position whenever the filter shifts the visible set.
  useEffect(() => {
    setActiveIdx(0)
  }, [filter])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown' || e.key === 'j') {
        setActiveIdx((i) => Math.min(filtered.length - 1, i + 1))
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        setActiveIdx((i) => Math.max(0, i - 1))
      } else if (e.key === 'm' || e.key === 'M') {
        setMuted((m) => !m)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, filtered.length])

  const remove = async (id: number): Promise<void> => {
    await window.api.reels.delete(id)
    setActiveIdx((i) => Math.max(0, Math.min(i, filtered.length - 2)))
    await reload()
  }

  return (
    <section className="h-full bg-black flex flex-col min-h-0 relative">
      <header className="absolute top-0 left-0 right-0 z-30 px-6 pt-5 pb-3 flex items-center gap-4 bg-gradient-to-b from-black/85 to-transparent">
        <div className="flex items-center gap-2 shrink-0">
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="w-5 h-5 text-yellow-300 shrink-0"
            fill="currentColor"
          >
            <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
          </svg>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-yellow-300/90">
              News flash
            </div>
            <h1 className="text-[22px] leading-none font-bold text-zinc-50 tracking-tight">
              Flash
            </h1>
          </div>
        </div>
        <FilterTabs value={filter} onChange={setFilter} />
        <div className="ml-auto flex items-center gap-2 text-[11px] shrink-0">
          <button
            onClick={() => setMuted((m) => !m)}
            className="h-7 w-7 grid place-items-center rounded-full border border-edge/80 bg-black/60 text-zinc-300 hover:text-white transition-colors"
            aria-label={muted ? 'Unmute' : 'Mute'}
            title={muted ? 'Unmute (M)' : 'Mute (M)'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <StatusPill label="Voice" status={voiceLabel(kokoro, piper)} tone={voiceTone(kokoro, piper)} />
          <StatusPill label="Video" status={videoLabel(video)} tone={videoTone(video)} />
          <button
            onClick={() => void refill()}
            disabled={refilling}
            title="Generate flashes for any recent top articles without one"
            className="px-3 py-1.5 rounded-full border border-yellow-300/30 bg-yellow-300/10 text-yellow-200 hover:bg-yellow-300/20 transition-colors uppercase tracking-wider disabled:opacity-50 disabled:cursor-wait"
          >
            {refilling ? 'Refilling…' : 'Refill'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 transition-colors uppercase tracking-wider"
          >
            Close
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 grid place-items-center text-zinc-500 text-[12px]">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          kokoro={kokoro}
          piper={piper}
          video={video}
          filterEmpty={reels.length > 0 && filtered.length === 0 ? filter : null}
        />
      ) : (
        <ReelStack
          reels={filtered}
          activeIdx={activeIdx}
          onActiveChange={setActiveIdx}
          onDelete={remove}
          onOpenArticle={onOpenArticle}
          muted={muted}
        />
      )}
    </section>
  )
}

function FilterTabs({
  value,
  onChange
}: {
  value: ReelFilter
  onChange: (v: ReelFilter) => void
}): JSX.Element {
  const tabs: Array<{ id: ReelFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'finance', label: 'Finance' },
    { id: 'news', label: 'News' },
    { id: 'urgent', label: 'Urgent' }
  ]
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-full border border-white/10 bg-black/70 backdrop-blur-sm text-[10px] uppercase tracking-[0.18em]">
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              active
                ? 'bg-yellow-300/20 text-yellow-100 ring-1 ring-inset ring-yellow-300/30'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

type PillTone = 'ready' | 'working' | 'idle' | 'error'

function StatusPill({
  label,
  status,
  tone
}: {
  label: string
  status: string
  tone: PillTone
}): JSX.Element {
  const dot = {
    ready: 'bg-emerald-400',
    working: 'bg-amber-400 animate-pulse',
    idle: 'bg-zinc-500',
    error: 'bg-rose-500'
  }[tone]
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-edge/80 bg-black/40 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300">{status}</span>
    </div>
  )
}

function voiceLabel(k: KokoroStatus, p: PiperStatus): string {
  if (k.state === 'ready') return 'kokoro'
  if (k.state === 'installing-deps') return 'kokoro install'
  if (k.state === 'loading-model') return 'kokoro load'
  if (k.state === 'creating-venv') return 'kokoro venv'
  if (k.state === 'checking-python' || k.state === 'starting-worker') return 'kokoro setup'
  // Kokoro unavailable — show piper status.
  if (p.state === 'ready') return 'piper'
  if (p.state === 'downloading') return `piper ${p.pct}%`
  if (p.state === 'extracting' || p.state === 'checking') return 'piper setup'
  return 'say'
}

function voiceTone(k: KokoroStatus, p: PiperStatus): PillTone {
  if (k.state === 'ready') return 'ready'
  if (
    k.state === 'installing-deps' ||
    k.state === 'loading-model' ||
    k.state === 'creating-venv' ||
    k.state === 'checking-python' ||
    k.state === 'starting-worker'
  )
    return 'working'
  if (p.state === 'ready') return 'ready'
  if (p.state === 'downloading' || p.state === 'extracting' || p.state === 'checking')
    return 'working'
  if (
    (k.state === 'failed' || k.state === 'unsupported') &&
    (p.state === 'failed' || p.state === 'unsupported')
  )
    return 'error'
  return 'idle'
}

function videoLabel(s: VideoGenStatus): string {
  switch (s.state) {
    case 'idle':
      return 'waiting'
    case 'checking-python':
      return 'python…'
    case 'creating-venv':
      return 'venv…'
    case 'installing-deps':
      return 'installing'
    case 'downloading-model':
      return s.pct != null ? `model ${s.pct}%` : 'model…'
    case 'starting-worker':
      return 'starting'
    case 'loading-model':
      return 'loading'
    case 'ready':
      return 'ready'
    case 'failed':
      return 'offline'
    case 'unsupported':
      return 'n/a'
  }
}

function videoTone(s: VideoGenStatus): PillTone {
  if (s.state === 'ready') return 'ready'
  if (s.state === 'failed' || s.state === 'unsupported') return 'error'
  if (s.state === 'idle') return 'idle'
  return 'working'
}

function EmptyState({
  kokoro,
  piper,
  video,
  filterEmpty
}: {
  kokoro: KokoroStatus
  piper: PiperStatus
  video: VideoGenStatus
  filterEmpty: ReelFilter | null
}): JSX.Element {
  if (filterEmpty) {
    const label = filterEmpty === 'urgent' ? 'urgent' : filterEmpty
    return (
      <div className="flex-1 grid place-items-center px-6">
        <div className="max-w-sm text-center space-y-3">
          <div className="text-[32px]">∅</div>
          <h2 className="text-[16px] font-semibold text-zinc-100">No {label} flashes</h2>
          <p className="text-[12px] text-zinc-500 leading-relaxed">
            Nothing matches this filter right now. Switch to All, or check back after
            the next feed poll.
          </p>
        </div>
      </div>
    )
  }
  const setupWorking =
    kokoro.state !== 'ready' &&
    kokoro.state !== 'failed' &&
    kokoro.state !== 'unsupported' &&
    kokoro.state !== 'idle'
  const videoWorking =
    video.state !== 'ready' && video.state !== 'failed' && video.state !== 'unsupported'
  return (
    <div className="flex-1 grid place-items-center px-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="text-[40px]">◉</div>
        <h2 className="text-[18px] font-semibold text-zinc-100">Preparing flashes</h2>
        <p className="text-[13px] text-zinc-400 leading-relaxed">
          Pulse generates short AI-narrated flashes from your highest-urgency
          articles. Setup runs in the background the first time — new flashes
          appear here as soon as the next poll cycle finds fresh stories.
        </p>
        <div className="text-[11px] text-zinc-500 leading-relaxed space-y-1">
          <div>
            Voice engine: <span className="text-zinc-300">{voiceLabel(kokoro, piper)}</span>
            {setupWorking ? ' (installing once)' : ''}
          </div>
          <div>
            Video engine: <span className="text-zinc-300">{videoLabel(video)}</span>
            {videoWorking ? ' (installing once)' : ''}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReelStack({
  reels,
  activeIdx,
  onActiveChange,
  onDelete,
  onOpenArticle,
  muted
}: {
  reels: Reel[]
  activeIdx: number
  onActiveChange: (i: number) => void
  onDelete: (id: number) => void
  onOpenArticle: (articleId: number) => void
  muted: boolean
}): JSX.Element {
  const lockRef = useRef(false)
  const accumRef = useRef(0)

  const advance = useCallback(
    (delta: number) => {
      if (lockRef.current) return
      const next = Math.max(0, Math.min(reels.length - 1, activeIdx + delta))
      if (next === activeIdx) return
      lockRef.current = true
      accumRef.current = 0
      onActiveChange(next)
      // Cooldown matches the transform transition so we don't snap mid-animation.
      setTimeout(() => {
        lockRef.current = false
      }, 620)
    },
    [activeIdx, reels.length, onActiveChange]
  )

  const onWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    if (lockRef.current) {
      accumRef.current = 0
      return
    }
    // Trackpad flings emit many small delta events; debounce by requiring a
    // minimum accumulated intent before snapping.
    accumRef.current += e.deltaY
    const THRESHOLD = 60
    if (accumRef.current > THRESHOLD) advance(1)
    else if (accumRef.current < -THRESHOLD) advance(-1)
  }

  // Touch: basic swipe-up / swipe-down
  const touchStartRef = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>): void => {
    touchStartRef.current = e.touches[0]?.clientY ?? null
  }
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>): void => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (start == null) return
    const end = e.changedTouches[0]?.clientY ?? start
    const dy = start - end
    if (Math.abs(dy) < 40) return
    advance(dy > 0 ? 1 : -1)
  }

  return (
    <div
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="flex-1 min-h-0 relative overflow-hidden"
      style={{ isolation: 'isolate' }}
    >
      {reels.map((reel, i) => {
        const offset = i - activeIdx
        // Virtualize: only mount the active panel and its immediate neighbors.
        // Everything else would just be painting animated scenes off-screen
        // for no user-visible benefit — and it noticeably warms the laptop.
        if (Math.abs(offset) > 1) return null
        return (
          <div
            key={reel.id}
            className="absolute inset-0 transition-transform duration-[600ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]"
            style={{
              transform: `translateY(${offset * 100}%)`,
              zIndex: 100 - Math.abs(offset)
            }}
          >
            <ReelPanel
              reel={reel}
              active={i === activeIdx}
              total={reels.length}
              index={i}
              muted={muted}
              onNext={() => advance(1)}
              onDelete={() => onDelete(reel.id)}
              onOpenArticle={() => onOpenArticle(reel.articleId)}
            />
          </div>
        )
      })}
      <StackDots total={reels.length} activeIdx={activeIdx} onSelect={onActiveChange} />
    </div>
  )
}

// Right-edge scroll-position dots. Caps at 8 dots so a big backlog collapses
// into start/middle/end rather than a long vertical ladder.
function StackDots({
  total,
  activeIdx,
  onSelect
}: {
  total: number
  activeIdx: number
  onSelect: (i: number) => void
}): JSX.Element | null {
  if (total <= 1) return null
  const maxVisible = 8
  const indices: number[] =
    total <= maxVisible
      ? Array.from({ length: total }, (_, i) => i)
      : (() => {
          const half = Math.floor(maxVisible / 2)
          const start = Math.max(0, Math.min(total - maxVisible, activeIdx - half))
          return Array.from({ length: maxVisible }, (_, i) => start + i)
        })()
  return (
    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5">
      {indices.map((i) => {
        const active = i === activeIdx
        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`rounded-full transition-all ${
              active ? 'h-4 w-1.5 bg-white/90' : 'h-1.5 w-1.5 bg-white/30 hover:bg-white/60'
            }`}
            aria-label={`Flash ${i + 1}`}
          />
        )
      })}
    </div>
  )
}

function ReelPanel({
  reel,
  active,
  total,
  index,
  muted,
  onNext,
  onDelete,
  onOpenArticle
}: {
  reel: Reel
  active: boolean
  total: number
  index: number
  muted: boolean
  onNext: () => void
  onDelete: () => void
  onOpenArticle: () => void
}): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [beatIdx, setBeatIdx] = useState(0)
  const [audioError, setAudioError] = useState<string | null>(null)
  const healAttemptedRef = useRef(false)

  const audioSrc = useMemo(
    () => `reel://audio/${encodeURIComponent(reel.audioFile)}`,
    [reel.audioFile]
  )

  // Reset heal state when the audio file actually changes (rebuild writes a
  // cache-busted filename). The playback effect below picks up the new src.
  useEffect(() => {
    healAttemptedRef.current = false
  }, [reel.audioFile])

  // Apply the global mute toggle to the underlying media element; browsers
  // don't accept `muted` as a reactive prop on <audio> reliably.
  useEffect(() => {
    const el = audioRef.current
    if (el) el.muted = muted
  }, [muted])

  // Single source of truth for load/play lifecycle. Depends on both `active`
  // (user swipes between reels) and `reel.audioFile` (rebuild produced a new
  // file). Calling load() when src changes forces the browser to drop the
  // cached/broken response and fetch the fresh URL; play() then resumes from
  // the top. Without this, a self-heal after a decode error would leave the
  // "Repairing audio…" UI stuck.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    if (active) {
      el.load()
      el.currentTime = 0
      setProgress(0)
      setBeatIdx(0)
      setAudioError(null)
      void el
        .play()
        .then(() => setPlaying(true))
        .catch((err) => {
          setPlaying(false)
          // AbortError: fires when a new load()/pause() preempts this play().
          // Happens naturally when the user swipes between reels before the
          // previous one's play() promise resolves. Not a real failure —
          // swallow so we don't flash an error banner on every swipe.
          if (err instanceof DOMException && err.name === 'AbortError') return
          setAudioError(err instanceof Error ? err.message : 'Tap to play')
        })
    } else {
      el.pause()
      setPlaying(false)
    }
  }, [active, reel.audioFile])

  // Smooth progress via requestAnimationFrame. The HTMLMediaElement
  // 'timeupdate' event only fires ~4x/sec, which makes the per-beat progress
  // bars visibly step instead of fill. We run our own loop — but only while
  // the panel is active AND audio is actually playing, and we throttle state
  // updates to ~12fps so React reconciliation doesn't dominate the main
  // thread. The progress-bar CSS transition (duration-150) smooths the gap.
  useEffect(() => {
    if (!active) return
    const el = audioRef.current
    if (!el) return
    let raf = 0
    let last = 0
    const tick = (): void => {
      if (!el.paused && !el.ended) {
        const now = performance.now()
        if (now - last >= 80) {
          last = now
          setProgress(el.currentTime)
          const dur = el.duration || duration
          if (reel.beats.length > 0 && dur > 0) {
            const ratio = Math.min(0.999, el.currentTime / dur)
            const idx = Math.floor(ratio * reel.beats.length)
            setBeatIdx((prev) => (prev === idx ? prev : idx))
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, duration, reel.beats.length])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onMeta = (): void => setDuration(el.duration || 0)
    const onEnd = (): void => {
      setPlaying(false)
      onNext()
    }
    const onErr = (): void => {
      const code = el.error?.code
      const map: Record<number, string> = {
        1: 'Aborted',
        2: 'Network error loading audio',
        3: 'Decoding error',
        4: 'Audio source not supported or not found'
      }
      setAudioError(map[code ?? 0] ?? 'Audio unavailable')
      setPlaying(false)
      // Self-heal: if the file is corrupt (decode / not-supported), ask the
      // main process to re-synthesize this reel's audio. Do it once per mount
      // so a genuinely broken TTS pipeline doesn't thrash.
      if ((code === 3 || code === 4) && !healAttemptedRef.current) {
        healAttemptedRef.current = true
        setAudioError('Repairing audio…')
        void window.api.reels.rebuildOne(reel.id).then((ok) => {
          if (!ok) setAudioError('Audio unavailable — retry later')
        })
      }
    }
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('ended', onEnd)
    el.addEventListener('error', onErr)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('error', onErr)
    }
  }, [reel.id, onNext])

  const togglePlay = (): void => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      setAudioError(null)
      void el
        .play()
        .then(() => setPlaying(true))
        .catch((err) => {
          setAudioError(err instanceof Error ? err.message : 'Playback failed')
        })
    } else {
      el.pause()
      setPlaying(false)
    }
  }

  // Cleaned beats: fix fragments produced by a naive sentence splitter running
  // on text with initials ("Judge Troy L. Nunley") or abbreviations ("Mr.
  // Smith"). Without this, captions like "As part of his ruling, which came
  // late Friday, Judge Troy L." render and look broken.
  const cleanBeats = useMemo(() => cleanBeatList(reel.beats, reel.articleTitle), [
    reel.beats,
    reel.articleTitle
  ])
  const numBeats = Math.max(1, cleanBeats.length)
  const activeBeat =
    cleanBeats.length > 0
      ? cleanBeats[Math.min(cleanBeats.length - 1, beatIdx)]
      : reel.articleTitle

  const pct = duration > 0 ? (progress / duration) * 100 : 0
  const accent = reel.domain === 'finance' ? '#f59e0b' : '#60a5fa'
  const accentSecondary = reel.domain === 'finance' ? '#ef4444' : '#a78bfa'

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-black"
      style={{ contain: 'paint' }}
    >
      {/* Multi-scene video: one scene per beat, cross-fades on beat change */}
      <SceneStack
        imageURL={reel.articleImageURL}
        keyframes={reel.keyframes}
        videoClips={reel.videoClips}
        active={active}
        beatIdx={beatIdx}
        totalBeats={numBeats}
        accent={accent}
        accentSecondary={accentSecondary}
      />

      {/* Broadcast overlays — only paint grain on the active panel since the
          SVG-filter animation is the single most expensive thing here. */}
      <div className="absolute inset-0 pointer-events-none scanlines-overlay opacity-[0.08]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/10 to-black/60 pointer-events-none" />
      {active && <div className="absolute inset-0 grain-overlay pointer-events-none" />}

      {/* LIVE badge */}
      <div className="absolute top-20 left-6 z-20 flex items-center gap-2 pointer-events-none">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
        </span>
        <span className="text-[10px] font-bold tracking-[0.32em] uppercase text-white/90">
          Live briefing
        </span>
      </div>

      {/* Source / category pill — top-left, just below the LIVE badge */}
      <div className="absolute top-32 left-6 z-20 pointer-events-none flex items-center gap-2">
        <span
          className="px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-[0.2em] text-white"
          style={{ background: accent }}
        >
          {reel.domain === 'finance' ? 'Markets' : 'World'}
        </span>
        <span className="text-[10px] uppercase tracking-[0.22em] text-white/75">
          {reel.feedTitle}
        </span>
      </div>

      {/* Scene progress (one bar per beat) */}
      <div className="absolute top-3 right-6 left-6 flex gap-1.5 z-20 pointer-events-none">
        {Array.from({ length: numBeats }).map((_, i) => (
          <div
            key={i}
            className="h-[3px] flex-1 rounded-full bg-white/15 overflow-hidden"
          >
            <div
              className="h-full bg-white/85 transition-[width] duration-150 ease-linear"
              style={{
                width:
                  i < beatIdx
                    ? '100%'
                    : i === beatIdx
                      ? `${Math.max(0, Math.min(100, ((pct / 100) * numBeats - i) * 100))}%`
                      : '0%'
              }}
            />
          </div>
        ))}
      </div>

      {/* Play/pause click target */}
      <button
        onClick={togglePlay}
        className="absolute inset-0 z-10 cursor-pointer focus:outline-none"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {!playing && active && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center h-16 w-16 rounded-full bg-white/20 backdrop-blur text-white text-[26px]">
            ▶
          </span>
        )}
      </button>

      {/* Beat caption (the thing that animates per beat) */}
      <div className="absolute left-6 right-6 bottom-32 z-20 pointer-events-none">
        <div
          key={`${reel.id}-${beatIdx}`}
          className="text-[28px] md:text-[34px] leading-[1.08] font-extrabold text-white tracking-tight animate-beat"
          style={{ textShadow: '0 2px 18px rgba(0,0,0,0.65)' }}
        >
          {activeBeat}
        </div>
      </div>

      {/* Lower-third ticker (article title scrolling) */}
      <div className="absolute left-0 right-0 bottom-16 z-20 pointer-events-none overflow-hidden">
        <div className="relative border-y border-white/10 bg-black/60 backdrop-blur-sm">
          <div className="flex items-center gap-4 py-1.5 pl-6 pr-6 text-[11px] text-white/80 whitespace-nowrap">
            <span
              className="px-2 py-px rounded-sm font-bold uppercase tracking-wider text-white text-[10px]"
              style={{ background: accent }}
            >
              {reel.domain === 'finance' ? 'Markets' : 'World'}
            </span>
            <span className="font-semibold truncate">{reel.articleTitle}</span>
          </div>
        </div>
      </div>

      {/* Meta row (source, actions) */}
      <div className="absolute left-6 right-6 bottom-5 z-20 flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-0.5 pointer-events-none">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/70">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: accent }}
            />
            <span>{reel.feedTitle}</span>
            <span className="opacity-50">·</span>
            <span>{relTime(reel.publishedAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenArticle}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] tracking-wide"
          >
            Read source
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 rounded-full text-white/60 hover:text-white/90 text-[11px]"
          >
            Dismiss
          </button>
        </div>
      </div>

      <div className="absolute top-20 right-6 z-20 text-[10px] uppercase tracking-[0.2em] text-white/50 tabular-nums pointer-events-none">
        {index + 1} / {total}
      </div>

      {audioError && active && (
        <div className="absolute bottom-44 left-6 right-6 z-30 text-center text-[11px] text-rose-300/90 bg-rose-950/60 border border-rose-500/30 rounded-md px-3 py-1.5">
          {audioError}
        </div>
      )}

      <audio ref={audioRef} src={audioSrc} preload="auto" />
    </div>
  )
}

// One scene per beat. Each is a distinct camera treatment of the per-beat
// AI-generated keyframe (or the article hero image / procedural gradient if
// keyframes aren't available yet), cross-fading when the beat changes.
function SceneStack({
  imageURL,
  keyframes,
  videoClips,
  active,
  beatIdx,
  totalBeats,
  accent,
  accentSecondary
}: {
  imageURL: string | null
  keyframes: string[]
  videoClips: string[]
  active: boolean
  beatIdx: number
  totalBeats: number
  accent: string
  accentSecondary: string
}): JSX.Element {
  const scenes = useMemo(
    () => Array.from({ length: totalBeats }, (_, i) => pickSceneVariant(i)),
    [totalBeats]
  )
  return (
    <div className="absolute inset-0">
      {scenes.map((variant, i) => {
        // Priority: real video clip > AI keyframe > article hero > gradient.
        const clip = videoClips[i]
        const keyframe = keyframes[i]
        const videoSrc = clip ? `reel://image/${encodeURIComponent(clip)}` : null
        const sceneImage = keyframe
          ? `reel://image/${encodeURIComponent(keyframe)}`
          : imageURL
        return (
          <div
            key={i}
            className="absolute inset-0 transition-opacity duration-700 ease-out"
            style={{ opacity: i === beatIdx ? 1 : 0 }}
          >
            <Scene
              variant={variant}
              imageURL={sceneImage}
              videoURL={videoSrc}
              active={active && i === beatIdx}
              accent={accent}
              accentSecondary={accentSecondary}
            />
          </div>
        )
      })}
    </div>
  )
}

type SceneVariant =
  | 'establish'
  | 'push-in'
  | 'rack-focus'
  | 'split-tone'
  | 'pan-right'
  | 'crop-detail'

function pickSceneVariant(beatIdx: number): SceneVariant {
  const rotation: SceneVariant[] = [
    'establish',
    'push-in',
    'pan-right',
    'rack-focus',
    'crop-detail',
    'split-tone'
  ]
  return rotation[beatIdx % rotation.length]
}

function Scene({
  variant,
  imageURL,
  videoURL,
  active,
  accent,
  accentSecondary
}: {
  variant: SceneVariant
  imageURL: string | null
  videoURL: string | null
  active: boolean
  accent: string
  accentSecondary: string
}): JSX.Element {
  const classes = active ? variantClasses[variant] : variantClasses[variant].replace(/animate-[\w-]+/g, '')
  const filter = variantFilters[variant]
  const bgImage = imageURL ? `url("${imageURL.replace(/"/g, '\\"')}")` : undefined
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Play/pause the clip with the active beat so background reels don't burn CPU
  // decoding frames nobody is watching. Reset to t=0 when the beat becomes
  // active so every cycle re-enters the clip cleanly.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !videoURL) return
    if (active) {
      v.currentTime = 0
      void v.play().catch(() => undefined)
    } else {
      v.pause()
    }
  }, [active, videoURL])

  return (
    <div className="absolute inset-0 overflow-hidden">
      {videoURL ? (
        <video
          ref={videoRef}
          src={videoURL}
          className={`absolute inset-0 w-full h-full object-cover ${classes}`}
          style={{ filter }}
          muted
          playsInline
          loop
          preload="auto"
        />
      ) : imageURL ? (
        <div
          className={`absolute inset-0 bg-cover bg-center ${classes}`}
          style={{ backgroundImage: bgImage, filter }}
        />
      ) : (
        <div
          className={`absolute inset-0 ${classes}`}
          style={{
            background: `radial-gradient(ellipse at 30% 20%, ${accent}88, transparent 55%), radial-gradient(ellipse at 70% 80%, ${accentSecondary}55, transparent 55%), #0a0b0d`,
            filter
          }}
        />
      )}
      <div
        className="absolute inset-0 mix-blend-overlay opacity-50 pointer-events-none"
        style={{
          background: `linear-gradient(${variantGradientAngle[variant]}deg, ${accent}33 0%, transparent 35%, transparent 65%, ${accentSecondary}33 100%)`
        }}
      />
      {variant === 'crop-detail' && (
        <div className="absolute inset-0 pointer-events-none vignette-heavy" />
      )}
      {/* rack-focus used a backdrop-blur overlay here, but layering a
          backdrop-filter on top of a transform-animated scene triggers a
          full-surface repaint per frame. Dropped for perf — the variant still
          reads distinctly thanks to its own CSS filter + gradient. */}
    </div>
  )
}

const variantClasses: Record<SceneVariant, string> = {
  establish: 'animate-scene-establish',
  'push-in': 'animate-scene-push',
  'pan-right': 'animate-scene-pan',
  'rack-focus': 'animate-scene-rack',
  'crop-detail': 'animate-scene-crop',
  'split-tone': 'animate-scene-split'
}

const variantFilters: Record<SceneVariant, string> = {
  establish: 'saturate(1.05) contrast(1.05) brightness(0.9)',
  'push-in': 'saturate(1.15) contrast(1.08)',
  'pan-right': 'saturate(1.1) contrast(1.02) hue-rotate(-4deg)',
  'rack-focus': 'saturate(0.95) contrast(1.1) brightness(0.85)',
  'crop-detail': 'saturate(1.2) contrast(1.15) brightness(0.95)',
  'split-tone': 'saturate(1.3) contrast(1.1) hue-rotate(6deg)'
}

const variantGradientAngle: Record<SceneVariant, number> = {
  establish: 135,
  'push-in': 180,
  'pan-right': 90,
  'rack-focus': 45,
  'crop-detail': 160,
  'split-tone': 210
}

function relTime(ts: number | null): string {
  if (!ts) return ''
  const diff = Math.max(0, Date.now() - ts)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  return `${d}d`
}

// Repair beats that were derived by a naive sentence splitter and ended up
// as mid-sentence fragments. Two common failure modes:
//   1. Split on an initial: "...Judge Troy L." + "Nunley ruled..."
//   2. Split on an abbreviation: "...Mr." + "Smith announced..."
//   3. Beat too long for on-screen caption (wraps to 3+ lines at 34px bold).
// We merge initial/abbreviation fragments with the following beat, strip
// trailing dangling punctuation, and truncate at a word boundary to keep
// each caption readable in a single glance.
const ABBREVS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'sr', 'jr',
  'inc', 'corp', 'co', 'ltd', 'llc',
  'sen', 'rep', 'gov', 'gen', 'lt', 'col', 'capt', 'sgt',
  'vs', 'etc', 'e.g', 'i.e', 'no', 'pp', 'u.s', 'u.k'
])

function endsWithFragment(s: string): boolean {
  // Last token ends with period. Check if it's a lone capital letter
  // ("...Troy L.") or a known abbreviation ("...Mr.").
  const trimmed = s.trim()
  if (!trimmed.endsWith('.')) return false
  const tokens = trimmed.split(/\s+/)
  const last = tokens[tokens.length - 1].replace(/[.,;:]+$/, '').toLowerCase()
  if (last.length === 1) return true
  if (ABBREVS.has(last)) return true
  return false
}

function truncateAtWord(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s
  const cut = s.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace < maxChars * 0.6) return cut.replace(/[,;:—-]\s*$/, '') + '…'
  return cut.slice(0, lastSpace).replace(/[,;:—-]\s*$/, '') + '…'
}

// Strip publisher paywall/subscription/CTA boilerplate that can leak into a
// beat caption or fallback title. This mirrors the server-side scrubber in
// reelService so reels generated before that fix landed also render cleanly.
const PROMO_RE =
  /[^.!?]*\b(?:subscribe|subscription|subscriber[- ]only|become a (?:member|subscriber)|sign up (?:for|to)|sign (?:in|up) to|create (?:an|a free) account|log in to (?:read|continue)|unlimited (?:access|digital)|continue reading|read (?:the full|more) (?:story|article) (?:at|on|in|with|here)|this (?:article|story|content|blog) is (?:for|available to|exclusive to|reserved for|now closed)|enjoy(?:ing)? (?:this|our) (?:article|coverage|story|newsletter)|get (?:our|the|unlimited) (?:newsletter|digital|daily|weekly|breaking news (?:email|app))|join (?:our|the) (?:newsletter|mailing list)|follow us on|download (?:our|the) app|support (?:our|independent|quality) journalism|donate (?:today|now)|paywall|free (?:trial|app)|limited[- ]time offer|already a (?:subscriber|member)|this blog is now closed)\b[^.!?]*[.!?]?/gi

function scrubBeatPromo(text: string): string {
  if (!text) return ''
  return text
    .replace(PROMO_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
}

function polishBeat(raw: string): string {
  let t = scrubBeatPromo(raw)
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:—-]+/, '')
    .replace(/[\s,;:—-]+$/, '')
    .trim()
  // Capitalize first character if it's a letter.
  if (t.length > 0 && /[a-z]/.test(t[0])) {
    t = t[0].toUpperCase() + t.slice(1)
  }
  return t
}

function cleanBeatList(beats: string[], fallbackTitle: string): string[] {
  const cleanFallback = scrubBeatPromo(fallbackTitle) || fallbackTitle
  if (!beats || beats.length === 0) return [cleanFallback]
  const merged: string[] = []
  for (let i = 0; i < beats.length; i++) {
    const current = beats[i]
    if (
      merged.length > 0 &&
      endsWithFragment(merged[merged.length - 1])
    ) {
      // Fold this beat into the previous fragment.
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${current}`.trim()
    } else {
      merged.push(current)
    }
  }
  const polished = merged
    .map((b) => polishBeat(b))
    .filter((b) => b.length > 0)
    .map((b) => truncateAtWord(b, 72))
  // If every beat ended up being an unrecoverable fragment, fall back to the
  // article title so the user sees *something* coherent.
  const anyOk = polished.some((b) => b.length >= 10 && !endsWithFragment(b))
  if (!anyOk) return [cleanFallback]
  return polished
}
