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
