import { resolve } from 'node:path'

import { isBookName } from './files'

/**
 * Books handed over by macOS (Finder, Dock, Open Recent) or a second launch can arrive before
 * the page listens: they wait here until it says it is ready.
 */
export function createOpenQueue(deliver: (paths: string[]) => void) {
  let waiting: string[] = []
  let isReady = false
  const flush = () => {
    if (!isReady || waiting.length === 0) return
    const paths = waiting
    waiting = []
    deliver(paths)
  }
  return {
    push(paths: readonly string[]) {
      waiting.push(...paths)
      flush()
    },
    ready() {
      isReady = true
      flush()
    },
  }
}

/** Book paths among launch arguments, absolute. */
export function bookArgs(argv: readonly string[], cwd: string): string[] {
  return argv.filter((a) => !a.startsWith('-') && isBookName(a)).map((a) => resolve(cwd, a))
}
