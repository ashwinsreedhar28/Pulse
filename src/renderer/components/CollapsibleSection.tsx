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
  tone,
  gradient,
  backdrop,
  backdropStyle
}: {
  title: string
  meta?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  // Optional dashed/ring variant for placeholder / CTA states that the
  // inactive News coverage section uses. Defaults to the standard shell.
  tone?: 'default' | 'dashed'
  // Use the surface-1→surface-0 diagonal gradient instead of a flat
  // background. Used by the value-chain sections so the static-graph card
  // and the generated-chain card share the same look, since they render
  // stacked on the stock detail page.
  gradient?: boolean
  // Optional absolute-positioned decoration rendered at section level,
  // behind the header + body. Used by StockValueChainCard to paint the
  // role-colored glow over the ENTIRE card (header + description + content)
  // instead of just the children container. Either pass JSX via `backdrop`
  // for fully custom content, or a CSSProperties object via `backdropStyle`
  // for a simple inline-style pseudo-element (background image, box-shadow).
  backdrop?: ReactNode
  backdropStyle?: React.CSSProperties
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  const borderClass =
    tone === 'dashed'
      ? 'border-dashed border-edge/70'
      : 'border-edge'
  const bgClass = gradient
    ? 'bg-gradient-to-br from-surface-1 to-surface-0'
    : 'bg-surface-1'
  // overflow-hidden clips absolute backdrop content to the rounded corners.
  // Needed when a backdrop is present OR when gradient mode is used (the
  // gradient itself doesn't need it, but callers that enable gradient are
  // the ones likely to add a backdrop). For bare sections without either,
  // avoid overflow-hidden so tooltips / popovers don't get clipped.
  const hasBackdrop = !!(backdrop || backdropStyle)
  const clipClass = gradient || hasBackdrop ? 'relative overflow-hidden' : ''
  const needsStackingContext = gradient || hasBackdrop
  return (
    <section className={`mt-6 rounded-2xl border ${borderClass} ${bgClass} p-5 ${clipClass}`}>
      {hasBackdrop && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={backdropStyle}
          aria-hidden
        >
          {backdrop}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${needsStackingContext ? 'relative' : ''} w-full flex items-center gap-3 mb-0 -mx-1 px-1 py-0.5 rounded hover:bg-surface-2/40 transition-colors`}
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
      {open && <div className={`${needsStackingContext ? 'relative' : ''} mt-3`}>{children}</div>}
    </section>
  )
}
