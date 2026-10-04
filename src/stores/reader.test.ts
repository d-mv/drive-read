import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useLibrary } from './library'
import { useReader } from './reader'
import { epubFile, META, setupServices } from './test-services'

beforeEach(() => setActivePinia(createPinia()))

const relocation = (fraction: number) => ({
  position: {
    locator: { kind: 'cfi' as const, cfi: `epubcfi(/6/4!/4/2/1:${fraction})` },
    fraction,
    chapterIndex: fraction < 0.5 ? 0 : 1,
    chapterFraction: 0.5,
  },
  chapterMinutesLeft: 11,
})

async function withBook() {
  const ctx = await setupServices()
  await useLibrary().importFiles([epubFile('abc')])
  return ctx
}

describe('open', () => {
  it('opens the stored file and mounts at the start of a new book', async () => {
    const { engine } = await withBook()
    const reader = useReader()
    const el = document.createElement('div')
    await reader.open('local-abc', el)

    expect(engine.open).toHaveBeenCalledWith(expect.any(File))
    expect(engine.mount).toHaveBeenCalledWith(el, undefined)
    expect(reader.status).toEqual({ kind: 'ready' })
    expect(reader.toc).toEqual(META.toc)
  })

  it('restores the saved position', async () => {
    const { engine } = await withBook()
    await useLibrary().saveProgress('local-abc', relocation(0.42).position)
    await useReader().open('local-abc', document.createElement('div'))
    expect(engine.mount).toHaveBeenCalledWith(expect.anything(), {
      locator: relocation(0.42).position.locator,
      fraction: 0.42,
    })
  })

  it('marks the book opened', async () => {
    await withBook()
    await useReader().open('local-abc', document.createElement('div'))
    expect(useLibrary().books[0]!.openedAt).not.toBeNull()
  })

  it('reports a book that is not in the library', async () => {
    await setupServices()
    const reader = useReader()
    await reader.open('nope', document.createElement('div'))
    expect(reader.status).toEqual({ kind: 'error', error: 'not-found' })
  })

  it('reports a file the browser evicted', async () => {
    const { blobs } = await withBook()
    await blobs.remove('books/local-abc')
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    expect(reader.status).toEqual({ kind: 'error', error: 'missing-file' })
  })
})

describe('reading', () => {
  it('tracks the position and saves it on every relocate', async () => {
    const { relocate } = await withBook()
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    relocate(relocation(0.6))
    await Promise.resolve()

    expect(reader.position?.fraction).toBe(0.6)
    expect(reader.chapterMinutesLeft).toBe(11)
    await expect.poll(() => useLibrary().items[0]!.fraction).toBe(0.6)
  })

  it('turns pages and follows contents links through the engine', async () => {
    const { engine } = await withBook()
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    await reader.next()
    await reader.prev()
    await reader.goTo(META.toc[1]!.locator)
    expect(engine.next).toHaveBeenCalled()
    expect(engine.prev).toHaveBeenCalled()
    expect(engine.goTo).toHaveBeenCalledWith({ kind: 'href', href: 'ch2.xhtml' })
  })

  it('destroys the engine on close', async () => {
    const { engine } = await withBook()
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    reader.close()
    expect(engine.destroy).toHaveBeenCalled()
    expect(reader.status).toEqual({ kind: 'idle' })
  })
})
