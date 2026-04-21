# Default Curated Feeds

Ship the app pre-configured with the feeds below. Research and verify each RSS URL is live at scaffold time; substitute the closest alternative if a feed is down. Add other high-quality sources discovered during research that fit the user's interests.

Once `src/data/defaultFeeds.json` exists (Stage 3), port this list into JSON with fields `{ title, url, category, domain }` where `domain` is `"finance"` or `"general"`.

## Finance domain

### Semiconductors & Tech
- SemiAnalysis (semianalysis.com)
- AnandTech / Tom's Hardware RSS
- EE Times (eetimes.com)
- SEMI.org news
- The Register — Data Centre / Hardware
- Ars Technica — Tech Policy
- Reuters Technology
- Bloomberg Technology (if available via RSS)
- ASML blog/newsroom
- TSMC newsroom
- NVIDIA blog

### Defense & Aerospace
- Defense News (defensenews.com)
- Breaking Defense
- The War Zone (thedrive.com/the-war-zone)
- Janes (janes.com)

### Mining & Materials
- Mining.com
- Reuters Commodities
- Investing.com — Commodities RSS

### General Financial
- Seeking Alpha (if RSS available)
- MarketWatch
- Yahoo Finance RSS

## General news domain

### Geopolitics / US Policy
- Reuters World News
- AP News — World
- AP News — US Politics
- Foreign Policy
- CSIS (Center for Strategic and International Studies)
- The Diplomat (for Indo-Pacific geopolitics)
- Nikkei Asia
- Politico
- The Hill
- NPR Politics
- BBC News — US & Canada
- Al Jazeera English

### Space Exploration
- NASA Spaceflight (nasaspaceflight.com)
- SpaceNews
- ESA news
- Ars Technica — Space
- Planetary Society blog
- Space.com
- SpaceX updates (if RSS available)

### World Events
- Reuters World
- BBC World News
- AP News — International
- The Guardian — World

### Local & Regional News
Ship with a few defaults (e.g., AP News regional feeds, local NPR affiliate feeds). This category is primarily user-driven — the user configures geographic areas of interest and the app suggests/auto-discovers relevant local feeds.
