import { describe, expect, it } from 'vitest'

import type { ProgressRecord } from '@/domain/book'

import {
  decideProgress,
  type LibraryEntry,
  libraryChanges,
  mergeLibrary,
  type RemoteProgress,
} from './merge'

const local = (over: Partial<ProgressRecord> = {}): ProgressRecord => ({
  v: 1,
  fileId: 'b1',
  locator: { kind: 'cfi', cfi: 'epubcfi(/6/4!/4/2/1:0)' },
  fraction: 0.4,
  updatedAt: '2026-10-05T10:00:00Z',
  device: { id: 'laptop', name: 'Laptop' },
  dirty: false,
  bookmarks: [],
  remoteId: 'r1',
  remoteModifiedTime: '2026-10-05T09:00:00Z',
  ...over,
})

const remote = (
  over: Partial<RemoteProgress['record']> = {},
  modifiedTime = '2026-10-05T09:00:00Z',
): RemoteProgress => ({
  id: 'r1',
  modifiedTime,
  record: {
    v: 1,
    fileId: 'b1',
    locator: { kind: 'cfi', cfi: 'epubcfi(/6/8!/4/2/1:0)' },
    fraction: 0.61,
    updatedAt: '2026-10-05T11:00:00Z',
    device: { id: 'phone', name: 'Phone' },
    bookmarks: [],
    ...over,
  },
})

describe('decideProgress', () => {
  it('pushes a dirty record that Drive does not have yet', () => {
    expect(
      decideProgress(
        local({ dirty: true, remoteId: undefined, remoteModifiedTime: undefined }),
        undefined,
      ),
    ).toEqual({
      action: 'push',
    })
  })

  it('does nothing when neither side changed', () => {
    expect(decideProgress(local(), remote())).toEqual({ action: 'none' })
  })

  it('pushes local changes when Drive has not changed since last seen', () => {
    expect(decideProgress(local({ dirty: true }), remote())).toEqual({ action: 'push' })
  })

  it('adopts a remote change silently when nothing local is waiting', () => {
    const r = remote({}, '2026-10-05T11:00:05Z')
    expect(decideProgress(local(), r)).toEqual({ action: 'adopt', remote: r })
  })

  it('adopts a record that exists only in Drive', () => {
    const r = remote()
    expect(decideProgress(undefined, r)).toEqual({ action: 'adopt', remote: r })
  })

  it('on a conflict, the later write wins and the other position is offered', () => {
    const r = remote({ updatedAt: '2026-10-05T11:00:00Z' }, '2026-10-05T11:00:05Z')
    const l = local({ dirty: true, updatedAt: '2026-10-05T10:30:00Z' })
    expect(decideProgress(l, r)).toEqual({ action: 'adopt', remote: r, offer: 'local' })

    const newerLocal = local({ dirty: true, updatedAt: '2026-10-05T12:00:00Z' })
    expect(decideProgress(newerLocal, r)).toEqual({ action: 'push', offer: 'remote', remote: r })
  })

  it('latest write wins, not furthest position: going back to re-read is kept', () => {
    const r = remote({ fraction: 0.9, updatedAt: '2026-10-05T11:00:00Z' }, '2026-10-05T11:00:05Z')
    const reread = local({ dirty: true, fraction: 0.2, updatedAt: '2026-10-05T11:30:00Z' })
    expect(decideProgress(reread, r).action).toBe('push')
  })
})

const entry = (
  fileId: string,
  updatedAt: string,
  over: Partial<LibraryEntry> = {},
): LibraryEntry => ({
  fileId,
  md5: null,
  name: `${fileId}.epub`,
  addedAt: '2026-10-01T00:00:00Z',
  updatedAt,
  removed: false,
  ...over,
})

describe('mergeLibrary', () => {
  it('keeps the newer entry for each book and the union of both sides', () => {
    const merged = mergeLibrary(
      [entry('a', '2026-10-02T00:00:00Z'), entry('b', '2026-10-05T00:00:00Z', { removed: true })],
      [entry('b', '2026-10-03T00:00:00Z'), entry('c', '2026-10-04T00:00:00Z')],
    )
    expect(merged.map((e) => [e.fileId, e.removed])).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
    ])
  })

  it('a removal on another device wins over an older local add', () => {
    const merged = mergeLibrary(
      [entry('a', '2026-10-02T00:00:00Z')],
      [entry('a', '2026-10-04T00:00:00Z', { removed: true })],
    )
    expect(merged[0]!.removed).toBe(true)
  })
})

describe('libraryChanges', () => {
  it('lists books to register here and books to remove here', () => {
    const merged = [
      entry('keep', '2026-10-01T00:00:00Z'),
      entry('new', '2026-10-01T00:00:00Z'),
      entry('gone', '2026-10-05T00:00:00Z', { removed: true }),
      entry('never-here', '2026-10-05T00:00:00Z', { removed: true }),
    ]
    expect(libraryChanges(merged, ['keep', 'gone'])).toEqual({
      toAdd: [merged[1]],
      toRemove: ['gone'],
    })
  })
})
