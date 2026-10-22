import { afterEach, describe, expect, it } from 'vitest'

import { Ok } from '@/shared/result'

import { createGis } from './gis'

/** A stand-in for Google's script: the token client answers with `response`. */
function fakeGoogle(response: { access_token?: string; expires_in?: number; error?: string }) {
  ;(window as { google?: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (config: { callback: (r: typeof response) => void }) => ({
          requestAccessToken: () => config.callback(response),
        }),
        hasGrantedAllScopes: () => true,
        revoke: (token: string, done: () => void) => {
          revoked.push(token)
          done()
        },
      },
    },
  }
}

let revoked: string[] = []

afterEach(() => {
  revoked = []
  delete (window as { google?: unknown }).google
})

describe('createGis', () => {
  it('keeps the token for as long as Google says', async () => {
    fakeGoogle({ access_token: 'tok', expires_in: 3599 })
    expect(await createGis('client', () => 1_000).requestToken()).toEqual(
      Ok({ accessToken: 'tok', expiresAt: 1_000 + 3_599_000 }),
    )
  })

  it("assumes Google's usual hour when the lifetime is missing, not an already-expired token", async () => {
    fakeGoogle({ access_token: 'tok' })
    expect(await createGis('client', () => 1_000).requestToken()).toEqual(
      Ok({ accessToken: 'tok', expiresAt: 1_000 + 3_600_000 }),
    )
  })
})

describe('revoke', () => {
  it("tells Google to revoke the app's access for the token", async () => {
    fakeGoogle({ access_token: 'tok' })
    await createGis('client').revoke('tok')
    expect(revoked).toEqual(['tok'])
  })

  it('settles even when Google cannot be reached', async () => {
    await expect(createGis('').revoke('tok')).resolves.toBeUndefined()
  })
})
