import type { Device } from './device'

/**
 * Pseudonymous identity for the logs (owner decision 2026-10-05, options A + B):
 * a random per-browser device id, and a hash of the Google account's Drive permission id.
 * No email or name ever reaches the logs; a known person's events can be found only by
 * hashing their permission id the same way.
 */

export const USER_KEY = 'drive-read:user'
const USER_ID = /^u_[0-9a-f]{16}$/

export async function userIdFromPermission(permissionId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(permissionId))
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return `u_${hex.slice(0, 16)}`
}

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
