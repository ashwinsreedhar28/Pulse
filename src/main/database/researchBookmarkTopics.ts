// Many-to-many tagging between bookmarks and saved topics. Lets the
// Research tab present a topic page that synthesizes the field (saved
// topic's brief) AND lists the user's library entries on that topic
// (their tagged bookmarks) in one view. Also unlocks downstream
// features like topic-colored map nodes.

import { getDb } from './connection'
import type { ResearchBookmarkRow } from './researchBookmarks'
import type { ResearchTopicRow } from './researchTopics'

export interface BookmarkTopicLink {
  bookmarkPaperId: string
  topicId: number
  createdAt: number
}

// Topics this bookmark is tagged with — JOINs through to return the
// full topic rows (one query, renders directly as chips).
export function listTopicsForBookmark(paperId: string): ResearchTopicRow[] {
  return getDb()
    .prepare<[string], ResearchTopicRow>(
      `SELECT t.id, t.query, t.label, t.createdAt, t.lastBriefAt
         FROM research_topics t
         JOIN research_bookmark_topics bt ON bt.topicId = t.id
        WHERE bt.bookmarkPaperId = ?
        ORDER BY t.createdAt ASC`
    )
    .all(paperId)
}

// Bookmarks tagged with a given topic. JOINs through and hydrates the
// stored paper JSON inline so the topic page renders without an extra
// per-bookmark fetch.
interface RawBookmarkRow {
  paperId: string
  savedAt: number
  paperJson: string
}

export function listBookmarksForTopic(topicId: number): ResearchBookmarkRow[] {
  const rows = getDb()
    .prepare<[number], RawBookmarkRow>(
      `SELECT b.paperId, b.savedAt, b.paperJson
         FROM research_bookmarks b
         JOIN research_bookmark_topics bt ON bt.bookmarkPaperId = b.paperId
        WHERE bt.topicId = ?
        ORDER BY bt.createdAt DESC`
    )
    .all(topicId)
  const out: ResearchBookmarkRow[] = []
  for (const r of rows) {
    try {
      const paper = JSON.parse(r.paperJson)
      out.push({ paperId: r.paperId, savedAt: r.savedAt, paper })
    } catch {
      // Skip corrupt rows; should never happen but defense-in-depth.
    }
  }
  return out
}

export function tagBookmark(paperId: string, topicId: number): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO research_bookmark_topics
         (bookmarkPaperId, topicId, createdAt)
       VALUES (?, ?, ?)`
    )
    .run(paperId, topicId, Date.now())
}

export function untagBookmark(paperId: string, topicId: number): void {
  getDb()
    .prepare(
      `DELETE FROM research_bookmark_topics
        WHERE bookmarkPaperId = ? AND topicId = ?`
    )
    .run(paperId, topicId)
}

// Bulk lookup: { paperId → topicId[] } across every tag row. Used by
// the renderer's bookmarks view to color each chip by topic without
// a per-bookmark IPC.
export function getAllBookmarkTopicLinks(): BookmarkTopicLink[] {
  return getDb()
    .prepare<[], BookmarkTopicLink>(
      `SELECT bookmarkPaperId, topicId, createdAt
         FROM research_bookmark_topics`
    )
    .all()
}
