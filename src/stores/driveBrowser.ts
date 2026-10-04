import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useServices } from '@/services'
import { logger } from '@/services/logger'
import { type DriveError, type DriveFile, FOLDER_MIME } from '@/services/drive/client'
import { bookFromFileName, folderLabel } from '@/services/drive/names'
import { isNone, type Result } from '@/shared/result'

import { useAuth } from './auth'
import { useLibrary } from './library'

/** "Add from Drive" (canvas: DriveBooks, DriveFolders, MobileDriveFolder, MobileDriveReconnect). */

export type BrowserStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'reconnect' }
  | { kind: 'error'; error: DriveError }

export interface BrowserBook {
  id: string
  name: string
  title: string
  author: string
  format: 'EPUB' | 'PDF'
  size: number
  inLibrary: boolean
  /** EPUB not yet in the library. PDF waits for build step 6. */
  addable: boolean
  selected: boolean
}

export interface BrowserFolder {
  id: string
  label: string
  /** The folder's name in Drive, shown under the label when they differ. */
  raw: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const useDriveBrowser = defineStore('driveBrowser', () => {
  const status = ref<BrowserStatus>({ kind: 'idle' })
  const files = ref<DriveFile[]>([])
  const trail = ref<{ id: string; name: string }[]>([])
  const selectedIds = ref<string[]>([])
  const busy = ref(false)

  const library = useLibrary()
  const inLibrary = computed(() => new Set(library.books.map((b) => b.id)))

  const books = computed<BrowserBook[]>(() =>
    files.value
      .filter((f) => f.mimeType !== FOLDER_MIME)
      .map((f) => {
        const isEpub = f.mimeType === 'application/epub+zip'
        const owned = inLibrary.value.has(f.id)
        return {
          id: f.id,
          name: f.name,
          ...bookFromFileName(f.name),
          format: isEpub ? 'EPUB' : 'PDF',
          size: f.size,
          inLibrary: owned,
          addable: isEpub && !owned,
          selected: selectedIds.value.includes(f.id),
        }
      }),
  )

  const folders = computed<BrowserFolder[]>(() =>
    files.value
      .filter((f) => f.mimeType === FOLDER_MIME)
      .map((f) => ({ id: f.id, label: folderLabel(f.name), raw: f.name })),
  )

  const selected = computed(() => books.value.filter((b) => b.selected))
  const selectedCount = computed(() => selected.value.length)
  const selectedBytes = computed(() => selected.value.reduce((n, b) => n + b.size, 0))

  /** Runs a Drive call with a valid token, turning auth problems into the reconnect state. */
  async function withToken<T>(
    call: (token: string) => Promise<Result<T, DriveError>>,
    isCurrent: () => boolean = () => true,
  ): Promise<T | null> {
    const auth = useAuth()
    const token = auth.validToken()
    if (isNone(token)) {
      status.value = { kind: 'reconnect' }
      return null
    }
    const r = await call(token.value)
    // A newer request owns the screen now; this answer must not touch it.
    if (!isCurrent()) return null
    if (r._tag === 'Ok') return r.value
    if (r.error.kind === 'auth-expired') {
      auth.markExpired()
      status.value = { kind: 'reconnect' }
    } else status.value = { kind: 'error', error: r.error }
    return null
  }

  /** Bumped by every listing; only the latest one may update the screen. */
  let seq = 0

  async function load(
    kind: 'search' | 'folder',
    call: (token: string) => Promise<Result<DriveFile[], DriveError>>,
  ) {
    const mine = ++seq
    const started = performance.now()
    status.value = { kind: 'loading' }
    const result = await withToken(call, () => mine === seq)
    logger.info('drive listed', {
      kind,
      ms: Math.round(performance.now() - started),
      files: result?.length ?? null,
      stale: mine !== seq,
    })
    if (!result || mine !== seq) return
    files.value = result
    selectedIds.value = []
    status.value = { kind: 'ready' }
  }

  /** Every EPUB and PDF in Drive whose name contains `query`. */
  function search(query: string) {
    trail.value = []
    return load('search', (token) => useServices().drive.searchBooks(token, query))
  }

  /** Opens a folder; opening one already in the trail goes back up to it. */
  async function openFolder(id: string, name: string) {
    const at = trail.value.findIndex((t) => t.id === id)
    trail.value = at >= 0 ? trail.value.slice(0, at + 1) : [...trail.value, { id, name }]
    await load('folder', (token) => useServices().drive.listChildren(token, id))
  }

  function toggle(id: string) {
    const book = books.value.find((b) => b.id === id)
    if (!book?.addable) return
    selectedIds.value = book.selected
      ? selectedIds.value.filter((x) => x !== id)
      : [...selectedIds.value, id]
  }

  function clearSelection() {
    selectedIds.value = []
  }

  function summary(addedIds: string[], before: Set<string>, pdfs: number, truncated = false) {
    const fresh = addedIds.filter((id) => !before.has(id)).length
    return [
      `Added ${plural(fresh, 'book')}.`,
      pdfs > 0 ? `${plural(pdfs, 'PDF')} skipped: PDF support comes later.` : '',
      truncated ? 'The folder is very large; add its subfolders separately for the rest.' : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  async function add(toAdd: DriveFile[], truncated = false): Promise<string> {
    const before = new Set(inLibrary.value)
    const result = await library.addFromDrive(toAdd)
    const pdfs = result.failed.filter((f) => f.reason === 'unsupported').length
    return summary(
      result.added.map((b) => b.id),
      before,
      pdfs,
      truncated,
    )
  }

  async function addSelected(): Promise<string> {
    busy.value = true
    try {
      const ids = new Set(selected.value.map((b) => b.id))
      const message = await add(files.value.filter((f) => ids.has(f.id)))
      selectedIds.value = []
      return message
    } finally {
      busy.value = false
    }
  }

  /** Every book under a folder, at any depth. */
  async function addFolder(id: string): Promise<string | null> {
    busy.value = true
    try {
      const found = await withToken((token) => useServices().drive.listBooksRecursive(token, id))
      return found ? add(found.books, found.truncated) : null
    } finally {
      busy.value = false
    }
  }

  return {
    status,
    trail,
    books,
    folders,
    busy,
    selectedCount,
    selectedBytes,
    search,
    openFolder,
    toggle,
    clearSelection,
    addSelected,
    addFolder,
  }
})
