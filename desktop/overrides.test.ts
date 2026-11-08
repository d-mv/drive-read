import { describe, expect, it } from 'vitest'

import { devOverrides } from './overrides'

const env = {
  DR_DIST: '/tmp/other-dist',
  DR_USER_DATA: '/tmp/other-profile',
  DR_FAKE_GOOGLE: 'http://127.0.0.1:9999',
}

describe('devOverrides', () => {
  it('honours DR_DIST, DR_USER_DATA and DR_FAKE_GOOGLE in dev and test runs', () => {
    expect(devOverrides(env, false)).toEqual({
      dist: '/tmp/other-dist',
      userData: '/tmp/other-profile',
      fakeGoogle: 'http://127.0.0.1:9999',
    })
  })

  it('ignores them in the packaged app, so a launcher cannot swap its pages, profile or Google', () => {
    expect(devOverrides(env, true)).toEqual({})
  })

  it('leaves unset or empty values out', () => {
    expect(devOverrides({}, false)).toEqual({})
    expect(devOverrides({ DR_DIST: '', DR_USER_DATA: '', DR_FAKE_GOOGLE: '' }, false)).toEqual({})
  })
})
