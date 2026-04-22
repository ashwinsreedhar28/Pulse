import type { Database } from 'better-sqlite3'
import defaultFeeds from '../../data/defaultFeeds.json'
import tickerReference from '../../data/tickerReference.json'

export interface Migration {
  version: number
  name: string
  up: (db: Database) => void
}

interface DefaultFeed {
  title: string
  url: string
  category: string
  domain: 'finance' | 'general'
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          notificationsEnabled INTEGER NOT NULL DEFAULT 1,
          domain TEXT NOT NULL CHECK (domain IN ('finance', 'general'))
        );

        CREATE TABLE feeds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          url TEXT NOT NULL UNIQUE,
          categoryId INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          isEnabled INTEGER NOT NULL DEFAULT 1,
          lastFetchedAt INTEGER,
          iconURL TEXT,
          etag TEXT,
          lastModified TEXT
        );
        CREATE INDEX idx_feeds_category ON feeds(categoryId);

        CREATE TABLE articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          feedId INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
          guid TEXT,
          title TEXT NOT NULL,
          summary TEXT,
          url TEXT NOT NULL,
          publishedAt INTEGER,
          isRead INTEGER NOT NULL DEFAULT 0,
          isBookmarked INTEGER NOT NULL DEFAULT 0,
          urgencyScore INTEGER,
          urgencyReason TEXT,
          scoredAt INTEGER,
          domain TEXT NOT NULL CHECK (domain IN ('finance', 'general'))
        );
        CREATE UNIQUE INDEX idx_articles_dedup ON articles(feedId, COALESCE(guid, url));
        CREATE INDEX idx_articles_published ON articles(publishedAt DESC);
        CREATE INDEX idx_articles_unread ON articles(isRead, publishedAt DESC);
        CREATE INDEX idx_articles_bookmarked ON articles(isBookmarked) WHERE isBookmarked = 1;

        CREATE TABLE tickers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL UNIQUE,
          companyName TEXT NOT NULL,
          sector TEXT,
          industry TEXT,
          isActive INTEGER NOT NULL DEFAULT 1,
          addedAt INTEGER NOT NULL
        );

        CREATE TABLE geo_interests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          displayName TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL CHECK (type IN ('city', 'state', 'country', 'region')),
          keywords TEXT NOT NULL DEFAULT '[]',
          isActive INTEGER NOT NULL DEFAULT 1,
          addedAt INTEGER NOT NULL
        );

        CREATE TABLE discovery_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticker TEXT NOT NULL,
          companyName TEXT NOT NULL,
          reason TEXT NOT NULL,
          sourceArticleIds TEXT NOT NULL DEFAULT '[]',
          createdAt INTEGER NOT NULL,
          isViewed INTEGER NOT NULL DEFAULT 0
        );
      `)
    }
  },
  {
    version: 2,
    name: 'seed default categories',
    up: (db) => {
      const insert = db.prepare(
        `INSERT INTO categories (name, sortOrder, notificationsEnabled, domain) VALUES (?, ?, 1, ?)`
      )
      const defaults: Array<[string, number, 'finance' | 'general']> = [
        ['Semiconductors', 0, 'finance'],
        ['Defense & Aerospace', 1, 'finance'],
        ['Mining & Materials', 2, 'finance'],
        ['General Financial', 3, 'finance'],
        ['US Geopolitics', 4, 'general'],
        ['World Events', 5, 'general'],
        ['Space', 6, 'general'],
        ['Regional', 7, 'general']
      ]
      for (const [name, sortOrder, domain] of defaults) insert.run(name, sortOrder, domain)
    }
  },
  {
    version: 3,
    name: 'seed default feeds',
    up: (db) => {
      const findCategory = db.prepare<[string, string], { id: number }>(
        `SELECT id FROM categories WHERE name = ? AND domain = ?`
      )
      const insert = db.prepare(
        `INSERT OR IGNORE INTO feeds (title, url, categoryId, isEnabled) VALUES (?, ?, ?, 1)`
      )
      for (const feed of defaultFeeds as DefaultFeed[]) {
        const cat = findCategory.get(feed.category, feed.domain)
        if (!cat) {
          console.warn(`[db] default feed skipped — unknown category ${feed.domain}/${feed.category}`)
          continue
        }
        insert.run(feed.title, feed.url, cat.id)
      }
    }
  },
  {
    version: 4,
    name: 'seed default tickers',
    up: (db) => {
      const insert = db.prepare(
        `INSERT OR IGNORE INTO tickers (symbol, companyName, sector, industry, isActive, addedAt)
         VALUES (?, ?, ?, ?, 1, ?)`
      )
      const seedSymbols = new Set([
        'NVDA', 'AMD', 'AVGO', 'TSM', 'ASML', 'AMAT', 'LRCX', 'KLAC',
        'SNPS', 'CDNS', 'INTC', 'MU', 'ARM', 'LMT', 'NOC', 'RTX', 'MP', 'ALB'
      ])
      const now = Date.now()
      for (const t of tickerReference as Array<{
        symbol: string
        name: string
        sector?: string | null
        industry?: string | null
      }>) {
        if (!seedSymbols.has(t.symbol)) continue
        insert.run(t.symbol, t.name, t.sector ?? null, t.industry ?? null, now)
      }
    }
  },
  {
    version: 5,
    name: 're-seed default feeds (expanded list)',
    up: (db) => {
      const findCategory = db.prepare<[string, string], { id: number }>(
        `SELECT id FROM categories WHERE name = ? AND domain = ?`
      )
      const insert = db.prepare(
        `INSERT OR IGNORE INTO feeds (title, url, categoryId, isEnabled) VALUES (?, ?, ?, 1)`
      )
      for (const feed of defaultFeeds as DefaultFeed[]) {
        const cat = findCategory.get(feed.category, feed.domain)
        if (!cat) {
          console.warn(`[db] default feed skipped — unknown category ${feed.domain}/${feed.category}`)
          continue
        }
        insert.run(feed.title, feed.url, cat.id)
      }
    }
  },
  {
    version: 6,
    name: 'add mode column to discovery_suggestions',
    up: (db) => {
      db.exec(`ALTER TABLE discovery_suggestions ADD COLUMN mode TEXT NOT NULL DEFAULT 'daily'`)
    }
  },
  {
    version: 7,
    name: 'create preferences table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `)
    }
  },
  {
    version: 8,
    name: 'add imageURL to articles',
    up: (db) => {
      db.exec(`ALTER TABLE articles ADD COLUMN imageURL TEXT`)
    }
  },
  {
    version: 9,
    name: 'create favorite_teams table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS favorite_teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          leagueId TEXT NOT NULL,
          teamId TEXT NOT NULL,
          teamName TEXT NOT NULL,
          abbreviation TEXT NOT NULL,
          logoURL TEXT,
          alertsEnabled INTEGER NOT NULL DEFAULT 1,
          addedAt INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_favorite_teams_dedup
          ON favorite_teams(leagueId, teamId);
      `)
    }
  },
  {
    version: 10,
    name: 'create reels table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          articleId INTEGER NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
          script TEXT NOT NULL,
          beats TEXT NOT NULL DEFAULT '[]',
          audioFile TEXT NOT NULL,
          durationMs INTEGER,
          createdAt INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reels_createdAt ON reels(createdAt DESC);
      `)
    }
  },
  {
    version: 11,
    name: 'reels: add keyframes column',
    up: (db) => {
      // JSON-encoded array of filenames (relative to the reels dir). One
      // entry per narration beat; the UI cross-fades between them.
      db.exec(`ALTER TABLE reels ADD COLUMN keyframes TEXT NOT NULL DEFAULT '[]'`)
    }
  },
  {
    version: 12,
    name: 'create ticker_summaries table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ticker_summaries (
          tickerId INTEGER PRIMARY KEY REFERENCES tickers(id) ON DELETE CASCADE,
          summary TEXT,
          articleCount INTEGER NOT NULL DEFAULT 0,
          generatedAt INTEGER NOT NULL,
          lastArticleAt INTEGER
        );
      `)
    }
  },
  {
    version: 13,
    name: 'create company_profiles table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS company_profiles (
          symbol TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          generatedAt INTEGER NOT NULL
        );
      `)
    }
  },
  {
    version: 14,
    name: 'create favorite_athletes table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS favorite_athletes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          leagueId TEXT NOT NULL,
          athleteId TEXT NOT NULL,
          athleteName TEXT NOT NULL,
          teamId TEXT,
          teamAbbreviation TEXT,
          position TEXT,
          headshotURL TEXT,
          addedAt INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_favorite_athletes_dedup
          ON favorite_athletes(leagueId, athleteId);
      `)
    }
  },
  {
    version: 15,
    name: 'create smart_lookups table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS smart_lookups (
          term TEXT PRIMARY KEY,
          title TEXT,
          summary TEXT NOT NULL,
          source TEXT NOT NULL,
          sourceURL TEXT,
          thumbnailURL TEXT,
          createdAt INTEGER NOT NULL
        );
      `)
    }
  },
  {
    version: 16,
    name: 'reels: add videoClips column',
    up: (db) => {
      db.exec(`ALTER TABLE reels ADD COLUMN videoClips TEXT NOT NULL DEFAULT '[]'`)
    }
  },
  {
    version: 17,
    name: 'hyperintelligence_chats: conversation history',
    up: (db) => {
      db.exec(`
        CREATE TABLE hyperintelligence_chats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          turns TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        );
        CREATE INDEX idx_hyper_chats_updated ON hyperintelligence_chats(updatedAt DESC);
      `)
    }
  },
  {
    version: 18,
    name: 'reader_cache: memoize readability extractions',
    up: (db) => {
      db.exec(`
        CREATE TABLE reader_cache (
          url TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          extractedAt INTEGER NOT NULL
        );
        CREATE INDEX idx_reader_cache_extractedAt ON reader_cache(extractedAt);
      `)
    }
  },
  {
    version: 19,
    name: 'articles_fts: full-text search index',
    // Contentless FTS5 table + triggers that keep it in sync with the
    // `articles` table. Storing content externally (`content=`) halves the
    // on-disk overhead vs. a standalone FTS table, since the text already
    // lives in `articles.title` / `articles.summary`. We index only title
    // and summary — article bodies live in reader_cache and aren't worth
    // 3-5× the disk to index. Backfill runs once here; steady-state cost
    // is a trigger per INSERT/UPDATE/DELETE.
    up: (db) => {
      db.exec(`
        CREATE VIRTUAL TABLE articles_fts USING fts5(
          title,
          summary,
          content='articles',
          content_rowid='id',
          tokenize='porter unicode61 remove_diacritics 1'
        );

        -- Backfill from existing rows.
        INSERT INTO articles_fts(rowid, title, summary)
          SELECT id, title, COALESCE(summary, '') FROM articles;

        -- Keep the index in sync on article mutations.
        CREATE TRIGGER articles_fts_ai AFTER INSERT ON articles BEGIN
          INSERT INTO articles_fts(rowid, title, summary)
            VALUES (new.id, new.title, COALESCE(new.summary, ''));
        END;
        CREATE TRIGGER articles_fts_ad AFTER DELETE ON articles BEGIN
          INSERT INTO articles_fts(articles_fts, rowid, title, summary)
            VALUES ('delete', old.id, old.title, COALESCE(old.summary, ''));
        END;
        CREATE TRIGGER articles_fts_au AFTER UPDATE OF title, summary ON articles BEGIN
          INSERT INTO articles_fts(articles_fts, rowid, title, summary)
            VALUES ('delete', old.id, old.title, COALESCE(old.summary, ''));
          INSERT INTO articles_fts(rowid, title, summary)
            VALUES (new.id, new.title, COALESCE(new.summary, ''));
        END;
      `)
    }
  },
  {
    version: 20,
    name: 'replace ticker watchlist with curated set',
    // The v4 seed was a generic semi/defense starter pack. This migration
    // replaces it (and any hand-added rows) with the owner's curated
    // watchlist. ON DELETE CASCADE on ticker_summaries handles the dependent
    // rows; company_profiles is keyed by symbol so it survives and gets
    // reused if a symbol returns.
    up: (db) => {
      const curated: Array<{
        symbol: string
        name: string
        sector: string | null
        industry: string | null
      }> = [
        { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Semiconductors', industry: 'Fabless CPU / GPU' },
        { symbol: 'APH', name: 'Amphenol', sector: 'Electronic Components', industry: 'Connectors / Interconnect' },
        { symbol: 'AMAT', name: 'Applied Materials', sector: 'Semiconductors', industry: 'Equipment' },
        { symbol: 'ASML', name: 'ASML Holding NV', sector: 'Semiconductors', industry: 'Equipment / Lithography' },
        { symbol: 'ACLS', name: 'Axcelis Technologies', sector: 'Semiconductors', industry: 'Equipment / Implant' },
        { symbol: 'AVGO', name: 'Broadcom', sector: 'Semiconductors', industry: 'Fabless / Networking' },
        { symbol: 'CLS', name: 'Celestica', sector: 'Electronic Manufacturing', industry: 'EMS / ODM (AI networking)' },
        { symbol: 'COHR', name: 'Coherent', sector: 'Semiconductors', industry: 'Photonics / Lasers' },
        { symbol: 'CRWV', name: 'CoreWeave', sector: 'Cloud Infrastructure', industry: 'GPU Cloud / AI Hyperscaler' },
        { symbol: 'GLW', name: 'Corning', sector: 'Materials', industry: 'Specialty Glass / Optical' },
        { symbol: 'CRDO', name: 'Credo Technology Group', sector: 'Semiconductors', industry: 'Fabless / Connectivity' },
        { symbol: 'INTC', name: 'Intel', sector: 'Semiconductors', industry: 'IDM' },
        { symbol: 'LIN', name: 'Linde plc', sector: 'Materials', industry: 'Industrial Gases' },
        { symbol: 'LITE', name: 'Lumentum', sector: 'Semiconductors', industry: 'Photonics / Lasers' },
        { symbol: 'MRVL', name: 'Marvell Technology', sector: 'Semiconductors', industry: 'Fabless / Networking' },
        { symbol: 'MPWR', name: 'Monolithic Power Systems', sector: 'Semiconductors', industry: 'Fabless / Power ICs' },
        { symbol: 'NVDA', name: 'NVIDIA', sector: 'Semiconductors', industry: 'Fabless AI / GPU' },
        { symbol: 'RKLB', name: 'Rocket Lab Corporation', sector: 'Aerospace', industry: 'Launch / Satellites' },
        { symbol: 'SNDK', name: 'Sandisk Corporation', sector: 'Semiconductors', industry: 'IDM / NAND Flash' },
        { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing', sector: 'Semiconductors', industry: 'Foundry' },
        { symbol: 'TER', name: 'Teradyne', sector: 'Semiconductors', industry: 'Test Equipment' },
        { symbol: 'VRT', name: 'Vertiv', sector: 'Industrials', industry: 'Data Center Infrastructure' }
      ]
      db.exec(`DELETE FROM tickers`)
      const insert = db.prepare(
        `INSERT INTO tickers (symbol, companyName, sector, industry, isActive, addedAt)
         VALUES (?, ?, ?, ?, 1, ?)`
      )
      const now = Date.now()
      for (const t of curated) {
        insert.run(t.symbol, t.name, t.sector, t.industry, now)
      }
    }
  }
]
