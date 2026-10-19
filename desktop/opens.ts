import { extname, resolve } from 'node:path'

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

/** EPUB and PDF paths among launch arguments, absolute. */
export function bookArgs(argv: readonly string[], cwd: string): string[] {
  return argv
    .filter((a) => !a.startsWith('-') && ['.epub', '.pdf'].includes(extname(a).toLowerCase()))
    .map((a) => resolve(cwd, a))
}
