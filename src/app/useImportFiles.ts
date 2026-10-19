import { ref } from 'vue'

import { type ImportFailure, type ImportResult, useLibrary } from '@/stores/library'

const FAILURE_COPY: Record<ImportFailure, string> = {
  unsupported: 'Only EPUB and PDF files open.',
  unreadable: "This file can't be opened. It may be protected or damaged.",
  quota: 'Not enough space on this device.',
  storage: "The file couldn't be saved on this device.",
}

/** One line for the user about a finished import, or null when everything went in. */
export function importMessage(result: ImportResult): string | null {
  const first = result.failed[0]
  if (!first) return null
  const others = result.failed.length - 1
  const suffix = others > 0 ? ` (and ${others} more)` : ''
  return `${first.name}: ${FAILURE_COPY[first.reason]}${suffix}`
}

const BOOK_TYPES = '.epub,.pdf,application/epub+zip,application/pdf'

/** The system file dialog through a hidden file input; empty when the reader cancels. */
export function chooseFiles(opts: { multiple: boolean; accept?: string }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = opts.accept ?? BOOK_TYPES
    input.multiple = opts.multiple
    input.addEventListener('change', () => resolve([...(input.files ?? [])]))
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

/** "Open a file from this device": a hidden file input plus the import call. */
export function useImportFiles() {
  const busy = ref(false)
  const message = ref<string | null>(null)

  async function pick(): Promise<ImportResult | null> {
    return run(await chooseFiles({ multiple: true }))
  }

  async function run(files: File[]): Promise<ImportResult | null> {
    if (files.length === 0) return null
    busy.value = true
    message.value = null
    try {
      const result = await useLibrary().importFiles(files)
      message.value = importMessage(result)
      return result
    } finally {
      busy.value = false
    }
  }

  return { busy, message, pick, run }
}
