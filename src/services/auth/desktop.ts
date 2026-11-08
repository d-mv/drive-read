import type { DesktopAuthError, DesktopAuthReply, DesktopBridge } from '@/shared/desktop'
import { Err, Ok, type Result } from '@/shared/result'

import type { AuthError, Gis, TokenGrant } from './gis'

/**
 * Sign-in in the desktop app: Google's OAuth flow for installed apps, run by main
 * (`desktop/auth.ts`). The page asks main for access tokens; the refresh token never reaches it.
 */

const ERROR: Record<DesktopAuthError, AuthError> = {
  cancelled: { kind: 'popup-closed' },
  denied: { kind: 'denied' },
  'scopes-missing': { kind: 'scopes-missing' },
  unavailable: { kind: 'unavailable' },
  'signed-out': { kind: 'denied' },
}

const toResult = (r: DesktopAuthReply): Result<TokenGrant, AuthError> =>
  r.ok ? Ok({ accessToken: r.accessToken, expiresAt: r.expiresAt }) : Err(ERROR[r.reason])

export function desktopGis(bridge: DesktopBridge): Gis {
  return {
    requestToken: async () => toResult(await bridge.connect()),
    silentToken: async (renew) => toResult(await bridge.token(renew)),
    revoke: () => bridge.disconnect(),
  }
}
