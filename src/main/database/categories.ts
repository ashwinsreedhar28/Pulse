import { getDb } from './connection'

export type Domain = 'finance' | 'general'

export interface Category {
  id: number
  name: string
  sortOrder: number
  notificationsEnabled: boolean
  domain: Domain
}

interface CategoryRow {
  id: number
  name: string
  sortOrder: number
  notificationsEnabled: number
  domain: Domain
}

const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sortOrder,
  notificationsEnabled: row.notificationsEnabled === 1,
  domain: row.domain
})

// "Watchlist Sources" holds the auto-provisioned per-ticker RSS feeds. Hide
// it from the Settings Categories tab so users don't see an empty-looking
// row they can't meaningfully interact with.
export function listCategories(): Category[] {
  const rows = getDb()
    .prepare<[], CategoryRow>(
      `SELECT * FROM categories
       WHERE name != 'Watchlist Sources'
       ORDER BY domain, sortOrder, id`
    )
    .all()
  return rows.map(toCategory)
}

export function createCategory(name: string, domain: Domain): Category {
  const db = getDb()
  const max = db
    .prepare<[Domain], { maxOrder: number | null }>(
      `SELECT COALESCE(MAX(sortOrder), -1) AS maxOrder FROM categories WHERE domain = ?`
    )
    .get(domain)
  const nextOrder = (max?.maxOrder ?? -1) + 1
  const info = db
    .prepare(
      `INSERT INTO categories (name, sortOrder, notificationsEnabled, domain) VALUES (?, ?, 1, ?)`
    )
    .run(name, nextOrder, domain)
  return getCategory(info.lastInsertRowid as number)!
}

export function getCategory(id: number): Category | null {
  const row = getDb()
    .prepare<[number], CategoryRow>(`SELECT * FROM categories WHERE id = ?`)
    .get(id)
  return row ? toCategory(row) : null
}

export function renameCategory(id: number, name: string): void {
  getDb().prepare(`UPDATE categories SET name = ? WHERE id = ?`).run(name, id)
}

export function setCategoryNotifications(id: number, enabled: boolean): void {
  getDb()
    .prepare(`UPDATE categories SET notificationsEnabled = ? WHERE id = ?`)
    .run(enabled ? 1 : 0, id)
}

export function deleteCategory(id: number): void {
  getDb().prepare(`DELETE FROM categories WHERE id = ?`).run(id)
}

export function setCategoryDomain(id: number, domain: Domain): void {
  getDb().prepare(`UPDATE categories SET domain = ? WHERE id = ?`).run(domain, id)
}

export function reorderCategories(ids: number[]): void {
  const db = getDb()
  const stmt = db.prepare(`UPDATE categories SET sortOrder = ? WHERE id = ?`)
  const txn = db.transaction((orderedIds: number[]) => {
    orderedIds.forEach((id, index) => stmt.run(index, id))
  })
  txn(ids)
}
