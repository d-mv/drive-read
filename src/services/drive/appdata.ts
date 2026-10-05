import { Err, Ok, type Result } from '@/shared/result'

import { type DriveError, type FetchFn, toError } from './client'

/**
 * The app's hidden Drive folder (drive.appdata): library.json and progress-<fileId>.json
 * (architecture doc, "Calls the app makes").
 */

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export interface AppDataFile {
  id: string
  name: string
  modifiedTime: string
}

export function createAppData(fetchFn: FetchFn = (i, init) => fetch(i, init)) {
  async function request(
    token: string,
    url: string,
    init: RequestInit = {},
  ): Promise<Result<Response, DriveError>> {
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${token}`)
    let res: Response
    try {
      res = await fetchFn(url, { ...init, headers })
    } catch {
      return Err({ kind: 'offline' })
    }
    return res.ok ? Ok(res) : Err(await toError(res))
  }

  async function list(token: string): Promise<Result<AppDataFile[], DriveError>> {
    const files: AppDataFile[] = []
    let pageToken = ''
    do {
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        pageSize: '1000',
        fields: 'nextPageToken,files(id,name,modifiedTime)',
        ...(pageToken ? { pageToken } : {}),
      })
      const res = await request(token, `${API}/files?${params}`)
      if (res._tag === 'Err') return res
      const body = (await res.value.json()) as { files: AppDataFile[]; nextPageToken?: string }
      files.push(...body.files)
      pageToken = body.nextPageToken ?? ''
    } while (pageToken)
    return Ok(files)
  }

  async function read(token: string, id: string): Promise<Result<unknown, DriveError>> {
    const res = await request(token, `${API}/files/${encodeURIComponent(id)}?alt=media`)
    if (res._tag === 'Err') return res
    try {
      return Ok(await res.value.json())
    } catch {
      return Err({ kind: 'http', status: 422 })
    }
  }

  const written = async (res: Result<Response, DriveError>) =>
    res._tag === 'Err' ? res : Ok((await res.value.json()) as { id: string; modifiedTime: string })

  async function create(
    token: string,
    name: string,
    body: unknown,
    opts: { keepalive?: boolean } = {},
  ) {
    const form = new FormData()
    form.append(
      'metadata',
      new Blob([JSON.stringify({ name, parents: ['appDataFolder'] })], {
        type: 'application/json',
      }),
    )
    form.append('file', new Blob([JSON.stringify(body)], { type: 'application/json' }))
    return written(
      await request(token, `${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, {
        method: 'POST',
        body: form,
        keepalive: opts.keepalive,
      }),
    )
  }

  async function update(
    token: string,
    id: string,
    body: unknown,
    opts: { keepalive?: boolean } = {},
  ) {
    return written(
      await request(
        token,
        `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=id,modifiedTime`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: opts.keepalive,
        },
      ),
    )
  }

  return { list, read, create, update }
}

export type AppData = ReturnType<typeof createAppData>
