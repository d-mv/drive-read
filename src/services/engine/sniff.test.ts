import { describe, expect, it } from 'vitest'

import { detectFormat, foliateKind } from './sniff'

/** A zip whose first local file header names `first` (contents don't matter for sniffing). */
function zipWith(first: string): Uint8Array<ArrayBuffer> {
  const name = new TextEncoder().encode(first)
  const head = new Uint8Array(30 + name.length)
  head.set([0x50, 0x4b, 0x03, 0x04])
  new DataView(head.buffer).setUint16(26, name.length, true)
  head.set(name, 30)
  return head
}

const file = (bytes: BlobPart, name: string, type = '') => new File([bytes], name, { type })

const FB2 =
  '<?xml version="1.0" encoding="windows-1251"?>\n<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description/></FictionBook>'

describe('detectFormat', () => {
  it.each([
    ['a PDF', file('%PDF-1.7 ...', 'paper.pdf'), 'pdf'],
    ['a PDF without an extension', file('%PDF-1.4', 'download'), 'pdf'],
    ['an EPUB (mimetype first)', file(zipWith('mimetype'), 'a.epub'), 'epub'],
    ['an FB2', file(FB2, 'book.fb2'), 'fb2'],
    ['an FB2 with no XML declaration', file('<FictionBook>', 'x.txt'), 'fb2'],
    ['a zipped FB2', file(zipWith('Book.fb2'), 'book.fbz'), 'fb2'],
    ['a zipped FB2 named .epub', file(zipWith('Dippel_Izara.fb2'), 'Пламя (epub).epub'), 'fb2'],
    ['a zipped FB2 named .fb2.zip', file(zipWith('a.fb2'), 'a.fb2.zip'), 'fb2'],
    ['an EPUB without mimetype first, by name', file(zipWith('OEBPS/c1.xhtml'), 'a.epub'), 'epub'],
    // Unrecognised bytes go by name: the engine then says the file is damaged.
    ['a damaged file named .pdf', file('nope', 'a.pdf'), 'pdf'],
    ['an empty file named .epub', file('', 'a.epub'), 'epub'],
    ['by type when there is no extension', file('?', 'download', 'application/epub+zip'), 'epub'],
  ])('knows %s', async (_, f, format) => {
    expect(await detectFormat(f)).toBe(format)
  })

  it.each([
    ['a text file', file('hello', 'notes.txt')],
    ['an unknown zip', file(zipWith('photo.jpg'), 'photos.zip')],
  ])('refuses %s', async (_, f) => {
    expect(await detectFormat(f)).toBeNull()
  })
})

describe('foliateKind', () => {
  it('opens an FB2 as plain XML or zipped, whatever it was called', async () => {
    expect(await foliateKind(file(FB2, 'Пламя.epub'), 'fb2')).toBe('fb2')
    expect(await foliateKind(file(zipWith('a.fb2'), 'Пламя.epub'), 'fb2')).toBe('fbz')
  })

  it('opens an EPUB as an EPUB, whatever it was called', async () => {
    for (const [name, type] of [
      ['a.epub', ''],
      ['comic.cbz', ''],
      ['download', 'application/vnd.comicbook+zip'],
    ]) {
      expect(await foliateKind(file(zipWith('mimetype'), name!, type), 'epub')).toBe('epub')
    }
  })

  it('refuses an EPUB that is not a zip', async () => {
    await expect(foliateKind(file(mobi(), 'a.epub'), 'epub')).rejects.toThrow('not a zip')
    await expect(foliateKind(file('nope', 'a.epub'), 'epub')).rejects.toThrow('not a zip')
  })

  it('refuses a Kindle (MOBI) file named as an FB2', async () => {
    await expect(foliateKind(file(mobi(), 'a.fb2'), 'fb2')).rejects.toThrow('Kindle book')
  })
})

/** A Kindle book's signature: `BOOKMOBI` at offset 60. */
function mobi(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(1024)
  bytes.set(new TextEncoder().encode('BOOKMOBI'), 60)
  return bytes
}
