import type { ReadAloudSource } from '@/services/engine/types'

import { markAt, pickVoice, ssmlToSpeech } from './ssml'

/** Speech output: the browser's speechSynthesis in the app, a fake in tests. */
export interface Speaker {
  speak(
    req: { text: string; lang: string | null; rate: number },
    on: { boundary(charIndex: number): void; end(): void; error(code: string): void },
  ): void
  cancel(): void
}

export type ReadAloudState = 'idle' | 'playing' | 'paused'
/** `no-voice`: the device has no voice for the book's language. */
export type ReadAloudError = 'no-voice' | 'failed'

export interface ReadAloud {
  play(): Promise<void>
  pause(): void
  stop(): void
  setRate(rate: number): void
  /** The reader moved to another page: carry on reading from there. */
  moved(): Promise<void>
}

/**
 * Reads a book aloud, block by block. Pause cancels the speech and resume starts the block again
 * at the last spoken word: speechSynthesis.pause() is unreliable, and Android ignores it.
 */
export function createReadAloud(
  source: ReadAloudSource,
  speaker: Speaker,
  on: { state(s: ReadAloudState): void; error(e: ReadAloudError): void },
): ReadAloud {
  let state: ReadAloudState = 'idle'
  let rate = 1
  /** Bumped on every pause, stop and jump; callbacks of an older run are ignored. */
  let run = 0
  /** Paused, then moved: the next play starts at the page on screen. */
  let fresh = false

  const set = (s: ReadAloudState) => {
    state = s
    on.state(s)
  }

  async function read(ssml: string | null, mine: number) {
    while (mine === run) {
      if (ssml === null) return stop()
      const block = ssmlToSpeech(ssml)
      if (block.text.trim()) return say(block, mine)
      ssml = await source.next()
    }
  }

  function say(block: ReturnType<typeof ssmlToSpeech>, mine: number) {
    // Show where reading is, even with voices that send no word boundaries.
    if (block.marks[0]) source.mark(block.marks[0].name)
    speaker.speak(
      { text: block.text, lang: block.lang, rate },
      {
        boundary(i) {
          if (mine !== run) return
          const name = markAt(block.marks, i)
          if (name !== null) source.mark(name)
        },
        end() {
          if (mine === run) void source.next().then((s) => read(s, mine))
        },
        error(code) {
          if (mine !== run) return
          stop()
          on.error(
            code === 'language-unavailable' || code === 'voice-unavailable' ? 'no-voice' : 'failed',
          )
        },
      },
    )
  }

  async function play() {
    if (state === 'playing') return
    const resume = state === 'paused' && !fresh
    fresh = false
    set('playing')
    const mine = ++run
    const ssml = resume ? await source.resume() : await source.start()
    await read(ssml, mine)
  }

  function pause() {
    if (state !== 'playing') return
    run++
    speaker.cancel()
    set('paused')
  }

  function stop() {
    run++
    fresh = false
    speaker.cancel()
    source.stop()
    if (state !== 'idle') set('idle')
  }

  return {
    play,
    pause,
    stop,
    setRate(r) {
      rate = r
      if (state === 'playing') {
        pause()
        void play()
      }
    },
    async moved() {
      if (state === 'paused') fresh = true
      if (state !== 'playing') return
      run++
      speaker.cancel()
      set('paused')
      fresh = true
      await play()
    },
  }
}

/** The browser's speech, or null where there is none. */
export function browserSpeaker(): Speaker | null {
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis
  if (!synth) return null
  // Held so the utterance is not garbage collected mid-speech (Chrome then never fires `end`).
  let current: SpeechSynthesisUtterance | null = null
  return {
    speak({ text, lang, rate }, on) {
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      current = u
      const voice = pickVoice(synth.getVoices(), lang)
      if (voice) u.voice = voice
      if (lang) u.lang = voice?.lang ?? lang
      u.rate = rate
      // A cancelled utterance still fires `end` (Safari) or `error` (Chrome): only the live one counts.
      u.onboundary = (e) => current === u && on.boundary(e.charIndex)
      u.onend = () => current === u && on.end()
      u.onerror = (e) => {
        if (current !== u || e.error === 'interrupted' || e.error === 'canceled') return
        on.error(e.error)
      }
      synth.speak(u)
    },
    cancel() {
      current = null
      synth.cancel()
    },
  }
}
