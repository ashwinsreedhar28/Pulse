// Right-click context menu for value-chain counterparty chips. Lets the
// user flag a chip as not-relevant, re-direct supplier/customer, or
// re-classify into a different relationship. Verdicts go to the
// chainCorrections IPC, which (1) applies the fix to the rendered chain
// immediately and (2) feeds the verdict into the next Claude regen as
// ground-truth so the model honors it instead of repeating the mistake.
//
// Self-contained: pass the menu the screen coordinates of the right-click,
// the chip's current category, and the symbol — it handles its own outside-
// click + Escape dismissal and reports the user's choice via onSelect.

import { useEffect, useRef } from 'react'

import type { Category } from './StockValueChainCard'

export type ChainCorrectionAction =
  | { type: 'not-relevant' }
  | { type: 'wrong-direction'; direction: 'supplier' | 'customer' }
  | {
      type: 'wrong-relationship'
      relationship: 'supplier' | 'customer' | 'competitor' | 'partner'
    }
  | { type: 'remove' }

export interface ChainCorrectionMenuProps {
  // Screen coordinates of the right-click event (clientX/Y). The menu
  // positions itself absolutely from the viewport top-left and clamps to
  // stay inside the window.
  x: number
  y: number
  symbol: string
  // The cluster the chip currently sits in — used to suppress redundant
  // menu items (no point offering "re-classify as supplier" on a chip
  // that's already a supplier).
  currentCategory: Category
  // True when at least one stored correction already targets this symbol.
  // When set, the menu shows a "Remove correction" item at the bottom.
  hasExistingCorrection: boolean
  onSelect: (action: ChainCorrectionAction) => void
  onClose: () => void
}

const CATEGORY_LABEL: Record<Category, string> = {
  supplier: 'supplier',
  customer: 'customer',
  competitor: 'competitor'
}

interface MenuItem {
  key: string
  label: string
  hint?: string
  destructive?: boolean
  action: ChainCorrectionAction
}

function buildItems(
  category: Category,
  hasExisting: boolean
): MenuItem[] {
  const items: MenuItem[] = []
  items.push({
    key: 'not-relevant',
    label: 'Mark as not relevant',
    hint: 'Hide from this chain',
    action: { type: 'not-relevant' }
  })

  // Direction flip — only meaningful when the chip currently sits in the
  // supplier or customer cluster. For a competitor chip, the user can use
  // the "Re-classify as supplier/customer" items below to set a direction
  // explicitly via wrong-relationship.
  if (category === 'supplier') {
    items.push({
      key: 'flip-customer',
      label: 'Actually a customer',
      hint: 'Flip direction',
      action: { type: 'wrong-direction', direction: 'customer' }
    })
  } else if (category === 'customer') {
    items.push({
      key: 'flip-supplier',
      label: 'Actually a supplier',
      hint: 'Flip direction',
      action: { type: 'wrong-direction', direction: 'supplier' }
    })
  }

  // Re-classify into a different relationship category. Skip the one that
  // matches the current chip's cluster (no-op) and the direction flip we
  // already offered above (avoids two items with overlapping semantics).
  const reclassOptions: Array<'supplier' | 'customer' | 'competitor' | 'partner'> = [
    'supplier',
    'customer',
    'competitor',
    'partner'
  ]
  for (const rel of reclassOptions) {
    if (rel === category) continue
    if (category === 'supplier' && rel === 'customer') continue
    if (category === 'customer' && rel === 'supplier') continue
    items.push({
      key: `reclass-${rel}`,
      label: `Re-classify as ${rel}`,
      hint: `From ${CATEGORY_LABEL[category]}`,
      action: { type: 'wrong-relationship', relationship: rel }
    })
  }

  if (hasExisting) {
    items.push({
      key: 'remove',
      label: 'Remove correction',
      hint: 'Restore Claude’s original',
      destructive: true,
      action: { type: 'remove' }
    })
  }

  return items
}

export function ChainCorrectionMenu({
  x,
  y,
  symbol,
  currentCategory,
  hasExistingCorrection,
  onSelect,
  onClose
}: ChainCorrectionMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click + Escape. We listen on mousedown (not click) so
  // the menu dismisses BEFORE the underlying element receives the click —
  // matters when the underlying element opens the ticker detail page.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      if (!menuRef.current) return
      if (menuRef.current.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Clamp position so the menu stays in the viewport. We measure on first
  // paint via the ref and shift left/up as needed. Falls back to the raw
  // coords on the first frame — fine because the menu is small.
  const menuWidth = 220
  const menuHeight = 220
  const left = Math.min(x, window.innerWidth - menuWidth - 8)
  const top = Math.min(y, window.innerHeight - menuHeight - 8)

  const items = buildItems(currentCategory, hasExistingCorrection)

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[220px] rounded-md border border-edge/80 bg-surface-1 shadow-2xl py-1 text-[12px] text-zinc-200"
      style={{ left, top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1.5 border-b border-edge/60">
        <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">
          Correct chain
        </div>
        <div className="text-[12px] font-semibold tabular-nums text-zinc-100 truncate">
          {symbol}
        </div>
      </div>
      <ul className="py-1">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(item.action)
                onClose()
              }}
              className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-surface-2 transition-colors ${
                item.destructive ? 'text-red-300' : 'text-zinc-200'
              }`}
            >
              <span>{item.label}</span>
              {item.hint && (
                <span className="text-[10px] text-zinc-500">{item.hint}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
