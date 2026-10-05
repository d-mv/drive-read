import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  fractionOf,
  locateFraction,
  outlineToc,
  pinchZoom,
  step,
  stepZoom,
  ZOOM_LEVELS,
} from './pdf-layout'

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

describe('zoom', () => {
  it('steps through the levels and stops at either end', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1.25, 1)).toBe(1.5)
    expect(stepZoom(3, 1)).toBe(3)
    expect(stepZoom(1, -1)).toBe(1)
    expect(stepZoom(2, -1)).toBe(1.5)
  })

  it('steps from a pinched level to the next level in that direction', () => {
    expect(stepZoom(1.6, 1)).toBe(2)
    expect(stepZoom(1.6, -1)).toBe(1.5)
  })

  it('a pinch scales the zoom, kept within 100–300% and rounded to 5%', () => {
    expect(pinchZoom(1, 1.5)).toBe(1.5)
    expect(pinchZoom(2, 0.1)).toBe(1)
    expect(pinchZoom(2, 5)).toBe(3)
    expect(pinchZoom(1, 1.234)).toBe(1.25)
  })

  it('always lands on a level within range, moving the way it was asked', () => {
    const z = fc.double({ min: 1, max: 3, noNaN: true })
    fc.assert(
      fc.property(z, fc.constantFrom(1 as const, -1 as const), (from, dir) => {
        const to = stepZoom(from, dir)
        expect(ZOOM_LEVELS).toContain(to)
        // Moves `dir`, unless already at that end.
        expect(Math.sign(to - from) === dir || to === (dir === 1 ? 3 : 1)).toBe(true)
      }),
    )
    fc.assert(
      fc.property(z, fc.double({ min: 0.01, max: 100, noNaN: true }), (from, ratio) => {
        const to = pinchZoom(from, ratio)
        expect(to).toBeGreaterThanOrEqual(1)
        expect(to).toBeLessThanOrEqual(3)
      }),
    )
  })
})
