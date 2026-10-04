import { None, type Option, Some } from '@/shared/result'

/** The keymap: pure key → action, per screen. Views decide what an action does. */

export type KeyScope = 'library' | 'reader'
export type KeyAction =
  | 'next'
  | 'prev'
  | 'contents'
  | 'settings'
  | 'theme'
  | 'back'
  | 'search'
  | 'resume'
  | 'blur'

export interface KeyInput {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  /** Focus is in a text field. */
  editable: boolean
}

const READER: Record<string, KeyAction> = {
  ArrowRight: 'next',
  PageDown: 'next',
  ' ': 'next',
  ArrowLeft: 'prev',
  PageUp: 'prev',
  c: 'contents',
  a: 'settings',
  t: 'theme',
  Escape: 'back',
}

const LIBRARY: Record<string, KeyAction> = {
  '/': 'search',
  Enter: 'resume',
  t: 'theme',
}

export function keyAction(scope: KeyScope, e: KeyInput): Option<KeyAction> {
  if (e.ctrlKey || e.metaKey || e.altKey) return None
  if (e.editable) return e.key === 'Escape' ? Some('blur') : None
  if (scope === 'reader' && e.key === ' ' && e.shiftKey) return Some('prev')
  const action = (scope === 'reader' ? READER : LIBRARY)[e.key]
  return action ? Some(action) : None
}

export function keyInput(e: KeyboardEvent): KeyInput {
  const t = e.target as HTMLElement | null
  const editable =
    !!t &&
    (t.isContentEditable ||
      t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT')
  return {
    key: e.key,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    altKey: e.altKey,
    editable,
  }
}
