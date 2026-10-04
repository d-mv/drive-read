<script setup lang="ts">
import { computed } from 'vue'

import { formatPercent } from '@/domain/book'
import { segments } from '@/services/engine/progress'

/** One segment per chapter, weighted by length, filled up to the reading position. */
const {
  starts,
  fraction,
  gap = 3,
} = defineProps<{
  /** Chapter start fractions (TocEntry.start). */
  starts: readonly number[]
  fraction: number
  /** px between segments */
  gap?: number
}>()

const parts = computed(() => segments(starts, fraction))
</script>

<template>
  <div
    role="progressbar"
    aria-label="Reading progress"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="Math.floor(fraction * 100)"
    :aria-valuetext="formatPercent(fraction)"
    class="flex h-1"
    :style="{ gap: `${gap}px` }"
  >
    <div
      v-for="(s, i) in parts"
      :key="i"
      data-segment
      class="flex bg-track"
      :style="{ flex: `${s.weight} 1 0px` }"
    >
      <div class="bg-signal" :style="{ width: `${s.fill * 100}%` }" />
    </div>
  </div>
</template>
