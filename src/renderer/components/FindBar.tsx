// Browser-style find-in-page overlay. Triggered from App-level Cmd+F.
// Routes to one of two backends based on what's active:
//   - When a webview is mounted (ExternalReader's <webview> mode), call
//     its findInPage method directly so the search runs inside the
//     embedded Chromium frame.
//   - Otherwise, search the host renderer's webContents via IPC. The
//     main process forwards 'found-in-page' results back so we can
//     show the match count + active ordinal.
//
// Esc dismisses; Enter cycles forward; Shift+Enter cycles backward.
// Empty query clears highlights so the user can keep typing without
// stale yellow boxes lingering.

import { useEffect, useRef, useState } from 'react'

interface Props {
  // Active webview element when one is mounted (ExternalReader's web
  // mode). Null/undefined means we route to the host findInPage IPC.
  webview?: HTMLElement | null
  onClose: () => void
}

interface MatchInfo {
  matches: number
  activeMatchOrdinal: number
}

export function FindBar({ webview, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [matchInfo, setMatchInfo] = useState<MatchInfo>({
    matches: 0,
    activeMatchOrdinal: 0
  })
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus + select on mount so Cmd+F → start typing works without an
  // extra click. Re-mount on route change isn't expected since the bar
  // lives at App level.
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Subscribe to find:result broadcasts (host find path). For the
  // webview path we use 'found-in-page' on the element itself.
  useEffect(() => {
    if (webview) return // webview path handled below
    return window.api.find.onResult((payload) => {
      // We don't track requestIds for our single-bar UI; just take the
      // most recent finalUpdate as the authoritative count. Intermediate
      // updates can flicker the active-ordinal as the search progresses.
      if (payload.finalUpdate) {
        setMatchInfo({
          matches: payload.matches,
          activeMatchOrdinal: payload.activeMatchOrdinal
        })
      }
    })
  }, [webview])

  // For the webview path, listen to its 'found-in-page' event. Cast
  // through unknown because Electron's WebView types aren't surfaced
  // by React's HTMLElement.
  useEffect(() => {
    if (!webview) return
    const onFoundInPage = (e: Event): void => {
      const detail = (e as unknown as { result?: { matches: number; activeMatchOrdinal: number } })
        .result
      if (!detail) return
      setMatchInfo({
        matches: detail.matches,
        activeMatchOrdinal: detail.activeMatchOrdinal
      })
    }
    webview.addEventListener('found-in-page', onFoundInPage)
    return (): void => {
      webview.removeEventListener('found-in-page', onFoundInPage)
    }
  }, [webview])

  // Stop any active find on unmount so the highlight doesn't linger.
  useEffect(() => {
    return (): void => {
      if (webview) {
        const wv = webview as unknown as { stopFindInPage?: (action: string) => void }
        wv.stopFindInPage?.('clearSelection')
      } else {
        void window.api.find.stop()
      }
    }
  }, [webview])

  const runSearch = (text: string, opts?: { forward?: boolean; findNext?: boolean }): void => {
    const forward = opts?.forward ?? true
    const findNext = opts?.findNext ?? false
    if (!text.trim()) {
      setMatchInfo({ matches: 0, activeMatchOrdinal: 0 })
      if (webview) {
        const wv = webview as unknown as { stopFindInPage?: (action: string) => void }
        wv.stopFindInPage?.('clearSelection')
      } else {
        void window.api.find.stop()
      }
      return
    }
    if (webview) {
      const wv = webview as unknown as {
        findInPage?: (text: string, options?: { forward?: boolean; findNext?: boolean }) => void
      }
      wv.findInPage?.(text, { forward, findNext })
    } else {
      void window.api.find.start(text, { forward, findNext })
    }
  }

  // Re-run on every keystroke so the count + first-match selection
  // updates as the user types. findNext=false makes the search restart
  // from the top each keystroke (otherwise typing "foo" would search
  // "f", then "o" within the f-match scope, etc.).
  useEffect(() => {
    runSearch(query, { forward: true, findNext: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, webview])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // Re-run with findNext=true so we advance to the next match
      // instead of restarting from the top. Shift+Enter goes back.
      runSearch(query, { forward: !e.shiftKey, findNext: true })
    }
  }

  const counter =
    query.trim().length === 0
      ? ''
      : matchInfo.matches === 0
        ? '0 matches'
        : `${matchInfo.activeMatchOrdinal} of ${matchInfo.matches}`

  return (
    <div className="fixed top-12 right-4 z-[200] flex items-center gap-2 px-3 py-2 rounded-md bg-surface-1/95 backdrop-blur ring-1 ring-edge shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Find on page…"
        className="bg-transparent outline-none text-[13px] text-zinc-100 placeholder-zinc-500 w-56"
      />
      <span className="text-[11px] tabular-nums text-zinc-500 min-w-[60px] text-right">
        {counter}
      </span>
      <button
        type="button"
        onClick={() => runSearch(query, { forward: false, findNext: true })}
        title="Previous (Shift+Enter)"
        className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() => runSearch(query, { forward: true, findNext: true })}
        title="Next (Enter)"
        className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"
      >
        ×
      </button>
    </div>
  )
}
