// Background growth for the paper graph.
//
// The finance graph accumulates on its own — every company chain generated
// deposits edges, so the structure gets richer with use. The research graph
// had no equivalent: it only grew when someone pressed a button, which meant
// in practice it stayed empty.
//
// This trickles. Each tick expands a few papers and backfills embeddings for
// anything missing them, so the graph fills in over a session rather than
// demanding a long blocking wait up front.
//
// Deliberately slow. Every expanded paper costs two Semantic Scholar calls,
// and s2RateLimit paces the whole process to ~1 request/second shared with
// search, paper detail panels and chain generation. Expanding aggressively
// here would starve the interactive paths the user is actually waiting on.

import { expandGraph } from './researchGraphExpander'
import { ensureEmbeddings } from './paperSimilarityService'
import { listGraphNodes } from '../database/researchGraph'
import { listEmbeddedIds } from '../database/paperEmbeddings'
import { shouldDeferOnResume } from './networkStatus'

// Papers per tick. At ~2.2s each (two rate-limited calls) this is roughly
// 13s of work per tick, leaving the rest of the interval free for
// interactive S2 traffic.
const PAPERS_PER_TICK = 6
const TICK_MS = 3 * 60 * 1000
// Long enough that boot-time feed polling, stock refresh and chain
// regeneration have all settled first.
const BOOT_DELAY_MS = 8 * 60 * 1000

// Embeddings are cheap relative to expansion — one batch call per 100 papers
// — so a tick can afford a much larger slice of them.
const EMBED_PER_TICK = 300

let timer: ReturnType<typeof setInterval> | null = null
let bootTimer: ReturnType<typeof setTimeout> | null = null
let running = false

async function tick(): Promise<void> {
  if (running) return
  if (shouldDeferOnResume()) return
  running = true
  try {
    const res = await expandGraph({ papers: PAPERS_PER_TICK })
    if (res.papersExpanded > 0) {
      console.log(
        `[research-graph] +${res.nodesAdded} papers, +${res.edgesAdded} links ` +
          `(${res.stats.nodes} total, ${res.stats.expanded} expanded)`
      )
    }

    // Backfill embeddings for whatever the graph holds but the vector store
    // doesn't. These drive semantic positioning and clustering, and without
    // them the graph can only be coloured by field — which is useless here,
    // since the corpus is overwhelmingly one field.
    try {
      const have = listEmbeddedIds()
      const missing = listGraphNodes()
        .map((n) => n.paperId)
        .filter((id) => !have.has(id))
        .slice(0, EMBED_PER_TICK)
      if (missing.length > 0) {
        const stored = await ensureEmbeddings(missing)
        if (stored > 0) console.log(`[research-graph] +${stored} embeddings`)
      }
    } catch (err) {
      console.warn(
        '[research-graph] embedding backfill failed:',
        err instanceof Error ? err.message : err
      )
    }
  } catch (err) {
    console.warn(
      '[research-graph] expansion failed:',
      err instanceof Error ? err.message : err
    )
  } finally {
    running = false
  }
}

export function startResearchGraphScheduler(): void {
  stopResearchGraphScheduler()
  bootTimer = setTimeout(() => {
    void tick()
    timer = setInterval(() => void tick(), TICK_MS)
  }, BOOT_DELAY_MS)
}

export function stopResearchGraphScheduler(): void {
  if (bootTimer) {
    clearTimeout(bootTimer)
    bootTimer = null
  }
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
