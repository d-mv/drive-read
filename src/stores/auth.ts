import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useServices } from '@/services'
import type { AuthError, TokenGrant } from '@/services/auth/gis'
import { loadUserId, saveUserId, userIdFromPermission } from '@/app/identity'
import { track } from '@/services/events'
import { logger } from '@/services/logger'
import { None, type Option, Some } from '@/shared/result'

/**
 * The Drive access token (architecture doc, "Token lifecycle"): in memory and in sessionStorage,
 * so a reload within its lifetime needs no prompt. A new token always needs a tap (connect()).
 */
const TOKEN_KEY = 'drive-read:token'
const CONNECTED_KEY = 'drive-read:drive-connected'
/** Treat a token this close to expiry as gone: a request could outlive it. */
const SAFETY_MS = 60_000

export type AuthStatus = 'disconnected' | 'connected' | 'expired'

function readSession(): TokenGrant | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as TokenGrant | null
    return t?.accessToken && typeof t.expiresAt === 'number' ? t : null
  } catch {
    return null
  }
}

function safely(fn: () => void) {
  try {
    fn()
  } catch {
    // Storage unavailable (private mode): the token lives in memory only.
  }
}

export const useAuth = defineStore('auth', () => {
  const token = ref<TokenGrant | null>(null)
  const everConnected = ref(false)
  const error = ref<AuthError | null>(null)
  const busy = ref(false)
  /** Bumped when validToken() finds the token stale, so `status` recomputes. */
  const tick = ref(0)

  const fresh = (t: TokenGrant | null) => !!t && t.expiresAt - SAFETY_MS > Date.now()

  const status = computed<AuthStatus>(() => {
    void tick.value
    if (fresh(token.value)) return 'connected'
    return everConnected.value ? 'expired' : 'disconnected'
  })

  function restore() {
    safely(() => (everConnected.value = localStorage.getItem(CONNECTED_KEY) === '1'))
    const t = readSession()
    if (fresh(t)) {
      token.value = t
      // Connected before identification existed (or storage was cleared): identify now.
      if (!loadUserId()) void identify(t!.accessToken)
    }
  }

  /** Must run from a user gesture: it may open Google's sign-in popup. */
  async function connect(): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      const r = await useServices().gis.requestToken()
      if (r._tag === 'Err') {
        error.value = r.error
        track('auth.connect_failed', { reason: r.error.kind })
        return false
      }
      const first = !everConnected.value
      token.value = r.value
      everConnected.value = true
      safely(() => {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(r.value))
        localStorage.setItem(CONNECTED_KEY, '1')
      })
      track('auth.connected', { first })
      // Awaited (one small call) so identity is settled when connect() returns.
      await identify(r.value.accessToken)
      return true
    } finally {
      busy.value = false
    }
  }

  /** Pseudonymous account id for the logs: a hash of the Drive permission id, never the email. */
  async function identify(accessToken: string) {
    const about = await useServices()
      .drive.aboutUser(accessToken)
      .catch(() => null)
    if (!about || about._tag === 'Err') return
    const userId = await userIdFromPermission(about.value.permissionId)
    saveUserId(userId)
    logger.setIdentity({ userId })
  }

  /** The token if it is still good; a stale one is dropped. */
  function validToken(): Option<string> {
    if (fresh(token.value)) return Some(token.value!.accessToken)
    if (token.value) markExpired('expiry')
    return None
  }

  /** After a 401 or a passed expiry. `where` says which call found out. */
  function markExpired(where = 'api') {
    if (token.value) track('auth.expired', { where })
    token.value = null
    if (!everConnected.value) everConnected.value = true
    tick.value++
    safely(() => sessionStorage.removeItem(TOKEN_KEY))
  }

  return { status, error, busy, restore, connect, validToken, markExpired }
})
