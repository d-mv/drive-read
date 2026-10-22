import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useServices } from '@/services'
import type { AuthError, TokenGrant } from '@/services/auth/gis'
import { loadUserId, saveUserId, userIdFromPermission } from '@/app/identity'
import { track } from '@/services/events'
import { logger } from '@/services/logger'
import { None, type Option, Some } from '@/shared/result'

import { useLibrary } from './library'
import { useSync } from './sync'

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
      // Which account this is, before the token is kept: one small call.
      const userId = await accountOf(r.value.accessToken)
      if (!(await sameAccountOrReset(userId))) return false
      const first = !everConnected.value
      token.value = r.value
      everConnected.value = true
      safely(() => {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(r.value))
        localStorage.setItem(CONNECTED_KEY, '1')
      })
      track('auth.connected', { first })
      if (userId) setUser(userId)
      return true
    } finally {
      busy.value = false
    }
  }

  /**
   * The library on this device syncs with one Google account. If another one connects, ask; once
   * confirmed, clear the device first, or the old account's books and positions would be pushed
   * into the new account's Drive. False: the user kept the old account.
   */
  async function sameAccountOrReset(userId: string | null): Promise<boolean> {
    const before = loadUserId()
    if (!userId || !before || userId === before) return true
    const library = useLibrary()
    const books = library.books.length
    const confirmed = confirm(
      'This is a different Google account from the one used on this device before.\n\n' +
        'Continue with it? The books and reading positions of the other account are removed ' +
        'from this device (they stay in that account’s Drive).',
    )
    track('auth.account_switch', { confirmed, books })
    if (!confirmed) return false
    await library.removeAll()
    await useSync().forget()
    return true
  }

  /** Pseudonymous account id for the logs: a hash of the Drive permission id, never the email. */
  async function accountOf(accessToken: string): Promise<string | null> {
    const about = await useServices()
      .drive.aboutUser(accessToken)
      .catch(() => null)
    if (!about || about._tag === 'Err') return null
    return userIdFromPermission(about.value.permissionId)
  }

  function setUser(userId: string) {
    saveUserId(userId)
    logger.setIdentity({ userId })
  }

  async function identify(accessToken: string) {
    const userId = await accountOf(accessToken)
    if (userId) setUser(userId)
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
