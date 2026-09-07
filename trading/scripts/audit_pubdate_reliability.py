#!/usr/bin/env python3
"""A1.1 — feed pubDate reliability audit.

Event studies live or die on timestamp accuracy. If a feed's pubDate is
systematically late, "forward" returns silently include some of the move the
news already caused, and the study measures its own lag rather than any
signal.

For a sample of articles per feed, fetch the page and extract the publisher's
own timestamp (`article:published_time`, JSON-LD `datePublished`, or a
`<time datetime>`), then compare against the RSS pubDate. Feeds are tiered:

  Tier 1  median |delta| < 5 min  and p90 < 15 min  — safe for timing
  Tier 2  median |delta| < 30 min                   — usable with caveats
  Tier 3  anything else                             — content only

Results are stored per article so re-runs extend coverage instead of
re-scraping, and tiers land in trading_feed_timing rather than mutating
Pulse's own feeds table.

Deliberately slow: one request at a time with a delay. This hits publisher
sites we don't control, and the whole point of the exercise is a careful
measurement, not a fast one.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.db import connect  # noqa: E402

SAMPLE_PER_FEED = 25
REQUEST_DELAY_S = 1.0
TIMEOUT_S = 12
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15"

META_PATTERNS = [
    re.compile(
        r'<meta[^>]+property=["\']article:published_time["\'][^>]+content=["\']([^"\']+)',
        re.I,
    ),
    re.compile(
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']article:published_time["\']',
        re.I,
    ),
    re.compile(r'<time[^>]+datetime=["\']([^"\']+)', re.I),
]
JSONLD = re.compile(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.S | re.I)


def parse_iso(s: str) -> datetime | None:
    s = s.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def extract_published(html: str) -> tuple[datetime | None, str]:
    for i, pat in enumerate(META_PATTERNS):
        m = pat.search(html)
        if m:
            dt = parse_iso(m.group(1))
            if dt:
                return dt, f"meta{i}"
    for block in JSONLD.findall(html):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if not isinstance(item, dict):
                continue
            for key in ("datePublished", "dateCreated"):
                if key in item:
                    dt = parse_iso(str(item[key]))
                    if dt:
                        return dt, "jsonld"
    return None, "none"


def fetch(url: str) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return resp.read(400_000).decode("utf-8", errors="ignore")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        return None


def percentile(xs: list[float], p: float) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    i = min(int(len(s) * p), len(s) - 1)
    return s[i]


def main() -> int:
    conn = connect()
    now = int(datetime.now(tz=timezone.utc).timestamp() * 1000)

    # Only articles we haven't audited yet, newest first.
    rows = conn.execute(
        """
        SELECT a.id, a.feedId, a.url, a.publishedAt
          FROM articles_archive a
          LEFT JOIN trading_article_pubdate_audit t ON t.articleId = a.id
         WHERE a.publishedAt IS NOT NULL AND t.articleId IS NULL
         ORDER BY a.publishedAt DESC
        """
    ).fetchall()
    if not rows:
        print("Nothing new to audit.")
        return 0

    by_feed: dict[int, list] = defaultdict(list)
    for r in rows:
        if len(by_feed[r["feedId"]]) < SAMPLE_PER_FEED:
            by_feed[r["feedId"]].append(r)

    total = sum(len(v) for v in by_feed.values())
    print(f"auditing {total} articles across {len(by_feed)} feeds (~{total * REQUEST_DELAY_S / 60:.0f} min)")

    deltas: dict[int, list[float]] = defaultdict(list)
    audited = 0
    for feed_id, sample in by_feed.items():
        for r in sample:
            html = fetch(r["url"])
            time.sleep(REQUEST_DELAY_S)
            audited += 1
            if html is None:
                conn.execute(
                    """INSERT OR REPLACE INTO trading_article_pubdate_audit
                       (articleId, scrapedPubDateMs, scrapeMethod, scrapeOk, errorMsg, scrapedAt)
                       VALUES (?, NULL, NULL, 0, 'fetch failed', ?)""",
                    (r["id"], now),
                )
                continue
            dt, method = extract_published(html)
            if dt is None:
                conn.execute(
                    """INSERT OR REPLACE INTO trading_article_pubdate_audit
                       (articleId, scrapedPubDateMs, scrapeMethod, scrapeOk, errorMsg, scrapedAt)
                       VALUES (?, NULL, ?, 0, 'no timestamp found', ?)""",
                    (r["id"], method, now),
                )
                continue
            scraped_ms = int(dt.timestamp() * 1000)
            conn.execute(
                """INSERT OR REPLACE INTO trading_article_pubdate_audit
                   (articleId, scrapedPubDateMs, scrapeMethod, scrapeOk, errorMsg, scrapedAt)
                   VALUES (?, ?, ?, 1, NULL, ?)""",
                (r["id"], scraped_ms, method, now),
            )
            deltas[feed_id].append((r["publishedAt"] - scraped_ms) / 1000.0)
        conn.commit()
        print(f"  feed {feed_id}: {len(deltas[feed_id])}/{len(sample)} resolved")

    feeds = {r["id"]: r["title"] for r in conn.execute("SELECT id, title FROM feeds")}
    lines = [
        "# Phase A1.1 — feed pubDate reliability",
        "",
        f"Generated {datetime.now(tz=timezone.utc).isoformat(timespec='seconds')}",
        "",
        "Delta = RSS pubDate minus the publisher's own timestamp. Positive means",
        "the feed reports the story as *later* than the page does.",
        "",
        "| feed | n | median | p90 | >5min | tier |",
        "|---|---|---|---|---|---|",
    ]
    for feed_id, ds in sorted(deltas.items(), key=lambda kv: -len(kv[1])):
        if not ds:
            continue
        absd = [abs(d) for d in ds]
        med = percentile(absd, 0.5)
        p90 = percentile(absd, 0.9)
        over = sum(1 for d in absd if d > 300) / len(absd)
        tier = 1 if med < 300 and p90 < 900 else (2 if med < 1800 else 3)
        conn.execute(
            """INSERT INTO trading_feed_timing
                 (feedId, tier, sampleSize, medianDeltaSec, p90DeltaSec, fractionOver5min, note, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
               ON CONFLICT(feedId) DO UPDATE SET
                 tier=excluded.tier, sampleSize=excluded.sampleSize,
                 medianDeltaSec=excluded.medianDeltaSec, p90DeltaSec=excluded.p90DeltaSec,
                 fractionOver5min=excluded.fractionOver5min, updatedAt=excluded.updatedAt""",
            (feed_id, tier, len(ds), int(med), int(p90), over, now),
        )
        lines.append(
            f"| {feeds.get(feed_id, feed_id)} | {len(ds)} | {med:.0f}s | {p90:.0f}s "
            f"| {over*100:.0f}% | {tier} |"
        )
    conn.commit()

    lines += [
        "",
        "Tier 1: median < 5 min and p90 < 15 min — safe for timing-sensitive work.",
        "Tier 2: median < 30 min — usable with a flag.",
        "Tier 3: content only; do not use for event timing.",
        "",
        "Note: SEC filings sidestep this entirely. `sec_filings.filedAt` is a",
        "legally exact timestamp, which is why the 8-K event study is better",
        "grounded than anything built on RSS pubDate.",
        "",
    ]
    out = Path(__file__).resolve().parents[1] / "reports"
    out.mkdir(exist_ok=True)
    (out / "feed_reliability.md").write_text("\n".join(lines))
    print(f"audited {audited} · wrote {out / 'feed_reliability.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
