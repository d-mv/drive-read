<script setup lang="ts" generic="T extends string">
/** A row of mutually exclusive options (aria-pressed buttons), as on the design canvas. */
const { options, modelValue, label } = defineProps<{
  options: readonly { value: T; label: string }[]
  modelValue: T
  /** Accessible name of the group. */
  label: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <div
    role="group"
    :aria-label="label"
    class="grid h-11 overflow-hidden rounded-ctl border border-rule"
    :style="{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }"
  >
    <button
      v-for="(o, i) in options"
      :key="o.value"
      type="button"
      :aria-pressed="o.value === modelValue"
      class="text-sm"
      :class="[o.value === modelValue ? 'bg-ink text-paper' : '', i > 0 && 'border-l border-rule']"
      @click="emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
