import type { AuthError } from '@/services/auth/gis'
import type { DriveError } from '@/services/drive/client'

/** User-facing sentences for errors (architecture doc, "Failure states"). */

const AUTH: Record<AuthError['kind'], string> = {
  'popup-blocked': 'The sign-in window was blocked. Allow pop-ups for this site, then try again.',
  'popup-closed': 'The sign-in window closed before finishing. Try again.',
  denied: 'Drive access was not granted.',
  'scopes-missing':
    'Drive Read needs both permissions: reading your books and saving your place. Try again and allow both.',
  unavailable: 'Google sign-in could not load. Check your connection and try again.',
}

export const authErrorCopy = (e: AuthError) => AUTH[e.kind]

export function driveErrorCopy(e: DriveError): string {
  switch (e.kind) {
    case 'offline':
      return "You're offline. Drive can be browsed once you're back online."
    case 'rate-limited':
      return 'Drive is busy. Wait a moment and try again.'
    case 'forbidden':
    case 'not-found':
      return 'That folder is no longer available in your Drive.'
    case 'auth-expired':
      return 'Drive access has expired. Reconnect to continue.'
    case 'http':
      return `Drive did not answer (error ${e.status}). Try again.`
  }
}

export function formatSize(bytes: number): string {
  const mb = bytes / 1048576
  return mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

const time = (d: Date) =>
  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** "14:02", "yesterday 23:10", or "3 Oct 09:05". */
export function when(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (sameDay(d, now)) return time(d)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `yesterday ${time(d)}`
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time(d)}`
}

export function syncedLabel(lastSyncAt: string | null, now: Date = new Date()): string {
  return lastSyncAt ? `Synced ${when(lastSyncAt, now)}` : 'Not synced yet'
}

export function offerLabel(
  offer: { fraction: number; device: { name: string }; updatedAt: string },
  now: Date = new Date(),
): string {
  const w = when(offer.updatedAt, now)
  const at = sameDay(new Date(offer.updatedAt), now) ? `at ${w}` : w
  return `Jump to ${Math.floor(offer.fraction * 100)}%, read on ${offer.device.name} ${at}?`
}

const changes = (n: number) => `${n} change${n === 1 ? '' : 's'}`

export function syncNotice(status: string, pending: number): string | null {
  if (pending === 0) return null
  if (status === 'offline') return `Offline. ${changes(pending)} will sync when you're back online.`
  if (status === 'reconnect') return `Reconnect Drive to sync ${changes(pending)}.`
  return null
}

/** "Last read on Phone, yesterday 23:10" when the last position came from another device. */
export function lastReadLabel(
  record: { device: { id: string; name: string }; updatedAt: string },
  thisDeviceId: string,
  now: Date = new Date(),
): string | null {
  if (record.device.id === thisDeviceId) return null
  return `Last read on ${record.device.name}, ${when(record.updatedAt, now)}`
}
