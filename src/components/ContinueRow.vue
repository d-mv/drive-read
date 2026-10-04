<script setup lang="ts">
import { computed } from 'vue'

import type { BookRecord } from '@/domain/book'
import { formatPercent } from '@/domain/book'
import { chapterAt } from '@/services/engine/progress'
import { toNullable } from '@/shared/result'

import BookCover from './BookCover.vue'
import ProgressSegments from './ProgressSegments.vue'

const { book, fraction } = defineProps<{ book: BookRecord; fraction: number }>()
const emit = defineEmits<{ resume: [] }>()

const starts = computed(() => book.toc.map((t) => t.start))
const chapter = computed(() => toNullable(chapterAt(starts.value, fraction)))
const pad = (n: number) => String(n).padStart(2, '0')
</script>

<template>
  <section
    aria-label="Continue reading"
    class="flex flex-col gap-4 border-b border-rule px-5 py-5 sm:flex-row sm:flex-wrap sm:gap-x-7 sm:gap-y-6 sm:px-[clamp(16px,3vw,40px)] sm:py-8"
  >
    <div class="flex gap-4 sm:contents">
      <div class="w-16 flex-none sm:w-24">
        <BookCover
          :id="book.id"
          :title="book.title"
          :author="book.author"
          :has-cover="book.hasCover"
          size="md"
        />
      </div>
      <div class="flex min-w-0 flex-col gap-1 sm:flex-[999_1_320px]">
        <div class="font-mono text-xs tracking-[0.06em] text-ink2 uppercase">Continue</div>
        <h2 class="m-0 font-read text-[22px] leading-tight font-medium sm:text-[30px]">
          {{ book.title }}
        </h2>
        <div class="text-ink2">{{ book.author }}</div>
        <div class="mt-auto hidden flex-col gap-2.5 pt-5 sm:flex">
          <ProgressSegments :starts="starts" :fraction="fraction" />
          <div
            class="tabular flex flex-wrap items-baseline gap-x-3.5 gap-y-1 font-mono text-xs text-ink2"
          >
            <span v-if="chapter" class="text-ink"
              >{{ pad(chapter.index + 1) }} / {{ pad(book.toc.length) }}</span
            >
            <span v-if="chapter" class="font-ui text-[13px]">{{
              book.toc[chapter.index]?.label
            }}</span>
            <span class="ml-auto min-w-9 text-right text-ink">{{ formatPercent(fraction) }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="flex flex-col gap-2 sm:hidden">
      <ProgressSegments :starts="starts" :fraction="fraction" :gap="2" />
      <div class="tabular flex items-baseline gap-2.5 font-mono text-xs text-ink2">
        <span v-if="chapter" class="text-ink"
          >{{ pad(chapter.index + 1) }} / {{ pad(book.toc.length) }}</span
        >
        <span v-if="chapter" class="truncate font-ui text-[13px]">{{
          book.toc[chapter.index]?.label
        }}</span>
        <span class="ml-auto text-ink">{{ formatPercent(fraction) }}</span>
      </div>
    </div>
    <div class="flex flex-col items-stretch justify-end sm:flex-[1_1_200px] sm:items-end">
      <button
        type="button"
        class="flex h-12 items-center justify-center gap-3 rounded-ctl bg-ink pr-3 pl-[18px] font-medium text-paper sm:h-11"
        @click="emit('resume')"
      >
        <span>Resume</span>
        <kbd
          class="hidden h-[22px] items-center rounded-[2px] border border-current px-1.5 font-mono text-[11px] opacity-75 sm:flex"
          >Enter</kbd
        >
      </button>
    </div>
  </section>
</template>
