<script setup lang="ts" generic="T extends string">
/** A row or grid of mutually exclusive options (aria-pressed buttons), as on the design canvas. */
const { options, modelValue, label, cols } = defineProps<{
  options: readonly { value: T; label: string }[]
  modelValue: T
  /** Accessible name of the group. */
  label: string
  /** Number of columns for multi-row grid layout. Defaults to options.length (single row). */
  cols?: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <div
    role="group"
    :aria-label="label"
    class="grid overflow-hidden rounded-ctl border border-rule"
    :style="{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }"
  >
    <button
      v-for="(o, i) in options"
      :key="o.value"
      type="button"
      :aria-pressed="o.value === modelValue"
      class="flex h-11 items-center justify-center px-1 text-[13px] sm:text-sm"
      :class="[
        o.value === modelValue ? 'bg-ink text-paper' : '',
        (cols ? i % cols !== 0 : i > 0) && 'border-l border-rule',
        cols && i >= cols && 'border-t border-rule',
      ]"
      @click="emit('update:modelValue', o.value)"
    >
      <span class="truncate">{{ o.label }}</span>
    </button>
  </div>
</template>
