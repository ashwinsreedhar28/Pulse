"""Experiment 3 content extraction from GDELT GKG (BigQuery, ADC; see PREREG_EXP3_DRAFT.md).

    python bench/exp3_extract.py --dry-run     # exact bytes for both queries, free
    python bench/exp3_extract.py               # run (capped: tone 200 GB, titles 280 GB)

(a) tone: per held ticker per UTC day 2017-2024, docs matched by the v2 org patterns
    (src/data/gdeltOrgPatterns.json): n docs, mean/sd tone, mean positive, negative, polarity (V2Tone
    fields 0-3). -> bench/data/gkg_tone_daily.csv
(b) titles: per held ticker per UTC day 2021-2024, distinct page titles (Extras <PAGE_TITLE>, case-folded
    and trimmed, >= 15 chars) with first-seen UTC time and doc count; at most 30 per ticker-day chosen by
    FARM_FINGERPRINT(title) (deterministic), plus the uncapped distinct-title count.
    -> bench/data/gkg_titles.csv
"""
import argparse
import csv
import json
import os

from google.cloud import bigquery

HERE = os.path.dirname(os.path.abspath(__file__))
PATTERNS = json.load(open(os.path.join(HERE, "..", "src", "data", "gdeltOrgPatterns.json")))["patterns"]

TONE_SQL = r"""
WITH q AS (SELECT s.symbol, s.re FROM UNNEST(@q) AS s),
g AS (
  SELECT DATE(PARSE_TIMESTAMP('%Y%m%d%H%M%S', CAST(`DATE` AS STRING))) AS day,
         LOWER(Organizations) AS orgs, SPLIT(V2Tone, ',') AS t
  FROM `gdelt-bq.gdeltv2.gkg_partitioned`
  WHERE _PARTITIONTIME >= TIMESTAMP('2016-12-31') AND _PARTITIONTIME < TIMESTAMP('2025-01-02')
    AND REGEXP_CONTAINS(LOWER(Organizations), @combined)
)
SELECT q.symbol, FORMAT_DATE('%Y-%m-%d', g.day) AS day, COUNT(*) AS n,
  AVG(SAFE_CAST(g.t[SAFE_OFFSET(0)] AS FLOAT64)) AS tone,
  STDDEV(SAFE_CAST(g.t[SAFE_OFFSET(0)] AS FLOAT64)) AS tone_sd,
  AVG(SAFE_CAST(g.t[SAFE_OFFSET(1)] AS FLOAT64)) AS pos,
  AVG(SAFE_CAST(g.t[SAFE_OFFSET(2)] AS FLOAT64)) AS neg,
  AVG(SAFE_CAST(g.t[SAFE_OFFSET(3)] AS FLOAT64)) AS polarity
FROM g CROSS JOIN q
WHERE g.day >= '2017-01-01' AND g.day < '2025-01-01' AND REGEXP_CONTAINS(g.orgs, q.re)
GROUP BY 1, 2
"""

TITLES_SQL = r"""
WITH q AS (SELECT s.symbol, s.re FROM UNNEST(@q) AS s),
g AS (
  SELECT PARSE_TIMESTAMP('%Y%m%d%H%M%S', CAST(`DATE` AS STRING)) AS ts, LOWER(Organizations) AS orgs,
         TRIM(REGEXP_EXTRACT(Extras, r'<PAGE_TITLE>(.*?)</PAGE_TITLE>')) AS title
  FROM `gdelt-bq.gdeltv2.gkg_partitioned`
  WHERE _PARTITIONTIME >= TIMESTAMP('2020-12-31') AND _PARTITIONTIME < TIMESTAMP('2025-01-02')
    AND REGEXP_CONTAINS(LOWER(Organizations), @combined)
),
m AS (
  SELECT q.symbol, DATE(g.ts) AS day, LOWER(g.title) AS k, ANY_VALUE(g.title) AS title,
         MIN(g.ts) AS first_seen, COUNT(*) AS n_docs
  FROM g CROSS JOIN q
  WHERE DATE(g.ts) >= '2021-01-01' AND DATE(g.ts) < '2025-01-01'
    AND g.title IS NOT NULL AND LENGTH(g.title) >= 15 AND REGEXP_CONTAINS(g.orgs, q.re)
  GROUP BY 1, 2, 3
)
SELECT symbol, FORMAT_DATE('%Y-%m-%d', day) AS day, title,
       FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', first_seen) AS first_seen, n_docs,
       COUNT(*) OVER (PARTITION BY symbol, day) AS n_titles_day
FROM m
WHERE TRUE
QUALIFY ROW_NUMBER() OVER (PARTITION BY symbol, day ORDER BY FARM_FINGERPRINT(k)) <= 30
"""

JOBS = [("tone", TONE_SQL, 200e9, "gkg_tone_daily.csv"), ("titles", TITLES_SQL, 280e9, "gkg_titles.csv")]


def params():
    syms = sorted(PATTERNS)
    q = [bigquery.StructQueryParameter(None, bigquery.ScalarQueryParameter("symbol", "STRING", s),
                                       bigquery.ScalarQueryParameter("re", "STRING", PATTERNS[s])) for s in syms]
    return [bigquery.ArrayQueryParameter("q", "STRUCT", q),
            bigquery.ScalarQueryParameter("combined", "STRING", "|".join(PATTERNS[s] for s in syms))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", choices=["tone", "titles"])
    a = ap.parse_args()
    client = bigquery.Client(project=os.environ.get("PULSE_BQ_PROJECT") or None)
    for name, sql, cap, out in JOBS:
        if a.only and a.only != name:
            continue
        cfg = bigquery.QueryJobConfig(query_parameters=params(), dry_run=a.dry_run, use_query_cache=False,
                                      maximum_bytes_billed=int(cap))
        job = client.query(sql, job_config=cfg)
        if a.dry_run:
            print(f"{name}: would process {job.total_bytes_processed / 1e9:.1f} GB (cap {cap / 1e9:.0f} GB)")
            continue
        path = os.path.join(HERE, "data", out)
        n = 0
        with open(path, "w", newline="") as f:
            w = None
            for row in job.result(page_size=50_000):
                if w is None:
                    w = csv.writer(f)
                    w.writerow(list(row.keys()))
                w.writerow(list(row.values()))
                n += 1
                if n % 200_000 == 0:
                    print(f"  {name}: {n:,} rows", flush=True)
        print(f"{name}: {n:,} rows -> {path}; processed {job.total_bytes_processed / 1e9:.1f} GB, "
              f"billed {(job.total_bytes_billed or 0) / 1e9:.1f} GB", flush=True)


if __name__ == "__main__":
    main()
