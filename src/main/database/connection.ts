import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { migrations } from './migrations'
import { reconcileGraphTickers } from './reconcileGraphTickers'

let dbInstance: Database.Database | null = null

export function initDatabase(): Database.Database {
  if (dbInstance) return dbInstance

  const userDataDir = app.getPath('userData')
  mkdirSync(userDataDir, { recursive: true })
  const dbPath = join(userDataDir, 'pulse.db')

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  // 128 MB memory-mapped read window. SQLite serves pages within the window
  // directly from the OS page cache instead of issuing pread() syscalls, which
  // materially speeds up hot article-list scans as the DB grows past a few MB.
  db.pragma('mmap_size = 134217728')
  // Ask SQLite to recompute stats for query planning. Cheap on startup, pays
  // for itself the first time a new index path becomes optimal.
  db.pragma('optimize')

  runMigrations(db)
  // After migrations: ensure every graph-referenced symbol has a tickers row.
  // This replaces the old "author a new migration every time the graph grows"
  // pattern — idempotent, runs on every boot, INSERT OR IGNORE.
  reconcileGraphTickers(db)

  dbInstance = db
  return db
}

export function getDb(): Database.Database {
  if (!dbInstance) throw new Error('Database not initialized — call initDatabase() first')
  return dbInstance
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number
  const pending = migrations.filter((m) => m.version > currentVersion)

  if (pending.length === 0) return

  for (const migration of pending) {
    const apply = db.transaction(() => {
      migration.up(db)
      db.pragma(`user_version = ${migration.version}`)
    })
    apply()
    console.log(`[db] applied migration v${migration.version}: ${migration.name}`)
  }
}
