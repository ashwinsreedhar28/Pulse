// Top-level + per-panel React error boundary. React 18 unmounts the
// entire tree when a component throws inside render — without a
// boundary catching it, the user sees a blank white window with no
// error message and no recovery short of force-quitting the app.
//
// Usage:
//   <ErrorBoundary>             — top-level, full-window fallback
//   <ErrorBoundary scope="...">  — per-panel, "Something went wrong in {scope}" with reload
//
// The fallback offers a Reload button (full window reload via
// location.reload()), which discards in-memory state but recovers from
// any render-time crash. For per-panel boundaries the user can also
// click "Try again" to remount just that subtree without dropping
// other panels' state.

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  // Human-readable name for the panel/section this boundary wraps.
  // When set, the fallback says "Something went wrong in {scope}"; when
  // omitted, the fallback is the full-window top-level message.
  scope?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[ErrorBoundary${this.props.scope ? ' ' + this.props.scope : ''}]`,
      error,
      info.componentStack
    )
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  reload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children

    const isTopLevel = !this.props.scope
    const heading = isTopLevel
      ? 'Pulse hit an error'
      : `Something went wrong in ${this.props.scope}`
    const detail = this.state.error.message || String(this.state.error)

    return (
      <div
        className={
          isTopLevel
            ? 'min-h-screen flex flex-col items-center justify-center bg-surface-0 px-8 text-center'
            : 'flex flex-col items-center justify-center px-6 py-12 text-center text-zinc-300'
        }
        role="alert"
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-red-400/90 mb-3">
          Render error
        </div>
        <h2 className="text-[18px] font-bold text-zinc-100 mb-2">{heading}</h2>
        <p className="text-[12px] text-zinc-400 max-w-[480px] mb-5 leading-relaxed">
          {detail}
        </p>
        <div className="flex items-center gap-2">
          {!isTopLevel && (
            <button
              type="button"
              onClick={this.reset}
              className="text-[11px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-zinc-800/70 text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={this.reload}
            className="text-[11px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25"
          >
            Reload Pulse
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-6 max-w-[480px]">
          Details are in the dev console (Cmd+Opt+I).
        </p>
      </div>
    )
  }
}
