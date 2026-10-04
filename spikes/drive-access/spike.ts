/**
 * Drive access spike. Answers three questions from the architecture doc:
 *  1. Does picking a folder under drive.file grant access to the files inside it?
 *  2. Does the GIS sign-in popup work (incl. from an installed PWA on Android)?
 *  3. Does the proposed CSP allow GIS, the Picker and the Drive API?
 * Never logs the access token.
 */

type Config = { clientId: string; apiKey: string; appId: string }
type TokenResponse = { access_token?: string; expires_in?: number; scope?: string; error?: string }
type PickedDoc = { id: string; name: string; mimeType: string }
type DriveFile = { id: string; name: string; mimeType: string; size?: string; md5Checksum?: string }

// Minimal shapes of the Google globals this spike touches.
declare const google: any
declare const gapi: any

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
]
const FOLDER = 'application/vnd.google-apps.folder'
const BOOK_TYPES = ['application/epub+zip', 'application/pdf']
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const logEl = $<HTMLPreElement>('log')

function log(line: string, cls?: string) {
  const span = document.createElement('span')
  if (cls) span.className = cls
  span.textContent = `${new Date().toISOString().slice(11, 19)}  ${line}\n`
  logEl.append(span)
}
const verdict = (line: string) => log(`VERDICT: ${line}`, 'verdict')

let token = ''

// --- CSP and environment -------------------------------------------------------

document.addEventListener('securitypolicyviolation', (e) => {
  log(`CSP VIOLATION: ${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'}`, 'verdict')
})

const standalone = matchMedia('(display-mode: standalone)').matches
$('mode').textContent = `Display mode: ${standalone ? 'standalone (installed app)' : 'browser tab'}. ${navigator.userAgent}`

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`failed to load ${src}`))
    document.head.append(s)
  })
}

async function drive(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  return fetch(url, { ...init, headers })
}

async function driveJson<T>(url: string): Promise<{ ok: true; value: T } | { ok: false; status: number; body: string }> {
  const res = await drive(url)
  if (!res.ok) return { ok: false, status: res.status, body: (await res.text()).slice(0, 300) }
  return { ok: true, value: (await res.json()) as T }
}

// --- 1. Connect ----------------------------------------------------------------

const config: Config = await fetch('/config.json').then((r) => r.json())
if (!config.clientId || !config.apiKey || !config.appId) {
  log('config incomplete: fill spikes/drive-access/.env and restart the server', 'verdict')
}

$('connect').addEventListener('click', async () => {
  try {
    if (!('google' in window) || !google.accounts) {
      log('loading GIS script on demand…')
      await loadScript('https://accounts.google.com/gsi/client')
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: SCOPES.join(' '),
      callback: (r: TokenResponse) => {
        if (r.error || !r.access_token) return log(`token error: ${r.error ?? 'no token'}`, 'verdict')
        token = r.access_token
        const all = google.accounts.oauth2.hasGrantedAllScopes(r, ...SCOPES)
        log(`token ok, expires_in=${r.expires_in}s, all scopes granted=${all}, scope="${r.scope}"`)
        verdict(`sign-in popup works in ${standalone ? 'INSTALLED APP' : 'browser tab'}`)
        $<HTMLButtonElement>('pick').disabled = false
        $<HTMLButtonElement>('appdata').disabled = false
      },
      error_callback: (e: { type: string; message?: string }) =>
        log(`GIS error_callback: ${e.type} ${e.message ?? ''}`, 'verdict'),
    })
    log('requesting token (popup)…')
    client.requestAccessToken({ prompt: '' })
  } catch (e) {
    log(`connect failed: ${(e as Error).message}`, 'verdict')
  }
})

// --- 2. Pick and probe -----------------------------------------------------------

async function loadPicker(): Promise<void> {
  if (!('gapi' in window)) await loadScript('https://apis.google.com/js/api.js')
  await new Promise<void>((resolve) => gapi.load('picker', () => resolve()))
}

$('pick').addEventListener('click', async () => {
  try {
    await loadPicker()
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes([...BOOK_TYPES, FOLDER].join(','))
    new google.picker.PickerBuilder()
      .addView(view)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setOrigin(location.origin)
      .setCallback(async (data: any) => {
        if (data.action !== google.picker.Action.PICKED) return
        const docs: PickedDoc[] = data.docs.map((d: any) => ({ id: d.id, name: d.name, mimeType: d.mimeType }))
        log(`picked ${docs.length}: ${docs.map((d) => `${d.name} [${d.mimeType}]`).join(', ')}`)
        for (const d of docs) await (d.mimeType === FOLDER ? probeFolder(d, 0) : probeFile(d.id, d.name))
      })
      .build()
      .setVisible(true)
  } catch (e) {
    log(`picker failed: ${(e as Error).message}`, 'verdict')
  }
})

async function probeFile(id: string, name: string): Promise<boolean> {
  const res = await drive(`${API}/files/${id}?alt=media`, { headers: { range: 'bytes=0-3' } })
  if (!res.ok) {
    log(`  download "${name}": HTTP ${res.status}`)
    return false
  }
  const head = new TextDecoder().decode(await res.arrayBuffer()).slice(0, 4)
  log(`  download "${name}": HTTP ${res.status}, magic=${JSON.stringify(head)}`)
  return true
}

async function probeFolder(folder: PickedDoc, depth: number): Promise<void> {
  const pad = '  '.repeat(depth)
  log(`${pad}folder "${folder.name}" (${folder.id})`)
  const meta = await driveJson<{ capabilities?: { canListChildren?: boolean } }>(
    `${API}/files/${folder.id}?fields=id,name,capabilities(canListChildren)`,
  )
  log(`${pad}  metadata: ${meta.ok ? `ok, canListChildren=${meta.value.capabilities?.canListChildren}` : `HTTP ${meta.status} ${meta.body}`}`)

  const q = encodeURIComponent(`'${folder.id}' in parents and trashed = false`)
  const list = await driveJson<{ files: DriveFile[] }>(
    `${API}/files?q=${q}&pageSize=100&fields=files(id,name,mimeType,size,md5Checksum)`,
  )
  if (!list.ok) return log(`${pad}  list children: HTTP ${list.status} ${list.body}`, 'verdict')

  const files = list.value.files
  log(`${pad}  list children: ${files.length} visible to the app`)
  for (const f of files) log(`${pad}    - ${f.name} [${f.mimeType}] md5=${f.md5Checksum ?? '-'}`)

  const books = files.filter((f) => BOOK_TYPES.includes(f.mimeType)).slice(0, 3)
  let downloaded = 0
  for (const b of books) if (await probeFile(b.id, b.name)) downloaded++

  if (depth === 0) {
    const sub = files.find((f) => f.mimeType === FOLDER)
    if (sub) await probeFolder({ id: sub.id, name: sub.name, mimeType: FOLDER }, 1)
  }

  if (depth > 0) return
  if (files.length === 0) {
    verdict('folder pick gives NO visible children (or the folder is empty: retry with a folder you know holds books)')
  } else if (books.length > 0 && downloaded === books.length) {
    verdict(`folder pick GRANTS children: listed ${files.length}, downloaded ${downloaded}/${books.length}`)
  } else {
    verdict(`children listed (${files.length}) but downloads ${downloaded}/${books.length}: partial access`)
  }
}

// --- 3. appData round-trip ---------------------------------------------------------

$('appdata').addEventListener('click', async () => {
  try {
    const name = `spike-${Date.now()}.json`
    const body = new FormData()
    body.append('metadata', new Blob([JSON.stringify({ name, parents: ['appDataFolder'] })], { type: 'application/json' }))
    body.append('file', new Blob([JSON.stringify({ v: 1, fraction: 0.42 })], { type: 'application/json' }))
    const created = await drive(`${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime`, {
      method: 'POST',
      body,
    })
    if (!created.ok) return log(`appData create: HTTP ${created.status} ${await created.text()}`, 'verdict')
    const file = (await created.json()) as { id: string; modifiedTime: string }
    log(`appData create: ok ${file.id} at ${file.modifiedTime}`)

    const list = await driveJson<{ files: DriveFile[] }>(`${API}/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)`)
    log(`appData list: ${list.ok ? `${list.value.files.length} file(s)` : `HTTP ${list.status}`}`)

    const read = await drive(`${API}/files/${file.id}?alt=media`)
    log(`appData read: HTTP ${read.status} ${read.ok ? await read.text() : ''}`)

    const del = await drive(`${API}/files/${file.id}`, { method: 'DELETE' })
    log(`appData delete: HTTP ${del.status}`)
    verdict(`appData round-trip ${created.ok && list.ok && read.ok && del.ok ? 'OK' : 'FAILED'}`)
  } catch (e) {
    log(`appData failed: ${(e as Error).message}`, 'verdict')
  }
})

$('copy').addEventListener('click', () => navigator.clipboard.writeText(logEl.textContent ?? ''))
