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
  },
  {
    version: 21,
    name: 'article-ticker relevance matches',
    // Replaces the per-request regex matcher (`listArticlesMatching`) with a
    // persisted join table populated at ingest time. Each row carries a
    // `strength` tier ('strong' vs 'weak') so briefs can require strong matches
    // and drop noise like "ARM instruction set" articles being surfaced under
    // Arm Holdings. Backfill of existing articles happens on app start —
    // keeping it out of the migration avoids pulling TS service code into the
    // raw DDL path, and lets the classifier evolve without bumping schema.
    up: (db) => {
      db.exec(`
        CREATE TABLE article_ticker_matches (
          articleId INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
          symbol TEXT NOT NULL,
          strength TEXT NOT NULL CHECK (strength IN ('strong', 'weak')),
          PRIMARY KEY (articleId, symbol)
        );
        CREATE INDEX idx_atm_symbol_strength ON article_ticker_matches(symbol, strength);
      `)
    }
  },
  {
    version: 22,
    name: 'ticker_summaries.relevantCount',
    // The summarizer now returns a separate count of headlines it considered
    // materially about the ticker. `articleCount` is "strong matches in the
    // last 24h" (retrieval-level), `relevantCount` is "headlines the LLM
    // agreed were on-topic" (judgment-level). The UI distinguishes three
    // empty-ish states using both:
    //   articleCount = 0  → no strong matches at all (nothing fetched)
    //   relevantCount = 0 → LLM saw articles but rejected them as noise
    //   summary = null + relevantCount = null → Ollama offline or never ran
    up: (db) => {
      db.exec(`ALTER TABLE ticker_summaries ADD COLUMN relevantCount INTEGER;`)
    }
  },
  {
    version: 23,
    name: 'ticker-owned news feeds (Yahoo + Nasdaq per ticker)',
    // Per-ticker news sourcing: the 44 curated feeds only surface tickers that
    // make the front page of a generalist outlet. To guarantee baseline
    // coverage for every watchlist symbol we provision two virtual feeds per
    // ticker — Yahoo Finance and Nasdaq per-ticker RSS — and route them
    // through the normal poller. They live in a hidden "Watchlist Sources"
    // category (notifications off) and are filtered out of the Settings feed
    // list via `feeds.tickerId IS NULL`. The main article list also hides
    // them so the home view isn't flooded with per-ticker syndication.
    up: (db) => {
      db.exec(`
        ALTER TABLE feeds ADD COLUMN tickerId INTEGER
          REFERENCES tickers(id) ON DELETE CASCADE;
        CREATE INDEX idx_feeds_tickerId ON feeds(tickerId) WHERE tickerId IS NOT NULL;
      `)
      const catInsert = db
        .prepare<[string, number, number, string], { id: number }>(
          `INSERT INTO categories (name, sortOrder, notificationsEnabled, domain)
           VALUES (?, ?, ?, ?)
           RETURNING id`
        )
        .get('Watchlist Sources', 99, 0, 'finance')
      if (!catInsert) return
      const categoryId = catInsert.id
      const tickers = db
        .prepare<[], { id: number; symbol: string; companyName: string }>(
          `SELECT id, symbol, companyName FROM tickers WHERE isActive = 1`
        )
        .all()
      const feedInsert = db.prepare(
        `INSERT OR IGNORE INTO feeds (title, url, categoryId, tickerId, isEnabled)
         VALUES (?, ?, ?, ?, 1)`
      )
      for (const t of tickers) {
        const yahooSym = t.symbol.replace('.', '-')
        feedInsert.run(
          `${t.symbol} — Yahoo Finance`,
          `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(yahooSym)}&region=US&lang=en-US`,
          categoryId,
          t.id
        )
        feedInsert.run(
          `${t.symbol} — Nasdaq`,
          `https://www.nasdaq.com/feed/rssoutbound?symbol=${encodeURIComponent(t.symbol)}`,
          categoryId,
          t.id
        )
      }
    }
  },
  {
    version: 24,
    name: 'seed passive graph tickers (isActive=0)',
    // Every symbol that appears in the Value Chain graph now gets a row in the
    // tickers table. Watchlist membership is the existing `isActive` flag —
    // passive rows get `isActive=0` so they're invisible to watchlist-scoped
    // code (urgency scoring, article classification, per-ticker RSS feeds,
    // summary generation, etc.) but the stocks scheduler (which no longer
    // filters on isActive) will poll their quotes. Activating a passive
    // ticker is a simple UPDATE handled by the `db:tickers:activate` IPC.
    up: (db) => {
      const passive: Array<{
        symbol: string
        name: string
        sector: string
        industry: string
      }> = [
        { symbol: 'MP', name: 'MP Materials', sector: 'Materials', industry: 'Rare Earths' },
        { symbol: 'USAR', name: 'USA Rare Earth', sector: 'Materials', industry: 'Rare Earths' },
        { symbol: 'LAC', name: 'Lithium Americas', sector: 'Materials', industry: 'Lithium Mining' },
        { symbol: 'ALB', name: 'Albemarle', sector: 'Materials', industry: 'Lithium' },
        { symbol: 'SQM', name: 'Sociedad Química y Minera', sector: 'Materials', industry: 'Lithium' },
        { symbol: 'FCX', name: 'Freeport-McMoRan', sector: 'Materials', industry: 'Copper' },
        { symbol: 'SCCO', name: 'Southern Copper', sector: 'Materials', industry: 'Copper' },
        { symbol: 'RIO', name: 'Rio Tinto', sector: 'Materials', industry: 'Diversified Mining' },
        { symbol: 'BHP', name: 'BHP Group', sector: 'Materials', industry: 'Diversified Mining' },
        { symbol: 'VALE', name: 'Vale SA', sector: 'Materials', industry: 'Iron Ore / Nickel' },
        { symbol: 'NEM', name: 'Newmont', sector: 'Materials', industry: 'Gold Mining' },
        { symbol: 'APD', name: 'Air Products and Chemicals', sector: 'Materials', industry: 'Industrial Gases' },
        { symbol: 'AIQUY', name: 'Air Liquide', sector: 'Materials', industry: 'Industrial Gases' },
        { symbol: 'ENTG', name: 'Entegris', sector: 'Materials', industry: 'Semi Consumables' },
        { symbol: 'HOCPY', name: 'Hoya Corporation', sector: 'Materials', industry: 'Photomask Blanks / Optics' },
        { symbol: 'MKSI', name: 'MKS Instruments', sector: 'Semiconductors', industry: 'Vacuum / Subsystems' },
        { symbol: 'UCTT', name: 'Ultra Clean Holdings', sector: 'Semiconductors', industry: 'Gas Delivery Subsystems' },
        { symbol: 'SNPS', name: 'Synopsys', sector: 'Semiconductors', industry: 'EDA / IP' },
        { symbol: 'CDNS', name: 'Cadence Design Systems', sector: 'Semiconductors', industry: 'EDA / IP' },
        { symbol: 'ARM', name: 'Arm Holdings', sector: 'Semiconductors', industry: 'CPU IP' },
        { symbol: 'RMBS', name: 'Rambus', sector: 'Semiconductors', industry: 'Memory IP' },
        { symbol: 'CEVA', name: 'CEVA Inc.', sector: 'Semiconductors', industry: 'DSP / Connectivity IP' },
        { symbol: 'ADEA', name: 'Adeia', sector: 'Semiconductors', industry: 'Hybrid Bonding IP' },
        { symbol: 'LRCX', name: 'Lam Research', sector: 'Semiconductors', industry: 'Equipment / Etch' },
        { symbol: 'KLAC', name: 'KLA Corporation', sector: 'Semiconductors', industry: 'Process Control' },
        { symbol: 'ONTO', name: 'Onto Innovation', sector: 'Semiconductors', industry: 'Metrology / Inspection' },
        { symbol: 'ACMR', name: 'ACM Research', sector: 'Semiconductors', industry: 'Wet Cleaning' },
        { symbol: 'AEHR', name: 'Aehr Test Systems', sector: 'Semiconductors', industry: 'SiC Burn-In Test' },
        { symbol: 'FORM', name: 'FormFactor', sector: 'Semiconductors', industry: 'Probe Cards' },
        { symbol: 'GFS', name: 'GlobalFoundries', sector: 'Semiconductors', industry: 'Foundry' },
        { symbol: 'UMC', name: 'United Microelectronics', sector: 'Semiconductors', industry: 'Foundry' },
        { symbol: 'TSEM', name: 'Tower Semiconductor', sector: 'Semiconductors', industry: 'Specialty Foundry' },
        { symbol: 'SKYT', name: 'SkyWater Technology', sector: 'Semiconductors', industry: 'Trusted Foundry' },
        { symbol: 'TXN', name: 'Texas Instruments', sector: 'Semiconductors', industry: 'Analog IDM' },
        { symbol: 'ADI', name: 'Analog Devices', sector: 'Semiconductors', industry: 'Analog IDM' },
        { symbol: 'ON', name: 'onsemi', sector: 'Semiconductors', industry: 'Power / SiC IDM' },
        { symbol: 'MU', name: 'Micron Technology', sector: 'Semiconductors', industry: 'Memory IDM' },
        { symbol: 'STM', name: 'STMicroelectronics', sector: 'Semiconductors', industry: 'IDM / Auto' },
        { symbol: 'NXPI', name: 'NXP Semiconductors', sector: 'Semiconductors', industry: 'Automotive MCU' },
        { symbol: 'MCHP', name: 'Microchip Technology', sector: 'Semiconductors', industry: 'MCU / Analog' },
        { symbol: 'WOLF', name: 'Wolfspeed', sector: 'Semiconductors', industry: 'SiC IDM' },
        { symbol: 'QCOM', name: 'Qualcomm', sector: 'Semiconductors', industry: 'Fabless / Mobile' },
        { symbol: 'AMBA', name: 'Ambarella', sector: 'Semiconductors', industry: 'Fabless / Vision SoC' },
        { symbol: 'LSCC', name: 'Lattice Semiconductor', sector: 'Semiconductors', industry: 'Fabless / FPGA' },
        { symbol: 'ALGM', name: 'Allegro MicroSystems', sector: 'Semiconductors', industry: 'Fabless / Sensors' },
        { symbol: 'AMKR', name: 'Amkor Technology', sector: 'Semiconductors', industry: 'OSAT / Packaging' },
        { symbol: 'ASX', name: 'ASE Technology Holding', sector: 'Semiconductors', industry: 'OSAT / Packaging' },
        { symbol: 'IMOS', name: 'ChipMOS Technologies', sector: 'Semiconductors', industry: 'OSAT / Memory Packaging' },
        { symbol: 'KLIC', name: 'Kulicke & Soffa Industries', sector: 'Semiconductors', industry: 'Packaging Equipment' },
        { symbol: 'TEL', name: 'TE Connectivity', sector: 'Electronic Components', industry: 'Connectors / Sensors' },
        { symbol: 'FLEX', name: 'Flex Ltd', sector: 'Electronic Manufacturing', industry: 'EMS' },
        { symbol: 'JBL', name: 'Jabil', sector: 'Electronic Manufacturing', industry: 'EMS' },
        { symbol: 'SMCI', name: 'Super Micro Computer', sector: 'Technology Hardware', industry: 'AI Servers' },
        { symbol: 'ANET', name: 'Arista Networks', sector: 'Technology Hardware', industry: 'Cloud Networking' },
        { symbol: 'DELL', name: 'Dell Technologies', sector: 'Technology Hardware', industry: 'Servers / Storage' },
        { symbol: 'HPE', name: 'Hewlett Packard Enterprise', sector: 'Technology Hardware', industry: 'Enterprise Systems' },
        { symbol: 'CIEN', name: 'Ciena', sector: 'Technology Hardware', industry: 'Optical Transport' },
        { symbol: 'JNPR', name: 'Juniper Networks', sector: 'Technology Hardware', industry: 'Networking' },
        { symbol: 'MSFT', name: 'Microsoft', sector: 'Cloud Infrastructure', industry: 'Hyperscaler / AI' },
        { symbol: 'GOOGL', name: 'Alphabet', sector: 'Cloud Infrastructure', industry: 'Hyperscaler / AI' },
        { symbol: 'AMZN', name: 'Amazon', sector: 'Cloud Infrastructure', industry: 'Hyperscaler / AI' },
        { symbol: 'META', name: 'Meta Platforms', sector: 'Cloud Infrastructure', industry: 'AI Buyer' },
        { symbol: 'ORCL', name: 'Oracle', sector: 'Cloud Infrastructure', industry: 'Hyperscaler / AI' },
        { symbol: 'NBIS', name: 'Nebius Group', sector: 'Cloud Infrastructure', industry: 'GPU Cloud' },
        { symbol: 'IBM', name: 'International Business Machines', sector: 'Cloud Infrastructure', industry: 'Hybrid Cloud / AI' },
        { symbol: 'LMT', name: 'Lockheed Martin', sector: 'Aerospace & Defense', industry: 'Prime Contractor' },
        { symbol: 'NOC', name: 'Northrop Grumman', sector: 'Aerospace & Defense', industry: 'Prime Contractor' },
        { symbol: 'RTX', name: 'RTX Corporation', sector: 'Aerospace & Defense', industry: 'Prime Contractor' },
        { symbol: 'GD', name: 'General Dynamics', sector: 'Aerospace & Defense', industry: 'Prime Contractor' },
        { symbol: 'BA', name: 'Boeing', sector: 'Aerospace & Defense', industry: 'Commercial / Defense Aircraft' },
        { symbol: 'LHX', name: 'L3Harris Technologies', sector: 'Aerospace & Defense', industry: 'C4ISR / Space' },
        { symbol: 'HII', name: 'Huntington Ingalls Industries', sector: 'Aerospace & Defense', industry: 'Naval Shipbuilding' },
        { symbol: 'KTOS', name: 'Kratos Defense & Security Solutions', sector: 'Aerospace & Defense', industry: 'Unmanned Systems' },
        { symbol: 'MRCY', name: 'Mercury Systems', sector: 'Aerospace & Defense', industry: 'Mission Computing' },
        { symbol: 'TDG', name: 'TransDigm Group', sector: 'Aerospace & Defense', industry: 'Aerospace Components' }
      ]
      const insert = db.prepare(
        `INSERT OR IGNORE INTO tickers (symbol, companyName, sector, industry, isActive, addedAt)
         VALUES (?, ?, ?, ?, 0, ?)`
      )
      const now = Date.now()
      for (const t of passive) {
        insert.run(t.symbol, t.name, t.sector, t.industry, now)
      }
    }
  },
  {
    version: 25,
    name: 'seed quantum + defense + test-equipment graph additions',
    // Follow-up to v24 as the value-chain graph grew: quantum compute
    // (IONQ, RGTI, QBTS, QUBT, ARQQ), broader defense (HEI, CW) and
    // Keysight on the equipment side. Same passive pattern — rows land
    // with isActive=0 so the stocks scheduler polls quotes but the
    // watchlist-scoped code paths stay untouched.
    up: (db) => {
      const passive: Array<{
        symbol: string
        name: string
        sector: string
        industry: string
      }> = [
        { symbol: 'KEYS', name: 'Keysight Technologies', sector: 'Technology Hardware', industry: 'Test & Measurement' },
        { symbol: 'HEI', name: 'HEICO', sector: 'Aerospace & Defense', industry: 'Aerospace Aftermarket' },
        { symbol: 'CW', name: 'Curtiss-Wright', sector: 'Aerospace & Defense', industry: 'Defense Electronics / Naval' },
        { symbol: 'IONQ', name: 'IonQ', sector: 'Quantum Computing', industry: 'Trapped-Ion Quantum' },
        { symbol: 'RGTI', name: 'Rigetti Computing', sector: 'Quantum Computing', industry: 'Superconducting Quantum' },
        { symbol: 'QBTS', name: 'D-Wave Quantum', sector: 'Quantum Computing', industry: 'Quantum Annealing' },
        { symbol: 'QUBT', name: 'Quantum Computing Inc.', sector: 'Quantum Computing', industry: 'Photonic / Entropy' },
        { symbol: 'ARQQ', name: 'Arqit Quantum', sector: 'Quantum Computing', industry: 'Quantum-Safe Encryption' },
        { symbol: 'XNDU', name: 'Xanadu', sector: 'Quantum Computing', industry: 'Photonic Quantum' }
      ]
      const insert = db.prepare(
        `INSERT OR IGNORE INTO tickers (symbol, companyName, sector, industry, isActive, addedAt)
         VALUES (?, ?, ?, ?, 0, ?)`
      )
      const now = Date.now()
      for (const t of passive) {
        insert.run(t.symbol, t.name, t.sector, t.industry, now)
      }
    }
  },
  {
    version: 26,
    name: 'drop JNPR (HPE acquisition closed), reassert XNDU seed',
    // Juniper Networks finished being absorbed into HPE in 2025; JNPR no
    // longer trades. Its graph edges roll up into HPE in the JSON; here we
    // just delete the ticker row so quote polling stops hitting a dead
    // symbol. XNDU is reasserted because an earlier draft of v25 shipped
    // without it — dev DBs with schema_migrations.version=25 already
    // recorded would otherwise never get the row.
    up: (db) => {
      db.prepare(`DELETE FROM tickers WHERE symbol = 'JNPR'`).run()
      db.prepare(
        `INSERT OR IGNORE INTO tickers (symbol, companyName, sector, industry, isActive, addedAt)
         VALUES ('XNDU', 'Xanadu', 'Quantum Computing', 'Photonic Quantum', 0, ?)`
      ).run(Date.now())
    }
  },
  {
    version: 27,
    name: 'create article_relevance table for "Why this matters to you"',
    // Caches the personal-relevance briefing shown above the reader article
    // body. Each row pairs an article with the user's matched entities
    // (watchlist tickers, supply-chain neighbors, favorite teams/athletes,
    // tracked geos) and an Ollama-written one-sentence prose hook.
    //
    // Status field distinguishes the three terminal states so the renderer
    // can decide what to show:
    //   no_matches — article has no personal angle; row exists so we don't
    //                re-scan on reopen.
    //   ready      — summary present (Ollama succeeded).
    //   offline    — matches present, summary null (Ollama unreachable at
    //                compute time; a later reopen while Ollama is up will
    //                retry).
    //   pending    — matching done, summary request in flight (transient).
    //   error      — matching ran but the summary attempt produced an
    //                unexpected failure (non-network). Chips still shown.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS article_relevance (
          articleId INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
          matchesJson TEXT NOT NULL,
          summary TEXT,
          status TEXT NOT NULL,
          computedAt INTEGER NOT NULL,
          summaryGeneratedAt INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_article_relevance_status
          ON article_relevance(status);
      `)
    }
  },
  {
    version: 28,
    name: 'create ticker_financials for quarterly cashflow + income',
    // Per-quarter income + cashflow slice for every ticker (watchlist or
    // passive graph node). Powers the value-chain "cash flow" overlay: each
    // node surfaces TTM revenue, FCF margin, and QoQ deltas so the graph
    // reads as a money-flow map instead of a static org chart.
    //
    // One row per (symbol, periodEnd) — the composite PK guarantees we
    // overwrite on re-fetch instead of accumulating duplicates when Yahoo
    // restates a prior quarter. Keep quarters sparse: we never need more
    // than 8 back for TTM/YoY math.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ticker_financials (
          symbol TEXT NOT NULL,
          periodEnd INTEGER NOT NULL,
          periodType TEXT NOT NULL DEFAULT 'Q',
          revenue REAL,
          operatingCashFlow REAL,
          capex REAL,
          freeCashFlow REAL,
          netIncome REAL,
          grossProfit REAL,
          currency TEXT,
          fetchedAt INTEGER NOT NULL,
          PRIMARY KEY (symbol, periodEnd)
        );
        CREATE INDEX IF NOT EXISTS idx_ticker_financials_symbol
          ON ticker_financials(symbol);
        CREATE INDEX IF NOT EXISTS idx_ticker_financials_fetchedAt
          ON ticker_financials(fetchedAt);
      `)
    }
  },
  {
    version: 29,
    name: 'create ticker_estimates for analyst consensus + price targets',
    // One row per symbol with a JSON blob carrying the full estimates snapshot
    // (forward EPS per period, price-target range, recommendation split,
    // 30-day upgrade/downgrade tally). Analyst data is read as a whole unit
    // and never queried on individual fields, so a single JSON column is
    // cleaner than a 15-column schema that'd need a migration per new field.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ticker_estimates (
          symbol TEXT PRIMARY KEY,
          dataJson TEXT NOT NULL,
          fetchedAt INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ticker_estimates_fetchedAt
          ON ticker_estimates(fetchedAt);
      `)
    }
  },
  {
    version: 30,
    name: 'create sec_filings + sec_cik_map for EDGAR filings feed',
    // sec_cik_map: one row per ticker→CIK pair. SEC publishes the full
    // universe at www.sec.gov/files/company_tickers.json; we snapshot it
    // monthly so the filings fetcher can translate "AAPL" → CIK 0000320193
    // without hitting the network per request.
    //
    // sec_filings: one row per (symbol, accessionNumber). Accession numbers
    // are globally unique within EDGAR so the PK doubles as a dedupe key on
    // re-fetch. Composite index on (symbol, filedAt DESC) powers the
    // "latest filings for this ticker" query that backs the ticker detail
    // page and the value-chain tile's recency badge.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sec_cik_map (
          symbol TEXT PRIMARY KEY,
          cik TEXT NOT NULL,
          companyName TEXT,
          fetchedAt INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sec_filings (
          symbol TEXT NOT NULL,
          accessionNumber TEXT NOT NULL,
          cik TEXT NOT NULL,
          formType TEXT NOT NULL,
          filedAt INTEGER NOT NULL,
          reportDate INTEGER,
          primaryDocument TEXT,
          primaryDocDescription TEXT,
          items TEXT,
          fetchedAt INTEGER NOT NULL,
          PRIMARY KEY (symbol, accessionNumber)
        );
        CREATE INDEX IF NOT EXISTS idx_sec_filings_symbol_filedAt
          ON sec_filings(symbol, filedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_sec_filings_formType
          ON sec_filings(formType);
      `)
    }
  },
  {
    version: 31,
    name: 'create earnings_releases for 8-K 2.02 AI summaries',
    // One row per (symbol, accessionNumber) where the 8-K carries Item 2.02
    // (Results of Operations). summaryJson holds the structured Ollama output
    // — highlights, key numbers, guidance, notable quotes — so the UI can
    // render it as a small dashboard rather than a blob of prose.
    //
    // status tracks the async pipeline: 'pending' while the body is being
    // fetched + summarized, 'ready' when the row has a summary, 'offline'
    // when Ollama was unreachable (chips still show via the raw filing),
    // 'error' when parsing or summarization failed. Re-queued on next open.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS earnings_releases (
          symbol TEXT NOT NULL,
          accessionNumber TEXT NOT NULL,
          status TEXT NOT NULL,
          summaryJson TEXT,
          rawTextLength INTEGER,
          filedAt INTEGER NOT NULL,
          generatedAt INTEGER,
          PRIMARY KEY (symbol, accessionNumber)
        );
        CREATE INDEX IF NOT EXISTS idx_earnings_releases_symbol_filedAt
          ON earnings_releases(symbol, filedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_earnings_releases_status
          ON earnings_releases(status);
      `)
    }
  },
  {
    version: 32,
    name: 'create graph_candidates + graph_edge_overrides for auto-reviewed chain growth',
    // graph_candidates is the audit log. Every proposal generated by a
    // candidate-source pipeline lands here with its final auto-decision so
    // users can inspect what the system accepted/rejected and why. The
    // pipeline runs the judge inline — there's no human-in-the-loop gate,
    // the row's `status` is decided at insert time.
    //
    //   kind: 'edge' | 'node' | 'sector_move' | 'note_refresh'
    //   payloadJson: full proposal (relationship, note, suggested stage, etc.)
    //   evidenceJson: pointers to supporting articles/filings the judge saw
    //   confidence: 0..1 composite of source strength + Ollama score
    //   source: 'news_cooccurrence' | 'sec_10k_concentration' | ...
    //   status: 'accepted' | 'rejected' | 'pending' (only during the async
    //           judge call — should never persist as 'pending')
    //   reviewNote: the judge's one-line rationale (why accepted/rejected),
    //               shown in the audit UI so users can spot systematic
    //               mistakes.
    //
    // graph_edge_overrides is the active overlay layer. Each accepted-edge
    // candidate writes a row here; the value-chain renderer merges it on top
    // of supplyChainGraph.json at read time. Users who disagree with an
    // auto-accept delete the override row (via the audit UI's Undo button),
    // which both removes the overlay and marks the source candidate as
    // rejected so we don't re-propose it next sweep.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS graph_candidates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL,
          fromSymbol TEXT,
          toSymbol TEXT,
          symbol TEXT,
          payloadJson TEXT NOT NULL,
          evidenceJson TEXT,
          confidence REAL NOT NULL DEFAULT 0,
          source TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          createdAt INTEGER NOT NULL,
          reviewedAt INTEGER,
          reviewNote TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_graph_candidates_status
          ON graph_candidates(status, createdAt DESC);
        CREATE INDEX IF NOT EXISTS idx_graph_candidates_pair
          ON graph_candidates(fromSymbol, toSymbol);

        CREATE TABLE IF NOT EXISTS graph_edge_overrides (
          fromSymbol TEXT NOT NULL,
          toSymbol TEXT NOT NULL,
          relationship TEXT NOT NULL,
          note TEXT,
          weight REAL,
          source TEXT NOT NULL,
          acceptedAt INTEGER NOT NULL,
          PRIMARY KEY (fromSymbol, toSymbol, relationship)
        );
        CREATE INDEX IF NOT EXISTS idx_graph_edge_overrides_from
          ON graph_edge_overrides(fromSymbol);
      `)
    }
  },
  {
    version: 33,
    name: 'create graph_node_overrides for auto-discovered tickers',
    // Companion to graph_edge_overrides. When a 10-K names a customer whose
    // ticker isn't yet in supplyChainGraph.json (or when some other pipeline
    // proposes a new node), the symbol lands here so the ValueChain renderer
    // can surface it as a first-class tile alongside the hand-curated graph.
    //
    // Fields:
    //   symbol: PK, uppercase ticker.
    //   stage: maps to a ValueChainStage.id from supplyChainGraph.json.
    //   sector: group tag (e.g. "semi", "cloud", "energy"). Also drives
    //           sector-filter visibility in the UI.
    //   name/blurb: display copy. Ollama picks these from the company's
    //               SEC-filed legal name + a 1-sentence summary.
    //   source: "sec_10k_concentration" for now; future sources (news
    //           co-occurrence with a bigger ticker map, 13F holders) will
    //           use their own identifiers.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS graph_node_overrides (
          symbol TEXT PRIMARY KEY,
          stage TEXT NOT NULL,
          sector TEXT,
          name TEXT,
          blurb TEXT,
          source TEXT NOT NULL,
          acceptedAt INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_graph_node_overrides_stage
          ON graph_node_overrides(stage);
      `)
    }
  },
  {
    version: 34,
    name: 'create company_value_chains for ticker-scoped subgraphs',
    // One row per symbol carrying a full Ollama-generated value-chain
    // subgraph: industry-appropriate stages, nodes (resolved to tickers
    // when possible, otherwise unverified company names), and edges. Lives
    // alongside the main graph but doesn't mix with it — the subgraph is
    // shown on that ticker's detail page only, so stage taxonomies stay
    // industry-local.
    //
    // status: 'pending' while generation is in flight; 'ready' when the
    // graphJson is populated; 'offline' when Ollama was down (user can
    // retry); 'error' on malformed output. Retry just re-runs the service.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS company_value_chains (
          symbol TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          graphJson TEXT,
          sourceContext TEXT,
          generatedAt INTEGER,
          updatedAt INTEGER NOT NULL
        );
      `)
    }
  },
  {
    version: 35,
    name: 'unified multi-sector graph — sectors, ticker_sectors, sectorId columns',
    // Lays the data model for the unified multi-sector ecosystem graph. The
    // sector catalog (src/data/sectorCatalog.json) is the source of truth;
    // `sectors` mirrors it into SQL so override rows can FK by id. parentId
    // is nullable for top-level (GICS-11-inspired) sectors and set for
    // sub-sectors like `tech-semi` under `technology`. stagesJson is a JSON
    // array of { id, name } only on leaf sub-sectors that actually carry
    // value-chain nodes — top-level sectors are organizational.
    //
    // ticker_sectors is many-to-many. One row per (symbol, sectorId); the
    // row with isPrimary=1 is the ticker's dominant sector. Confidence is
    // the Ollama classifier's score (0..1); source identifies who assigned
    // the row (e.g. 'legacy_json' for the backfill, 'ollama_classify' for
    // future classification calls).
    //
    // Existing graph_edge_overrides + graph_node_overrides get a sectorId
    // column so the unified renderer can partition them by sector without
    // re-walking endpoints. The legacy graph_node_overrides.sector text
    // column stays — the bootstrap service maps it to sectorId on first
    // boot and future writes populate both until Phase 2 drops the old
    // column.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sectors (
          id TEXT PRIMARY KEY,
          parentId TEXT,
          name TEXT NOT NULL,
          description TEXT,
          stagesJson TEXT,
          catalogVersion INTEGER NOT NULL DEFAULT 0,
          updatedAt INTEGER NOT NULL,
          FOREIGN KEY (parentId) REFERENCES sectors(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sectors_parent ON sectors(parentId);

        CREATE TABLE IF NOT EXISTS ticker_sectors (
          symbol TEXT NOT NULL,
          sectorId TEXT NOT NULL,
          isPrimary INTEGER NOT NULL DEFAULT 0,
          confidence REAL,
          source TEXT NOT NULL,
          assignedAt INTEGER NOT NULL,
          PRIMARY KEY (symbol, sectorId),
          FOREIGN KEY (sectorId) REFERENCES sectors(id)
        );
        CREATE INDEX IF NOT EXISTS idx_ticker_sectors_sector
          ON ticker_sectors(sectorId);
        CREATE INDEX IF NOT EXISTS idx_ticker_sectors_primary
          ON ticker_sectors(symbol, isPrimary);
      `)

      // Add sectorId to existing override tables. SQLite ALTER TABLE ADD
      // COLUMN is safe (nullable, no default needed).
      const edgeCols = db.prepare(`PRAGMA table_info(graph_edge_overrides)`).all() as Array<{ name: string }>
      if (!edgeCols.some((c) => c.name === 'sectorId')) {
        db.exec(`ALTER TABLE graph_edge_overrides ADD COLUMN sectorId TEXT`)
      }
      const nodeCols = db.prepare(`PRAGMA table_info(graph_node_overrides)`).all() as Array<{ name: string }>
      if (!nodeCols.some((c) => c.name === 'sectorId')) {
        db.exec(`ALTER TABLE graph_node_overrides ADD COLUMN sectorId TEXT`)
      }
    }
  },
  {
    version: 36,
    name: 'create sec_former_names for rebrand-aware name resolution',
    // SEC's submissions JSON for each issuer includes a `formerNames` array
    // listing every legal name the CIK has traded under (e.g. META's CIK
    // shows "FACEBOOK INC" and the dates it was in force). Storing these
    // keyed by CIK + name lets the company-name resolver map old names to
    // the current ticker without hand-curated NAME_ALIASES entries.
    //
    // Keyed by (cik, normalizedName) so the same former name recorded with
    // trivial punctuation differences collapses to one row. fromDate/toDate
    // are the raw strings SEC provides ("2012-05-01") — we don't parse
    // them; the resolver only cares about the current→symbol mapping.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sec_former_names (
          cik TEXT NOT NULL,
          normalizedName TEXT NOT NULL,
          originalName TEXT NOT NULL,
          fromDate TEXT,
          toDate TEXT,
          fetchedAt INTEGER NOT NULL,
          PRIMARY KEY (cik, normalizedName)
        );
        CREATE INDEX IF NOT EXISTS idx_sec_former_names_cik ON sec_former_names(cik);
      `)
    }
  },
  {
    version: 37,
    name: 'create morning_briefs for daily Claude-authored watchlist digest',
    // Single-row-pattern: we only ever care about the most recent brief.
    // Keyed by `id` not date so we can use INSERT-OR-REPLACE on a fixed
    // singleton id (1) — saves a DELETE FROM + INSERT round-trip on
    // each daily refresh and keeps the row count bounded at 1 forever.
    // payloadJson stores the structured sections (headlines / earnings /
    // filings / iv) so the renderer doesn't have to re-parse Claude's
    // markdown. provider records 'claude' vs 'ollama' for telemetry.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS morning_briefs (
          id INTEGER PRIMARY KEY,
          generatedAt INTEGER NOT NULL,
          payloadJson TEXT NOT NULL,
          watchlistSize INTEGER NOT NULL,
          provider TEXT
        );
      `)
    }
  },
  {
    version: 38,
    name: 'create fred_observations + fred_series_meta for FRED macro panel',
    // FRED (Federal Reserve Economic Data) cache. Each series stores the
    // last ~24 months of observations as (seriesId, observationDate, value)
    // rows. observationDate is the FRED-reported date (e.g. '2026-04-15'),
    // not the fetched-at — we keep the original cadence so a daily series
    // shows ~250 points and a monthly series shows ~24.
    //
    // fred_series_meta is one-row-per-series: tracks last successful fetch
    // + the human-readable label / units pulled from the series-info
    // endpoint. Lets the renderer label cards without re-querying FRED.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS fred_observations (
          seriesId TEXT NOT NULL,
          observationDate TEXT NOT NULL,
          value REAL,
          PRIMARY KEY (seriesId, observationDate)
        );
        CREATE INDEX IF NOT EXISTS idx_fred_observations_series
          ON fred_observations(seriesId, observationDate DESC);

        CREATE TABLE IF NOT EXISTS fred_series_meta (
          seriesId TEXT PRIMARY KEY,
          title TEXT,
          units TEXT,
          frequency TEXT,
          lastFetchedAt INTEGER NOT NULL,
          lastObservationDate TEXT,
          fetchError TEXT
        );
      `)
    }
  },
  {
    version: 39,
    name: 'create chain_corrections for user-flagged value chain fixes',
    // User corrections to per-ticker value chains. Each row is one user
    // judgment on a counterparty in a specific focus's chain — "this isn't
    // relevant", "this is a customer not a supplier", etc. Corrections are
    // (1) applied client-side when rendering the focus panel and (2) fed
    // back into the Claude generator prompt as ground-truth on the next
    // regen so the model honors them instead of re-emitting the mistake.
    //
    // PK is (focusSymbol, subjectType, subjectKey, correctionType) — one
    // user can only have one "not-relevant" verdict on a given chip; they
    // can layer "wrong-direction" on top if both apply (rare but possible).
    // correctedValueJson holds the fix payload (e.g., {"direction":"supplier"}
    // or {"relationship":"competitor"}). null when the correction is purely
    // negative (not-relevant).
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chain_corrections (
          focusSymbol TEXT NOT NULL,
          subjectType TEXT NOT NULL,
          subjectKey TEXT NOT NULL,
          correctionType TEXT NOT NULL,
          correctedValueJson TEXT,
          note TEXT,
          createdAt INTEGER NOT NULL,
          appliedAt INTEGER,
          PRIMARY KEY (focusSymbol, subjectType, subjectKey, correctionType)
        );
        CREATE INDEX IF NOT EXISTS idx_chain_corrections_focus
          ON chain_corrections(focusSymbol);
      `)
    }
  },
  {
    version: 40,
    name: 'denormalize chain edges into chain_edge_mentions for fast lookup',
    // getEdgesMentioningSymbol used to run `json_each(c.graphJson, '$.edges')`
    // cross-joined against every company_value_chains row, then JSON-extract
    // each edge — unindexed scan + parse-per-row, called on every chain
    // regen (so once per ticker during boot auto-regen). With 100+ stored
    // chains × dozens of edges this was the slowest read path in the chain
    // pipeline.
    //
    // Denormalize to one row per edge keyed by (sourceFocus, fromSym, toSym,
    // relationship). Two endpoint indexes let "edges mentioning X on either
    // side" run as two indexed lookups. Write-path replaces all rows for a
    // sourceFocus inside the same transaction as setCompanyValueChain so
    // the table can never drift from the JSON source of truth.
    //
    // Backfill: populates from existing graphJson once at end of migration.
    // Subsequent boots are no-ops because writers keep the table fresh.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chain_edge_mentions (
          sourceFocus TEXT NOT NULL,
          fromSym TEXT NOT NULL,
          toSym TEXT NOT NULL,
          relationship TEXT NOT NULL,
          note TEXT,
          PRIMARY KEY (sourceFocus, fromSym, toSym, relationship)
        );
        CREATE INDEX IF NOT EXISTS idx_chain_edge_mentions_from
          ON chain_edge_mentions(fromSym, sourceFocus);
        CREATE INDEX IF NOT EXISTS idx_chain_edge_mentions_to
          ON chain_edge_mentions(toSym, sourceFocus);
      `)

      // Backfill from existing chains. Walks every ready chain row, parses
      // the graphJson, and inserts one mentions row per edge. Wrapped in a
      // transaction for atomicity + speed (single fsync).
      const chains = db
        .prepare<[], { symbol: string; graphJson: string | null }>(
          `SELECT symbol, graphJson FROM company_value_chains
            WHERE status = 'ready' AND graphJson IS NOT NULL`
        )
        .all()
      const insertStmt = db.prepare(
        `INSERT OR IGNORE INTO chain_edge_mentions
           (sourceFocus, fromSym, toSym, relationship, note)
         VALUES (?, ?, ?, ?, ?)`
      )
      const txn = db.transaction(() => {
        for (const c of chains) {
          if (!c.graphJson) continue
          let parsed: { edges?: Array<{ from?: unknown; to?: unknown; relationship?: unknown; note?: unknown }> }
          try {
            parsed = JSON.parse(c.graphJson)
          } catch {
            continue
          }
          if (!Array.isArray(parsed.edges)) continue
          for (const e of parsed.edges) {
            if (typeof e?.from !== 'string' || typeof e?.to !== 'string') continue
            if (typeof e?.relationship !== 'string') continue
            const note = typeof e?.note === 'string' ? e.note : null
            insertStmt.run(
              c.symbol.toUpperCase(),
              e.from.toUpperCase(),
              e.to.toUpperCase(),
              e.relationship,
              note
            )
          }
        }
      })
      txn()
    }
  },
  {
    version: 41,
    name: 'add citationJson column to graph_edge_overrides',
    // Per-edge citation provenance for the unified graph. Edges absorbed
    // from per-ticker chains carry a structured CompanyValueChainEdgeCitation
    // (10-K accession + URL, or article id + url, or model-attribution
    // string). The diagram tooltip + the unified-graph counterparty chips
    // surface these so users can click through from any edge to the actual
    // source document — same UX as the per-ticker chain card.
    //
    // Stored as JSON on a nullable column rather than its own table because
    // (a) it's strictly per-edge metadata with no shared lookup, (b) there's
    // no use-case to query "which edges cite this filing", and (c) edges
    // can be added without overrides ever growing into the millions.
    up: (db) => {
      const cols = db.prepare(`PRAGMA table_info(graph_edge_overrides)`).all() as Array<{
        name: string
      }>
      if (!cols.some((c) => c.name === 'citationJson')) {
        db.exec(`ALTER TABLE graph_edge_overrides ADD COLUMN citationJson TEXT`)
      }
    }
  },
  {
    version: 42,
    name: 'create notification_log for cross-source dedup + throughput cap',
    // Central log of every OS notification dispatched. Keyed by
    // (category, identityKey) so any source — feedPoller, stocksScheduler,
    // sportsAlerts, etc. — can call dispatchNotification() with a stable
    // identity and the central service short-circuits if we've already
    // notified about this event. Also serves as the rolling window for the
    // daily cap (count rows where sentAt > now - 24h).
    //
    // identityKey shapes by category:
    //   article:42                            — by article id
    //   stock-daily:AAPL:2026-04-25           — daily-move alert per ticker per market day
    //   stock-intraday:AAPL:2026-04-25:1030   — intraday spike per ticker per minute window
    //   stock-52wh:AAPL:2026-04-25            — 52-week high touch
    //   sport-hr:GAMEID:HRID                  — baseball HR (per home-run event)
    //   sport-goal:GAMEID:GOALID              — soccer goal
    //   sport-milestone:LEBRON:GAMEID:30PTS   — NBA player milestone
    //   filing:AAPL:0000320193-24-000123      — SEC filing accession
    //   analyst:AAPL:2026-04-25:UG-MS         — analyst upgrade/downgrade
    //   macro:VIX:2026-04-25:spike            — macro shock
    //
    // payloadJson preserves the OS notification body so a future "in-app
    // notification feed" view can replay history without re-fetching from
    // the source tables.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notification_log (
          category TEXT NOT NULL,
          identityKey TEXT NOT NULL,
          sentAt INTEGER NOT NULL,
          payloadJson TEXT,
          PRIMARY KEY (category, identityKey)
        );
        CREATE INDEX IF NOT EXISTS idx_notification_log_sentAt
          ON notification_log(sentAt DESC);
      `)
    }
  },
  {
    version: 43,
    name: 're-seed defaultFeeds.json — adds Bloomberg, WSJ, CNBC, FT, FreightWaves',
    // Default-feed inserts use INSERT OR IGNORE keyed on the (title, url)
    // unique constraint, so this safely no-ops on rows that already exist
    // and inserts the new finance + supply-chain feeds for existing users.
    // New installs pick these up via migration v3 / v5 reading the same
    // JSON. Without this re-seed, only fresh installs would get the new
    // feeds; existing users would never see Bloomberg/WSJ/etc. unless
    // they added them by hand.
    up: (db) => {
      const findCategory = db.prepare<[string, string], { id: number }>(
        `SELECT id FROM categories WHERE name = ? AND domain = ?`
      )
      const insert = db.prepare(
        `INSERT OR IGNORE INTO feeds (title, url, categoryId, isEnabled) VALUES (?, ?, ?, 1)`
      )
      for (const feed of defaultFeeds as DefaultFeed[]) {
        const cat = findCategory.get(feed.category, feed.domain)
        if (!cat) continue
        insert.run(feed.title, feed.url, cat.id)
      }
    }
  },
  {
    version: 44,
    name: 'research_topics + research_briefs (saved-topic synthesis)',
    // Two new tables that back the Research tab's saved-topic feature.
    // research_topics: user-facing list of saved keyword searches,
    // each one paired with a label for display. Briefs regenerate
    // weekly via researchScheduler; we cache the latest in
    // research_briefs keyed by topicId so the UI can render
    // immediately on tab open without waiting for a re-fetch.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS research_topics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL,
          label TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          lastBriefAt INTEGER
        );
        CREATE TABLE IF NOT EXISTS research_briefs (
          topicId INTEGER PRIMARY KEY,
          generatedAt INTEGER NOT NULL,
          payloadJson TEXT NOT NULL,
          paperIdsJson TEXT NOT NULL,
          FOREIGN KEY (topicId) REFERENCES research_topics(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_research_topics_createdAt
          ON research_topics(createdAt DESC);
      `)
    }
  },
  {
    version: 45,
    name: 'invalidate company_profiles for HQ/country prompt update',
    // The describeCompany prompt now requires the HQ country/city in the
    // one-sentence description. Existing cached profiles were generated
    // under the old prompt and won't include location, so wipe them and
    // let prefetchAllCompanyProfiles repopulate on next boot. Cheap —
    // each profile is one local Ollama call and the prefetcher is bounded
    // to one ticker at a time so it doesn't compete with interactive work.
    up: (db) => {
      db.exec(`DELETE FROM company_profiles;`)
    }
  },
  {
    version: 46,
    name: 'index discovery_suggestions.createdAt',
    // Both `listSuggestions` (ORDER BY createdAt DESC) and `clearOlderThan`
    // (WHERE createdAt < ?) on this table did full scans. The table is small
    // today, but the three sweep paths (daily/weekly/portfolio-gaps) write
    // rows continuously, and both queries fire on every Discovery focus +
    // every maintenance pass. Same shape that `notification_log` and
    // `reader_cache` already index.
    up: (db) => {
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_discovery_suggestions_createdAt
         ON discovery_suggestions(createdAt DESC);`
      )
    }
  },
  {
    version: 47,
    name: 'index sec_cik_map.cik for former-names join',
    // companyNameResolver.loadIndex joins sec_former_names to sec_cik_map
    // on cik to produce the rebrand-aware name index. sec_cik_map's only
    // index was its PK on `symbol`, so the join did a full scan per row.
    // With sec_former_names now populated, regen-all (~30 nodes × ~60
    // chains = ~1800 calls) compounded the cost noticeably. Adding the
    // cik index makes the join indexed even on cold first call.
    up: (db) => {
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_sec_cik_map_cik
         ON sec_cik_map(cik);`
      )
    }
  },
  {
    version: 48,
    name: 'research_bookmarks',
    // Per-paper bookmarks for the Research tab. Stores the full
    // ResearchPaper JSON so the Bookmarks view can render without
    // re-hitting Semantic Scholar (wasted RPS budget + unreliable when
    // we're rate-limited). paperId is S2's stable identifier — same
    // key the citation-lineage panel uses.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS research_bookmarks (
          paperId TEXT PRIMARY KEY,
          savedAt INTEGER NOT NULL,
          paperJson TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_research_bookmarks_savedAt
          ON research_bookmarks(savedAt DESC);
      `)
    }
  },
  {
    version: 49,
    name: 'research_paper_foundational',
    // Per-paper cache of "foundational" references — the ~3-7 refs S2
    // marks isInfluential=true AND tags with intents in {background,
    // methodology, extension}. Approximates "papers explicitly named
    // in intro/related-works as the basis for this work."
    //
    // Cached locally because (a) we auto-fetch on bookmark to populate
    // before the user opens detail, (b) the inverse query — "which of
    // my bookmarks list paper X as foundational" — needs to walk every
    // bookmark's cache without paying per-call S2 latency. Stores the
    // full hydrated ResearchPaper[] JSON so the "Built on" list renders
    // with no extra fetches.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS research_paper_foundational (
          paperId TEXT PRIMARY KEY,
          foundationalJson TEXT NOT NULL,
          fetchedAt INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_research_paper_foundational_fetchedAt
          ON research_paper_foundational(fetchedAt);
      `)
    }
  }
]
