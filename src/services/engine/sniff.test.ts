import { describe, expect, it } from 'vitest'

import { detectFormat, foliateFile } from './sniff'

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

describe('foliateFile', () => {
  it('names an FB2 so foliate-js picks its FB2 reader', async () => {
    expect((await foliateFile(file(FB2, 'Пламя.epub'), 'fb2')).name).toBe('book.fb2')
    expect((await foliateFile(file(zipWith('a.fb2'), 'Пламя.epub'), 'fb2')).name).toBe('book.fbz')
  })

  it('passes an EPUB through untouched', async () => {
    const f = file(zipWith('mimetype'), 'a.epub')
    expect(await foliateFile(f, 'epub')).toBe(f)
  })
})
