// Weekly refresh of saved-topic research briefs. Mirrors the pattern
// of morningBriefService — a single-process timer + an explicit
// `refreshNow(id)` for user-triggered refresh from the renderer.
//
// Cadence: 7 days from lastBriefAt. Topics that have never been
// refreshed get a brief on the next scheduler tick (~5 minutes
// after boot to avoid stampeding startup). Renderer can also fire
// `refreshNow(topicId)` to bypass the cadence entirely.

import { BrowserWindow } from 'electron'

import {
  listResearchTopics,
  setLastBriefAt,
  type ResearchTopicRow
} from '../database/researchTopics'
import { getResearchBrief, upsertResearchBrief } from '../database/researchBriefs'
import { searchAndSynthesize } from './researchService'

const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const TICK_MS = 30 * 60 * 1000 // 30 min — cheap, runs only when due topics exist
const FIRST_TICK_DELAY_MS = 5 * 60 * 1000 // 5 min — wait out boot

let timer: ReturnType<typeof setInterval> | null = null
let kicked = false

function broadcastUpdated(topicId: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('research:topic-updated', topicId)
  }
}

async function refreshTopic(topic: ResearchTopicRow): Promise<void> {
  try {
    const result = await searchAndSynthesize(topic.query)
    const generatedAt = Date.now()
    upsertResearchBrief({
      topicId: topic.id,
      generatedAt,
      payload: result.brief,
      paperIds: result.papers.map((p) => p.paperId)
    })
    setLastBriefAt(topic.id, generatedAt)
    broadcastUpdated(topic.id)
  } catch (err) {
    console.warn(
      `[research-scheduler] refresh failed for topic ${topic.id} ("${topic.query}"):`,
      err instanceof Error ? err.message : err
    )
  }
}

async function tick(): Promise<void> {
  const topics = listResearchTopics()
  const now = Date.now()
  const due = topics.filter(
    (t) => t.lastBriefAt === null || now - t.lastBriefAt >= REFRESH_INTERVAL_MS
  )
  if (due.length === 0) return
  // Sequential refresh to avoid bursting the Anthropic + Semantic
  // Scholar APIs simultaneously. With cadence at 7 days the queue
  // is tiny in practice (1-2 topics per tick).
  for (const topic of due) {
    await refreshTopic(topic)
  }
}

export function startResearchScheduler(): void {
  if (kicked) return
  kicked = true
  setTimeout(() => {
    void tick()
  }, FIRST_TICK_DELAY_MS)
  timer = setInterval(() => {
    void tick()
  }, TICK_MS)
}

export function stopResearchScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  kicked = false
}

// User-triggered immediate refresh. Returns the freshly-saved brief
// row (or null on failure) so the renderer can update without
// waiting for the broadcast.
export async function refreshTopicNow(topicId: number): Promise<void> {
  const topics = listResearchTopics()
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await refreshTopic(topic)
}

// Convenience helper that combines getResearchBrief + a kickoff
// refresh when no brief exists yet. Used by the renderer to handle
// the "user just saved a topic, what do we show?" race — DB has
// the topic but no cached brief yet, scheduler hasn't ticked.
export async function ensureFreshBrief(topicId: number): Promise<void> {
  const existing = getResearchBrief(topicId)
  if (existing) return
  await refreshTopicNow(topicId)
}
