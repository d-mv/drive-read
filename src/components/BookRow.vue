<script setup lang="ts">
import { computed } from 'vue'

import { formatSize } from '@/app/copy'
import { type BookRecord, statusLabel } from '@/domain/book'

import AppIcon from './AppIcon.vue'
import BookCover from './BookCover.vue'

/**
 * A book in the list. `action` picks the row's button: remove the book, or (in the Downloaded
 * view) remove only its downloaded file, with the file size as the status.
 */
const {
  book,
  fraction,
  online = true,
  action = 'remove',
} = defineProps<{
  book: BookRecord
  fraction: number | undefined
  /** Offline, a book not on this device cannot open: shown dimmed. */
  online?: boolean
  action?: 'remove' | 'remove-download'
}>()
const emit = defineEmits<{ open: []; remove: []; removeDownload: [] }>()

const status = computed(() =>
  action === 'remove-download'
    ? formatSize(book.size)
    : statusLabel(fraction, book.downloaded, online, {
        missingInDrive: book.missingInDrive,
        newVersion: !!book.driveVersion,
      }),
)
const unavailable = computed(() => !online && !book.downloaded)
</script>

<template>
  <li class="flex items-center gap-1 border-t border-rule" :class="unavailable && 'opacity-45'">
    <a
      :href="`/read/${book.id}`"
      class="grid min-w-0 flex-1 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3.5 py-2"
      @click.prevent="emit('open')"
    >
      <span class="w-10">
        <BookCover
          :id="book.id"
          :title="book.title"
          :author="book.author"
          :has-cover="book.hasCover"
          size="sm"
        />
      </span>
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class="truncate font-medium">{{ book.title }}</span>
        <span class="truncate text-[13px] text-ink2">{{ book.author }}</span>
      </span>
      <span class="tabular text-right font-mono text-xs text-ink2">{{ status }}</span>
    </a>
    <button
      v-if="action === 'remove-download'"
      type="button"
      :aria-label="`Remove download of ${book.title}`"
      class="h-11 flex-none px-2 text-sm text-ink2 underline underline-offset-[3px]"
      @click="emit('removeDownload')"
    >
      Remove download
    </button>
    <button
      v-else
      type="button"
      :aria-label="`Remove ${book.title}`"
      class="flex size-11 flex-none items-center justify-center text-ink2"
      @click="emit('remove')"
    >
      <AppIcon name="trash" :size="16" />
    </button>
  </li>
</template>
