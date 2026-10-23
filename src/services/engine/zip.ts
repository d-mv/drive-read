/**
 * The zip loader foliate-js reads EPUB and zipped FB2 through, with caps. foliate-js's own loader
 * unpacks whatever an archive asks for, so a few KB of zip could inflate to gigabytes in the tab.
 */

const MiB = 1024 * 1024

export interface ZipLimits {
  /** Files in the archive. */
  entries: number
  /** Unpacked bytes of one file. */
  entryBytes: number
  /** Unpacked bytes of all files together. */
  totalBytes: number
}

/** Far above any real book (a whole book file is at most 200 MB), far below a zip bomb. */
export const ZIP_LIMITS: ZipLimits = {
  entries: 10_000,
  entryBytes: 256 * MiB,
  totalBytes: 1024 * MiB,
}

/** The loader shape foliate-js's EPUB class and FB2 path read from. */
export interface ZipLoader {
  entries: { filename: string }[]
  loadText(name: string): Promise<string> | null
  loadBlob(name: string, type?: string): Promise<Blob> | null
  getSize(name: string): number
}

/**
 * Opens a zip after checking the sizes its directory declares against `limits`. zip.js then stops
 * any file that inflates past its declared size, so the declared sizes are binding.
 */
export async function openZip(file: Blob, limits: ZipLimits = ZIP_LIMITS): Promise<ZipLoader> {
  const { configure, ZipReader, BlobReader, TextWriter, BlobWriter } =
    await import('@foliate/vendor/zip.js')
  configure({ useWebWorkers: false })
  const entries = await new ZipReader(new BlobReader(file)).getEntries()

  if (entries.length > limits.entries)
    throw new Error(`zip too large: ${entries.length} entries (cap ${limits.entries})`)
  let total = 0
  for (const e of entries) {
    if (e.uncompressedSize > limits.entryBytes)
      throw new Error(`zip too large: an entry unpacks to ${e.uncompressedSize} bytes`)
    total += e.uncompressedSize
  }
  if (total > limits.totalBytes) throw new Error(`zip too large: ${total} bytes in total`)

  const byName = new Map(entries.map((e) => [e.filename, e]))
  return {
    entries,
    loadText: (name) => byName.get(name)?.getData(new TextWriter()) ?? null,
    loadBlob: (name, type) => byName.get(name)?.getData(new BlobWriter(type)) ?? null,
    getSize: (name) => byName.get(name)?.uncompressedSize ?? 0,
  }
}
