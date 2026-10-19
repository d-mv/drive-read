import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { memoryLocalFiles } from '@/services/storage/localFiles'
import { useLibrary } from '@/stores/library'
import { epubFile, setupServices } from '@/stores/test-services'

import { openBooks, openNotice, openPaths } from './desktopOpen'

beforeEach(() => {
  setActivePinia(createPinia())
  openNotice.value = null
})

describe('openBooks', () => {
  it('adds the books and answers the first one to open', async () => {
    await setupServices()
    const id = await openBooks([epubFile('abc'), epubFile('def', 'other.epub')])
    expect(id).toBe('local-abc')
    expect(useLibrary().books).toHaveLength(2)
    expect(openNotice.value).toBeNull()
  })

  it('says why nothing opened', async () => {
    await setupServices()
    expect(await openBooks([new File(['x'], 'notes.txt')])).toBeNull()
    expect(openNotice.value).toBe('notes.txt: Only EPUB, FB2 and PDF files open.')
  })
})

describe('openPaths (Finder, Dock, Open Recent)', () => {
  it('reads the file in place and keeps its path', async () => {
    const files = memoryLocalFiles()
    const { blobs } = await setupServices({ files })
    files.disk.set('/Books/harbour_year.epub', epubFile('abc'))
    files.kept.add('/Books/harbour_year.epub')

    const id = await openPaths(['/Books/harbour_year.epub'])

    expect(id).toBe('local-abc')
    expect(useLibrary().books[0]).toEqual(
      expect.objectContaining({ path: '/Books/harbour_year.epub', format: 'epub' }),
    )
    expect(blobs.paths()).toEqual(['covers/local-abc'])
  })

  it('says a file could not be read', async () => {
    const files = memoryLocalFiles()
    await setupServices({ files })
    expect(await openPaths(['/Books/gone.epub'])).toBeNull()
    expect(openNotice.value).toBe(
      "gone.epub: This file can't be opened. It may be protected or damaged.",
    )
  })
})
