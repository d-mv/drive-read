<script setup lang="ts">
/** Stroke icons from the design canvas. Decorative: label the button, not the icon. */
export type IconName =
  | 'search'
  | 'plus'
  | 'theme'
  | 'back'
  | 'contents'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'close'
  | 'minus'
  | 'trash'
  | 'upload'
  | 'folder'

type Shape =
  | { kind: 'path'; d: string; filled?: boolean }
  | { kind: 'circle'; cx: number; cy: number; r: number }

const ICONS: Record<IconName, Shape[]> = {
  search: [
    { kind: 'circle', cx: 11, cy: 11, r: 7 },
    { kind: 'path', d: 'M20 20l-3.8-3.8' },
  ],
  plus: [{ kind: 'path', d: 'M12 5v14M5 12h14' }],
  theme: [
    { kind: 'circle', cx: 12, cy: 12, r: 8.5 },
    { kind: 'path', d: 'M12 3.5a8.5 8.5 0 0 1 0 17z', filled: true },
  ],
  back: [{ kind: 'path', d: 'M19 12H5M11 6l-6 6 6 6' }],
  contents: [{ kind: 'path', d: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01' }],
  'chevron-left': [{ kind: 'path', d: 'M15 6l-6 6 6 6' }],
  'chevron-right': [{ kind: 'path', d: 'M9 6l6 6-6 6' }],
  'chevron-down': [{ kind: 'path', d: 'M6 9l6 6 6-6' }],
  close: [{ kind: 'path', d: 'M6 6l12 12M18 6L6 18' }],
  minus: [{ kind: 'path', d: 'M5 12h14' }],
  trash: [{ kind: 'path', d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' }],
  upload: [{ kind: 'path', d: 'M12 16V4M7 9l5-5 5 5M5 20h14' }],
  folder: [{ kind: 'path', d: 'M3 7h6l2 2h10v10H3z' }],
}

const { name, size = 20 } = defineProps<{ name: IconName; size?: number }>()
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="flex-none"
  >
    <template v-for="(s, i) in ICONS[name]" :key="i">
      <circle v-if="s.kind === 'circle'" :cx="s.cx" :cy="s.cy" :r="s.r" />
      <path
        v-else
        :d="s.d"
        :fill="s.filled ? 'currentColor' : 'none'"
        :stroke="s.filled ? 'none' : undefined"
      />
    </template>
  </svg>
</template>
