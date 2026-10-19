/**
 * The desktop app is not notarised, so it cannot update itself (Squirrel.Mac needs that).
 * Instead it reads a small version file published with the web app and offers a download.
 */

/** Published at VERSION_URL by `bun run desktop:package` (public/desktop-version.json). */
export const VERSION_URL = 'https://drive-read.mlnkv.net/desktop-version.json'

export interface DesktopUpdate {
  version: string
  /** https only: opened in the browser. */
  url: string
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

function parts(v: string): number[] | null {
  const m = SEMVER.exec(v)
  return m ? m.slice(1).map(Number) : null
}

function isNewer(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!
  return false
}

const httpsUrl = (u: unknown): u is string => {
  if (typeof u !== 'string') return false
  try {
    return new URL(u).protocol === 'https:'
  } catch {
    return false
  }
}

/** The published version when it is newer than `current`; null otherwise or for a bad file. */
export function newerVersion(raw: unknown, current: string): DesktopUpdate | null {
  if (typeof raw !== 'object' || raw === null) return null
  const doc = raw as Record<string, unknown>
  if (doc.v !== 1 || typeof doc.version !== 'string' || !httpsUrl(doc.url)) return null
  const published = parts(doc.version)
  const mine = parts(current)
  if (!published || !mine || !isNewer(published, mine)) return null
  return { version: doc.version, url: doc.url }
}
