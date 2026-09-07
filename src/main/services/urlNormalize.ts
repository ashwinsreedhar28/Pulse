// Canonical form of an article URL, used as the cross-feed dedup key
// (migration v56).
//
// Two separate problems to collapse:
//   1. The same story syndicated to several feeds — identical URL, different
//      feedId, so the old (feedId, COALESCE(guid,url)) index let all of them
//      through.
//   2. The same story with rotating tracking parameters, which would defeat
//      even a plain URL comparison.

// Query parameters that only identify the referrer/campaign and never change
// which document is served. Anything not on this list is preserved — plenty
// of publishers route real content through query params (?id=, ?p=, ?story=),
// and stripping the whole query string would collide unrelated articles.
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_brand',
  'utm_social',
  'utm_social-type',
  'ref',
  'ref_src',
  'referrer',
  'source',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'cmpid',
  'ncid',
  'partner',
  'sh',
  'yptr',
  'guccounter',
  'guce_referrer',
  'guce_referrer_sig',
  '__source',
  'taid'
])

export function normalizeArticleUrl(raw: string): string {
  const input = (raw ?? '').trim()
  if (!input) return input
  try {
    const u = new URL(input)

    // Scheme/host are case-insensitive; path is not. Normalizing the host
    // stops http/https and Host/host variants from splitting a story.
    u.protocol = u.protocol.toLowerCase()
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '')

    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key)
    }
    // Stable param order so ?a=1&b=2 and ?b=2&a=1 agree.
    u.searchParams.sort()

    // Fragments never select a different document.
    u.hash = ''

    // Trailing slash is not meaningful for article paths, but "/" alone is.
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }

    return u.toString()
  } catch {
    // Not a parseable absolute URL (relative link, malformed feed entry).
    // Fall back to the raw string so the caller still gets a usable key.
    return input
  }
}
