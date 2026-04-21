import { useEffect, useState } from 'react'
import type { Category } from '../../preload'

export function useCategories(): {
  categories: Category[]
  feedCounts: Record<number, number>
  unreadCounts: Record<number, number>
  recentCounts: Record<number, number>
  bookmarkCount: number
  refresh: () => Promise<void>
} {
  const [categories, setCategories] = useState<Category[]>([])
  const [feedCounts, setFeedCounts] = useState<Record<number, number>>({})
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({})
  const [recentCounts, setRecentCounts] = useState<Record<number, number>>({})
  const [bookmarkCount, setBookmarkCount] = useState(0)

  const load = async (): Promise<void> => {
    const since = Date.now() - 24 * 60 * 60 * 1000
    const [cats, fc, uc, rc, bm] = await Promise.all([
      window.api.categories.list(),
      window.api.feeds.countsByCategory(),
      window.api.articles.unreadCountsByCategory(),
      window.api.articles.recentCountsByCategory(since),
      window.api.articles.countBookmarked()
    ])
    setCategories(cats)
    setFeedCounts(fc)
    setUnreadCounts(uc)
    setRecentCounts(rc)
    setBookmarkCount(bm)
  }

  useEffect(() => {
    void load()
  }, [])

  return { categories, feedCounts, unreadCounts, recentCounts, bookmarkCount, refresh: load }
}
