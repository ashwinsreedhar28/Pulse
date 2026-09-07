# Pulse

A private news and intelligence dashboard for macOS that lives in your menu bar. No accounts, no cloud sync, no telemetry — your data is stored only on your machine and is never synced anywhere.

Note that "private" means storage and identity, not network isolation. Pulse fetches from the public sources it aggregates (Yahoo Finance, SEC EDGAR, FRED, Semantic Scholar, OpenAlex, arXiv, ESPN, Nasdaq, Wikipedia, and your RSS feeds), and when the Claude provider is enabled it sends article and paper text to `api.anthropic.com` for summarization. Set `aiProvider` to `ollama` in Settings to keep all inference local.

I built Pulse because every reader I tried either treated my stock portfolio and my regular news habit as two different apps, or threw it all into one firehose with no sense of what actually mattered. Pulse does both at once and tries to tell you when something's worth your attention.

## What's in it

**Finance.** Add tickers you hold or care about, subscribe to the usual suspects (Bloomberg, Reuters, trade press), and the app scores new articles against your watchlist. You get per-ticker article rollups, Stooq quotes on a market-aware schedule (active during trading hours, hourly overnight, every 6h on weekends), auto-generated company write-ups, and a discovery panel that surfaces adjacent companies showing up in your feeds.

**News.** Add geographic interests — countries, states, cities — and topic areas. Same urgency treatment. If something breaking hits a place you follow, you'll know; if it's routine coverage, it stays in the background where it belongs.

**Sports.** Follow teams and athletes across NFL, NBA, NHL, MLB, college football, and English football. Pre-game, live, and final box scores with linescores, player stats, and embedded YouTube highlights for finished games. Optional notification when your team scores — the notification pill uses the scoring team's actual colors.

**A few extras that kept creeping in:**

- **Reader mode** — strips chrome, ads, and trackers. Cached for 7 days so reopening is instant.
- **Smart lookup** — highlight any term anywhere in the app and get a Wikipedia summary, or an Ollama-generated definition if Wikipedia doesn't cover it. Context-aware for ambiguous terms (so "Jordan" in an NBA article gets you Michael Jordan, not the country).
- **Hyperintelligence** — describe a topic in plain English and the app suggests RSS feeds, probes them to confirm they're live, and lets you add with one click.
- **Reels** — optional 30-second AI-generated video summaries of articles, using local TTS and image generation. Entirely offline.

## Running it

```bash
npm install
npm run dev
```

The app seeds default feeds, tickers, and locations on first launch. Close the window and it sticks around in the menu bar; ⌘Q quits fully.

**Ollama is optional but makes a lot of things better.** Without it, urgency scoring falls back to keywords only, and Hyperintelligence / discovery / smart-lookup-for-obscure-terms stop working. With it, the app uses a local model (default: `mistral:7b`, override with `PULSE_OLLAMA_MODEL`) for everything keywords can't catch. Grab Ollama from [ollama.ai](https://ollama.ai), then `ollama pull mistral`.

## How it's built

- Electron + Vite + React 18 + TypeScript + Tailwind
- `better-sqlite3` for all persistence (single file at `~/Library/Application Support/Pulse/pulse.db`)
- Main process handles feed polling, Ollama calls, notifications, scheduling — renderer is pure UI
- `contextBridge` with a typed preload API; no direct `ipcRenderer` in components
- `@mozilla/readability` + `jsdom` + `DOMPurify` for reader mode
- `@ghostery/adblocker-electron` on every session for network-level blocking
- Optional Python workers for TTS (Kokoro, Piper) and video generation (SDXL)

## Commands

```
npm run dev        # hot-reload dev
npm run build      # production build
npm run package    # electron-builder -> dist/mac-arm64/Pulse.app (target is `dir`; no .dmg)
npm run lint
npm test
```

## Status

Stages 1–13 done, including packaging. Since then: the stock value-chain graph, a 3D market graph, the research/paper subsystem with a semantic layer, SEC and FRED ingestion, and the Phase A1 trading research under `trading/`.

See `CLAUDE.md` for the architecture map, `BUGS.md` for known issues, and `trading/PHASE_A1_RESULT.md` for where the signal research stands.
