import { describe, expect, it, vi } from 'vitest'

import type { ReadAloudSource } from '@/services/engine/types'

import { createReadAloud, type ReadAloudError, type ReadAloudState, type Speaker } from './player'

const NS = 'http://www.w3.org/2001/10/synthesis'
const block = (...words: string[]) =>
  `<speak xmlns="${NS}" xml:lang="en">${words.map((w, i) => `<mark name="${i}"/>${w} `).join('')}</speak>`

/** A book of blocks; `start` and `resume` answer the block the reader is on. */
function fakeSource(blocks: string[]) {
  let at = 0
  const source = {
    start: vi.fn<ReadAloudSource['start']>(async () => blocks[(at = 0)] ?? null),
    next: vi.fn<ReadAloudSource['next']>(async () => blocks[++at] ?? null),
    resume: vi.fn<ReadAloudSource['resume']>(async () => blocks[at] ?? null),
    mark: vi.fn<ReadAloudSource['mark']>(),
    stop: vi.fn<ReadAloudSource['stop']>(),
    onSwipe: vi.fn<ReadAloudSource['onSwipe']>(),
  }
  return source
}

type On = Parameters<Speaker['speak']>[1]
function fakeSpeaker() {
  const said: { text: string; lang: string | null; rate: number; on: On }[] = []
  const speaker: Speaker = {
    speak: (req, on) => void said.push({ ...req, on }),
    cancel: vi.fn<Speaker['cancel']>(),
  }
  return { speaker, said, last: () => said[said.length - 1]! }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

function setup(blocks: string[]) {
  const source = fakeSource(blocks)
  const s = fakeSpeaker()
  const states: ReadAloudState[] = []
  const errors: ReadAloudError[] = []
  const player = createReadAloud(source, s.speaker, {
    state: (x) => states.push(x),
    error: (e) => errors.push(e),
  })
  return { source, ...s, states, errors, player }
}

describe('read aloud', () => {
  it('reads block after block, highlighting each word, and stops at the end of the book', async () => {
    const t = setup([block('Call', 'me'), block('Ishmael')])
    await t.player.play()
    expect(t.last().text).toBe('Call me ')
    expect(t.last().lang).toBe('en')
    expect(t.source.mark).toHaveBeenLastCalledWith('0')
    t.last().on.boundary(5)
    expect(t.source.mark).toHaveBeenLastCalledWith('1')

    t.last().on.end()
    await flush()
    expect(t.last().text).toBe('Ishmael ')
    t.last().on.end()
    await flush()
    expect(t.states).toEqual(['playing', 'idle'])
    expect(t.source.stop).toHaveBeenCalled()
  })

  it('skips blocks with no text', async () => {
    const t = setup([`<speak xmlns="${NS}"> </speak>`, block('Hello')])
    await t.player.play()
    expect(t.said.map((s) => s.text)).toEqual(['Hello '])
  })

  it('resumes the block it paused in, from the last word', async () => {
    const t = setup([block('a', 'b')])
    await t.player.play()
    t.player.pause()
    expect(t.speaker.cancel).toHaveBeenCalled()
    // A cancelled utterance's late events change nothing.
    t.last().on.end()
    await flush()
    expect(t.source.next).not.toHaveBeenCalled()

    await t.player.play()
    expect(t.source.resume).toHaveBeenCalledTimes(1)
    expect(t.states).toEqual(['playing', 'paused', 'playing'])
  })

  it('starts again at the page on screen when the reader moves', async () => {
    const t = setup([block('a')])
    await t.player.play()
    await t.player.moved()
    expect(t.source.start).toHaveBeenCalledTimes(2)

    t.player.pause()
    await t.player.moved()
    expect(t.source.start).toHaveBeenCalledTimes(2)
    await t.player.play()
    expect(t.source.start).toHaveBeenCalledTimes(3)
    expect(t.source.resume).not.toHaveBeenCalled()
  })

  it('applies a new speed from the current word', async () => {
    const t = setup([block('a', 'b')])
    await t.player.play()
    t.player.setRate(1.5)
    await flush()
    expect(t.last().rate).toBe(1.5)
    expect(t.source.resume).toHaveBeenCalled()
  })

  it('stops and says why when the device has no voice for the language', async () => {
    const t = setup([block('a')])
    await t.player.play()
    t.last().on.error('language-unavailable')
    expect(t.errors).toEqual(['no-voice'])
    expect(t.states.at(-1)).toBe('idle')
  })
})
