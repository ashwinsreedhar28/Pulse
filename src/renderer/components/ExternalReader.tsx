import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReaderResult } from '../../preload'

// Generic URL viewer — used by calendar pills (launch/Fed/econ), smart-lookup
// "Open article" links, and any other in-app trigger that would otherwise
// shell out to the system browser. Mirrors ArticleReader's reader/webview
// toggle without the article-specific affordances (bookmark, flash,
// mark-read), which only make sense for rows in the feeds DB.
//
// Can also render a pre-built ReaderResult with no backing URL (IPO briefs),
// in which case the Web toggle + reload are hidden since there's nothing to
// re-fetch.

type ViewMode = 'reader' | 'web'

interface Props {
  url: string | null
  title: string
  subtitle?: string | null
  onClose: () => void
  initialReader?: ReaderResult | null
  // Called when the user clicks an http(s) link *inside* the reader content.
  // Without this, anchors injected via dangerouslySetInnerHTML would navigate
  // the entire renderer process, blowing away the React app. Callers should
  // re-set their external-view state so this component re-renders with the
  // new URL and fetches reader content for it.
  onLinkClick?: (url: string, title: string) => void
}

export function ExternalReader({
  url,
  title,
  subtitle,
  onClose,
  initialReader,
  onLinkClick
}: Props): JSX.Element {
  const webviewRef = useRef<HTMLElement | null>(null)
  const autoFellBackRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ViewMode>('reader')
  const [reader, setReader] = useState<ReaderResult | null>(initialReader ?? null)
  const [readerLoading, setReaderLoading] = useState(false)

  // A synthesized brief has no URL — webview mode is meaningless, so we gate
  // the toggle + reload buttons on this. Callers should pass a usable URL OR
  // a pre-built reader, not both.
  const hasURL = typeof url === 'string' && url.length > 0

  // Reset everything when the URL changes so a sequence of opens (e.g., user
  // clicks several launch pills) doesn't leak state between them. When the
  // initialReader changes (different IPO brief) we also reset the view.
  useEffect(() => {
    setMode('reader')
    setReader(initialReader ?? null)
    setReaderLoading(false)
    autoFellBackRef.current = false
  }, [url, initialReader])

  useEffect(() => {
    if (!hasURL) return
    if (mode === 'reader' && !reader && !readerLoading) {
      void (async () => {
        setReaderLoading(true)
        try {
          const result = await window.api.reader.extract(url as string)
          setReader(result)
          // Auto-fall-back to webview once if extraction fails — some pages
          // (SPAs, aggressive paywalls, JS-heavy news sites) can't be read
          // statically but render fine in the embedded Chromium webview.
          if (result.status === 'error' && !autoFellBackRef.current) {
            autoFellBackRef.current = true
            setMode('web')
          }
        } finally {
          setReaderLoading(false)
        }
      })()
    }
  }, [url, hasURL, mode, reader, readerLoading])

  useEffect(() => {
    if (mode !== 'web') return
    setLoading(true)
    const el = webviewRef.current
    if (!el) return
    const onStart = (): void => setLoading(true)
    const onStop = (): void => setLoading(false)
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    return () => {
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
    }
  }, [url, mode])

  const loadReader = useCallback(async (): Promise<void> => {
    if (!hasURL) return
    setReaderLoading(true)
    try {
      const result = await window.api.reader.extract(url as string)
      setReader(result)
    } finally {
      setReaderLoading(false)
    }
  }, [url, hasURL])

  const reload = (): void => {
    if (mode === 'web') {
      const el = webviewRef.current as unknown as { reload?: () => void } | null
      el?.reload?.()
    } else if (hasURL) {
      setReader(null)
      void loadReader()
    }
  }

  const toggleMode = (): void => {
    const next: ViewMode = mode === 'web' ? 'reader' : 'web'
    setMode(next)
    if (next === 'reader' && !reader && !readerLoading) void loadReader()
  }

  return (
    <section className="h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden">
      <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-edge bg-surface-1/60 backdrop-blur">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] text-zinc-300 hover:text-zinc-50 hover:bg-surface-2 transition-colors"
        >
          <span className="text-base leading-none">←</span>
          <span className="uppercase tracking-[0.18em]">Back</span>
        </button>
        <span className="w-px h-5 bg-edge" />
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-300 truncate">
            {title}
          </span>
          {subtitle && (
            <>
              <span className="text-zinc-700 text-[10px]">·</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 truncate">
                {subtitle}
              </span>
            </>
          )}
          {((mode === 'web' && loading) || (mode === 'reader' && readerLoading)) && (
            <span className="text-[10px] text-zinc-500 ml-1">loading…</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {hasURL && (
            <>
              <button
                onClick={toggleMode}
                title="Toggle reader mode"
                className={`no-drag h-7 px-2 flex items-center justify-center rounded text-[10px] uppercase tracking-[0.18em] transition-colors ${
                  mode === 'reader'
                    ? 'bg-surface-2 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface-2'
                }`}
              >
                {mode === 'reader' ? 'Web' : 'Reader'}
              </button>
              <button
                onClick={reload}
                title="Reload"
                aria-label="Reload"
                className="no-drag h-7 w-7 flex items-center justify-center rounded text-sm text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 transition-colors"
              >
                ↻
              </button>
            </>
          )}
        </div>
      </header>
      {mode === 'web' && hasURL ? (
        <div className="flex-1 min-h-0 bg-white">
          <webview
            ref={(el) => {
              webviewRef.current = el
            }}
            src={url as string}
            partition="persist:webview"
            style={{ display: 'flex', width: '100%', height: '100%' }}
          />
        </div>
      ) : (
        <ExternalReaderBody
          url={url}
          reader={reader}
          onRetry={loadReader}
          canRetry={hasURL}
          onLinkClick={onLinkClick}
        />
      )}
    </section>
  )
}

function ExternalReaderBody({
  url,
  reader,
  onRetry,
  canRetry,
  onLinkClick
}: {
  url: string | null
  reader: ReaderResult | null
  onRetry: () => void
  canRetry: boolean
  onLinkClick?: (url: string, title: string) => void
}): JSX.Element {
  // Three pending shapes land here as `!reader`:
  //   (1) URL extraction in flight       → `loading=true`, hasURL true
  //   (2) IPO brief synthesis in flight  → `loading=false`, hasURL false
  //   (3) Between mount and the fetch useEffect firing → `loading=false`, hasURL true
  // All three deserve a loader, not "Reader unavailable". Previously (2) and
  // (3) would flash the unavailable state; now only a reader with a real
  // error (status === 'error') triggers it.
  if (!reader) {
    const msg = canRetry ? 'Extracting readable content…' : 'Assembling brief…'
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-zinc-500">
        {msg}
      </div>
    )
  }
  if (reader.status === 'error') {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-center px-8">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-zinc-600 mb-3">
            Reader unavailable
          </div>
          <div className="text-sm text-zinc-500 max-w-sm mb-4">
            {reader.error ?? 'Could not extract readable content from this page.'}
          </div>
          {canRetry && (
            <button
              onClick={onRetry}
              className="text-[11px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }
  const host = (() => {
    if (!url) return ''
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-surface-0">
      <article className="select-text max-w-[720px] mx-auto px-8 py-12">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-4">
          <span>{reader.siteName ?? host}</span>
        </div>
        {reader.title && (
          <h1 className="text-[30px] font-bold text-zinc-50 leading-[1.2] tracking-tight mb-3">
            {reader.title}
          </h1>
        )}
        {reader.byline && <div className="text-sm text-zinc-400 mb-8">{reader.byline}</div>}
        <div
          className="reader-content text-[15.5px] leading-[1.75] text-zinc-200"
          onClick={(e) => {
            // Links injected via dangerouslySetInnerHTML default to navigating
            // the whole renderer window, which nukes the React app. Intercept
            // http(s) anchors and route them through onLinkClick so they
            // re-use this same viewer instead.
            const anchor = (e.target as HTMLElement).closest('a') as
              | HTMLAnchorElement
              | null
            if (!anchor) return
            const href = anchor.getAttribute('href') ?? ''
            if (!href.startsWith('http')) return
            e.preventDefault()
            if (onLinkClick) {
              onLinkClick(href, anchor.textContent?.trim() || href)
            }
          }}
          dangerouslySetInnerHTML={{ __html: reader.contentHTML ?? '' }}
        />
      </article>
    </div>
  )
}
