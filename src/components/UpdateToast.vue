<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'

import { applyUpdate, offlineReady, updateAvailable, updatedTo, updating } from '@/app/update'

import AppIcon from './AppIcon.vue'

/**
 * App-wide service-worker messages. "A new version is ready" waits for the reader's tap (never
 * reloads mid-book); "Updated to…" and "Ready to work offline" go away on their own.
 */
const route = useRoute()
const AUTO_HIDE_MS = 8000

const message = computed(() => {
  if (updating.value) return { text: 'Updating…', action: null, busy: true }
  if (updateAvailable.value) return { text: 'A new version is ready.', action: 'Reload' as const }
  if (updatedTo.value) return { text: `Updated to v${updatedTo.value}.`, action: null }
  if (offlineReady.value) return { text: 'Ready to work offline.', action: null }
  return null
})

function dismiss() {
  if (updateAvailable.value) updateAvailable.value = false
  else if (updatedTo.value) updatedTo.value = null
  else offlineReady.value = false
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  message,
  (m) => {
    clearTimeout(timer)
    if (m && !m.action && !('busy' in m)) timer = setTimeout(dismiss, AUTO_HIDE_MS)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div
    v-if="message"
    role="status"
    class="fixed inset-x-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-ctl border border-rule bg-panel py-1 pr-1 pl-4 text-sm shadow-[0_8px_24px_rgb(0_0_0/0.15)]"
    :class="
      route.name === 'reader' ? 'bottom-[88px]' : 'bottom-[max(16px,env(safe-area-inset-bottom))]'
    "
  >
    <span class="mr-auto py-2">{{ message.text }}</span>
    <button
      v-if="message.action"
      type="button"
      class="h-11 px-2 font-medium underline underline-offset-[3px]"
      @click="applyUpdate()"
    >
      {{ message.action }}
    </button>
    <button
      v-if="!('busy' in message)"
      type="button"
      aria-label="Dismiss"
      class="flex size-11 items-center justify-center"
      @click="dismiss"
    >
      <AppIcon name="close" :size="16" />
    </button>
  </div>
</template>
