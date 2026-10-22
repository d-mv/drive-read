import { describe, expect, it } from 'vitest'

import { devOverrides } from './overrides'

const env = { DR_DIST: '/tmp/other-dist', DR_USER_DATA: '/tmp/other-profile' }

describe('devOverrides', () => {
  it('honours DR_DIST and DR_USER_DATA in dev and test runs', () => {
    expect(devOverrides(env, false)).toEqual({
      dist: '/tmp/other-dist',
      userData: '/tmp/other-profile',
    })
  })

  it('ignores them in the packaged app, so a launcher cannot swap its pages or profile', () => {
    expect(devOverrides(env, true)).toEqual({})
  })

  it('leaves unset or empty values out', () => {
    expect(devOverrides({}, false)).toEqual({})
    expect(devOverrides({ DR_DIST: '', DR_USER_DATA: '' }, false)).toEqual({})
  })
})
