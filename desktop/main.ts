/**
 * Drive Read desktop: the main process. Serves the web build from app://drive-read/ with the
 * production CSP, in one isolated, sandboxed window, and reads books the user chose from disk.
 * Plan: docs/DESKTOP.md.
 */
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent, protocol, shell } from 'electron'

import { CSP } from '../csp.ts'
import { IPC } from '../src/shared/desktop'
import { type Grants, keepFile, loadGrants, readKept } from './files'

const HERE = dirname(fileURLToPath(import.meta.url))
/** The web build. Packaged next to the bundled main; DR_DIST overrides it for tests. */
const DIST = resolve(process.env.DR_DIST ?? join(HERE, '..', '..', 'dist'))
const ORIGIN = 'app://drive-read'

// A separate profile (tests) keeps runs apart.
if (process.env.DR_USER_DATA) app.setPath('userData', process.env.DR_USER_DATA)

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

function handleFiles(grants: Grants) {
  ipcMain.handle(IPC.keep, (e, path: unknown) => (fromApp(e) ? keepFile(grants, path) : null))
  ipcMain.handle(IPC.read, (e, path: unknown) =>
    fromApp(e) ? readKept(grants, path) : { ok: false, reason: 'denied' },
  )
}

async function createWindow() {
  const win = new BrowserWindow({
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
  await win.loadURL(`${ORIGIN}/`)
}

void app.whenReady().then(async () => {
  // Keeping the screen on while reading is the only permission the page gets.
  app.on('web-contents-created', (_, wc) =>
    wc.session.setPermissionRequestHandler((_wc, permission, done) =>
      done(permission === 'screen-wake-lock'),
    ),
  )
  protocol.handle('app', serve)
  handleFiles(await loadGrants(join(app.getPath('userData'), 'kept-files.json')))
  await createWindow()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})

// macOS convention would keep the app running; with one window and no menu-bar use, quit.
app.on('window-all-closed', () => app.quit())
