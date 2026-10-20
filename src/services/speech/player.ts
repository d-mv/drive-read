import type { ReadAloudSource } from '@/services/engine/types'

import { markAt, pickVoice, ssmlToSpeech } from './ssml'

/** Speech output: the browser's speechSynthesis in the app, a fake in tests. */
export interface Speaker {
  speak(
    req: { text: string; lang: string | null; rate: number },
    on: {
      start(): void
      boundary(charIndex: number): void
      end(): void
      error(code: string): void
    },
  ): void
  cancel(): void
  /** How many voices the device has, and whether one matches `lang`: for diagnostics. */
  voices(lang: string | null): { count: number; matched: boolean }
}

export type ReadAloudState = 'idle' | 'playing' | 'paused'
/** `no-voice`: the device has no voice for the book's language. */
export type ReadAloudError = 'no-voice' | 'failed'

/** One read-aloud run, from play to stop: what the logs need to explain a stop. */
export interface ReadAloudReport {
  reason: 'user' | 'end' | 'error' | 'closed'
  /** The speech error code, when reason is `error`. */
  code: string | null
  /** Blocks that started speaking. */
  blocks: number
  /** The voice sent word boundaries; without them the highlight follows an estimate. */
  boundaries: boolean
  seconds: number
  lang: string | null
  voices: number
  voiceMatched: boolean
}

export interface ReadAloud {
  play(): Promise<void>
  pause(): void
  stop(reason?: 'user' | 'closed'): void
  setRate(rate: number): void
  /** The reader moved to another page: carry on reading from there. */
  moved(): Promise<void>
}

/** Speaking speed at rate 1, in characters per second, until a finished block measures it. */
const DEFAULT_CPS = 14
const ESTIMATE_MS = 200

/**
 * Reads a book aloud, block by block. Pause cancels the speech and resume starts the block again
 * at the last spoken word: speechSynthesis.pause() is unreliable, and Android ignores it.
 *
 * Some voices (Android's) send no word boundaries. Until one arrives, the highlight follows the
 * time spoken, at a speed measured from the blocks already finished.
 */
export function createReadAloud(
  source: ReadAloudSource,
  speaker: Speaker,
  on: {
    state(s: ReadAloudState): void
    error(e: ReadAloudError): void
    report?(r: ReadAloudReport): void
  },
): ReadAloud {
  let state: ReadAloudState = 'idle'
  let rate = 1
  /** Bumped on every pause, stop and jump; callbacks of an older run are ignored. */
  let run = 0
  /** Paused, then moved: the next play starts at the page on screen. */
  let fresh = false
  let boundaries = false
  /** Characters per second at rate 1. */
  let cps = DEFAULT_CPS
  let session = { started: 0, blocks: 0, lang: null as string | null }

  const set = (s: ReadAloudState) => {
    state = s
    on.state(s)
  }

  async function read(ssml: string | null, mine: number) {
    while (mine === run) {
      if (ssml === null) return stop('end')
      const block = ssmlToSpeech(ssml)
      if (block.text.trim()) return say(block, mine)
      ssml = await source.next()
    }
  }

  function say(block: ReturnType<typeof ssmlToSpeech>, mine: number) {
    session.lang = block.lang
    let last: string | null = null
    const mark = (i: number) => {
      const name = markAt(block.marks, i)
      if (name !== null && name !== last) source.mark((last = name))
    }
    // Show where reading is before the voice starts.
    mark(0)
    let startedAt = 0
    let timer: ReturnType<typeof setInterval> | undefined
    const clear = () => clearInterval(timer)

    speaker.speak(
      { text: block.text, lang: block.lang, rate },
      {
        start() {
          if (mine !== run) return
          startedAt = Date.now()
          session.blocks++
          if (boundaries) return
          timer = setInterval(() => {
            if (mine !== run || boundaries) return clear()
            mark(Math.floor(((Date.now() - startedAt) / 1000) * cps * rate))
          }, ESTIMATE_MS)
        },
        boundary(i) {
          if (mine !== run) return
          boundaries = true
          clear()
          mark(i)
        },
        end() {
          clear()
          if (mine !== run) return
          const seconds = (Date.now() - startedAt) / 1000
          if (!boundaries && startedAt && seconds > 1 && block.text.length > 40)
            cps = block.text.length / seconds / rate
          void source.next().then((s) => read(s, mine))
        },
        error(code) {
          clear()
          if (mine !== run) return
          stop('error', code)
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
    if (state === 'idle') session = { started: Date.now(), blocks: 0, lang: null }
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

  function stop(reason: ReadAloudReport['reason'] = 'user', code: string | null = null) {
    run++
    fresh = false
    speaker.cancel()
    source.stop()
    if (state === 'idle') return
    set('idle')
    const v = speaker.voices(session.lang)
    on.report?.({
      reason,
      code,
      blocks: session.blocks,
      boundaries,
      seconds: Math.round((Date.now() - session.started) / 100) / 10,
      lang: session.lang,
      voices: v.count,
      voiceMatched: v.matched,
    })
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
      // No cancel() here: on Android a cancel straight before speak() can drop the new utterance.
      // Pause, stop and jumps cancel before they speak again.
      const u = new SpeechSynthesisUtterance(text)
      current = u
      const voice = pickVoice(synth.getVoices(), lang, navigator.languages ?? [])
      if (voice) u.voice = voice
      if (lang) u.lang = voice?.lang ?? lang
      u.rate = rate
      let started = false
      // A cancelled utterance still fires `end` (Safari) or `error` (Chrome): only the live one counts.
      u.onstart = () => {
        started = true
        if (current === u) on.start()
      }
      u.onboundary = (e) => current === u && on.boundary(e.charIndex)
      // Ending without ever starting means nothing was spoken: say so instead of racing ahead.
      u.onend = () => current === u && (started ? on.end() : on.error('no-start'))
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
    voices(lang) {
      const all = synth.getVoices()
      return { count: all.length, matched: pickVoice(all, lang) !== null }
    },
  }
}
