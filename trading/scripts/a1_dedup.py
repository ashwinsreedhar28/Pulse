#!/usr/bin/env python3
"""A1.4 — first-mention deduplication.

Repeat coverage of one event is the biggest confound in a news event study.
If a story is carried by eight outlets, a naive study counts eight
observations of what is really one piece of information, and the resulting
t-statistics are inflated by roughly sqrt(8) for no reason.

Two passes:

  1. Exact-URL duplicates. Pulse now dedups these at ingest (migration v56,
     UNIQUE on normalizedUrl), but rows archived before that still carry
     them, so the pass stays.
  2. Near-duplicate titles within a (symbol, day) bucket, via TF-IDF cosine.
     Different outlets rewrite the headline but keep most of the noun phrases.

The earliest article in each cluster is the first-mention; the rest are
flagged. A1.3 then reports metrics both with and without them, because
whether the signal *sharpens* on first-mentions is itself the finding — if
novelty matters, first-mention t-stats should be higher.

Idempotent: re-running recomputes and upserts.
"""

from __future__ import annotations

import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.db import connect, load_events  # noqa: E402

# Cosine similarity above which two same-day headlines about the same ticker
# are treated as the same story. 0.7 is the brief's figure; spot-checked
# against real Nasdaq/Yahoo syndication, where rewrites of one market wrap
# land around 0.75-0.9 and genuinely different stories sit well below 0.5.
SIMILARITY_THRESHOLD = 0.7


def day_key(published_ms: int) -> str:
    return datetime.fromtimestamp(published_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def main() -> int:
    conn = connect()
    events = load_events(conn)
    if not events:
        print("No events found. Has Pulse run and archived any articles?")
        return 1

    # Bucket by (symbol, day). Cross-day clustering would merge a genuine
    # follow-up story with its original, which is a different event.
    buckets: dict[tuple[str, str], list] = defaultdict(list)
    for e in events:
        buckets[(e["symbol"], day_key(e["publishedAt"]))].append(e)

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
    except ImportError:
        print("scikit-learn missing. Run: pip install -r trading/requirements.txt")
        return 1

    rows: list[tuple] = []
    now = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    clustered = 0

    for (symbol, day), group in buckets.items():
        group.sort(key=lambda r: (r["publishedAt"], r["articleId"]))

        if len(group) == 1:
            e = group[0]
            rows.append((e["articleId"], symbol, 0, f"{symbol}:{day}:0", e["articleId"], now))
            continue

        titles = [(e["title"] or "") for e in group]
        try:
            tfidf = TfidfVectorizer(stop_words="english", min_df=1).fit_transform(titles)
            sim = cosine_similarity(tfidf)
        except ValueError:
            # Every title reduced to stop words — treat all as distinct.
            for i, e in enumerate(group):
                rows.append(
                    (e["articleId"], symbol, 0, f"{symbol}:{day}:{i}", e["articleId"], now)
                )
            continue

        # Single-link agglomeration in publish order. The first unassigned
        # article seeds a cluster and absorbs every later one above threshold,
        # so the cluster representative is always the earliest — which is the
        # definition of first-mention.
        assigned: dict[int, int] = {}
        for i in range(len(group)):
            if i in assigned:
                continue
            assigned[i] = i
            for j in range(i + 1, len(group)):
                if j not in assigned and sim[i, j] >= SIMILARITY_THRESHOLD:
                    assigned[j] = i

        for i, e in enumerate(group):
            head = assigned[i]
            is_dup = 1 if head != i else 0
            clustered += is_dup
            rows.append(
                (
                    e["articleId"],
                    symbol,
                    is_dup,
                    f"{symbol}:{day}:{head}",
                    group[head]["articleId"],
                    now,
                )
            )

    conn.executemany(
        """
        INSERT INTO trading_article_dedup
          (articleId, symbol, isDuplicate, clusterKey, firstMentionArticleId, computedAt)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(articleId, symbol) DO UPDATE SET
          isDuplicate = excluded.isDuplicate,
          clusterKey = excluded.clusterKey,
          firstMentionArticleId = excluded.firstMentionArticleId,
          computedAt = excluded.computedAt
        """,
        rows,
    )
    conn.commit()

    total = len(rows)
    print(f"events:          {total}")
    print(f"first-mentions:  {total - clustered}")
    print(f"duplicates:      {clustered} ({100 * clustered / total:.1f}%)")
    print(f"buckets:         {len(buckets)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
