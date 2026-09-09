// Directed sector-to-sector supply flow, as a Sankey.
//
// Replaces a flat list of undirected sector pairs, which summed both
// directions into one number and so destroyed the most interesting property of
// the data. On the live graph Consumer Staples -> Consumer Discretionary runs
// 159 links one way, while Materials <-> Industrials is 30 against 29. A
// ribbon shows that asymmetry directly; a sorted list cannot.
//
// Two columns, not four. The reference designs that inspired this have a real
// hierarchy to spend columns on (gas -> sector -> stage -> category). Our only
// candidate for a third column is graph_node_overrides.stage, which holds 224
// unstandardized values including one-offs like "patent-portfolio" — inventing
// a hierarchy from that would be decoration, not information.
//
// Hand-rolled SVG: the repo carries no charting library by convention, and a
// two-column Sankey is stacked bars plus bezier ribbons.

import { useMemo, useState } from 'react'
import type { MarketSectorFlow } from '../../preload'

interface Props {
  flows: MarketSectorFlow[]
  /** Sector name -> "r,g,b", so this agrees with the graph's colours. */
  colorOf?: (sector: string) => string
  onSelectSymbol?: (symbol: string, name?: string | null) => void
}

const NODE_W = 13
const NODE_GAP = 6
const PAD = 8
const MIN_RIBBON = 1.2
const LABEL_W = 168
const FALLBACK_RGB = '113,113,122'

interface Band {
  key: string
  flow: MarketSectorFlow
  y1: number
  y2: number
  thickness: number
}

export default function SectorFlowSankey({
  flows,
  colorOf,
  onSelectSymbol
}: Props): JSX.Element {
  const [active, setActive] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)

  const model = useMemo(() => {
    if (flows.length === 0) return null

    // Column totals. A sector appears on the left as a supplier and on the
    // right as a customer, and the two totals differ — that difference is the
    // net position of the sector, and keeping the columns independent is what
    // makes it visible.
    const outTotal = new Map<string, number>()
    const inTotal = new Map<string, number>()
    for (const f of flows) {
      outTotal.set(f.from, (outTotal.get(f.from) ?? 0) + f.count)
      inTotal.set(f.to, (inTotal.get(f.to) ?? 0) + f.count)
    }

    const left = [...outTotal.entries()].sort((a, b) => b[1] - a[1])
    const right = [...inTotal.entries()].sort((a, b) => b[1] - a[1])
    const grand = flows.reduce((s, f) => s + f.count, 0)

    // Height is driven by the busier column so both fit the same canvas.
    const rows = Math.max(left.length, right.length)
    const height = Math.max(260, grand * 0.42 + rows * NODE_GAP)
    const usable = height - PAD * 2 - (rows - 1) * NODE_GAP
    const unit = usable / grand

    const place = (
      entries: Array<[string, number]>
    ): Map<string, { y: number; h: number; total: number }> => {
      const out = new Map<string, { y: number; h: number; total: number }>()
      let y = PAD
      for (const [name, total] of entries) {
        const h = Math.max(total * unit, 2)
        out.set(name, { y, h, total })
        y += h + NODE_GAP
      }
      return out
    }
    const leftPos = place(left)
    const rightPos = place(right)

    // Ribbons stack within each endpoint in the same order the columns are
    // sorted, which keeps crossings down without a full ordering pass.
    const leftCursor = new Map<string, number>()
    const rightCursor = new Map<string, number>()
    const bands: Band[] = []
    for (const f of flows) {
      const l = leftPos.get(f.from)
      const r = rightPos.get(f.to)
      if (!l || !r) continue
      const t = Math.max(f.count * unit, MIN_RIBBON)
      const ly = l.y + (leftCursor.get(f.from) ?? 0)
      const ry = r.y + (rightCursor.get(f.to) ?? 0)
      leftCursor.set(f.from, (leftCursor.get(f.from) ?? 0) + t)
      rightCursor.set(f.to, (rightCursor.get(f.to) ?? 0) + t)
      bands.push({ key: `${f.from}>${f.to}`, flow: f, y1: ly, y2: ry, thickness: t })
    }

    return { height, leftPos, rightPos, bands, grand }
  }, [flows])

  if (!model) {
    return <div className="py-6 text-[11px] text-zinc-600">No cross-sector supply links yet.</div>
  }

  const { height, leftPos, rightPos, bands, grand } = model
  const width = 640
  const x1 = LABEL_W
  const x2 = width - LABEL_W - NODE_W
  const shown = pinned ?? active
  const rgb = (s: string): string => colorOf?.(s) ?? FALLBACK_RGB
  const shownFlow = bands.find((b) => b.key === shown)?.flow ?? null

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[640px]"
          role="img"
          aria-label="Directed supply flow between sectors"
        >
          {/* Ribbons first, so the column bars and labels sit on top. */}
          {bands.map((b) => {
            const dim = shown !== null && shown !== b.key
            const mid = (x1 + NODE_W + x2) / 2
            const yA = b.y1 + b.thickness / 2
            const yB = b.y2 + b.thickness / 2
            return (
              <path
                key={b.key}
                d={`M ${x1 + NODE_W} ${yA} C ${mid} ${yA}, ${mid} ${yB}, ${x2} ${yB}`}
                stroke={`rgba(${rgb(b.flow.from)},${dim ? 0.06 : shown === b.key ? 0.85 : 0.32})`}
                strokeWidth={b.thickness}
                fill="none"
                className="cursor-pointer transition-[stroke]"
                onMouseEnter={() => setActive(b.key)}
                onMouseLeave={() => setActive(null)}
                onClick={() => setPinned((p) => (p === b.key ? null : b.key))}
              >
                <title>{`${b.flow.from} → ${b.flow.to}: ${b.flow.count} supplier links`}</title>
              </path>
            )
          })}

          {[...leftPos.entries()].map(([name, p]) => (
            <g key={`l-${name}`}>
              <rect x={x1} y={p.y} width={NODE_W} height={p.h} fill={`rgb(${rgb(name)})`} rx={2} />
              <text
                x={x1 - 6}
                y={p.y + p.h / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-zinc-400 text-[10px]"
              >
                {name} ({p.total})
              </text>
            </g>
          ))}

          {[...rightPos.entries()].map(([name, p]) => (
            <g key={`r-${name}`}>
              <rect x={x2} y={p.y} width={NODE_W} height={p.h} fill={`rgb(${rgb(name)})`} rx={2} />
              <text
                x={x2 + NODE_W + 6}
                y={p.y + p.h / 2}
                dominantBaseline="middle"
                className="fill-zinc-400 text-[10px]"
              >
                {name} ({p.total})
              </text>
            </g>
          ))}

          <text x={x1} y={height - 1} textAnchor="middle" className="fill-zinc-600 text-[9px]">
            supplies
          </text>
          <text
            x={x2 + NODE_W}
            y={height - 1}
            textAnchor="middle"
            className="fill-zinc-600 text-[9px]"
          >
            receives
          </text>
        </svg>
      </div>

      {/* A ribbon on its own only says "a lot of links". Naming a few of the
          companies behind it is what makes it checkable. */}
      {shownFlow ? (
        <div className="mt-2 rounded border border-edge/60 bg-surface-1/60 px-2.5 py-2 text-[11px]">
          <div className="text-zinc-200">
            <span className="font-semibold">{shownFlow.from}</span>
            <span className="text-zinc-600"> supplies </span>
            <span className="font-semibold">{shownFlow.to}</span>
            <span className="text-zinc-500"> · {shownFlow.count} links</span>
          </div>
          {shownFlow.examples.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
              {shownFlow.examples.map((ex) => (
                <span key={`${ex.from}>${ex.to}`}>
                  <button
                    onClick={() => onSelectSymbol?.(ex.from)}
                    className="text-zinc-300 hover:text-sky-300"
                  >
                    {ex.from}
                  </button>
                  <span className="text-zinc-600"> → </span>
                  <button
                    onClick={() => onSelectSymbol?.(ex.to)}
                    className="text-zinc-300 hover:text-sky-300"
                  >
                    {ex.to}
                  </button>
                </span>
              ))}
            </div>
          )}
          {pinned && (
            <button
              onClick={() => setPinned(null)}
              className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              clear
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 text-[10px] text-zinc-600">
          {grand.toLocaleString()} cross-sector supplier links · hover a ribbon, click to pin
        </div>
      )}
    </div>
  )
}
