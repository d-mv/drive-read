import { describe, expect, it } from 'vitest'

import { None, Some } from '@/shared/result'

import { type KeyInput, keyAction } from './keymap'

const key = (k: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  editable: false,
  ...extra,
})

describe('keyAction in the reader', () => {
  it.each([
    ['ArrowRight', 'next'],
    ['PageDown', 'next'],
    [' ', 'next'],
    ['ArrowLeft', 'prev'],
    ['PageUp', 'prev'],
    ['c', 'contents'],
    ['a', 'settings'],
    ['t', 'theme'],
    ['Escape', 'back'],
  ] as const)('%s → %s', (k, action) => {
    expect(keyAction('reader', key(k))).toEqual(Some(action))
  })

  it('Shift+Space goes back a page', () => {
    expect(keyAction('reader', key(' ', { shiftKey: true }))).toEqual(Some('prev'))
  })

  it('leaves modified keys to the browser', () => {
    expect(keyAction('reader', key('ArrowRight', { metaKey: true }))).toEqual(None)
    expect(keyAction('reader', key('c', { ctrlKey: true }))).toEqual(None)
  })
})

describe('keyAction in the library', () => {
  it('/ focuses search, Enter resumes, t switches theme', () => {
    expect(keyAction('library', key('/'))).toEqual(Some('search'))
    expect(keyAction('library', key('Enter'))).toEqual(Some('resume'))
    expect(keyAction('library', key('t'))).toEqual(Some('theme'))
  })

  it('ignores reader keys', () => {
    expect(keyAction('library', key('ArrowRight'))).toEqual(None)
  })
})

describe('keyAction while typing', () => {
  it('ignores everything but Escape', () => {
    expect(keyAction('library', key('/', { editable: true }))).toEqual(None)
    expect(keyAction('library', key('Enter', { editable: true }))).toEqual(None)
    expect(keyAction('library', key('Escape', { editable: true }))).toEqual(Some('blur'))
  })
})
