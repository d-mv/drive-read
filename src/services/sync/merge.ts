import type { ProgressRecord } from '@/domain/book'

/**
 * Pure sync rules (architecture doc, "Progress sync" and "Conflict rule").
 * Remote change is detected against Drive's modifiedTime this device last saw, never by
 * comparing device clocks; the later updatedAt only breaks a real conflict.
 */

/** The record as stored in Drive: the local one minus local-only fields. */
export type SyncedProgress = Omit<ProgressRecord, 'dirty' | 'remoteId' | 'remoteModifiedTime'>

export interface RemoteProgress {
  /** Drive file id of progress-<fileId>.json */
  id: string
  modifiedTime: string
  record: SyncedProgress
}

export type ProgressDecision =
  | { action: 'none' }
  | { action: 'push'; offer?: 'remote'; remote?: RemoteProgress }
  | { action: 'adopt'; remote: RemoteProgress; offer?: 'local' }

export function decideProgress(
  local: ProgressRecord | undefined,
  remote: RemoteProgress | undefined,
): ProgressDecision {
  if (!remote) return local?.dirty ? { action: 'push' } : { action: 'none' }
  if (!local) return { action: 'adopt', remote }

  const remoteChanged = remote.modifiedTime !== local.remoteModifiedTime
  if (!remoteChanged) return local.dirty ? { action: 'push' } : { action: 'none' }
  if (!local.dirty) return { action: 'adopt', remote }

  // Both changed: latest write wins (not furthest position), the other is offered once.
  return remote.record.updatedAt > local.updatedAt
    ? { action: 'adopt', remote, offer: 'local' }
    : { action: 'push', offer: 'remote', remote }
}

export const toSynced = ({
  dirty: _d,
  remoteId: _i,
  remoteModifiedTime: _m,
  ...rest
}: ProgressRecord): SyncedProgress => rest

/** One book in library.json. Removal is a marker, so another device does not add it back. */
export interface LibraryEntry {
  fileId: string
  md5: string | null
  name: string
  addedAt: string
  updatedAt: string
  removed: boolean
}

export interface LibraryDoc {
  v: 1
  entries: LibraryEntry[]
}

/** Per entry, the later updatedAt wins; the result is the union of both sides, by fileId. */
export function mergeLibrary(
  local: readonly LibraryEntry[],
  remote: readonly LibraryEntry[],
): LibraryEntry[] {
  const byId = new Map<string, LibraryEntry>()
  for (const e of [...local, ...remote]) {
    const have = byId.get(e.fileId)
    if (!have || e.updatedAt > have.updatedAt) byId.set(e.fileId, e)
  }
  return [...byId.values()].sort((a, b) => a.fileId.localeCompare(b.fileId))
}

/** What this device must do so its library matches the merged entries. */
export function libraryChanges(
  merged: readonly LibraryEntry[],
  localIds: readonly string[],
): { toAdd: LibraryEntry[]; toRemove: string[] } {
  const here = new Set(localIds)
  return {
    toAdd: merged.filter((e) => !e.removed && !here.has(e.fileId)),
    toRemove: merged.filter((e) => e.removed && here.has(e.fileId)).map((e) => e.fileId),
  }
}

export function isValidLibraryDoc(raw: unknown): raw is LibraryDoc {
  if (!raw || typeof raw !== 'object') return false
  const doc = raw as Record<string, unknown>
  if (doc.v !== 1 || !Array.isArray(doc.entries)) return false
  return doc.entries.every((e) => {
    if (!e || typeof e !== 'object') return false
    const entry = e as Record<string, unknown>
    return (
      typeof entry.fileId === 'string' &&
      (entry.md5 === null || typeof entry.md5 === 'string') &&
      typeof entry.name === 'string' &&
      typeof entry.addedAt === 'string' &&
      typeof entry.updatedAt === 'string' &&
      typeof entry.removed === 'boolean'
    )
  })
}

export function isValidSyncedProgress(raw: unknown): raw is SyncedProgress {
  if (!raw || typeof raw !== 'object') return false
  const p = raw as Record<string, unknown>
  if (
    p.v !== 1 ||
    typeof p.fileId !== 'string' ||
    typeof p.fraction !== 'number' ||
    typeof p.updatedAt !== 'string' ||
    !p.device ||
    typeof p.device !== 'object'
  ) {
    return false
  }
  const device = p.device as Record<string, unknown>
  if (typeof device.id !== 'string' || typeof device.name !== 'string') return false
  if (!p.locator || typeof p.locator !== 'object') return false
  const loc = p.locator as Record<string, unknown>
  if (loc.kind === 'cfi') {
    if (typeof loc.cfi !== 'string') return false
  } else if (loc.kind === 'page') {
    if (typeof loc.page !== 'number' || typeof loc.offset !== 'number') return false
  } else {
    return false
  }
  return true
}
