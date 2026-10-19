/**
 * Phase 0 spike: does the unchanged web build run in Electron when served from app://?
 * Serves `dist/` with the production CSP, isolated and sandboxed, nothing exposed to the page.
 * Build: bun spikes/desktop/build.ts · Run: bunx electron spikes/desktop/out/main.mjs
 */
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'

import { app, BrowserWindow, protocol } from 'electron'

import { CSP } from '../../csp.ts'

const DIST = resolve(process.env.DR_DIST ?? 'dist')
const ORIGIN = 'app://drive-read'

// A separate profile per run lets the test check persistence across restarts.
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
  const file = inDist(url.pathname)
  if (!file) return new Response('Forbidden', { status: 403 })
  // Client-side routes (/read/:id) have no extension: fall back to the app shell.
  const target = extname(file) ? file : join(DIST, 'index.html')
  try {
    const body = await readFile(target)
    return new Response(body, {
      headers: {
        'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
        'Content-Security-Policy': CSP,
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  await win.loadURL(`${ORIGIN}/`)
}

void app.whenReady().then(async () => {
  protocol.handle('app', serve)
  await createWindow()
})

app.on('window-all-closed', () => app.quit())
