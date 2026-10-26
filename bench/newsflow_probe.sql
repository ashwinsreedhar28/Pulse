-- Step 2 probe: shape of the news-flow panel. Read-only. Days are Mac local time (ET).
.headers on
.mode column
SELECT '== 1. corpus' AS section;
SELECT 'archive' AS src, COUNT(*) AS n, SUM(publishedAt IS NULL) AS null_pub,
  date(MIN(publishedAt)/1000,'unixepoch','localtime') AS first_pub, date(MAX(publishedAt)/1000,'unixepoch','localtime') AS last_pub,
  date(MIN(archivedAt)/1000,'unixepoch','localtime') AS first_ingest,
  SUM(urgencyScore IS NULL) AS null_score, SUM(urgencyScore >= 4) AS ge4
FROM articles_archive
UNION ALL
SELECT 'live', COUNT(*), SUM(publishedAt IS NULL),
  date(MIN(publishedAt)/1000,'unixepoch','localtime'), date(MAX(publishedAt)/1000,'unixepoch','localtime'),
  NULL, SUM(urgencyScore IS NULL), SUM(urgencyScore >= 4)
FROM articles;
SELECT COUNT(*) AS tickers, SUM(isActive) AS held FROM tickers;

SELECT '== 2. score source x score (archive)' AS section;
SELECT CASE WHEN urgencyReason LIKE 'AI(runpod)%' THEN 'runpod' WHEN urgencyReason LIKE 'AI(ollama)%' THEN 'ollama'
            WHEN urgencyReason LIKE 'AI%' THEN 'ai-other' WHEN urgencyReason IS NULL THEN 'null' ELSE 'keyword' END AS src,
       urgencyScore AS score, COUNT(*) AS n
FROM articles_archive GROUP BY 1, 2 ORDER BY 1, 2;

SELECT '== 3. per day (by publishedAt): all, finance, held-strong, scored, ingested' AS section;
WITH held AS (SELECT symbol FROM tickers WHERE isActive = 1),
hs AS (SELECT DISTINCT m.articleId FROM article_ticker_matches_archive m JOIN held USING (symbol) WHERE m.strength = 'strong'),
pub AS (SELECT date(publishedAt/1000,'unixepoch','localtime') AS d, COUNT(*) AS n_all, SUM(domain = 'finance') AS n_fin,
          SUM(id IN (SELECT articleId FROM hs)) AS n_held_strong, SUM(urgencyScore IS NOT NULL) AS n_scored
        FROM articles_archive WHERE publishedAt IS NOT NULL GROUP BY 1),
ing AS (SELECT date(archivedAt/1000,'unixepoch','localtime') AS d, COUNT(*) AS n_ingested FROM articles_archive GROUP BY 1)
SELECT pub.*, COALESCE(ing.n_ingested, 0) AS n_ingested FROM pub LEFT JOIN ing USING (d)
WHERE pub.d >= (SELECT date(MIN(archivedAt)/1000,'unixepoch','localtime','-14 days') FROM articles_archive)
ORDER BY pub.d;

SELECT '== 4. per held ticker (strong matches, archive)' AS section;
SELECT t.symbol, COUNT(a.id) AS n_strong, COUNT(DISTINCT lower(trim(a.title))) AS n_title_dedup,
  COUNT(DISTINCT date(a.publishedAt/1000,'unixepoch','localtime')) AS days_w_news,
  date(MIN(a.publishedAt)/1000,'unixepoch','localtime') AS first, SUM(a.urgencyScore >= 4) AS ge4,
  (SELECT COUNT(*) FROM article_ticker_matches_archive w WHERE w.symbol = t.symbol AND w.strength = 'weak') AS n_weak
FROM tickers t
LEFT JOIN article_ticker_matches_archive m ON m.symbol = t.symbol AND m.strength = 'strong'
LEFT JOIN articles_archive a ON a.id = m.articleId
WHERE t.isActive = 1 GROUP BY t.symbol ORDER BY n_strong DESC;

SELECT '== 5. earnings_releases' AS section;
SELECT status, COUNT(*) AS n, COUNT(DISTINCT symbol) AS symbols, SUM(symbol IN (SELECT symbol FROM tickers WHERE isActive = 1)) AS held_rows,
  date(MIN(filedAt)/1000,'unixepoch','localtime') AS first, date(MAX(filedAt)/1000,'unixepoch','localtime') AS last
FROM earnings_releases GROUP BY status;
