import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  ipcMain,
  nativeTheme,
  shell,
  protocol,
  net,
  dialog
} from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { initDatabase, closeDatabase } from './database/connection'
import { bootstrapSectorCatalog } from './services/sectorService'
import { seedSectorUniverse, sectorCoverage } from './services/sectorUniverseService'
import {
  backfillPassiveTickersForAbsorbedNodes,
  repopulateAbsorbedSectorIds
} from './services/chainAbsorberService'
import { registerDbIpc } from './ipc/handlers'
import {
  startPolling,
  stopPolling,
  pollAllFeeds,
  backfillArticleTickerMatches
} from './services/feedPoller'
import { rescoreArticles } from './database/articles'
import { buildUrgencyContext, scoreArticle } from './services/urgencyScorer'
import { initAdblocker, registerAdblockerHooks } from './services/adblockerService'
import {
  setWindowOpener,
  startDigestTimer,
  stopDigestTimer
} from './services/notificationManager'
import {
  checkOllamaHealth,
  getOllamaStatus,
  onOllamaStatusChange
} from './services/ollamaService'
import { startDiscoverySchedule, stopDiscoverySchedule } from './services/discoveryService'
import { refreshAllTickerSummaries } from './services/tickerSummaryService'
import { prefetchAllCompanyProfiles } from './services/companyProfileService'
import {
  refreshStocksNow,
  startStocksScheduler,
  stopStocksScheduler
} from './services/stocksScheduler'
import {
  startFinancialsScheduler,
  stopFinancialsScheduler
} from './services/financialsService'
import {
  startEarningsScheduler,
  stopEarningsScheduler
} from './services/earningsScheduler'
import {
  startEstimatesScheduler,
  stopEstimatesScheduler
} from './services/analystEstimatesService'
import {
  startSecFilingsScheduler,
  stopSecFilingsScheduler
} from './services/secFilingsService'
import {
  startEarningsReleasesScheduler,
  stopEarningsReleasesScheduler
} from './services/earningsReleasesService'
import {
  startGraphCandidatesScheduler,
  stopGraphCandidatesScheduler
} from './services/graphCandidatesService'
import {
  startTenKConcentrationScheduler,
  stopTenKConcentrationScheduler
} from './services/tenKConcentrationService'
import {
  startGraphNotesRefreshScheduler,
  stopGraphNotesRefreshScheduler
} from './services/graphNotesRefreshService'
import {
  startSportsReelScheduler,
  stopSportsReelScheduler
} from './services/sportsReelScheduler'
import {
  setAlertsWindowOpener,
  startSportsAlerts,
  stopSportsAlerts
} from './services/sportsAlertsService'
import { getPreferences, type Theme } from './database/preferences'
import {
  backfillReelKeyframes,
  backfillReelVideoClips,
  getReelsDir,
  startReelScheduler,
  stopReelScheduler
} from './services/reelService'
import { ensurePiperReady, getPiperStatus } from './services/piperService'
import {
  ensureKokoroReady,
  getKokoroStatus,
  KOKORO_VOICES,
  stopKokoro
} from './services/kokoroService'
import {
  ensureVideoGenInstalled,
  getVideoGenStatus,
  stopVideoGen
} from './services/videoGenService'
import { ensureMediaTools, getMediaToolsStatus } from './services/mediaToolsService'
import { startMaintenanceSchedule, stopMaintenanceSchedule } from './services/maintenanceService'
import { startMarketBackfill, stopMarketBackfill } from './services/marketBackfillService'
import {
  applySettingsChange as commitSettingsChange,
  type SettingsChange
} from './services/settingsWriteService'

const isDev = !app.isPackaged

protocol.registerSchemesAsPrivileged([
  { scheme: 'reel', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
])

let mainWindow: BrowserWindow | null = null
let popoverWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let ollamaHealthInterval: NodeJS.Timeout | null = null

function getRendererURL(page: 'main' | 'popover' | 'splash'): string {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devServerUrl) {
    const file = page === 'main' ? 'index.html' : `${page}.html`
    return `${devServerUrl}/${file}`
  }
  const basename = page === 'main' ? 'index' : page
  return `file://${join(__dirname, `../renderer/${basename}.html`)}`
}

function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 360,
    center: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.loadURL(getRendererURL('splash'))
  win.on('closed', () => {
    splashWindow = null
  })
  return win
}

type SplashStatus = 'pending' | 'ok' | 'skip' | 'err'
function splashUpdate(id: string, status: SplashStatus): void {
  if (!splashWindow || splashWindow.isDestroyed()) return
  const js = `window.splash && window.splash.update(${JSON.stringify(id)}, ${JSON.stringify(status)})`
  splashWindow.webContents.executeJavaScript(js).catch(() => undefined)
}
function splashMessage(text: string): void {
  if (!splashWindow || splashWindow.isDestroyed()) return
  const js = `window.splash && window.splash.message(${JSON.stringify(text)})`
  splashWindow.webContents.executeJavaScript(js).catch(() => undefined)
}
let mainRendererReady = false
let mainRendererReadyResolver: (() => void) | null = null
const mainRendererReadyPromise = new Promise<void>((resolve) => {
  mainRendererReadyResolver = resolve
})
function markMainRendererReady(): void {
  if (mainRendererReady) return
  mainRendererReady = true
  mainRendererReadyResolver?.()
}

async function revealMainAndCloseSplash(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow()
  // Wait for React to signal mount (capped) so the main window is already
  // painted when it first appears — no in-content jitter after reveal.
  await Promise.race([
    mainRendererReadyPromise,
    new Promise<void>((resolve) => setTimeout(resolve, 2500))
  ])

  // Destroy the splash synchronously first (no close animation) so we never
  // have both windows visible at once.
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy()
  }
  splashWindow = null

  // Let the compositor settle after the splash disappears before we reveal
  // the main window. Two animation frames (~32ms) is plenty on M-series.
  await new Promise<void>((resolve) => setTimeout(resolve, 180))

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  }
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0b0d',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      backgroundThrottling: true
    }
  })

  // Main is revealed explicitly by revealMainAndCloseSplash() once startup
  // services are warm — otherwise the user sees the in-app jitter we're
  // trying to hide. Subsequent re-opens (tray click after a hide) still show
  // instantly because the window object persists.
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Forward findInPage results to the renderer so the FindBar overlay
  // can show match counts + active-match index. Each result carries
  // requestId / matches / activeMatchOrdinal — the renderer doesn't
  // care about requestId for our single-bar model, but we forward
  // everything in case we surface multi-find later.
  win.webContents.on('found-in-page', (_event, result) => {
    if (!win.isDestroyed()) {
      win.webContents.send('find:result', {
        requestId: result.requestId,
        matches: result.matches,
        activeMatchOrdinal: result.activeMatchOrdinal,
        finalUpdate: result.finalUpdate
      })
    }
  })

  win.loadURL(getRendererURL('main'))
  return win
}

function createPopoverWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'menu',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) win.hide()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.loadURL(getRendererURL('popover'))
  return win
}

function positionPopoverUnderTray(): void {
  if (!tray || !popoverWindow) return
  const trayBounds = tray.getBounds()
  const winBounds = popoverWindow.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2)
  const y = Math.round(trayBounds.y + trayBounds.height + 4)

  const clampedX = Math.max(
    display.workArea.x + 4,
    Math.min(x, display.workArea.x + display.workArea.width - winBounds.width - 4)
  )
  popoverWindow.setPosition(clampedX, y, false)
}

function togglePopover(): void {
  if (!popoverWindow) popoverWindow = createPopoverWindow()
  if (popoverWindow.isVisible()) {
    popoverWindow.hide()
    return
  }
  positionPopoverUnderTray()
  popoverWindow.show()
  popoverWindow.focus()
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow()
  mainWindow.show()
  mainWindow.focus()
}

function buildTrayIcon(): Electron.NativeImage {
  const iconPath = join(app.getAppPath(), 'resources/icons/trayTemplate.png')
  const image = nativeImage.createFromPath(iconPath)
  image.setTemplateImage(true)
  return image
}

// Per-theme dock icon palettes. `bg` is the rounded-square background,
// `accent` is the brightest color in the concentric pulse rings. We luminance-
// lerp the source icon's pixels between the two (see tintIcon). Keep these in
// rough sync with the CSS `--surface-0` / `--accent` values from styles.css.
const DOCK_PALETTES: Record<
  Exclude<Theme, 'system'>,
  { bg: [number, number, number]; accent: [number, number, number] }
> = {
  default: { bg: [10, 11, 13], accent: [96, 165, 250] },
  light: { bg: [246, 247, 249], accent: [37, 99, 235] },
  fiesta: { bg: [20, 6, 8], accent: [248, 113, 113] },
  zazu: { bg: [6, 20, 14], accent: [74, 222, 128] },
  ocean: { bg: [5, 14, 28], accent: [125, 211, 252] },
  casino: { bg: [14, 12, 8], accent: [250, 204, 21] }
}

// toBitmap() returns BGRA-ordered pixels on all Electron platforms. We read
// the luminance of each pixel, then lerp between the theme's background and
// accent colors. This preserves anti-aliasing and the ring gradient without
// needing a per-theme hand-authored PNG.
let masterIconBitmap: { buffer: Buffer; width: number; height: number } | null = null
const tintedIconCache = new Map<string, Electron.NativeImage>()

function getMasterIconBitmap(): typeof masterIconBitmap {
  if (masterIconBitmap) return masterIconBitmap
  const iconPath = join(app.getAppPath(), 'resources/icons/appIcon.png')
  const source = nativeImage.createFromPath(iconPath)
  if (source.isEmpty()) return null
  const size = source.getSize()
  masterIconBitmap = { buffer: source.toBitmap(), width: size.width, height: size.height }
  return masterIconBitmap
}

function tintIcon(theme: Exclude<Theme, 'system'>): Electron.NativeImage | null {
  const cached = tintedIconCache.get(theme)
  if (cached) return cached
  const src = getMasterIconBitmap()
  if (!src) return null
  const { buffer, width, height } = src
  const { bg, accent } = DOCK_PALETTES[theme]
  const out = Buffer.alloc(buffer.length)
  for (let i = 0; i < buffer.length; i += 4) {
    const b = buffer[i]!
    const g = buffer[i + 1]!
    const r = buffer[i + 2]!
    const a = buffer[i + 3]!
    if (a === 0) {
      out[i + 3] = 0
      continue
    }
    // Rec. 601 luminance — icon is blue-dominant so weighted > mean.
    const L = (r * 0.299 + g * 0.587 + b * 0.114) / 255
    out[i] = Math.round(bg[2] + (accent[2] - bg[2]) * L)
    out[i + 1] = Math.round(bg[1] + (accent[1] - bg[1]) * L)
    out[i + 2] = Math.round(bg[0] + (accent[0] - bg[0]) * L)
    out[i + 3] = a
  }
  const tinted = nativeImage.createFromBitmap(out, { width, height })
  tintedIconCache.set(theme, tinted)
  return tinted
}

function applyDockIcon(theme?: Exclude<Theme, 'system'>): void {
  if (process.platform !== 'darwin' || !app.dock) return
  const resolved = theme ?? resolveTheme(getPreferences().theme)
  const tinted = tintIcon(resolved)
  if (tinted && !tinted.isEmpty()) app.dock.setIcon(tinted)
}

function createTray(): void {
  tray = new Tray(buildTrayIcon())
  tray.setToolTip('Pulse')

  tray.on('click', () => togglePopover())
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open Pulse', click: () => showMainWindow() },
      { type: 'separator' },
      {
        label: 'Quit Pulse',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
    tray?.popUpContextMenu(menu)
  })
}

function registerIpc(): void {
  ipcMain.handle('app:getTheme', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'))
  ipcMain.handle('prefs:getResolvedTheme', () => resolveTheme(getPreferences().theme))
  ipcMain.handle('app:rendererReady', () => markMainRendererReady())
  ipcMain.handle('app:showMainWindow', () => showMainWindow())
  ipcMain.handle('app:hidePopover', () => popoverWindow?.hide())
  ipcMain.handle('app:getOllamaStatus', () => getOllamaStatus())
  ipcMain.handle('feeds:refreshAll', () => pollAllFeeds({ force: true }))
  ipcMain.handle('prefs:apply', () => applyPreferences())
  // Hyperintelligence write: commits the change to the right store (sqlite
  // prefs or the PulseConfig JSON) and then fans out via applyPreferences
  // so timers restart, theme/density broadcast, login-item flips, etc.
  ipcMain.handle('hyper:applySettings', async (_e, change: SettingsChange) => {
    await commitSettingsChange(change)
    applyPreferences()
  })
  ipcMain.handle('reels:piperStatus', () => getPiperStatus())
  ipcMain.handle('reels:videoGenStatus', () => getVideoGenStatus())
  ipcMain.handle('reels:mediaToolsStatus', () => getMediaToolsStatus())
  ipcMain.handle('reels:kokoroStatus', () => getKokoroStatus())
  ipcMain.handle('reels:kokoroVoices', () => KOKORO_VOICES)
}

function applyPreferences(): void {
  const prefs = getPreferences()
  stopPolling()
  startPolling(prefs.pollIntervalMin * 60 * 1000)
  stopDigestTimer()
  startDigestTimer(prefs.digestIntervalMin * 60 * 1000)
  app.setLoginItemSettings({ openAtLogin: prefs.launchAtLogin })
  stopSportsAlerts()
  if (prefs.favoriteTeamAlertsEnabled) startSportsAlerts()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('prefs:density', prefs.density)
  }
  broadcastTheme(resolveTheme(prefs.theme))
}

// Converts 'system' to the OS preference, passes concrete themes through.
function resolveTheme(theme: Theme): Exclude<Theme, 'system'> {
  if (theme !== 'system') return theme
  return nativeTheme.shouldUseDarkColors ? 'default' : 'light'
}

function broadcastTheme(resolved: Exclude<Theme, 'system'>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('prefs:theme', resolved)
  }
  applyDockIcon(resolved)
}

// Re-evaluate when macOS flips between light/dark while 'system' is selected.
nativeTheme.on('updated', () => {
  const prefs = getPreferences()
  if (prefs.theme === 'system') broadcastTheme(resolveTheme(prefs.theme))
})

function broadcastOllamaStatus(status: 'online' | 'offline'): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('app:ollamaStatus', status)
  }
}

function registerReelProtocol(): void {
  protocol.handle('reel', async (request) => {
    try {
      const url = new URL(request.url)
      // URL shape is reel://audio/<filename>. With standard: true schemes,
      // Chromium treats the first segment as the host. If a caller uses
      // reel://<file> by mistake, the host will contain the filename — fall
      // back to that so both forms work.
      const rawPath = url.pathname.replace(/^\//, '')
      const file = decodeURIComponent(rawPath || url.host)
      if (!file || file.includes('..') || file.includes('/')) {
        return new Response('forbidden', { status: 403 })
      }
      const full = join(getReelsDir(), file)
      return net.fetch(pathToFileURL(full).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

// Override Electron's default "Electron" label in the macOS menu bar, dock
// tooltip, and About menu. Must run before `whenReady` so the first menu
// build picks it up.
app.setName('Pulse')

app.whenReady().then(async () => {
  splashWindow = createSplashWindow()

  // Boot init guard: any synchronous throw between here and the splash
  // watchdog (~line 715 below) used to leave the user staring at a
  // transparent splash forever — initDatabase rejects synchronously on
  // a failed migration / SQLITE_FULL / corrupt DB, no .catch was chained,
  // no uncaughtException handler was registered. Now we surface the
  // failure via a real Electron error dialog and quit cleanly. Healthy
  // boots are unaffected — this branch only runs on init failure.
  try {
    initDatabase()
    splashUpdate('db', 'ok')

    // Sector catalog sync + ticker_sectors backfill runs immediately after
    // migrations. Idempotent — re-syncs on every boot, but the backfill only
    // fires when ticker_sectors is empty.
    bootstrapSectorCatalog()

    // Broaden the per-sector ticker universe. Coverage was extremely lopsided
    // — Information Technology had 106 assigned symbols and every other GICS
    // sector had 0-23 — which made sector filters, cross-sector edge
    // detection and event-study size buckets describe a semiconductor
    // watchlist rather than a market. Symbols are added passive and never
    // overwrite an existing row or sector assignment, so this is safe to run
    // on every boot.
    try {
      const seeded = seedSectorUniverse()
      if (seeded.tickersAdded > 0 || seeded.assignmentsAdded > 0) {
        console.log(
          `[sector-universe] +${seeded.tickersAdded} tickers, ` +
            `+${seeded.assignmentsAdded} sector assignments`
        )
        for (const row of sectorCoverage()) {
          console.log(`[sector-universe]   ${row.name}: ${row.count}`)
        }
      }
    } catch (err) {
      console.warn(
        '[sector-universe] seed failed:',
        err instanceof Error ? err.message : err
      )
    }

    // One-time fix for chain-absorbed tickers created before the absorber
    // started calling ensurePassiveTicker. Without this, the stocks scheduler
    // has no tickers-table row for those symbols and their tiles render as
    // EXT with no quote. Idempotent — skips symbols that already have rows.
    const passiveBackfilled = backfillPassiveTickersForAbsorbedNodes()
    if (passiveBackfilled > 0) {
      console.log(
        `[boot] created ${passiveBackfilled} passive ticker row(s) for absorbed nodes`
      )
    }

    // Populate sectorId on absorbed non-focus nodes that were written with
    // a null tag by an earlier, more conservative absorber. With Claude's
    // chain quality, counterparties in a focus's chain are almost always in
    // the focus's sector (banks in COF's chain are financials, payments
    // networks in MA's chain are fin-payments). Making them inheritable
    // lights up the unified Value Chain tabs + Diagram so the graph grows
    // dynamically as the user generates each focus.
    const reseeded = repopulateAbsorbedSectorIds()
    if (reseeded > 0) {
      console.log(`[boot] repopulated sectorId on ${reseeded} absorbed override row(s)`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[boot] database initialization failed:', err)
    dialog.showErrorBox(
      'Pulse failed to start',
      `Database initialization failed:\n\n${message}\n\nThe app cannot continue. Please check the dev console (Cmd+Opt+I in development) or report this issue.`
    )
    app.quit()
    return
  }

  registerReelProtocol()
  registerIpc()
  registerDbIpc()
  const ctx = buildUrgencyContext()
  const backfilled = rescoreArticles((a) => scoreArticle(a, ctx), { onlyUnscored: true })
  if (backfilled > 0) console.log(`[scorer] backfilled urgency for ${backfilled} articles`)

  registerAdblockerHooks()
  await initAdblocker()
    .then(() => splashUpdate('adblock', 'ok'))
    .catch(() => splashUpdate('adblock', 'err'))

  applyDockIcon()
  createTray()
  mainWindow = createMainWindow()
  setWindowOpener(showMainWindow)

  onOllamaStatusChange((online) => broadcastOllamaStatus(online ? 'online' : 'offline'))
  const prefs = getPreferences()

  // Cold-toggle gate for the reels + TTS pipeline. When disabled, the Python
  // workers (Kokoro, Piper, videoGen diffusers, ffmpeg/yt-dlp downloads) are
  // never started, which meaningfully extends battery life on laptops. The
  // toggle is cold — flipping it in Settings requires a restart, and the UI
  // surfaces that hint.
  let kokoroP: Promise<void>
  let piperP: Promise<void>
  let videoP: Promise<void>
  let mediaToolsP: Promise<void>
  let videoReady = false
  let mediaToolsReady = false

  if (prefs.mediaPipelineEnabled) {
    // Kick the heavy Python workers FIRST so their services flip to a busy
    // state synchronously (before any await inside). The feed poller checks
    // those flags at entry and defers if either is loading — but it can only
    // see "busy" if the status has been set by the time pollAllFeeds() runs.
    kokoroP = ensureKokoroReady()
      .then((ok) => splashUpdate('kokoro', ok ? 'ok' : 'skip'))
      .catch(() => splashUpdate('kokoro', 'skip'))
    piperP = ensurePiperReady()
      .then((ok) => splashUpdate('piper', ok ? 'ok' : 'skip'))
      .catch(() => splashUpdate('piper', 'skip'))
    videoP = ensureVideoGenInstalled()
      .then((ok) => {
        videoReady = ok
        splashUpdate('video', ok ? 'ok' : 'skip')
      })
      .catch(() => splashUpdate('video', 'skip'))
    mediaToolsP = ensureMediaTools()
      .then((ok) => {
        mediaToolsReady = ok
        splashUpdate('mediaTools', ok ? 'ok' : 'skip')
      })
      .catch(() => splashUpdate('mediaTools', 'skip'))
  } else {
    console.log('[boot] media pipeline disabled via preference — skipping reels + TTS startup')
    splashUpdate('kokoro', 'skip')
    splashUpdate('piper', 'skip')
    splashUpdate('video', 'skip')
    splashUpdate('mediaTools', 'skip')
    kokoroP = Promise.resolve()
    piperP = Promise.resolve()
    videoP = Promise.resolve()
    mediaToolsP = Promise.resolve()
  }

  startPolling(prefs.pollIntervalMin * 60 * 1000)
  startDigestTimer(prefs.digestIntervalMin * 60 * 1000)
  app.setLoginItemSettings({ openAtLogin: prefs.launchAtLogin })
  startDiscoverySchedule()
  startStocksScheduler()
  // Quarterly cashflow/income sweeps run on a separate cadence (hours, not
  // minutes) because statements only change on earnings. See financialsService
  // for the staleness gate + per-tick batching.
  startFinancialsScheduler()
  // Earnings calendar + EPS history refresher. Tighter cadence than
  // financials (30 min vs 6 h) so the "Reports in N days" countdown
  // and EPS-Δ 4Q dots on the Value Chain page never drift more than
  // ~30 min stale during a long session.
  startEarningsScheduler()
  // Analyst consensus (forward EPS, price targets, upgrade/downgrade tally)
  // on its own slow cadence — weekly per-symbol refresh; nothing user-visible
  // changes more often than that.
  startEstimatesScheduler()
  // SEC EDGAR filings feed — 8-K / 10-Q / Form 4 / etc. per watchlist ticker.
  // CIK map refreshes monthly, filings per-symbol daily. Separate scheduler
  // because SEC has a different rate-limit regime than Yahoo.
  startSecFilingsScheduler()
  // Earnings-release AI summaries — retries pending/offline rows every 30min.
  // New filings trigger a one-shot summarize inside refreshFilings; this
  // scheduler just catches the stuff that failed because Ollama was down.
  startEarningsReleasesScheduler()
  // Dynamic value-chain growth — weekly news co-occurrence sweep with an
  // inline Ollama auto-judge. Proposes edges, auto-accepts the high-confidence
  // ones into graph_edge_overrides, logs the rest to graph_candidates.
  startGraphCandidatesScheduler()
  // 10-K customer concentration — weekly sweep extracts named customers
  // from the filer's own annual report and auto-commits supplier→customer
  // edges at high baseline confidence. Authoritative source, complements
  // the news co-occurrence layer.
  startTenKConcentrationScheduler()
  // Rolling note-refresh — monthly sweep re-judges stale overlay edges
  // against fresh article evidence so the visible notes don't drift
  // further from current reality than a season or two.
  startGraphNotesRefreshScheduler()
  setAlertsWindowOpener(showMainWindow)
  if (prefs.favoriteTeamAlertsEnabled) startSportsAlerts()
  // Sports reel scheduler is just an ESPN scoreboard fetcher — it has no
  // dependency on the media pipeline (Kokoro/Piper/videoGen). Starting it
  // unconditionally so the top sports ticker populates even with the media
  // pipeline toggle off. `startReelScheduler()` is the actual reels pipeline
  // and stays behind the gate.
  startSportsReelScheduler()
  if (prefs.mediaPipelineEnabled) {
    startReelScheduler()
  }
  startMaintenanceSchedule()

  // Daily-bar backfill. Trickles one symbol per 30s, and only while the
  // market is closed, so it never competes with the live quote poll for
  // Yahoo's per-IP budget (which 429s more readily than the poll cadence
  // suggests — see BUGS.md). Intraday 1m bars are captured by the quote
  // path itself, since Yahoo only retains ~30 days of those.
  startMarketBackfill()

  // Auto-regenerate value chains on boot, throttled so back-to-back
  // restarts during active development don't re-burn the Claude daily
  // cap. Fires 3 min after startup (once the feed poll + financials
  // backfill burst clears) and skips chains generated in the last
  // ~20h — so a partial run that hit yesterday's cap finishes its
  // stragglers today instead of re-running the whole graph. Won't fire
  // again until > 20h since the last stamp in preferences.
  const { scheduleAutoRegenerateOnBoot } = await import(
    './services/companyValueChainService'
  )
  scheduleAutoRegenerateOnBoot()

  // Daily Claude-authored morning brief. Fires 5 min after boot. The
  // staleness gate inside the service short-circuits if the cached
  // brief is < 4h old, so casual restarts during the day cost nothing.
  const { scheduleMorningBriefRefresh } = await import(
    './services/morningBriefService'
  )
  scheduleMorningBriefRefresh()

  // FRED macro panel — pulls a curated set of Federal Reserve indicators
  // (rates, inflation, labor, volatility) into a local cache and refreshes
  // every 6h. No-op if the user hasn't configured a FRED API key.
  const { startFredScheduler } = await import('./services/fredService')
  startFredScheduler()

  // Research-tab saved-topic scheduler. Walks research_topics every
  // 30 min and re-syntheses any topic whose lastBriefAt is more than
  // 7 days old (or never refreshed). No-op when no topics exist.
  const { startResearchScheduler } = await import('./services/researchScheduler')
  startResearchScheduler()

  // Hold the splash until every boot service is ready — otherwise heavy
  // background loads (SDXL, Kokoro) cause jitter the moment the main window
  // opens. A 180s watchdog caps the worst case (first-run model downloads).
  let revealed = false
  const reveal = (reason: string): void => {
    if (revealed) return
    revealed = true
    splashMessage(reason)
    void revealMainAndCloseSplash()
  }
  const watchdog = setTimeout(() => reveal('Opening dashboard…'), 180_000)

  const feedsP = pollAllFeeds()
    .then(() => splashUpdate('feeds', 'ok'))
    .catch(() => splashUpdate('feeds', 'err'))

  const stocksP = refreshStocksNow()
    .then(() => splashUpdate('stocks', 'ok'))
    .catch(() => splashUpdate('stocks', 'err'))

  const ollamaP = checkOllamaHealth(true)
    .then((online) => splashUpdate('ollama', online ? 'ok' : 'skip'))
    .catch(() => splashUpdate('ollama', 'skip'))
  // Track the handle so will-quit can clear it; without this the timer
  // outlives `app.quit()` in dev hot-reload and keeps pinging Ollama after
  // the DB has been closed (occasionally noisy in shutdown logs).
  ollamaHealthInterval = setInterval(() => void checkOllamaHealth(true), 2 * 60 * 1000)

  // Backfill article↔ticker classifications for pre-v21 articles (or any
  // article ingested before a ticker was added to the watchlist). Runs
  // sequentially ahead of the first summary refresh so the briefs see the
  // historical matches — otherwise Today's brief would be empty on the first
  // boot after the migration.
  void backfillArticleTickerMatches().finally(() => {
    void refreshAllTickerSummaries()
  })
  // Pre-generate company profiles so the stock detail page never shows the
  // "generating…" placeholder. Runs in the background after boot so it doesn't
  // block the splash reveal.
  setTimeout(() => void prefetchAllCompanyProfiles(), 5_000)

  await Promise.all([feedsP, stocksP, ollamaP, kokoroP, piperP, videoP, mediaToolsP])
  clearTimeout(watchdog)
  reveal('Ready')

  // Defer heavy post-boot work until the main window has settled. The
  // mediaPipelineEnabled gate above ensures videoReady/mediaToolsReady stay
  // false when the pipeline is off, so these are already no-ops in that case.
  if (videoReady) {
    setTimeout(() => void backfillReelKeyframes(), 8_000)
  }
  if (mediaToolsReady) {
    setTimeout(() => void backfillReelVideoClips(), 12_000)
  }
})

app.on('will-quit', () => {
  if (ollamaHealthInterval) {
    clearInterval(ollamaHealthInterval)
    ollamaHealthInterval = null
  }
  stopPolling()
  stopDigestTimer()
  stopDiscoverySchedule()
  stopStocksScheduler()
  stopFinancialsScheduler()
  stopEarningsScheduler()
  stopEstimatesScheduler()
  stopSecFilingsScheduler()
  stopEarningsReleasesScheduler()
  stopGraphCandidatesScheduler()
  stopTenKConcentrationScheduler()
  stopGraphNotesRefreshScheduler()
  stopSportsReelScheduler()
  stopSportsAlerts()
  stopReelScheduler()
  stopMaintenanceSchedule()
  stopMarketBackfill()
  stopKokoro()
  stopVideoGen()
  closeDatabase()
})

app.on('window-all-closed', () => {
  // Keep app alive in tray on macOS; on other platforms, quit.
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  showMainWindow()
})

app.on('before-quit', () => {
  isQuitting = true
})
