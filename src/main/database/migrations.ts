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
  }
]
