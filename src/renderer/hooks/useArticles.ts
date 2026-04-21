import { useCallback, useEffect, useState } from 'react'
import type { Article, ListArticlesOptions } from '../../preload'

export function useArticles(opts: ListArticlesOptions): {
  articles: Article[]
  loading: boolean
  refresh: () => Promise<void>
  patchArticle: (id: number, patch: Partial<Article>) => void
} {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setArticles(await window.api.articles.list(opts))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.domain, opts.categoryId, opts.unreadOnly, opts.bookmarkedOnly, opts.limit])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const unsubscribe = window.api.feeds.onPolled(() => {
      void load()
    })
    return unsubscribe
  }, [load])

  const patchArticle = useCallback((id: number, patch: Partial<Article>): void => {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }, [])

  return { articles, loading, refresh: load, patchArticle }
}
