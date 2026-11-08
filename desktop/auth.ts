/**
 * Google sign-in for the desktop app (docs/DESKTOP.md, phase 3): the OAuth flow for installed
 * apps. Consent happens in the system browser, which Google redirects to a one-shot server on
 * 127.0.0.1; the code is exchanged with PKCE. The refresh token never leaves main: it is kept
 * encrypted with the keychain (safeStorage), and the page gets short-lived access tokens only.
 */
import { createHash, randomBytes } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { DesktopAuthError, DesktopAuthReply } from '../src/shared/desktop'
import { DRIVE_SCOPES } from '../src/shared/google'

export interface OAuthConfig {
  clientId: string
  /** Google's "Desktop app" clients have one; for installed apps it is not a secret. */
  clientSecret: string
  authUrl: string
  tokenUrl: string
  revokeUrl: string
}

export const GOOGLE_ENDPOINTS = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
} as const

/** Where the refresh token is kept between runs. */
export interface Vault {
  load(): Promise<string | null>
  save(refreshToken: string): Promise<void>
  clear(): Promise<void>
}

/** The part of Electron's safeStorage the vault uses. */
export interface Encryption {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

export interface DesktopAuth {
  connect(): Promise<DesktopAuthReply>
  /** `renew`: the cached access token was refused, so refresh even if it looks fresh. */
  token(renew?: boolean): Promise<DesktopAuthReply>
  disconnect(): Promise<void>
}

interface Deps {
  config: OAuthConfig
  vault: Vault
  /** Opens the consent page in the system browser. */
  openBrowser(url: string): Promise<void>
  fetch?: typeof fetch
  now?: () => number
  /** How long to wait for the user to finish in the browser. */
  timeoutMs?: number
}

/** Long enough to sign in and read the consent screen. */
const CONSENT_WAIT_MS = 5 * 60_000
const REQUEST_WAIT_MS = 15_000
/** Treat an access token this close to expiry as gone. */
const SAFETY_MS = 60_000
const DEFAULT_LIFETIME_S = 3600

const fail = (reason: DesktopAuthError): DesktopAuthReply => ({ ok: false, reason })

const DONE_PAGE = (ok: boolean) =>
  `<!doctype html><meta charset="utf-8"><title>Drive Read</title>` +
  `<body style="font:16px system-ui;margin:3em">` +
  (ok
    ? '<p>Drive Read is connected to Google Drive. You can close this tab.</p>'
    : '<p>Drive Read was not connected. You can close this tab and try again in the app.</p>')

interface TokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  error?: string
}

/**
 * Waits for Google's redirect on 127.0.0.1. Only a request carrying our `state` counts; anything
 * else is answered and ignored. Resolves null on timeout.
 */
async function loopback(
  state: string,
  timeoutMs: number,
): Promise<{ redirectUri: string; reply: Promise<URLSearchParams | null> }> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  const redirectUri = `http://127.0.0.1:${port}`
  const reply = new Promise<URLSearchParams | null>((resolve) => {
    const finish = (params: URLSearchParams | null) => {
      clearTimeout(timer)
      server.close()
      server.closeAllConnections()
      resolve(params)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', redirectUri)
      if (req.method !== 'GET' || url.pathname !== '/' || url.searchParams.get('state') !== state) {
        res.writeHead(404).end()
        return
      }
      const ok = url.searchParams.has('code')
      res
        .writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        })
        .end(DONE_PAGE(ok), () => finish(url.searchParams))
    })
  })
  return { redirectUri, reply }
}

export function createDesktopAuth(deps: Deps): DesktopAuth {
  const { config, vault } = deps
  const fetchFn = deps.fetch ?? fetch
  const now = deps.now ?? Date.now
  let access: { accessToken: string; expiresAt: number } | null = null
  let connecting: Promise<DesktopAuthReply> | null = null
  let refreshing: Promise<DesktopAuthReply> | null = null

  async function post(url: string, form: Record<string, string>): Promise<Response> {
    return fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(REQUEST_WAIT_MS),
    })
  }

  /** A token response turned into an access token kept here; the refresh token is the caller's. */
  function accept(r: TokenResponse): DesktopAuthReply {
    if (!r.access_token) return fail('unavailable')
    // Google omits `scope` on some refreshes; an exchange always carries it.
    const scopes = r.scope?.split(' ')
    if (scopes && !DRIVE_SCOPES.every((s) => scopes.includes(s))) return fail('scopes-missing')
    access = {
      accessToken: r.access_token,
      expiresAt: now() + (r.expires_in ?? DEFAULT_LIFETIME_S) * 1000,
    }
    return { ok: true, ...access }
  }

  async function signIn(): Promise<DesktopAuthReply> {
    if (!config.clientId) return fail('unavailable')
    const verifier = randomBytes(32).toString('base64url')
    const state = randomBytes(16).toString('base64url')
    const { redirectUri, reply } = await loopback(state, deps.timeoutMs ?? CONSENT_WAIT_MS)
    const auth = new URL(config.authUrl)
    auth.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: DRIVE_SCOPES.join(' '),
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state,
      access_type: 'offline',
      // Consent each time, so Google always returns a refresh token.
      prompt: 'consent',
    }).toString()
    await deps.openBrowser(auth.toString())

    const params = await reply
    if (!params) return fail('cancelled')
    const code = params.get('code')
    if (!code) return fail('denied')

    let r: TokenResponse
    try {
      const res = await post(config.tokenUrl, {
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      })
      r = (await res.json()) as TokenResponse
      if (!res.ok) return fail('denied')
    } catch {
      return fail('unavailable')
    }
    const result = accept(r)
    if (result.ok && r.refresh_token) await vault.save(r.refresh_token)
    return result
  }

  async function refresh(): Promise<DesktopAuthReply> {
    const saved = await vault.load()
    if (!saved || !config.clientId) return fail('signed-out')
    let res: Response
    let r: TokenResponse
    try {
      res = await post(config.tokenUrl, {
        refresh_token: saved,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
      })
      r = (await res.json()) as TokenResponse
    } catch {
      return fail('unavailable')
    }
    if (r.error === 'invalid_grant') {
      // Revoked, expired or the password changed: a new sign-in is needed.
      await vault.clear()
      return fail('signed-out')
    }
    if (!res.ok) return fail('unavailable')
    return accept(r)
  }

  return {
    connect() {
      connecting ??= signIn().finally(() => (connecting = null))
      return connecting
    },
    async token(renew = false) {
      if (renew) access = null
      if (access && access.expiresAt - SAFETY_MS > now()) return { ok: true, ...access }
      refreshing ??= refresh().finally(() => (refreshing = null))
      return refreshing
    },
    async disconnect() {
      const saved = await vault.load()
      access = null
      await vault.clear()
      if (!saved) return
      try {
        await post(config.revokeUrl, { token: saved })
      } catch {
        // Offline: the sign-in is gone from this Mac; Google drops unused ones in time.
      }
    },
  }
}

/** The refresh token, encrypted by the keychain. Without a keychain nothing is written. */
export function createVault(file: string, crypto: Encryption): Vault {
  return {
    async load() {
      if (!crypto.isEncryptionAvailable()) return null
      try {
        return crypto.decryptString(await readFile(file))
      } catch {
        return null
      }
    },
    async save(refreshToken) {
      if (!crypto.isEncryptionAvailable()) return
      const tmp = `${file}.tmp`
      await writeFile(tmp, crypto.encryptString(refreshToken), { mode: 0o600 })
      await rename(tmp, file)
    },
    async clear() {
      await rm(file, { force: true })
    },
  }
}
