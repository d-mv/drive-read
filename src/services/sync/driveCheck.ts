import type { BookRecord } from '@/domain/book'
import type { DriveFile } from '@/services/drive/client'

/**
 * Drive file changes (architecture doc, "Failure states"): compares the library's Drive books
 * with one listing of every EPUB and PDF in Drive, so the check costs a few requests however
 * large the library is.
 */

export type DrivePatch = Pick<BookRecord, 'missingInDrive' | 'driveVersion' | 'md5' | 'size'>
export interface DriveChange {
  id: string
  patch: Partial<DrivePatch>
}

/**
 * What to change per book. `complete` is false when the listing may be cut short: then no book
 * is marked missing, since it may simply be beyond the listing.
 */
export function compareWithDrive(
  books: readonly BookRecord[],
  files: readonly DriveFile[],
  complete: boolean,
): DriveChange[] {
  const inDrive = new Map(files.map((f) => [f.id, f]))
  const changes: DriveChange[] = []
  for (const b of books) {
    if (b.source !== 'drive') continue
    const f = inDrive.get(b.id)
    const patch: Partial<DrivePatch> = {}
    if (!f) {
      if (complete && !b.missingInDrive) patch.missingInDrive = true
    } else {
      if (b.missingInDrive) patch.missingInDrive = false
      if (!f.md5) {
        // Drive gives no checksum (rare): nothing to compare.
      } else if (!b.downloaded) {
        // Not on the device: the next download fetches the current file anyway.
        if (f.md5 !== b.md5) Object.assign(patch, { md5: f.md5, size: f.size })
        if (b.driveVersion) patch.driveVersion = undefined
      } else if (f.md5 !== b.md5) {
        if (b.driveVersion?.md5 !== f.md5) patch.driveVersion = { md5: f.md5, size: f.size }
      } else if (b.driveVersion) patch.driveVersion = undefined
    }
    if (Object.keys(patch).length > 0) changes.push({ id: b.id, patch })
  }
  return changes
}

/** The books with `changes` applied (unchanged books are returned as they are). */
export function applyPatches(books: readonly BookRecord[], changes: readonly DriveChange[]) {
  const byId = new Map(changes.map((c) => [c.id, c.patch]))
  return books.map((b) => {
    const patch = byId.get(b.id)
    if (!patch) return b
    const next = { ...b, ...patch }
    if ('driveVersion' in patch && patch.driveVersion === undefined) delete next.driveVersion
    return next
  })
}
