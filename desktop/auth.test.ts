// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DRIVE_SCOPES } from '../src/shared/google'
import { createDesktopAuth, createVault, type OAuthConfig, type Vault } from './auth'

const CONFIG: OAuthConfig = {
  clientId: 'desk-client',
  clientSecret: 'desk-secret',
  authUrl: 'https://accounts.test/auth',
  tokenUrl: 'https://oauth.test/token',
  revokeUrl: 'https://oauth.test/revoke',
}
const ALL_SCOPES = DRIVE_SCOPES.join(' ')

const memoryVault = (start: string | null = null): Vault & { value: string | null } => {
  const v = {
    value: start,
    load: async () => v.value,
    save: async (t: string) => void (v.value = t),
    clear: async () => void (v.value = null),
  }
  return v
}

interface Call {
  url: string
  body: URLSearchParams
}

/** Google's token and revoke endpoints. `reply` answers each token request. */
function fakeGoogle(reply: (body: URLSearchParams) => { status?: number; json: unknown }) {
  const calls: Call[] = []
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const body = new URLSearchParams(String(init?.body ?? ''))
    calls.push({ url, body })
    if (url === CONFIG.revokeUrl) return new Response('', { status: 200 })
    const r = reply(body)
    return Response.json(r.json, { status: r.status ?? 200 })
  }) as typeof fetch
  return { calls, fetchFn }
}

/** The system browser: the user approves (or not), and Google redirects to the loopback. */
function browser(answer: (auth: URL) => Record<string, string> | null): {
  opened: URL[]
  open: (url: string) => Promise<void>
} {
  const opened: URL[] = []
  return {
    opened,
    async open(url) {
      const auth = new URL(url)
      opened.push(auth)
      const params = answer(auth)
      if (!params) return
      const back = new URL(auth.searchParams.get('redirect_uri')!)
      for (const [k, v] of Object.entries(params)) back.searchParams.set(k, v)
      // The browser loads the redirect after the app has started waiting for it.
      setTimeout(() => void fetch(back).catch(() => {}), 0)
    },
  }
}

const approve = (auth: URL) => ({ code: 'the-code', state: auth.searchParams.get('state')! })

const granted = (body: URLSearchParams) =>
  body.get('grant_type') === 'authorization_code'
    ? {
        json: {
          access_token: 'access-1',
          expires_in: 3599,
          refresh_token: 'refresh-1',
          scope: ALL_SCOPES,
        },
      }
    : { json: { access_token: 'access-2', expires_in: 3599, scope: ALL_SCOPES } }

let now = 1_000_000
const clock = () => now
beforeEach(() => {
  now = 1_000_000
})

describe('connect', () => {
  it('signs in through the loopback with PKCE and saves the refresh token', async () => {
    const vault = memoryVault()
    const google = fakeGoogle(granted)
    const b = browser(approve)
    const auth = createDesktopAuth({
      config: CONFIG,
      vault,
      openBrowser: b.open,
      fetch: google.fetchFn,
      now: clock,
    })

    expect(await auth.connect()).toEqual({
      ok: true,
      accessToken: 'access-1',
      expiresAt: now + 3599_000,
    })
    expect(vault.value).toBe('refresh-1')

    const asked = b.opened[0]!
    expect(asked.origin + asked.pathname).toBe(CONFIG.authUrl)
    expect(asked.searchParams.get('client_id')).toBe('desk-client')
    expect(asked.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(asked.searchParams.get('scope')).toBe(ALL_SCOPES)
    expect(asked.searchParams.get('access_type')).toBe('offline')
    expect(asked.searchParams.get('code_challenge_method')).toBe('S256')

    const exchange = google.calls[0]!.body
    expect(exchange.get('code')).toBe('the-code')
    expect(exchange.get('client_secret')).toBe('desk-secret')
    expect(exchange.get('redirect_uri')).toBe(asked.searchParams.get('redirect_uri'))
    const challenge = createHash('sha256')
      .update(exchange.get('code_verifier')!)
      .digest('base64url')
    expect(asked.searchParams.get('code_challenge')).toBe(challenge)
  })

  it('ignores a redirect with the wrong state', async () => {
    const google = fakeGoogle(granted)
    const b = browser(() => ({ code: 'forged', state: 'not-ours' }))
    const auth = createDesktopAuth({
      config: CONFIG,
      vault: memoryVault(),
      openBrowser: b.open,
      fetch: google.fetchFn,
      timeoutMs: 300,
    })
    expect(await auth.connect()).toEqual({ ok: false, reason: 'cancelled' })
    expect(google.calls).toEqual([])
  })

  it('gives up when the user never finishes in the browser', async () => {
    const auth = createDesktopAuth({
      config: CONFIG,
      vault: memoryVault(),
      openBrowser: browser(() => null).open,
      fetch: fakeGoogle(granted).fetchFn,
      timeoutMs: 100,
    })
    expect(await auth.connect()).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('reports a refusal on the consent screen', async () => {
    const auth = createDesktopAuth({
      config: CONFIG,
      vault: memoryVault(),
      openBrowser: browser((a) => ({ error: 'access_denied', state: a.searchParams.get('state')! }))
        .open,
      fetch: fakeGoogle(granted).fetchFn,
    })
    expect(await auth.connect()).toEqual({ ok: false, reason: 'denied' })
  })

  it('refuses a grant without both Drive scopes and saves nothing', async () => {
    const vault = memoryVault()
    const auth = createDesktopAuth({
      config: CONFIG,
      vault,
      openBrowser: browser(approve).open,
      fetch: fakeGoogle(() => ({
        json: {
          access_token: 'a',
          expires_in: 3599,
          refresh_token: 'r',
          scope: DRIVE_SCOPES[1],
        },
      })).fetchFn,
    })
    expect(await auth.connect()).toEqual({ ok: false, reason: 'scopes-missing' })
    expect(vault.value).toBeNull()
  })

  it('is unavailable without a client id', async () => {
    const b = browser(approve)
    const auth = createDesktopAuth({
      config: { ...CONFIG, clientId: '' },
      vault: memoryVault(),
      openBrowser: b.open,
      fetch: fakeGoogle(granted).fetchFn,
    })
    expect(await auth.connect()).toEqual({ ok: false, reason: 'unavailable' })
    expect(b.opened).toEqual([])
  })
})

describe('token', () => {
  it('is signed out with nothing saved', async () => {
    const google = fakeGoogle(granted)
    const auth = createDesktopAuth({
      config: CONFIG,
      vault: memoryVault(),
      openBrowser: browser(approve).open,
      fetch: google.fetchFn,
    })
    expect(await auth.token()).toEqual({ ok: false, reason: 'signed-out' })
    expect(google.calls).toEqual([])
  })

  it('refreshes from the saved sign-in, once while the token is fresh', async () => {
    const google = fakeGoogle(granted)
    const auth = createDesktopAuth({
      config: CONFIG,
      vault: memoryVault('refresh-1'),
      openBrowser: browser(approve).open,
      fetch: google.fetchFn,
      now: clock,
    })
    const [a, b] = await Promise.all([auth.token(), auth.token()])
    expect(a).toEqual({ ok: true, accessToken: 'access-2', expiresAt: now + 3599_000 })
    expect(b).toEqual(a)
    expect(await auth.token()).toEqual(a)
    expect(google.calls).toHaveLength(1)
    expect(google.calls[0]!.body.get('grant_type')).toBe('refresh_token')
    expect(google.calls[0]!.body.get('refresh_token')).toBe('refresh-1')

    now += 3599_000 - 30_000
    await auth.token()
    expect(google.calls).toHaveLength(2)
  })

  it('forgets a sign-in Google no longer accepts', async () => {
    const vault = memoryVault('revoked')
    const auth = createDesktopAuth({
      config: CONFIG,
      vault,
      openBrowser: browser(approve).open,
      fetch: fakeGoogle(() => ({ status: 400, json: { error: 'invalid_grant' } })).fetchFn,
    })
    expect(await auth.token()).toEqual({ ok: false, reason: 'signed-out' })
    expect(vault.value).toBeNull()
  })

  it('keeps the sign-in when Google cannot be reached', async () => {
    const vault = memoryVault('refresh-1')
    const auth = createDesktopAuth({
      config: CONFIG,
      vault,
      openBrowser: browser(approve).open,
      fetch: (async () => {
        throw new TypeError('offline')
      }) as unknown as typeof fetch,
    })
    expect(await auth.token()).toEqual({ ok: false, reason: 'unavailable' })
    expect(vault.value).toBe('refresh-1')
  })
})

describe('disconnect', () => {
  it('revokes the refresh token at Google and forgets it', async () => {
    const vault = memoryVault('refresh-1')
    const google = fakeGoogle(granted)
    const auth = createDesktopAuth({
      config: CONFIG,
      vault,
      openBrowser: browser(approve).open,
      fetch: google.fetchFn,
    })
    await auth.token()
    await auth.disconnect()
    expect(vault.value).toBeNull()
    const revoke = google.calls.find((c) => c.url === CONFIG.revokeUrl)
    expect(revoke?.body.get('token')).toBe('refresh-1')
    expect(await auth.token()).toEqual({ ok: false, reason: 'signed-out' })
  })
})

describe('createVault', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dr-vault-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const crypto = (available = true) => ({
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => {
      const s = b.toString()
      if (!s.startsWith('enc:')) throw new Error('bad')
      return s.slice(4)
    },
  })

  it('stores only the encrypted token, readable by the owner only', async () => {
    const file = join(dir, 'drive-sign-in.bin')
    const vault = createVault(file, crypto())
    await vault.save('refresh-1')
    expect((await readFile(file)).toString()).toBe('enc:refresh-1')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await createVault(file, crypto()).load()).toBe('refresh-1')
    await vault.clear()
    expect(await vault.load()).toBeNull()
  })

  it('saves nothing to disk when the keychain is unavailable', async () => {
    const file = join(dir, 'drive-sign-in.bin')
    const vault = createVault(file, crypto(false))
    await vault.save('refresh-1')
    await expect(stat(file)).rejects.toThrow('ENOENT')
    expect(await vault.load()).toBeNull()
  })

  it('treats an unreadable file as no sign-in', async () => {
    const file = join(dir, 'drive-sign-in.bin')
    await createVault(file, { ...crypto(), encryptString: (s: string) => Buffer.from(s) }).save(
      'plain',
    )
    expect(await createVault(file, crypto()).load()).toBeNull()
  })
})
