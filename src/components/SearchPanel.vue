<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { Locator, SearchResult } from '@/services/engine/types'
import { useReader } from '@/stores/reader'

import AppIcon from './AppIcon.vue'

const emit = defineEmits<{ go: [locator: Locator]; close: [] }>()

const reader = useReader()
const query = ref('')
const input = ref<HTMLInputElement>()
const results = ref<SearchResult[]>([])
const searching = ref(false)
const progress = ref<number | null>(null)
let abortSearch = false

async function runSearch(q: string) {
  abortSearch = true
  await nextTick()
  const trimmed = q.trim()
  if (!trimmed) {
    results.value = []
    searching.value = false
    progress.value = null
    reader.clearSearch()
    return
  }

  abortSearch = false
  searching.value = true
  progress.value = 0
  results.value = []

  try {
    for await (const yieldItem of reader.search(trimmed)) {
      if (abortSearch) break
      if ('progress' in yieldItem && typeof yieldItem.progress === 'number') {
        progress.value = Math.round(yieldItem.progress * 100)
      } else if ('subitems' in yieldItem) {
        results.value.push(yieldItem)
      }
    }
  } finally {
    if (!abortSearch) {
      searching.value = false
      progress.value = null
    }
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch(query, (newVal) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void runSearch(newVal)
  }, 250)
})

function clear() {
  query.value = ''
  results.value = []
  searching.value = false
  progress.value = null
  reader.clearSearch()
  input.value?.focus()
}

const list = ref<HTMLDivElement>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
  }
}

onMounted(() => {
  input.value?.focus()
})

onBeforeUnmount(() => {
  abortSearch = true
  clearTimeout(debounceTimer)
  reader.clearSearch()
})
</script>

<template>
  <aside aria-label="Search" class="flex min-h-0 flex-col bg-panel" @keydown="onKeydown">
    <div class="flex flex-none items-center justify-between border-b border-rule pr-2 pl-5">
      <h2 class="flex h-12 items-center border-b-2 border-ink pt-0.5 text-[15px] font-semibold">
        Search
      </h2>
      <button
        type="button"
        aria-label="Close search"
        class="flex size-11 items-center justify-center text-ink2 hover:text-ink"
        @click="emit('close')"
      >
        <AppIcon name="close" />
      </button>
    </div>

    <div class="flex-none p-4">
      <div class="relative flex items-center">
        <span class="pointer-events-none absolute left-3 text-ink2">
          <AppIcon name="search" :size="16" />
        </span>
        <input
          ref="input"
          v-model="query"
          type="search"
          placeholder="Search this book…"
          class="h-10 w-full rounded-ctl border border-rule bg-paper pr-9 pl-9 text-sm text-ink placeholder:text-ink2 focus:outline-none focus:ring-2 focus:ring-signal"
        />
        <button
          v-if="query"
          type="button"
          aria-label="Clear search query"
          class="absolute right-2 flex size-6 items-center justify-center text-ink2 hover:text-ink"
          @click="clear"
        >
          <AppIcon name="close" :size="14" />
        </button>
      </div>

      <div v-if="searching" class="mt-2 flex items-center justify-between text-xs text-ink2">
        <span>Searching…</span>
        <span v-if="progress !== null" class="tabular font-mono">{{ progress }}%</span>
      </div>
    </div>

    <div ref="list" class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      <div v-if="!query.trim()" class="py-6 text-center text-xs text-ink2">
        Type a word or phrase to search within the book.
      </div>

      <div
        v-else-if="!searching && results.length === 0"
        class="py-6 text-center text-xs text-ink2"
      >
        No results found for “{{ query }}”.
      </div>

      <div v-else class="flex flex-col gap-4">
        <div v-for="(group, gIdx) in results" :key="gIdx" class="flex flex-col gap-1.5">
          <div v-if="group.label" class="text-xs font-semibold text-ink2">
            {{ group.label }}
          </div>
          <button
            v-for="(sub, sIdx) in group.subitems"
            :key="sIdx"
            type="button"
            class="rounded-ctl border border-rule/60 bg-paper p-2.5 text-left text-xs leading-relaxed text-ink transition-colors hover:border-signal/80 focus:border-signal focus:outline-none"
            @click="emit('go', sub.locator)"
          >
            {{ sub.excerpt }}
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
