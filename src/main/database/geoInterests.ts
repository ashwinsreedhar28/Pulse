import { getDb } from './connection'

export type GeoType = 'city' | 'state' | 'country' | 'region'

export interface GeoInterest {
  id: number
  displayName: string
  type: GeoType
  keywords: string[]
  isActive: boolean
  addedAt: number
}

interface GeoRow {
  id: number
  displayName: string
  type: GeoType
  keywords: string
  isActive: number
  addedAt: number
}

const toGeo = (row: GeoRow): GeoInterest => ({
  id: row.id,
  displayName: row.displayName,
  type: row.type,
  keywords: JSON.parse(row.keywords),
  isActive: row.isActive === 1,
  addedAt: row.addedAt
})

export function listGeoInterests(): GeoInterest[] {
  return getDb()
    .prepare<[], GeoRow>(`SELECT * FROM geo_interests ORDER BY displayName`)
    .all()
    .map(toGeo)
}

export interface CreateGeoInterestInput {
  displayName: string
  type: GeoType
  keywords: string[]
}

export function createGeoInterest(input: CreateGeoInterestInput): GeoInterest {
  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO geo_interests (displayName, type, keywords, isActive, addedAt)
       VALUES (?, ?, ?, 1, ?)`
    )
    .run(input.displayName, input.type, JSON.stringify(input.keywords), Date.now())
  const row = db
    .prepare<[number], GeoRow>(`SELECT * FROM geo_interests WHERE id = ?`)
    .get(info.lastInsertRowid as number)!
  return toGeo(row)
}

export function updateGeoKeywords(id: number, keywords: string[]): void {
  getDb()
    .prepare(`UPDATE geo_interests SET keywords = ? WHERE id = ?`)
    .run(JSON.stringify(keywords), id)
}

export function deleteGeoInterest(id: number): void {
  getDb().prepare(`DELETE FROM geo_interests WHERE id = ?`).run(id)
}
