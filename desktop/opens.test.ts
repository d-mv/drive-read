// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { bookArgs, createOpenQueue } from './opens'

describe('createOpenQueue', () => {
  it('holds files until the page is ready, then delivers them once', () => {
    const got: string[][] = []
    const q = createOpenQueue((paths) => got.push(paths))
    q.push(['/a.epub'])
    q.push(['/b.pdf'])
    expect(got).toEqual([])

    q.ready()
    expect(got).toEqual([['/a.epub', '/b.pdf']])
    q.ready()
    expect(got).toHaveLength(1)
  })

  it('delivers straight away once ready', () => {
    const got: string[][] = []
    const q = createOpenQueue((paths) => got.push(paths))
    q.ready()
    q.push(['/a.epub'])
    expect(got).toEqual([['/a.epub']])
  })

  it('ignores an empty push', () => {
    const got: string[][] = []
    const q = createOpenQueue((paths) => got.push(paths))
    q.ready()
    q.push([])
    expect(got).toEqual([])
  })
})

describe('bookArgs', () => {
  it('keeps EPUB and PDF arguments, resolved against the working directory', () => {
    expect(
      bookArgs(
        ['/Applications/Drive Read', '--flag', 'x.epub', '/b/Paper.PDF', 'notes.txt'],
        '/home',
      ),
    ).toEqual(['/home/x.epub', '/b/Paper.PDF'])
  })

  it('keeps FB2 arguments too', () => {
    expect(bookArgs(['/a.fb2', '/b.fbz', '/c.fb2.zip', '/d.zip'], '/')).toEqual([
      '/a.fb2',
      '/b.fbz',
      '/c.fb2.zip',
    ])
  })
})
