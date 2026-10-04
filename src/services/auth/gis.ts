import { Err, Ok, type Result } from '@/shared/result'

/**
 * Google Identity Services token model (architecture doc, "Auth and Drive access"). The script is
 * injected the first time a token is needed, never at boot, so the app starts with no network.
 * A token request must come from a user gesture (a tap); there is no refresh token.
 */

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
] as const

export interface TokenGrant {
  accessToken: string
  /** ms since epoch */
  expiresAt: number
}

export type AuthError =
  | { kind: 'popup-closed' }
  | { kind: 'popup-blocked' }
  | { kind: 'denied' }
  | { kind: 'scopes-missing' }
  | { kind: 'unavailable' }

export interface Gis {
  requestToken(): Promise<Result<TokenGrant, AuthError>>
}

interface GisTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}

interface GisGlobal {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string
        scope: string
        callback: (r: GisTokenResponse) => void
        error_callback?: (e: { type: string }) => void
      }): { requestAccessToken(opts?: { prompt?: string }): void }
      hasGrantedAllScopes(r: GisTokenResponse, ...scopes: string[]): boolean
    }
  }
}

const SCRIPT = 'https://accounts.google.com/gsi/client'

function loadScript(): Promise<GisGlobal> {
  const existing = (window as { google?: GisGlobal }).google
  if (existing?.accounts?.oauth2) return Promise.resolve(existing)
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => {
      const g = (window as { google?: GisGlobal }).google
      if (g?.accounts?.oauth2) resolve(g)
      else reject(new Error('GIS loaded without google.accounts'))
    }
    s.onerror = () => reject(new Error('GIS script failed to load'))
    document.head.append(s)
  })
}

const ERROR_KIND: Record<string, AuthError> = {
  popup_closed: { kind: 'popup-closed' },
  popup_failed_to_open: { kind: 'popup-blocked' },
  access_denied: { kind: 'denied' },
}

export function createGis(clientId: string, now: () => number = Date.now): Gis {
  return {
    async requestToken() {
      if (!clientId) return Err({ kind: 'unavailable' })
      let google: GisGlobal
      try {
        google = await loadScript()
      } catch {
        return Err({ kind: 'unavailable' })
      }
      return new Promise((resolve) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPES.join(' '),
          callback: (r) => {
            if (r.error || !r.access_token)
              return resolve(Err(ERROR_KIND[r.error ?? ''] ?? { kind: 'denied' }))
            if (!google.accounts.oauth2.hasGrantedAllScopes(r, ...DRIVE_SCOPES))
              return resolve(Err({ kind: 'scopes-missing' }))
            resolve(
              Ok({ accessToken: r.access_token, expiresAt: now() + (r.expires_in ?? 0) * 1000 }),
            )
          },
          error_callback: (e) => resolve(Err(ERROR_KIND[e.type] ?? { kind: 'popup-closed' })),
        })
        client.requestAccessToken({ prompt: '' })
      })
    },
  }
}
