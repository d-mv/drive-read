<script setup lang="ts">
import { computed } from 'vue'

import { type BookRecord, statusLabel } from '@/domain/book'

import AppIcon from './AppIcon.vue'
import BookCover from './BookCover.vue'

/** A book in the grid. The whole card opens the book; remove sits beside the status. */
const {
  book,
  fraction,
  online = true,
} = defineProps<{
  book: BookRecord
  fraction: number | undefined
  /** Offline, a book not on this device cannot open: shown dimmed. */
  online?: boolean
}>()
const emit = defineEmits<{ open: []; remove: [] }>()

const status = computed(() => statusLabel(fraction, book.downloaded, online))
const unavailable = computed(() => !online && !book.downloaded)
</script>

<template>
  <article class="group flex min-w-0 flex-col gap-2.5" :class="unavailable && 'opacity-45'">
    <a :href="`/read/${book.id}`" class="flex flex-col gap-2.5" @click.prevent="emit('open')">
      <BookCover
        :id="book.id"
        :title="book.title"
        :author="book.author"
        :has-cover="book.hasCover"
        size="lg"
      />
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class="truncate text-sm font-medium">{{ book.title }}</span>
        <span class="truncate text-[13px] text-ink2">{{ book.author }}</span>
      </span>
    </a>
    <div class="flex h-6 items-center gap-2.5">
      <div class="h-0.5 flex-1 bg-track">
        <div class="h-0.5 bg-signal" :style="{ width: `${(fraction ?? 0) * 100}%` }" />
      </div>
      <span class="tabular font-mono text-xs text-ink2">{{ status }}</span>
      <button
        type="button"
        :aria-label="`Remove ${book.title}`"
        class="-mr-2.5 flex size-11 items-center justify-center text-ink2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        @click="emit('remove')"
      >
        <AppIcon name="trash" :size="16" />
      </button>
    </div>
  </article>
</template>
