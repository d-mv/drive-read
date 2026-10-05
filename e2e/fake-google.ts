import { readFileSync } from 'node:fs'

import type { Page, Route } from '@playwright/test'

/**
 * Google, faked at the network layer: the GIS script URL serves a token client that answers at
 * once, and the Drive API serves a small Calibre-style tree. The real URLs are used, so the app's
 * CSP is exercised as in production.
 */

const EPUB = readFileSync('e2e/fixtures/test-voyage.epub')
const FOLDER = 'application/vnd.google-apps.folder'

interface FakeFile {
  id: string
  name: string
  mimeType: string
  parent: string
}

const TREE: FakeFile[] = [
  { id: 'stocks', name: 'Stocks', mimeType: FOLDER, parent: 'root' },
  { id: 'books', name: 'books', mimeType: FOLDER, parent: 'stocks' },
  { id: 'ada', name: 'fixture,-ada', mimeType: FOLDER, parent: 'books' },
  { id: 'tess', name: 'reed,-tess', mimeType: FOLDER, parent: 'books' },
  {
    id: 'voyage',
    name: 'Fixture, Ada. The Test Voyage.epub',
    mimeType: 'application/epub+zip',
    parent: 'ada',
  },
  {
    id: 'second',
    name: 'Second Voyage - Tess Reed.epub',
    mimeType: 'application/epub+zip',
    parent: 'tess',
  },
  { id: 'notes', name: 'Ship Notes.pdf', mimeType: 'application/pdf', parent: 'tess' },
]

const GIS = `
window.google = { accounts: { oauth2: {
  initTokenClient: function (cfg) {
    return { requestAccessToken: function () {
      setTimeout(function () { cfg.callback({ access_token: 'fake-token', expires_in: 3599, scope: cfg.scope }) }, 10)
    } }
  },
  hasGrantedAllScopes: function () { return true }
} } }`

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
}

const asDrive = (f: FakeFile) => ({
  id: f.id,
  name: f.name,
  mimeType: f.mimeType,
  ...(f.mimeType === FOLDER ? {} : { size: String(EPUB.length), md5Checksum: `md5-${f.id}` }),
  modifiedTime: '2026-10-01T00:00:00Z',
})

/** The Drive app folder (library.json, progress-*.json); share one between two "devices". */
export interface AppDataStore {
  files: Map<string, { id: string; name: string; modifiedTime: string; body: string }>
  seq: number
}

export const appDataStore = (): AppDataStore => ({ files: new Map(), seq: 0 })

export interface FakeGoogle {
  /** Status returned by the next downloads (200 serves the fixture EPUB). */
  downloadStatus: number
  downloads: string[]
  /** Delay for whole-Drive searches, to reproduce slow first loads. */
  searchDelayMs: number
  /** Drop the connection during downloads, as a lost network would. */
  abortDownloads: boolean
}

export async function fakeGoogle(
  page: Page,
  appData: AppDataStore = appDataStore(),
): Promise<FakeGoogle> {
  const state: FakeGoogle = {
    downloadStatus: 200,
    downloads: [],
    searchDelayMs: 0,
    abortDownloads: false,
  }

  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: GIS }),
  )

  await page.route('https://www.googleapis.com/drive/v3/files**', async (route: Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.headers()['authorization'] !== 'Bearer fake-token')
      return route.fulfill({ status: 401, headers: CORS, json: { error: { code: 401 } } })

    const url = new URL(req.url())
    const id = /\/files\/([^/?]+)/.exec(url.pathname)?.[1]
    if (url.searchParams.get('spaces') === 'appDataFolder') {
      const files = [...appData.files.values()].map(({ id, name, modifiedTime }) => ({
        id,
        name,
        modifiedTime,
      }))
      return route.fulfill({ headers: CORS, json: { files } })
    }
    if (id && appData.files.has(id) && url.searchParams.get('alt') === 'media') {
      return route.fulfill({
        headers: { ...CORS, 'content-type': 'application/json' },
        body: appData.files.get(id)!.body,
      })
    }
    if (id && url.searchParams.get('alt') === 'media') {
      state.downloads.push(id)
      if (state.abortDownloads) return route.abort('connectionreset')
      if (state.downloadStatus !== 200)
        return route.fulfill({ status: state.downloadStatus, headers: CORS, body: '' })
      return route.fulfill({
        status: 200,
        headers: {
          ...CORS,
          'content-type': 'application/epub+zip',
          'content-length': String(EPUB.length),
        },
        body: EPUB,
      })
    }

    const q = url.searchParams.get('q') ?? ''
    const parent = /'([^']+)' in parents/.exec(q)?.[1]
    const name = /name contains '([^']+)'/.exec(q)?.[1]?.toLowerCase()
    if (parent === undefined && state.searchDelayMs > 0)
      await new Promise((r) => setTimeout(r, state.searchDelayMs))
    const files = TREE.filter((f) =>
      parent !== undefined
        ? f.parent === parent
        : f.mimeType !== FOLDER && (!name || f.name.toLowerCase().includes(name)),
    )
    return route.fulfill({ headers: CORS, json: { files: files.map(asDrive) } })
  })

  await page.route('https://www.googleapis.com/upload/drive/v3/files**', async (route: Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.headers()['authorization'] !== 'Bearer fake-token')
      return route.fulfill({ status: 401, headers: CORS, json: { error: { code: 401 } } })
    const url = new URL(req.url())
    const modifiedTime = new Date(Date.now() + ++appData.seq).toISOString()
    if (req.method() === 'POST') {
      const form = await new Response(new Uint8Array(req.postDataBuffer() ?? []), {
        headers: { 'content-type': req.headers()['content-type'] ?? '' },
      }).formData()
      const meta = JSON.parse(await (form.get('metadata') as Blob).text()) as { name: string }
      const id = `appdata-${appData.seq}`
      appData.files.set(id, {
        id,
        name: meta.name,
        modifiedTime,
        body: await (form.get('file') as Blob).text(),
      })
      return route.fulfill({ headers: CORS, json: { id, modifiedTime } })
    }
    const id = /\/files\/([^/?]+)/.exec(url.pathname)?.[1] ?? ''
    const file = appData.files.get(id)
    if (!file) return route.fulfill({ status: 404, headers: CORS, json: {} })
    file.body = req.postData() ?? ''
    file.modifiedTime = modifiedTime
    return route.fulfill({ headers: CORS, json: { id, modifiedTime } })
  })

  return state
}
