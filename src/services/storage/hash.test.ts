import { describe, expect, it } from 'vitest'

import { localBookId } from './hash'

describe('localBookId', () => {
  it('is local- plus the first 32 hex digits of the SHA-256 of the content', async () => {
    // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(await localBookId(new Blob(['abc']))).toBe('local-ba7816bf8f01cfea414140de5dae2223')
  })

  it('is the same for the same bytes under a different name', async () => {
    const a = new File(['same'], 'a.epub')
    const b = new File(['same'], 'b.epub')
    expect(await localBookId(a)).toBe(await localBookId(b))
  })
})
