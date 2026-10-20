/**
 * foliate-js (tts.js) hands out one block of text at a time as SSML, with a <mark> before each
 * word. Browsers speak plain text only, so this flattens the SSML and keeps where each mark falls;
 * the speech boundary events then say which word is being spoken.
 */

export interface SpeechMark {
  name: string
  /** Character offset of the word in `text`. */
  offset: number
}

export interface SpeechText {
  text: string
  /** The block's language (xml:lang), if the book names one. */
  lang: string | null
  marks: SpeechMark[]
}

export function ssmlToSpeech(ssml: string): SpeechText {
  const doc = new DOMParser().parseFromString(ssml, 'application/xml')
  const root = doc.documentElement
  if (!root || root.getElementsByTagName('parsererror').length > 0 || root.localName !== 'speak')
    return { text: '', lang: null, marks: [] }
  let text = ''
  const marks: SpeechMark[] = []
  const walk = (node: Node) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) {
        text += child.textContent ?? ''
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element
        if (el.localName === 'mark')
          marks.push({ name: el.getAttribute('name') ?? '', offset: text.length })
        else if (el.localName === 'break') text += ' '
        else walk(el)
      }
    }
  }
  walk(root)
  const lang =
    root.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') ||
    root.getAttribute('xml:lang') ||
    null
  return { text, lang, marks }
}

/** The mark of the word at `charIndex`, or null before the first word. */
export function markAt(marks: readonly SpeechMark[], charIndex: number): string | null {
  let found: string | null = null
  for (const m of marks) {
    if (m.offset > charIndex) break
    found = m.name
  }
  return found
}

const norm = (lang: string) => lang.toLowerCase().replace('_', '-')

/**
 * A voice for the book's language: an exact match first, then the same language in any region.
 * Among several, the region the reader prefers (`preferred`, e.g. navigator.languages) wins, then
 * the default voice, then an on-device one. Null leaves the choice to the browser.
 */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  lang: string | null,
  preferred: readonly string[] = [],
): SpeechSynthesisVoice | null {
  if (!lang) return null
  const want = norm(lang)
  const base = want.split('-')[0]
  const regions = preferred.map(norm)
  const best = (list: SpeechSynthesisVoice[]) =>
    regions.map((r) => list.find((v) => norm(v.lang) === r)).find((v) => v) ??
    list.find((v) => v.default) ??
    list.find((v) => v.localService) ??
    list[0] ??
    null
  return (
    best(voices.filter((v) => norm(v.lang) === want)) ??
    best(voices.filter((v) => norm(v.lang).split('-')[0] === base))
  )
}

export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const

export function stepRate(rate: number, dir: 1 | -1): number {
  const i = RATES.findIndex((r) => r >= rate)
  const at = i === -1 ? RATES.length - 1 : i
  return RATES[Math.min(RATES.length - 1, Math.max(0, at + dir))]!
}
