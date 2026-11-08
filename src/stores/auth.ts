import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useServices } from '@/services'
import type { AuthError, TokenGrant } from '@/services/auth/gis'
import {
  legacyUserIdFromPermission,
  loadUserId,
  saveUserId,
  userIdFromPermission,
} from '@/app/identity'
import { track } from '@/services/events'
import { logger } from '@/services/logger'
import { None, type Option, Some } from '@/shared/result'

import { useLibrary } from './library'
import { useSync } from './sync'

/**
 * The Drive access token (architecture doc, "Token lifecycle"): in memory and in sessionStorage,
 * so a reload within its lifetime needs no prompt. On the web a new token always needs a tap
 * (connect()); the desktop app renews it from its saved sign-in (`gis.silentToken`).
 */
const TOKEN_KEY = 'drive-read:token'
const CONNECTED_KEY = 'drive-read:drive-connected'
/** Treat a token this close to expiry as gone: a request could outlive it. */
const SAFETY_MS = 60_000

export type AuthStatus = 'disconnected' | 'connected' | 'expired'

/** Who connected: the log id, and the unsalted id older versions stored on this device. */
interface Account {
  userId: string
  legacyId: string
}

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
  /** Drive refused the token: the next silent renewal must not hand back the cached one. */
  let refused = false
  let renewing: Promise<Option<string>> | null = null

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
    } else if (everConnected.value) {
      // Desktop: connect from the saved sign-in at start.
      void validToken()
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
      const account = await accountOf(r.value.accessToken)
      if (!(await sameAccountOrReset(account))) return false
      const first = !everConnected.value
      keep(r.value)
      everConnected.value = true
      safely(() => localStorage.setItem(CONNECTED_KEY, '1'))
      track('auth.connected', { first })
      if (account) setUser(account.userId)
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
  async function sameAccountOrReset(account: Account | null): Promise<boolean> {
    const before = loadUserId()
    if (!account || !before || before === account.userId || before === account.legacyId) return true
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
  async function accountOf(accessToken: string): Promise<Account | null> {
    const about = await useServices()
      .drive.aboutUser(accessToken)
      .catch(() => null)
    if (!about || about._tag === 'Err') return null
    const { permissionId } = about.value
    return {
      userId: await userIdFromPermission(permissionId),
      legacyId: await legacyUserIdFromPermission(permissionId),
    }
  }

  function keep(t: TokenGrant) {
    token.value = t
    refused = false
    tick.value++
    safely(() => sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t)))
  }

  function setUser(userId: string) {
    saveUserId(userId)
    logger.setIdentity({ userId })
  }

  async function identify(accessToken: string) {
    const account = await accountOf(accessToken)
    if (account) setUser(account.userId)
  }

  /**
   * Disconnect Drive: Google withdraws the token, and this device forgets it was connected.
   * Books, positions and the account id stay, so the same account connects back without a prompt.
   */
  async function disconnect() {
    const t = token.value
    token.value = null
    everConnected.value = false
    error.value = null
    tick.value++
    safely(() => {
      sessionStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(CONNECTED_KEY)
    })
    track('auth.disconnected', {})
    await useServices().gis.revoke(t?.accessToken ?? null)
  }

  /**
   * The token if it is still good. A stale one is dropped; the desktop app then renews it from
   * the saved sign-in, without a tap.
   */
  async function validToken(): Promise<Option<string>> {
    if (fresh(token.value)) return Some(token.value!.accessToken)
    if (token.value) markExpired('expiry')
    const silent = useServices().gis.silentToken
    if (!silent || !everConnected.value) return None
    renewing ??= (async () => {
      const r = await silent(refused)
      if (r._tag === 'Err' || !fresh(r.value)) return None
      keep(r.value)
      if (!loadUserId()) void identify(r.value.accessToken)
      return Some(r.value.accessToken)
    })().finally(() => (renewing = null))
    return renewing
  }

  /** After a 401 or a passed expiry. `where` says which call found out. */
  function markExpired(where = 'api') {
    if (token.value) track('auth.expired', { where })
    if (where !== 'expiry') refused = true
    token.value = null
    if (!everConnected.value) everConnected.value = true
    tick.value++
    safely(() => sessionStorage.removeItem(TOKEN_KEY))
  }

  return { status, error, busy, restore, connect, disconnect, validToken, markExpired }
})
