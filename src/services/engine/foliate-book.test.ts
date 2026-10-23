import type { FoliateBook } from '@foliate/view.js'
import { describe, expect, it } from 'vitest'

import { embeddedCoverOnly, openFoliateBook } from './foliate-book'

const PNG_BASE64 = 'iVBORw0KGgo='

/**
 * A book whose getCover does what foliate-js's FB2 reader does: `fetch(src)` on the cover's src.
 * (happy-dom can't read the FB2's namespaced `l:href`; the real reader is covered by e2e.)
 */
const bookWithCover = (src: string) =>
  ({ getCover: () => fetch(src).then((res) => res.blob()) }) as unknown as FoliateBook

describe('embeddedCoverOnly', () => {
  it('reads a cover embedded in the book', async () => {
    const book = embeddedCoverOnly(bookWithCover(`data:image/png;base64,${PNG_BASE64}`))
    const cover = await book.getCover?.()
    expect(cover?.type).toBe('image/png')
    expect(new Uint8Array(await cover!.arrayBuffer())).toEqual(
      Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0)),
    )
  })

  it.each(['https://tracker.example/c.jpg', '/same-origin.jpg', 'blob:x'])(
    'never fetches a cover at %s',
    async (src) => {
      const fetched: unknown[] = []
      const real = globalThis.fetch
      globalThis.fetch = (async (input: unknown) => {
        fetched.push(input)
        return new Response('')
      }) as typeof fetch
      try {
        const book = embeddedCoverOnly(bookWithCover(src))
        await expect(Promise.resolve(book.getCover?.())).rejects.toThrow(/embedded/)
      } finally {
        globalThis.fetch = real
      }
      expect(fetched).toEqual([])
    },
  )

  it('leaves fetch as it was afterwards', async () => {
    const before = globalThis.fetch
    await Promise.resolve(embeddedCoverOnly(bookWithCover('/x.jpg')).getCover?.()).catch(() => null)
    expect(globalThis.fetch).toBe(before)
  })
})

describe('which reader opens a file', () => {
  it('refuses an EPUB that is not a zip', async () => {
    await expect(openFoliateBook(new File(['plain text'], 'x.epub'), 'epub')).rejects.toThrow(
      /not a zip/,
    )
  })

  it('refuses a Kindle book offered as FB2', async () => {
    const head = new Uint8Array(68)
    head.set(new TextEncoder().encode('BOOKMOBI'), 60)
    await expect(openFoliateBook(new File([head], 'x.fb2'), 'fb2')).rejects.toThrow(/Kindle/)
  })
})
