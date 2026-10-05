import { describe, expect, it } from 'vitest'

import { fractionOf, locateFraction, outlineToc, step } from './pdf-layout'

describe('fractionOf / locateFraction', () => {
  it('maps a page and the offset within it to a fraction of the book', () => {
    expect(fractionOf({ page: 0, offset: 0 }, 10)).toBe(0)
    expect(fractionOf({ page: 4, offset: 0.5 }, 10)).toBe(0.45)
    expect(fractionOf({ page: 9, offset: 1 }, 10)).toBe(1)
  })

  it('maps a fraction back to a page and offset', () => {
    expect(locateFraction(0.45, 10)).toEqual({ page: 4, offset: expect.closeTo(0.5, 9) })
    expect(locateFraction(1, 10)).toEqual({ page: 9, offset: 1 })
    expect(locateFraction(0, 10)).toEqual({ page: 0, offset: 0 })
  })
})

describe('outlineToc', () => {
  it('turns resolved outline items into contents starting at their page', () => {
    expect(
      outlineToc(
        [
          { title: ' One ', pageIndex: 0 },
          { title: 'Broken', pageIndex: undefined },
          { title: 'Two', pageIndex: 5 },
        ],
        10,
      ),
    ).toEqual([
      { label: 'One', locator: { kind: 'page', page: 0, offset: 0 }, start: 0 },
      { label: 'Two', locator: { kind: 'page', page: 5, offset: 0 }, start: 0.5 },
    ])
  })
})

describe('step', () => {
  // A page 2000 px tall in an 800 px viewport.
  const page = { viewport: 800, height: 2000 }

  it('scrolls within a tall page before turning it', () => {
    expect(step({ ...page, top: 0 }, 1)).toEqual({ kind: 'scroll', top: 720 })
    expect(step({ ...page, top: 720 }, 1)).toEqual({ kind: 'scroll', top: 1200 })
    expect(step({ ...page, top: 1200 }, 1)).toEqual({ kind: 'page' })
  })

  it('scrolls back up before going to the previous page', () => {
    expect(step({ ...page, top: 1200 }, -1)).toEqual({ kind: 'scroll', top: 480 })
    expect(step({ ...page, top: 480 }, -1)).toEqual({ kind: 'scroll', top: 0 })
    expect(step({ ...page, top: 0 }, -1)).toEqual({ kind: 'page' })
  })

  it('turns a page that fits the viewport at once', () => {
    expect(step({ viewport: 800, height: 700, top: 0 }, 1)).toEqual({ kind: 'page' })
  })
})
