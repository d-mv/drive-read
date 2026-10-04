<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { coverTone } from '@/domain/book'
import { useServices } from '@/services'
import { coverPath } from '@/services/storage/blobs'
import { isSome } from '@/shared/result'

/** The book's own cover when it has one, else a typographic cover in one of three tones. */
const {
  id,
  title,
  author,
  hasCover,
  size = 'md',
} = defineProps<{
  id: string
  title: string
  author: string
  hasCover: boolean
  size?: 'sm' | 'md' | 'lg'
}>()

const url = ref<string | null>(null)

async function loadCover() {
  release()
  if (!hasCover) return
  const file = await useServices().blobs.get(coverPath(id))
  if (isSome(file)) url.value = URL.createObjectURL(file.value)
}

function release() {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = null
}

watch(() => [id, hasCover], loadCover, { immediate: true })
onBeforeUnmount(release)

const TONE = {
  dark: 'bg-cover-dark text-cover-dark-ink',
  pale: 'bg-cover-pale text-[#1c1b19]',
  mid: 'bg-cover-mid text-[#1c1b19]',
} as const

/** sm: list rows, md: the Continue cover, lg: grid cards. */
const TEXT = {
  sm: { title: 'text-[9px]', author: 'hidden' },
  md: { title: 'text-[13px]', author: 'text-[8px]' },
  lg: { title: 'text-lg', author: 'text-[10px]' },
} as const
</script>

<template>
  <img
    v-if="url"
    :src="url"
    alt=""
    class="aspect-[2/3] w-full border border-rule object-cover"
    @error="release"
  />
  <div
    v-else
    aria-hidden="true"
    class="flex aspect-[2/3] w-full flex-col justify-between overflow-hidden border border-rule"
    :class="[TONE[coverTone(id)], size === 'sm' ? 'p-1.5' : 'p-3.5']"
  >
    <div class="font-read leading-tight font-medium" :class="TEXT[size].title">{{ title }}</div>
    <div class="font-mono tracking-[0.06em] uppercase" :class="TEXT[size].author">{{ author }}</div>
  </div>
</template>
