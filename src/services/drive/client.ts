import { Err, Ok, type Result } from '@/shared/result'

/**
 * Drive API v3 over plain fetch (architecture doc, "Calls the app makes"). One wrapper, typed
 * errors; the token is passed per call so the auth store stays the single owner of it.
 */

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const BOOK_MIMES = ['application/epub+zip', 'application/pdf'] as const

const API = 'https://www.googleapis.com/drive/v3'
const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum,modifiedTime'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size: number
  md5: string | null
  modifiedTime: string
}

export type DriveError =
  | { kind: 'auth-expired' }
  | { kind: 'offline' }
  | { kind: 'not-found' }
  | { kind: 'forbidden' }
  | { kind: 'rate-limited' }
  | { kind: 'http'; status: number }

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

interface RawFile {
  id: string
  name: string
  mimeType: string
  size?: string
  md5Checksum?: string
  modifiedTime?: string
}

const toDriveFile = (f: RawFile): DriveFile => ({
  id: f.id,
  name: f.name,
  mimeType: f.mimeType,
  size: Number(f.size ?? 0),
  md5: f.md5Checksum ?? null,
  modifiedTime: f.modifiedTime ?? '',
})

const escapeQ = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const mimeIn = (mimes: readonly string[]) => mimes.map((m) => `mimeType = '${m}'`).join(' or ')

/** Drive `q` for books, optionally filtered by name. */
export function bookQuery(name: string): string {
  const base = `trashed = false and (${mimeIn(BOOK_MIMES)})`
  const n = name.trim()
  return n ? `${base} and name contains '${escapeQ(n)}'` : base
}

export async function toError(res: Response): Promise<DriveError> {
  if (res.status === 401) return { kind: 'auth-expired' }
  if (res.status === 404) return { kind: 'not-found' }
  if (res.status === 429) return { kind: 'rate-limited' }
  if (res.status === 403) {
    const body = await res.text().catch(() => '')
    return /rateLimitExceeded/i.test(body) ? { kind: 'rate-limited' } : { kind: 'forbidden' }
  }
  return { kind: 'http', status: res.status }
}

export function createDriveApi(fetchFn: FetchFn = (i, init) => fetch(i, init)) {
  async function request(token: string, url: string): Promise<Result<Response, DriveError>> {
    let res: Response
    try {
      res = await fetchFn(url, { headers: { authorization: `Bearer ${token}` } })
    } catch {
      return Err({ kind: 'offline' })
    }
    return res.ok ? Ok(res) : Err(await toError(res))
  }

  /** files.list for `q`, following pages up to `max` files. */
  async function list(
    token: string,
    q: string,
    opts: { orderBy: string; max?: number },
  ): Promise<Result<DriveFile[], DriveError>> {
    const files: DriveFile[] = []
    let pageToken = ''
    const max = opts.max ?? 5000
    do {
      const params = new URLSearchParams({
        q,
        pageSize: '1000',
        orderBy: opts.orderBy,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        ...(pageToken ? { pageToken } : {}),
      })
      const res = await request(token, `${API}/files?${params}`)
      if (res._tag === 'Err') return res
      const body = (await res.value.json()) as { files: RawFile[]; nextPageToken?: string }
      files.push(...body.files.map(toDriveFile))
      pageToken = body.nextPageToken ?? ''
    } while (pageToken && files.length < max)
    return Ok(files)
  }

  /** Every EPUB and PDF in Drive whose name contains `query` (all of them when empty). */
  const searchBooks = (token: string, query: string) =>
    list(token, bookQuery(query), { orderBy: 'name' })

  /** Folders and books directly inside a folder ('root' for My Drive), folders first. */
  const listChildren = (token: string, folderId: string) =>
    list(
      token,
      `'${escapeQ(folderId)}' in parents and trashed = false and (${mimeIn([FOLDER_MIME, ...BOOK_MIMES])})`,
      { orderBy: 'folder,name' },
    )

  /**
   * Every book under a folder, at any depth (Calibre keeps books in author folders).
   * Walks breadth-first, a few folders at a time, and stops after `maxFolders`.
   */
  async function listBooksRecursive(
    token: string,
    folderId: string,
    opts: { maxFolders?: number; concurrency?: number } = {},
  ): Promise<Result<{ books: DriveFile[]; truncated: boolean }, DriveError>> {
    const maxFolders = opts.maxFolders ?? 500
    const concurrency = opts.concurrency ?? 4
    const queue = [folderId]
    const books: DriveFile[] = []
    let visited = 0
    while (queue.length > 0 && visited < maxFolders) {
      const batch = queue.splice(0, Math.min(concurrency, maxFolders - visited))
      visited += batch.length
      const results = await Promise.all(batch.map((id) => listChildren(token, id)))
      for (const r of results) {
        if (r._tag === 'Err') return r
        for (const f of r.value) {
          if (f.mimeType === FOLDER_MIME) queue.push(f.id)
          else books.push(f)
        }
      }
    }
    return Ok({ books, truncated: queue.length > 0 })
  }

  /** Downloads a file (alt=media), reporting 0..1 progress as it streams. */
  async function download(
    token: string,
    file: Pick<DriveFile, 'id' | 'mimeType' | 'size'>,
    onProgress?: (fraction: number) => void,
  ): Promise<Result<Blob, DriveError>> {
    const res = await request(token, `${API}/files/${encodeURIComponent(file.id)}?alt=media`)
    if (res._tag === 'Err') return res
    const total = Number(res.value.headers.get('content-length')) || file.size || 0
    const reader = res.value.body?.getReader()
    if (!reader) return Ok(new Blob([await res.value.arrayBuffer()], { type: file.mimeType }))
    const chunks: Uint8Array[] = []
    let received = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (total > 0) onProgress?.(Math.min(1, received / total))
      }
    } catch {
      return Err({ kind: 'offline' })
    }
    onProgress?.(1)
    return Ok(new Blob(chunks as BlobPart[], { type: file.mimeType }))
  }

  return { searchBooks, listChildren, listBooksRecursive, download }
}

export type DriveApi = ReturnType<typeof createDriveApi>
