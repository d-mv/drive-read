import type { BookFormat } from '@/domain/book'

/**
 * Which engine a file needs, from its first bytes, then its name and type. Content wins: books
 * are often misnamed (a zipped FB2 saved as `.epub`). Unrecognised bytes go by name, so a damaged
 * book reaches its engine and is reported as damaged rather than as the wrong kind of file.
 */

const HEAD_BYTES = 1024

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) =>
  prefix.every((b, i) => bytes[i] === b)

/** The first entry name of a zip archive (local file header), or null if not a zip. */
function firstZipEntry(bytes: Uint8Array): string | null {
  if (bytes.length < 30 || !startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return null
  const nameLength = bytes[26]! | (bytes[27]! << 8)
  return new TextDecoder().decode(bytes.subarray(30, 30 + nameLength))
}

const isFb2Name = (name: string) => /\.(fb2|fbz|fb2\.zip)$/i.test(name)

function byName({ name, type }: File): BookFormat | null {
  if (type === 'application/epub+zip' || /\.epub$/i.test(name)) return 'epub'
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  if (type === 'application/x-fictionbook+xml' || isFb2Name(name)) return 'fb2'
  return null
}

export async function detectFormat(file: File): Promise<BookFormat | null> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer())
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return 'pdf' // %PDF
  const entry = firstZipEntry(head)
  if (entry === 'mimetype') return 'epub'
  if (entry && /\.fb2$/i.test(entry)) return 'fb2'
  // FB2 is XML; any encoding keeps the ASCII tag name readable.
  if (!entry && /<FictionBook[\s>]/.test(new TextDecoder('latin1').decode(head))) return 'fb2'
  const named = byName(file)
  // A zip that is neither an EPUB nor an FB2 is only an EPUB if it says so by name.
  return entry && named === 'fb2' ? null : named
}

/** foliate-js's own test for a Kindle book: `BOOKMOBI` at byte 60. */
const isMobi = (head: Uint8Array) =>
  new TextDecoder('latin1').decode(head.subarray(60, 68)) === 'BOOKMOBI'

/**
 * foliate-js picks its reader by file name, type and bytes, and also has Kindle (MOBI) and comic
 * (CBZ) readers this app never offers. So an EPUB goes in as `book.epub` and must be a zip; an
 * FB2 goes in as `book.fbz` (zipped) or `book.fb2` (XML), never with Kindle bytes. Anything else
 * throws, and the engine reports the file as unreadable.
 */
export async function foliateFile(file: File, format: BookFormat): Promise<File> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer())
  const zipped = firstZipEntry(head) !== null
  if (format === 'epub') {
    if (!zipped) throw new Error('not an EPUB: the file is not a zip archive')
    return new File([file], 'book.epub', { type: 'application/epub+zip' })
  }
  if (format !== 'fb2') return file
  if (zipped) return new File([file], 'book.fbz', { type: 'application/x-zip-compressed-fb2' })
  if (isMobi(head)) throw new Error('not an FB2: the file is a Kindle book')
  return new File([file], 'book.fb2', { type: 'application/x-fictionbook+xml' })
}
