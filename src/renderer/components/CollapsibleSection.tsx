// Shared section shell with a click-to-collapse header. Mirrors the styling
// other StockDetail sections already use (rounded-2xl surface-1 border-edge,
// uppercase-tracked label + right rule + meta on the right) so swapping
// individual `<section>` tags over doesn't produce a visual gap.

import { useState, type ReactNode } from 'react'

export function CollapsibleSection({
  title,
  meta,
  defaultOpen = true,
  children,
  tone
}: {
  title: string
  meta?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  // Optional dashed/ring variant for placeholder / CTA states that the
  // inactive News coverage section uses. Defaults to the standard shell.
  tone?: 'default' | 'dashed'
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  const borderClass =
    tone === 'dashed'
      ? 'border-dashed border-edge/70'
      : 'border-edge'
  return (
    <section className={`mt-6 rounded-2xl border ${borderClass} bg-surface-1 p-5`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 mb-0 -mx-1 px-1 py-0.5 rounded hover:bg-surface-2/40 transition-colors"
        aria-expanded={open}
      >
        <span
          className={`shrink-0 text-[10px] leading-none text-zinc-500 transition-transform ${
            open ? 'rotate-90' : ''
          }`}
          aria-hidden
        >
          ▶
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          {title}
        </h2>
        <span className="h-px flex-1 bg-edge/80" />
        {meta && (
          <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            {meta}
          </span>
        )}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  )
}
