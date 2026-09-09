// Shared sector colours.
//
// The market graph and the sector-flow Sankey are two views of the same
// structure, so a sector must be the same colour in both — otherwise reading
// one after the other means re-learning the legend, and the Sankey's ribbons
// stop being recognisable as the graph's clusters.
//
// Keyed on sector NAME rather than id. Both views have the name to hand, and
// the id-sorted ordering the graph used previously could not be reproduced
// anywhere that only receives names.

export const SECTOR_PALETTE = [
  '56,189,248', '74,222,128', '251,191,36', '232,121,249', '251,113,133',
  '129,140,248', '251,146,60', '45,212,191', '167,139,250', '163,230,53',
  '34,211,238', '244,114,182'
]

export const NEUTRAL_RGB = '113,113,122'

/**
 * Stable name -> colour mapping.
 *
 * Sorting the names makes the assignment independent of the order they happen
 * to arrive in, so filtering the graph or reordering the Sankey never
 * recolours a sector.
 */
export function makeSectorColor(names: Iterable<string>): (name: string | null) => string {
  const sorted = [...new Set([...names].filter(Boolean))].sort()
  const byName = new Map(
    sorted.map((n, i) => [n, SECTOR_PALETTE[i % SECTOR_PALETTE.length]])
  )
  return (name: string | null): string => (name ? (byName.get(name) ?? NEUTRAL_RGB) : NEUTRAL_RGB)
}
