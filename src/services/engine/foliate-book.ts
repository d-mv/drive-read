import type { FoliateBook } from '@foliate/view.js'

import { foliateKind } from './sniff'
import { openZip } from './zip'

/**
 * Builds a foliate-js book in place of its `makeBook`, which picks among more readers than this
 * app offers (Kindle, comics) and unpacks zips without limits. Here an EPUB or FB2 is read only by
 * foliate-js's EPUB or FB2 reader, through the capped zip loader, with an embedded cover only.
 */
export async function openFoliateBook(file: File, format: 'epub' | 'fb2'): Promise<FoliateBook> {
  const kind = await foliateKind(file, format)
  if (kind === 'epub') {
    const { EPUB } = await import('@foliate/epub.js')
    return new EPUB(await openZip(file)).init()
  }
  const { makeFB2 } = await import('@foliate/fb2.js')
  let xml: Blob = file
  if (kind === 'fbz') {
    const zip = await openZip(file)
    const entry = zip.entries.find((e) => e.filename.endsWith('.fb2')) ?? zip.entries[0]
    const blob = entry && (await zip.loadBlob(entry.filename))
    if (!blob) throw new Error('not an FB2: the archive is empty')
    xml = blob
  }
  return embeddedCoverOnly(await makeFB2(xml))
}

/**
 * foliate-js's FB2 `getCover` runs `fetch(src)` on the cover image's src, which the book chooses:
 * an embedded image (a data: URL) or any URL at all. It calls fetch synchronously, so for that one
 * call fetch is swapped for one that decodes data: URLs and refuses the rest. Nothing is fetched.
 */
export function embeddedCoverOnly(book: FoliateBook): FoliateBook {
  const getCover = book.getCover
  if (!getCover) return book
  book.getCover = () => {
    const real = globalThis.fetch
    globalThis.fetch = decodeDataUrl
    try {
      return getCover.call(book)
    } finally {
      globalThis.fetch = real
    }
  }
  return book
}

/** A fetch for data: URLs only, decoded here. */
async function decodeDataUrl(input: RequestInfo | URL): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input)
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma < 0)
    throw new TypeError('the cover is not embedded in the book')
  const meta = url.slice('data:'.length, comma)
  const body = url.slice(comma + 1)
  const base64 = meta.endsWith(';base64')
  const bytes = base64
    ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(body))
  const type = base64 ? meta.slice(0, -';base64'.length) : meta
  return new Response(new Blob([bytes], { type }))
}
