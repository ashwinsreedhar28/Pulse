// Shared collapse primitives for top-of-page sections (Calendar, Morning
// Brief, Macro Panel, etc.). Two pieces:
//
//   useCollapsedSection(key, defaultCollapsed)
//     Hook that persists collapsed state to localStorage under a stable key.
//     Survives navigation between pages within a session, and reloads.
//     Falls back gracefully if storage is unavailable.
//
//   <CollapseChevron open={...} />
//     Tiny SVG chevron that points down when collapsed, flips up when open.
//     Same icon across every section so the user learns one signifier.
//
// Keeping these in one place ensures all three top-of-page panels use the
// same persistence mechanism + the same visual cue. Adding a new collapsible
// panel? Reach for these.

import { useCallback, useEffect, useState } from 'react'

const STORAGE_PREFIX = 'pulse:collapsed:'

function readInitial(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (raw === 'true') return true
    if (raw === 'false') return false
    return fallback
  } catch {
    return fallback
  }
}

export function useCollapsedSection(
  key: string,
  defaultCollapsed = false
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    readInitial(key, defaultCollapsed)
  )
  // Persist on every change. Wrapped in try/catch — Safari private mode
  // throws on localStorage writes; we silently accept the loss.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, collapsed ? 'true' : 'false')
    } catch {
      /* storage unavailable — preference won't survive reload */
    }
  }, [key, collapsed])
  const toggle = useCallback(
    (next: boolean | ((prev: boolean) => boolean)): void => {
      setCollapsed((prev) => (typeof next === 'function' ? next(prev) : next))
    },
    []
  )
  return [collapsed, toggle]
}

export function CollapseChevron({
  open,
  className = ''
}: {
  open: boolean
  className?: string
}): JSX.Element {
  return (
    <svg
      className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''} ${className}`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 4.5l3 3 3-3" />
    </svg>
  )
}
