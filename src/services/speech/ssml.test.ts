import { describe, expect, it } from 'vitest'

import { markAt, pickVoice, ssmlToSpeech, stepRate } from './ssml'

const NS = 'http://www.w3.org/2001/10/synthesis'

describe('ssmlToSpeech', () => {
  it('flattens the SSML to text and keeps each mark at the offset of its word', () => {
    const ssml = `<speak xmlns="${NS}" xml:lang="en"><mark name="0"/>Call <mark name="1"/>me <emphasis><mark name="2"/>Ishmael</emphasis>.</speak>`
    const s = ssmlToSpeech(ssml)
    expect(s.text).toBe('Call me Ishmael.')
    expect(s.lang).toBe('en')
    expect(s.marks).toEqual([
      { name: '0', offset: 0 },
      { name: '1', offset: 5 },
      { name: '2', offset: 8 },
    ])
  })

  it('reads a break as a space and has no language when the book names none', () => {
    const s = ssmlToSpeech(`<speak xmlns="${NS}">one<break/>two</speak>`)
    expect(s.text).toBe('one two')
    expect(s.lang).toBeNull()
  })

  it('answers empty text for SSML that does not parse', () => {
    expect(ssmlToSpeech('<speak').text).toBe('')
  })
})

describe('markAt', () => {
  const marks = [
    { name: '0', offset: 0 },
    { name: '1', offset: 5 },
    { name: '2', offset: 8 },
  ]
  it('finds the word a boundary falls in', () => {
    expect(markAt(marks, 0)).toBe('0')
    expect(markAt(marks, 6)).toBe('1')
    expect(markAt(marks, 40)).toBe('2')
  })
  it('answers null before the first word', () => {
    expect(markAt([{ name: '0', offset: 3 }], 1)).toBeNull()
  })
})

describe('pickVoice', () => {
  const v = (lang: string, extra: Partial<SpeechSynthesisVoice> = {}) =>
    ({
      lang,
      name: lang,
      default: false,
      localService: true,
      voiceURI: lang,
      ...extra,
    }) as SpeechSynthesisVoice

  it('prefers the default voice of the book language, ignoring region and case', () => {
    const voices = [
      v('en-US'),
      v('ru-RU', { name: 'Milena' }),
      v('ru_RU', { name: 'Yuri', default: true }),
    ]
    expect(pickVoice(voices, 'ru')?.name).toBe('Yuri')
  })
  it("prefers the reader's own region, then an on-device voice", () => {
    // Android lists voices with underscores and flags none as default.
    const voices = [v('en_AU', { localService: false }), v('en_GB'), v('en_US')]
    expect(pickVoice(voices, 'en', ['en-US', 'ru'])?.lang).toBe('en_US')
    expect(pickVoice(voices, 'en', ['de-DE'])?.lang).toBe('en_GB')
  })
  it('prefers an exact region match', () => {
    expect(pickVoice([v('en-US'), v('en-GB')], 'en-GB')?.lang).toBe('en-GB')
  })
  it('leaves the choice to the browser without a language or a matching voice', () => {
    expect(pickVoice([v('en-US')], null)).toBeNull()
    expect(pickVoice([v('en-US')], 'fr')).toBeNull()
  })
})

describe('stepRate', () => {
  it('steps through the speeds and stops at the ends', () => {
    expect(stepRate(1, 1)).toBe(1.25)
    expect(stepRate(1, -1)).toBe(0.75)
    expect(stepRate(2, 1)).toBe(2)
    expect(stepRate(0.75, -1)).toBe(0.75)
  })
})
