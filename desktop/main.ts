/**
 * Drive Read desktop: the main process. Serves the web build from app://drive-read/ with the
 * production CSP, in one isolated, sandboxed window, and reads books the user chose from disk.
 * Plan: docs/DESKTOP.md.
 */
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  net,
  protocol,
  shell,
} from 'electron'

import { CSP } from '../csp.ts'
import { IPC } from '../src/shared/desktop'
import { type Grants, keepFile, loadGrants, md5Kept, readKept } from './files'
import { setAppMenu } from './menu'
import { bookArgs, createOpenQueue } from './opens'
import { type DesktopUpdate, newerVersion, VERSION_URL } from './updates'

const HERE = dirname(fileURLToPath(import.meta.url))
/** The web build. Packaged next to the bundled main; DR_DIST overrides it for tests. */
const DIST = resolve(process.env.DR_DIST ?? join(HERE, '..', '..', 'dist'))
const ORIGIN = 'app://drive-read'

// A separate profile (tests) keeps runs apart.
if (process.env.DR_USER_DATA) app.setPath('userData', process.env.DR_USER_DATA)

// One app: a second launch (e.g. `open` with a file) hands its books to the first and quits.
const firstInstance = app.requestSingleInstanceLock()
if (!firstInstance) app.quit()

let win: BrowserWindow | null = null
let grants: Grants | null = null

/** Kept paths go to the page once it listens (IPC.ready). */
const opens = createOpenQueue((paths) => win?.webContents.send(IPC.opened, paths))

/** Open Recent. Only the packaged app: a dev run's Recents would belong to Electron.app. */
const addRecent = (path: string) => {
  if (app.isPackaged) app.addRecentDocument(path)
}

/** Paths from the system are the user's choice: keep them, add them to Recents, open them. */
const systemPaths: string[] = []
async function openFromSystem(paths: readonly string[]) {
  if (!grants) {
    systemPaths.push(...paths)
    return
  }
  const kept: string[] = []
  for (const p of paths) {
    const path = await keepFile(grants, p)
    if (path) kept.push(path)
  }
  for (const path of kept) addRecent(path)
  opens.push(kept)
  if (win?.isMinimized()) win.restore()
  win?.focus()
}

// Finder, Dock and Open Recent; can fire before `ready`, so it is registered at once.
app.on('open-file', (e, path) => {
  e.preventDefault()
  void openFromSystem([path])
})
app.on('second-instance', (_e, argv, cwd) => void openFromSystem(bookArgs(argv.slice(1), cwd)))

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
])

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
}

/** A path inside DIST, or null when the request tries to leave it. */
function inDist(pathname: string): string | null {
  const file = normalize(join(DIST, decodeURIComponent(pathname)))
  return file === DIST || file.startsWith(DIST + sep) ? file : null
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (url.host !== 'drive-read') return new Response('Not found', { status: 404 })
  const file = inDist(url.pathname)
  if (!file) return new Response('Forbidden', { status: 403 })
  // Client-side routes (/read/:id) have no extension: they get the app shell.
  const target = extname(file) ? file : join(DIST, 'index.html')
  try {
    return new Response(await readFile(target), {
      headers: {
        'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
        'Content-Security-Policy': CSP,
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

/** IPC is answered only for the app's own page. */
const fromApp = (e: IpcMainInvokeEvent) => e.senderFrame?.url.startsWith(`${ORIGIN}/`) === true

/** The published version file, when it names a newer version. Any failure: no offer. */
async function checkUpdate(): Promise<DesktopUpdate | null> {
  try {
    const res = await net.fetch(process.env.DR_VERSION_URL ?? VERSION_URL, {
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    return res.ok ? newerVersion(await res.json(), app.getVersion()) : null
  } catch {
    return null
  }
}

function handleFiles(g: Grants) {
  ipcMain.handle(IPC.keep, async (e, path: unknown) => {
    if (!fromApp(e)) return null
    const kept = await keepFile(g, path)
    if (kept) addRecent(kept)
    return kept
  })
  ipcMain.handle(IPC.read, (e, path: unknown) =>
    fromApp(e) ? readKept(g, path) : { ok: false, reason: 'denied' },
  )
  ipcMain.handle(IPC.md5, (e, path: unknown) => (fromApp(e) ? md5Kept(g, path) : null))
  ipcMain.handle(IPC.update, (e) => (fromApp(e) ? checkUpdate() : null))
  ipcMain.on(IPC.ready, (e) => {
    if (e.senderFrame?.url.startsWith(`${ORIGIN}/`)) opens.ready()
  })
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 480,
    minHeight: 560,
    title: 'Drive Read',
    webPreferences: {
      preload: join(HERE, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  // The app never leaves its origin; web links open in the browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('closed', () => {
    win = null
  })
  await win.loadURL(`${ORIGIN}/`)
}

void app.whenReady().then(async () => {
  if (!firstInstance) return
  // Keeping the screen on while reading is the only permission the page gets.
  app.on('web-contents-created', (_, wc) =>
    wc.session.setPermissionRequestHandler((_wc, permission, done) =>
      done(permission === 'screen-wake-lock'),
    ),
  )
  protocol.handle('app', serve)
  grants = await loadGrants(join(app.getPath('userData'), 'kept-files.json'))
  handleFiles(grants)
  setAppMenu(() => win?.webContents.send(IPC.menuOpen))
  await createWindow()
  // Books from before `ready`, and from the command line (`electron . book.epub`).
  await openFromSystem([
    ...systemPaths.splice(0),
    ...bookArgs(process.argv.slice(app.isPackaged ? 1 : 2), process.cwd()),
  ])
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})

// macOS convention would keep the app running; with one window and no menu-bar use, quit.
app.on('window-all-closed', () => app.quit())
