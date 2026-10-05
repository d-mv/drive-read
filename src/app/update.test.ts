import { beforeEach, describe, expect, it, vi } from 'vitest'

import { noteVersion, VERSION_KEY } from './update'

beforeEach(() => localStorage.clear())

describe('noteVersion', () => {
  it('is a first run when no version was recorded', () => {
    expect(noteVersion('0.6.0')).toEqual({ kind: 'first-run' })
    expect(localStorage.getItem(VERSION_KEY)).toBe('0.6.0')
  })

  it('reports an update once, then nothing', () => {
    localStorage.setItem(VERSION_KEY, '0.5.0')
    expect(noteVersion('0.6.0')).toEqual({ kind: 'updated', from: '0.5.0', to: '0.6.0' })
    expect(noteVersion('0.6.0')).toEqual({ kind: 'same' })
  })

  it('stays quiet when storage is unavailable', () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(noteVersion('0.6.0')).toEqual({ kind: 'same' })
    spy.mockRestore()
  })
})
