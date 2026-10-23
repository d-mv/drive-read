import { describe, expect, it } from 'vitest'

import { openZip } from './zip'

interface Entry {
  name: string
  data: Uint8Array
  /** The uncompressed size the headers claim; the true size when absent. */
  declared?: number
}

const deflateRaw = async (data: Uint8Array) =>
  new Uint8Array(
    await new Response(
      new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer(),
  )

/** A minimal deflate zip (no data descriptors), so a test can make the headers lie. */
async function buildZip(entries: Entry[]): Promise<Blob> {
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = new TextEncoder().encode(e.name)
    const body = await deflateRaw(e.data)
    const size = e.declared ?? e.data.length
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(8, 8, true) // deflate
    local.setUint32(18, body.length, true)
    local.setUint32(22, size, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, body)
    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(4, 20, true)
    dir.setUint16(6, 20, true)
    dir.setUint16(10, 8, true)
    dir.setUint32(20, body.length, true)
    dir.setUint32(24, size, true)
    dir.setUint16(28, name.length, true)
    dir.setUint32(42, offset, true)
    central.push(new Uint8Array(dir.buffer), name)
    offset += 30 + name.length + body.length
  }
  const dirSize = central.reduce((n, p) => n + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, dirSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[])
}

const text = (s: string) => new TextEncoder().encode(s)
const limits = { entries: 3, entryBytes: 1000, totalBytes: 1500 }

describe('openZip', () => {
  it('reads entries as text, blobs and sizes', async () => {
    const zip = await openZip(await buildZip([{ name: 'a.txt', data: text('hello') }]), limits)
    expect(zip.entries.map((e) => e.filename)).toEqual(['a.txt'])
    expect(await zip.loadText('a.txt')).toBe('hello')
    expect(await (await zip.loadBlob('a.txt'))?.text()).toBe('hello')
    expect(zip.getSize('a.txt')).toBe(5)
    expect(zip.loadText('missing')).toBeNull()
  })

  it('refuses more entries than the cap', async () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ name: `${i}.txt`, data: text('x') }))
    await expect(openZip(await buildZip(many), limits)).rejects.toThrow(/entries/)
  })

  it('refuses an entry that unpacks past the per-entry cap', async () => {
    const big = { name: 'big.txt', data: new Uint8Array(1001) }
    await expect(openZip(await buildZip([big]), limits)).rejects.toThrow(/entry/)
  })

  it('refuses entries that together unpack past the total cap', async () => {
    const two = ['a', 'b'].map((n) => ({ name: n, data: new Uint8Array(800) }))
    await expect(openZip(await buildZip(two), limits)).rejects.toThrow(/total/)
  })

  it('never inflates an entry past the size its headers claim', async () => {
    // A bomb that declares 10 bytes: the cap check passes, the read must still stop.
    const liar = { name: 'liar.txt', data: new Uint8Array(100_000), declared: 10 }
    const zip = await openZip(await buildZip([liar]), limits)
    await expect(zip.loadText('liar.txt')).rejects.toThrow(/uncompressed size/i)
  })
})
