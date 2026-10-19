import { ref } from 'vue'

import type { DesktopBridge } from '@/shared/desktop'

import { useServices } from '@/services'
import { useLibrary } from '@/stores/library'
import { isErr } from '@/shared/result'

import { chooseFiles, importMessage } from './useImportFiles'

/**
 * Desktop: books opened from outside the library (Finder, Dock, Open Recent, drag-and-drop,
 * File › Open…) are added and the first one opens.
 */

/** Why the last open from outside did not work; shown in the Library. */
export const openNotice = ref<string | null>(null)

const MIME = { epub: 'application/epub+zip', pdf: 'application/pdf' } as const
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** Adds the files; the id of the first book to open, or null (`openNotice` says why). */
export async function openBooks(files: readonly File[]): Promise<string | null> {
  if (files.length === 0) return null
  const result = await useLibrary().importFiles(files)
  openNotice.value = importMessage(result)
  return result.added[0]?.id ?? null
}

const HINT_KEY = 'drive-read:epub-default-hint'
const readHintDone = () => {
  try {
    return localStorage.getItem(HINT_KEY) === 'done'
  } catch {
    return false
  }
}
/** The one-time "make Drive Read open EPUB files" hint was dismissed, or is not needed. */
export const epubHintDone = ref(readHintDone())
export function finishEpubHint() {
  epubHintDone.value = true
  try {
    localStorage.setItem(HINT_KEY, 'done')
  } catch {
    // Private storage off: the hint may show again next run.
  }
}

/** Paths macOS handed over: read in place, then as `openBooks`. */
export async function openPaths(paths: readonly string[]): Promise<string | null> {
  const { files } = useServices()
  if (!files) return null
  // An EPUB arriving from Finder means macOS already opens EPUBs here: no need for the hint.
  if (paths.some((p) => /\.epub$/i.test(p))) finishEpubHint()
  const read: File[] = []
  const unreadable: string[] = []
  for (const path of paths) {
    const r = await files.read(path, /\.pdf$/i.test(path) ? MIME.pdf : MIME.epub)
    if (isErr(r)) unreadable.push(baseName(path))
    else read.push(r.value)
  }
  const id = await openBooks(read)
  if (unreadable.length > 0 && !openNotice.value)
    openNotice.value = importMessage({
      added: [],
      failed: unreadable.map((name) => ({ name, reason: 'unreadable' as const })),
    })
  return id
}

/**
 * Listens for books from outside the library. `go(id)` opens a book; `go(null)` shows the
 * library, where `openNotice` says why nothing opened.
 */
export function startDesktopOpens(bridge: DesktopBridge, go: (id: string | null) => void) {
  const finish = (id: string | null) => {
    if (id || openNotice.value) go(id)
  }
  bridge.onOpenPaths(async (paths) => finish(await openPaths(paths)))
  bridge.onMenuOpen(async () => finish(await openBooks(await chooseFiles({ multiple: true }))))
  // Dropped files: without this the window would try to navigate to the file.
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  })
  document.addEventListener('drop', async (e) => {
    const files = [...(e.dataTransfer?.files ?? [])]
    if (files.length === 0) return
    e.preventDefault()
    finish(await openBooks(files))
  })
}
