<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

import { formatPercent } from '@/domain/book'
import type { Locator, TocEntry } from '@/services/engine/types'

import AppIcon from './AppIcon.vue'

/**
 * The table of contents. J/K (or arrows) move, Enter opens, Esc closes.
 * The Bookmarks tab on the canvas waits for bookmarks (not in v1).
 */
const { toc, currentIndex } = defineProps<{
  toc: readonly TocEntry[]
  /** Chapter the reader is in, or null before the first chapter. */
  currentIndex: number | null
}>()
const emit = defineEmits<{ go: [locator: Locator]; close: [] }>()

const list = ref<HTMLOListElement>()
const pad = (n: number) => String(n).padStart(2, '0')

function buttons(): HTMLButtonElement[] {
  return [...(list.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
}

function onKeydown(e: KeyboardEvent) {
  const all = buttons()
  const at = all.indexOf(document.activeElement as HTMLButtonElement)
  const move = (d: number) => {
    e.preventDefault()
    all[Math.min(all.length - 1, Math.max(0, at + d))]?.focus()
  }
  if (e.key === 'j' || e.key === 'ArrowDown') move(1)
  else if (e.key === 'k' || e.key === 'ArrowUp') move(-1)
  else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
  }
}

onMounted(async () => {
  await nextTick()
  const all = buttons()
  const target = all[currentIndex ?? 0] ?? all[0]
  target?.focus()
  target?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <aside aria-label="Contents" class="flex min-h-0 flex-col bg-panel" @keydown="onKeydown">
    <div class="flex flex-none items-center justify-between border-b border-rule pr-2 pl-5">
      <h2 class="flex h-12 items-center border-b-2 border-ink pt-0.5 text-[15px] font-semibold">
        Contents
      </h2>
      <button
        type="button"
        aria-label="Close contents"
        class="flex size-11 items-center justify-center"
        @click="emit('close')"
      >
        <AppIcon name="close" />
      </button>
    </div>
    <p v-if="toc.length === 0" class="px-5 py-4 text-ink2">This book has no table of contents.</p>
    <ol ref="list" class="m-0 min-h-0 flex-1 list-none overflow-y-auto py-2">
      <li v-for="(entry, i) in toc" :key="i">
        <button
          type="button"
          :aria-current="i === currentIndex ? 'true' : undefined"
          class="grid h-11 w-full grid-cols-[6px_22px_minmax(0,1fr)_36px] items-center gap-x-2.5 px-5 text-left"
          @click="emit('go', entry.locator)"
        >
          <span
            class="size-1.5 rounded-full"
            :class="
              i === currentIndex
                ? 'bg-signal'
                : currentIndex !== null && i < currentIndex
                  ? 'bg-ink2'
                  : 'bg-transparent'
            "
          />
          <span class="tabular font-mono text-xs text-ink2">{{ pad(i + 1) }}</span>
          <span class="truncate" :class="i === currentIndex && 'font-semibold'">{{
            entry.label
          }}</span>
          <span class="tabular text-right font-mono text-xs text-ink2">{{
            formatPercent(entry.start)
          }}</span>
        </button>
      </li>
    </ol>
    <div
      class="hidden flex-none flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule px-5 py-3 text-[13px] text-ink2 sm:flex"
    >
      <span class="flex items-center gap-1.5"
        ><kbd class="kbd">J</kbd><kbd class="kbd">K</kbd><span>move</span></span
      >
      <span class="flex items-center gap-1.5"><kbd class="kbd">Enter</kbd><span>open</span></span>
      <span class="flex items-center gap-1.5"><kbd class="kbd">Esc</kbd><span>close</span></span>
    </div>
  </aside>
</template>

<style scoped>
@reference '../styles/tokens.css';
.kbd {
  @apply flex h-[22px] items-center rounded-[2px] border border-rule px-1.5 font-mono text-[11px];
}
</style>
