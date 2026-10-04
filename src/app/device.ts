/**
 * This device's identity for progress records ("read on Phone at 23:10").
 * Kept in localStorage: it must be readable synchronously at startup, and losing it only
 * means the next record carries a new id.
 */
const KEY = 'drive-read:device'

export interface Device {
  id: string
  name: string
}

export function deviceName(userAgent: string): string {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) return 'Tablet'
  if (/Mobi|iPhone|Android/i.test(userAgent)) return 'Phone'
  return 'Computer'
}

export function currentDevice(): Device {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Device | null
    if (stored?.id && stored.name) return stored
  } catch {
    // Unreadable: make a new one.
  }
  const device = { id: crypto.randomUUID().slice(0, 8), name: deviceName(navigator.userAgent) }
  try {
    localStorage.setItem(KEY, JSON.stringify(device))
  } catch {
    // Private mode: a fresh id per session is acceptable.
  }
  return device
}
