import { beforeEach, describe, expect, it } from 'vitest'

import { deviceLabel, loadUserId, saveUserId, userIdFromPermission, USER_KEY } from './identity'

beforeEach(() => localStorage.clear())

describe('userIdFromPermission', () => {
  it('is u_ plus the first 16 hex digits of SHA-256 of the permission id: stable, not reversible', async () => {
    // SHA-256("abc") = ba7816bf8f01cfea…
    expect(await userIdFromPermission('abc')).toBe('u_ba7816bf8f01cfea')
    expect(await userIdFromPermission('abc')).toBe(await userIdFromPermission('abc'))
    expect(await userIdFromPermission('abd')).not.toBe(await userIdFromPermission('abc'))
  })
})

describe('stored user id', () => {
  it('round-trips through localStorage so offline sessions are still attributed', () => {
    expect(loadUserId()).toBeNull()
    saveUserId('u_0123456789abcdef')
    expect(localStorage.getItem(USER_KEY)).toBe('u_0123456789abcdef')
    expect(loadUserId()).toBe('u_0123456789abcdef')
  })

  it('ignores anything that is not a user id', () => {
    localStorage.setItem(USER_KEY, 'someone@example.com')
    expect(loadUserId()).toBeNull()
  })
})

describe('deviceLabel', () => {
  it('is the random device id and its kind', () => {
    expect(deviceLabel({ id: 'a3f9c2e1', name: 'Phone' })).toBe('a3f9c2e1/Phone')
  })
})
