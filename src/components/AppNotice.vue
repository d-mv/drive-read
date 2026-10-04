<script setup lang="ts">
import AppIcon from './AppIcon.vue'

/** A one-line status notice. The UI shows status only when something needs attention. */
const { message, actionLabel } = defineProps<{ message: string; actionLabel?: string }>()
const emit = defineEmits<{ action: []; dismiss: [] }>()
</script>

<template>
  <div
    role="status"
    class="flex items-center gap-3 border-b border-rule bg-panel px-5 py-1.5 text-[13px] sm:px-[clamp(16px,3vw,40px)]"
  >
    <span class="mr-auto py-2">{{ message }}</span>
    <button
      v-if="actionLabel"
      type="button"
      class="h-11 font-medium underline underline-offset-[3px]"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
    <button
      type="button"
      aria-label="Dismiss"
      class="flex size-11 items-center justify-center"
      @click="emit('dismiss')"
    >
      <AppIcon name="close" :size="16" />
    </button>
  </div>
</template>
