<script setup lang="ts">
import { computed } from 'vue'

import { type BookRecord, statusLabel } from '@/domain/book'

import AppIcon from './AppIcon.vue'
import BookCover from './BookCover.vue'

/** A book in the list. */
const { book, fraction } = defineProps<{ book: BookRecord; fraction: number | undefined }>()
const emit = defineEmits<{ open: []; remove: [] }>()

const status = computed(() => statusLabel(fraction, book.downloaded))
</script>

<template>
  <li class="flex items-center gap-1 border-t border-rule">
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
      type="button"
      :aria-label="`Remove ${book.title}`"
      class="flex size-11 flex-none items-center justify-center text-ink2"
      @click="emit('remove')"
    >
      <AppIcon name="trash" :size="16" />
    </button>
  </li>
</template>
