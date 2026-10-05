<script setup lang="ts">
import { onMounted, ref } from 'vue'

import {
  type Align,
  LINE_HEIGHT_RANGE,
  type Margins,
  type Settings,
  SIZE_RANGE,
  type ThemeSetting,
  type Typeface,
} from '@/domain/settings'

import AppIcon from './AppIcon.vue'
import SegmentedControl from './SegmentedControl.vue'

/** The text settings panel from the canvas. Every change is an event; the view persists it. */
const { settings, fixedLayout = false } = defineProps<{
  settings: Settings
  /** PDF: pages keep their own type, so only margins (page width) and theme apply. */
  fixedLayout?: boolean
}>()
const emit = defineEmits<{
  typeface: [Typeface]
  size: [dir: 1 | -1]
  lineHeight: [dir: 1 | -1]
  margins: [Margins]
  align: [Align]
  theme: [ThemeSetting]
  close: []
}>()

const TYPEFACES = [
  { value: 'literata', label: 'Literata' },
  { value: 'grotesk', label: 'Grotesk' },
  { value: 'original', label: 'Original' },
] as const
const MARGINS = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'medium', label: 'Medium' },
  { value: 'wide', label: 'Wide' },
] as const
const ALIGNS = [
  { value: 'left', label: 'Left' },
  { value: 'justify', label: 'Justified' },
] as const
const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

const root = ref<HTMLElement>()
onMounted(() => root.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus())

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}
</script>

<template>
  <section
    ref="root"
    aria-label="Text settings"
    class="flex w-full flex-col gap-4 border border-rule bg-paper px-5 pt-4 pb-5 text-sm sm:w-[340px]"
    @keydown="onKeydown"
  >
    <div class="-mr-3 flex h-11 items-center justify-between">
      <h2 class="text-base font-semibold">Text</h2>
      <button
        type="button"
        aria-label="Close text settings"
        class="flex size-11 items-center justify-center"
        @click="emit('close')"
      >
        <AppIcon name="close" />
      </button>
    </div>

    <div v-if="!fixedLayout" class="flex flex-col gap-1.5">
      <div class="text-[13px] text-ink2">Typeface</div>
      <SegmentedControl
        label="Typeface"
        :options="TYPEFACES"
        :model-value="settings.typeface"
        @update:model-value="emit('typeface', $event)"
      />
    </div>

    <div v-if="!fixedLayout" class="grid grid-cols-2 gap-3">
      <div class="flex flex-col gap-1.5">
        <div id="ts-size" class="text-[13px] text-ink2">Size</div>
        <div
          role="group"
          aria-labelledby="ts-size"
          class="grid h-11 grid-cols-[43px_minmax(0,1fr)_43px] items-center rounded-ctl border border-rule"
        >
          <button
            type="button"
            aria-label="Smaller text"
            class="flex h-full items-center justify-center disabled:opacity-40"
            :disabled="settings.size <= SIZE_RANGE.min"
            @click="emit('size', -1)"
          >
            <AppIcon name="minus" :size="16" />
          </button>
          <span class="tabular text-center font-mono text-[13px]" aria-live="polite"
            >{{ settings.size }} px</span
          >
          <button
            type="button"
            aria-label="Larger text"
            class="flex h-full items-center justify-center disabled:opacity-40"
            :disabled="settings.size >= SIZE_RANGE.max"
            @click="emit('size', 1)"
          >
            <AppIcon name="plus" :size="16" />
          </button>
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <div id="ts-lh" class="text-[13px] text-ink2">Line spacing</div>
        <div
          role="group"
          aria-labelledby="ts-lh"
          class="grid h-11 grid-cols-[43px_minmax(0,1fr)_43px] items-center rounded-ctl border border-rule"
        >
          <button
            type="button"
            aria-label="Tighter line spacing"
            class="flex h-full items-center justify-center disabled:opacity-40"
            :disabled="settings.lineHeight <= LINE_HEIGHT_RANGE.min"
            @click="emit('lineHeight', -1)"
          >
            <AppIcon name="minus" :size="16" />
          </button>
          <span class="tabular text-center font-mono text-[13px]" aria-live="polite">{{
            settings.lineHeight.toFixed(2)
          }}</span>
          <button
            type="button"
            aria-label="Looser line spacing"
            class="flex h-full items-center justify-center disabled:opacity-40"
            :disabled="settings.lineHeight >= LINE_HEIGHT_RANGE.max"
            @click="emit('lineHeight', 1)"
          >
            <AppIcon name="plus" :size="16" />
          </button>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <div class="text-[13px] text-ink2">Margins</div>
      <SegmentedControl
        label="Margins"
        :options="MARGINS"
        :model-value="settings.margins"
        @update:model-value="emit('margins', $event)"
      />
    </div>
    <div v-if="!fixedLayout" class="flex flex-col gap-1.5">
      <div class="text-[13px] text-ink2">Alignment</div>
      <SegmentedControl
        label="Alignment"
        :options="ALIGNS"
        :model-value="settings.align"
        @update:model-value="emit('align', $event)"
      />
    </div>
    <div class="flex flex-col gap-1.5">
      <div class="text-[13px] text-ink2">Theme</div>
      <SegmentedControl
        label="Theme"
        :options="THEMES"
        :model-value="settings.theme"
        @update:model-value="emit('theme', $event)"
      />
    </div>
  </section>
</template>
