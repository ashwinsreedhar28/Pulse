import { getDb } from './connection'

export interface FavoriteAthlete {
  id: number
  leagueId: string
  athleteId: string
  athleteName: string
  teamId: string | null
  teamAbbreviation: string | null
  position: string | null
  headshotURL: string | null
  addedAt: number
}

export interface AddFavoriteAthleteInput {
  leagueId: string
  athleteId: string
  athleteName: string
  teamId?: string | null
  teamAbbreviation?: string | null
  position?: string | null
  headshotURL?: string | null
}

interface FavoriteAthleteRow {
  id: number
  leagueId: string
  athleteId: string
  athleteName: string
  teamId: string | null
  teamAbbreviation: string | null
  position: string | null
  headshotURL: string | null
  addedAt: number
}

function rowToFavorite(row: FavoriteAthleteRow): FavoriteAthlete {
  return {
    id: row.id,
    leagueId: row.leagueId,
    athleteId: row.athleteId,
    athleteName: row.athleteName,
    teamId: row.teamId,
    teamAbbreviation: row.teamAbbreviation,
    position: row.position,
    headshotURL: row.headshotURL,
    addedAt: row.addedAt
  }
}

const SELECT = `SELECT id, leagueId, athleteId, athleteName, teamId, teamAbbreviation, position, headshotURL, addedAt
                FROM favorite_athletes`

export function listFavoriteAthletes(): FavoriteAthlete[] {
  return getDb()
    .prepare<[], FavoriteAthleteRow>(`${SELECT} ORDER BY leagueId, athleteName`)
    .all()
    .map(rowToFavorite)
}

export function addFavoriteAthlete(input: AddFavoriteAthleteInput): FavoriteAthlete {
  const db = getDb()
  db.prepare(
    `INSERT OR IGNORE INTO favorite_athletes
      (leagueId, athleteId, athleteName, teamId, teamAbbreviation, position, headshotURL, addedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.leagueId,
    input.athleteId,
    input.athleteName,
    input.teamId ?? null,
    input.teamAbbreviation ?? null,
    input.position ?? null,
    input.headshotURL ?? null,
    Date.now()
  )
  const row = db
    .prepare<[string, string], FavoriteAthleteRow>(
      `${SELECT} WHERE leagueId = ? AND athleteId = ?`
    )
    .get(input.leagueId, input.athleteId)
  if (!row) throw new Error('favorite_athlete insert failed')
  return rowToFavorite(row)
}

export function deleteFavoriteAthlete(id: number): void {
  getDb().prepare(`DELETE FROM favorite_athletes WHERE id = ?`).run(id)
}

export function isFavoriteAthlete(leagueId: string, athleteId: string): boolean {
  const row = getDb()
    .prepare<[string, string], { id: number }>(
      `SELECT id FROM favorite_athletes WHERE leagueId = ? AND athleteId = ?`
    )
    .get(leagueId, athleteId)
  return Boolean(row)
}
