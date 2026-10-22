import type { Device } from './device'

/**
 * Pseudonymous identity for the logs (owner decision 2026-10-05, options A + B):
 * a random per-browser device id, and a hash of the Google account's Drive permission id.
 * No email or name ever reaches the logs; a known person's events can be found only by
 * hashing their permission id the same way.
 */

export const USER_KEY = 'drive-read:user'
const USER_ID = /^u_[0-9a-f]{16}$/

/** Makes the id specific to this app: a plain hash of a permission id is the same everywhere. */
const SALT = 'drive-read/user-id/v2:'

async function hashId(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return `u_${hex.slice(0, 16)}`
}

export const userIdFromPermission = (permissionId: string) => hashId(SALT + permissionId)

/** The id before 0.23.4 (unsalted): a device that stored it is still the same account. */
export const legacyUserIdFromPermission = (permissionId: string) => hashId(permissionId)

/** Kept so sessions without a token (offline, expired) are still attributed. */
export function loadUserId(): string | null {
  try {
    const v = localStorage.getItem(USER_KEY)
    return v && USER_ID.test(v) ? v : null
  } catch {
    return null
  }
}

export function saveUserId(id: string) {
  try {
    localStorage.setItem(USER_KEY, id)
  } catch {
    // Private mode: this session is still attributed in memory.
  }
}

export const deviceLabel = (d: Device) => `${d.id}/${d.name}`
