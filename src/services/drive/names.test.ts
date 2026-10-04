import { describe, expect, it } from 'vitest'

import { bookFromFileName, folderLabel } from './names'

describe('bookFromFileName', () => {
  it('reads "Last, First. Title" names', () => {
    expect(bookFromFileName('Dawson, Mark. The Cleaner (John Milton #1).epub')).toEqual({
      title: 'The Cleaner (John Milton #1)',
      author: 'Mark Dawson',
    })
  })

  it('reads Calibre "Title - Author" names', () => {
    expect(bookFromFileName('Middlemarch - George Eliot.epub')).toEqual({
      title: 'Middlemarch',
      author: 'George Eliot',
    })
  })

  it('falls back to the file name as the title', () => {
    expect(bookFromFileName('walden.pdf')).toEqual({ title: 'walden', author: '' })
    expect(bookFromFileName('St. Petersburg.epub')).toEqual({ title: 'St. Petersburg', author: '' })
  })
})

describe('folderLabel', () => {
  it('turns Calibre-style author slugs into names', () => {
    expect(folderLabel('dawson,-mark')).toBe('Mark Dawson')
    expect(folderLabel('le-guin,-ursula-k')).toBe('Ursula K Le Guin')
  })

  it('leaves single lowercase words alone: "books" is a folder, not an author', () => {
    expect(folderLabel('books')).toBe('books')
    expect(folderLabel('homer')).toBe('homer')
    expect(folderLabel('sci-fi')).toBe('sci-fi')
  })

  it('leaves ordinary folder names alone', () => {
    expect(folderLabel('Stocks')).toBe('Stocks')
    expect(folderLabel('My books 2024')).toBe('My books 2024')
  })
})
