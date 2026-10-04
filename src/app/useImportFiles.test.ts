import { describe, expect, it } from 'vitest'

import { importMessage } from './useImportFiles'

describe('importMessage', () => {
  it('is null when everything was added', () => {
    expect(importMessage({ added: [], failed: [] })).toBeNull()
  })

  it('names the first failure and counts the rest', () => {
    expect(
      importMessage({
        added: [],
        failed: [
          { name: 'a.epub', reason: 'unreadable' },
          { name: 'b.pdf', reason: 'unsupported' },
        ],
      }),
    ).toBe("a.epub: This file can't be opened. It may be protected or damaged. (and 1 more)")
  })
})
