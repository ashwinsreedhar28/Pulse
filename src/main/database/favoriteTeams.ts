import { getDb } from './connection'

export interface FavoriteTeam {
  id: number
  leagueId: string
  teamId: string
  teamName: string
  abbreviation: string
  logoURL: string | null
  alertsEnabled: boolean
  addedAt: number
}

export interface AddFavoriteTeamInput {
  leagueId: string
  teamId: string
  teamName: string
  abbreviation: string
  logoURL?: string | null
}

interface FavoriteTeamRow {
  id: number
  leagueId: string
  teamId: string
  teamName: string
  abbreviation: string
  logoURL: string | null
  alertsEnabled: number
  addedAt: number
}

function rowToFavorite(row: FavoriteTeamRow): FavoriteTeam {
  return {
    id: row.id,
    leagueId: row.leagueId,
    teamId: row.teamId,
    teamName: row.teamName,
    abbreviation: row.abbreviation,
    logoURL: row.logoURL,
    alertsEnabled: row.alertsEnabled === 1,
    addedAt: row.addedAt
  }
}

export function listFavoriteTeams(): FavoriteTeam[] {
  return getDb()
    .prepare<[], FavoriteTeamRow>(
      `SELECT id, leagueId, teamId, teamName, abbreviation, logoURL, alertsEnabled, addedAt
       FROM favorite_teams
       ORDER BY leagueId, teamName`
    )
    .all()
    .map(rowToFavorite)
}

export function addFavoriteTeam(input: AddFavoriteTeamInput): FavoriteTeam {
  const now = Date.now()
  const db = getDb()
  db.prepare(
    `INSERT OR IGNORE INTO favorite_teams
      (leagueId, teamId, teamName, abbreviation, logoURL, alertsEnabled, addedAt)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  ).run(
    input.leagueId,
    input.teamId,
    input.teamName,
    input.abbreviation,
    input.logoURL ?? null,
    now
  )
  const row = db
    .prepare<[string, string], FavoriteTeamRow>(
      `SELECT id, leagueId, teamId, teamName, abbreviation, logoURL, alertsEnabled, addedAt
       FROM favorite_teams WHERE leagueId = ? AND teamId = ?`
    )
    .get(input.leagueId, input.teamId)
  if (!row) throw new Error('favorite_team insert failed')
  return rowToFavorite(row)
}

export function deleteFavoriteTeam(id: number): void {
  getDb().prepare(`DELETE FROM favorite_teams WHERE id = ?`).run(id)
}

export function setFavoriteTeamAlerts(id: number, enabled: boolean): void {
  getDb()
    .prepare(`UPDATE favorite_teams SET alertsEnabled = ? WHERE id = ?`)
    .run(enabled ? 1 : 0, id)
}
