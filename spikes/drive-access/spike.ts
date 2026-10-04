/**
 * Drive access spike, Drive API only (no Google Picker). Answers:
 *  1. With drive.readonly, can the app browse folders and download the books inside?
 *  2. Does the GIS sign-in popup work (incl. from an installed PWA on Android)?
 *  3. Does the CSP allow GIS and the Drive API?
 *  4. Does the appDataFolder round-trip work (sync records)?
 * Never logs the access token.
 */

type Config = { clientId: string }
type TokenResponse = { access_token?: string; expires_in?: number; scope?: string; error?: string }
type DriveFile = { id: string; name: string; mimeType: string; size?: string; md5Checksum?: string }

// Minimal shape of the GIS global this spike touches.
declare const google: any

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
]
const FOLDER = 'application/vnd.google-apps.folder'
const BOOK_TYPES = ['application/epub+zip', 'application/pdf']
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FIELDS = 'nextPageToken,files(id,name,mimeType,size,md5Checksum)'

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

const enable = (...ids: string[]) => ids.forEach((id) => ($<HTMLButtonElement>(id).disabled = false))

// --- 1. Connect ----------------------------------------------------------------

const config: Config = await fetch('/config.json').then((r) => r.json())
if (!config.clientId) log('VITE_GOOGLE_CLIENT_ID missing in the root .env', 'verdict')

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
        enable('browse', 'books', 'appdata')
        void browse('root', 'My Drive')
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

// --- 2. Browse folders -------------------------------------------------------------

const trail: { id: string; name: string }[] = []

async function listChildren(folderId: string): Promise<DriveFile[] | null> {
  const types = [FOLDER, ...BOOK_TYPES].map((t) => `mimeType = '${t}'`).join(' or ')
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and (${types})`)
  const files: DriveFile[] = []
  let page = ''
  do {
    const r = await driveJson<{ files: DriveFile[]; nextPageToken?: string }>(
      `${API}/files?q=${q}&pageSize=200&orderBy=folder,name&fields=${FIELDS}${page ? `&pageToken=${page}` : ''}`,
    )
    if (!r.ok) {
      log(`list "${folderId}": HTTP ${r.status} ${r.body}`, 'verdict')
      return null
    }
    files.push(...r.value.files)
    page = r.value.nextPageToken ?? ''
  } while (page)
  return files
}

async function browse(folderId: string, name: string) {
  const at = trail.findIndex((t) => t.id === folderId)
  if (at >= 0) trail.splice(at + 1)
  else trail.push({ id: folderId, name })
  $('trail').textContent = trail.map((t) => t.name).join(' / ')

  const files = await listChildren(folderId)
  const list = $<HTMLUListElement>('folder')
  list.replaceChildren()
  if (!files) return
  if (trail.length > 1) list.append(row('↑ up', () => browse(trail[trail.length - 2]!.id, trail[trail.length - 2]!.name)))
  for (const f of files) {
    if (f.mimeType === FOLDER) list.append(row(`[folder] ${f.name}`, () => browse(f.id, f.name)))
    else list.append(row(`${f.name}  (${fmtSize(f.size)})`, () => probeFile(f)))
  }
  const books = files.filter((f) => f.mimeType !== FOLDER).length
  log(`"${name}": ${files.length - books} folder(s), ${books} book(s)`)
}

function row(label: string, onClick: () => void) {
  const li = document.createElement('li')
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.addEventListener('click', onClick)
  li.append(b)
  return li
}

const fmtSize = (s?: string) => (s ? `${(Number(s) / 1048576).toFixed(1)} MB` : '?')

async function probeFile(f: DriveFile): Promise<boolean> {
  const res = await drive(`${API}/files/${f.id}?alt=media`, { headers: { range: 'bytes=0-3' } })
  if (!res.ok) {
    log(`  download "${f.name}": HTTP ${res.status}`, 'verdict')
    return false
  }
  const head = new TextDecoder().decode(await res.arrayBuffer()).slice(0, 4)
  const expected = f.mimeType === 'application/pdf' ? '%PDF' : 'PK\u0003\u0004'
  log(`  download "${f.name}": HTTP ${res.status}, magic ok=${head === expected}, md5=${f.md5Checksum ?? '-'}`)
  return true
}

$('browse').addEventListener('click', () => browse('root', 'My Drive'))

// --- 3. Find every book in Drive ------------------------------------------------------

$('books').addEventListener('click', async () => {
  const types = BOOK_TYPES.map((t) => `mimeType = '${t}'`).join(' or ')
  const q = encodeURIComponent(`trashed = false and (${types})`)
  const started = performance.now()
  const r = await driveJson<{ files: DriveFile[]; nextPageToken?: string }>(
    `${API}/files?q=${q}&pageSize=1000&orderBy=modifiedTime desc&fields=${FIELDS}`,
  )
  if (!r.ok) return log(`book search: HTTP ${r.status} ${r.body}`, 'verdict')
  const ms = Math.round(performance.now() - started)
  log(`book search: ${r.value.files.length} book(s)${r.value.nextPageToken ? ' (more pages)' : ''} in ${ms} ms`)
  const sample = r.value.files.slice(0, 3)
  let ok = 0
  for (const f of sample) if (await probeFile(f)) ok++
  verdict(`drive.readonly: found ${r.value.files.length} book(s), downloaded ${ok}/${sample.length} sampled`)
})

// --- 4. appData round-trip ---------------------------------------------------------

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
    log(`appData create: ok at ${file.modifiedTime}`)

    const list = await driveJson<{ files: DriveFile[] }>(`${API}/files?spaces=appDataFolder&fields=files(id,name)`)
    log(`appData list: ${list.ok ? `${list.value.files.length} file(s)` : `HTTP ${list.status}`}`)

    const read = await drive(`${API}/files/${file.id}?alt=media`)
    log(`appData read: HTTP ${read.status} ${read.ok ? await read.text() : ''}`)

    const del = await drive(`${API}/files/${file.id}`, { method: 'DELETE' })
    log(`appData delete: HTTP ${del.status}`)
    verdict(`appData round-trip ${list.ok && read.ok && del.ok ? 'OK' : 'FAILED'}`)
  } catch (e) {
    log(`appData failed: ${(e as Error).message}`, 'verdict')
  }
})

$('copy').addEventListener('click', () => navigator.clipboard.writeText(logEl.textContent ?? ''))
