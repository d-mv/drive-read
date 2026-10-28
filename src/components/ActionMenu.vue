<script setup lang="ts" generic="K extends string">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import AppIcon, { type IconName } from './AppIcon.vue'

/** A "more" button that opens a short list of actions (WAI-ARIA menu button pattern). */
export interface ActionMenuItem<Key extends string> {
  key: Key
  label: string
  icon: IconName
}

const { items, label } = defineProps<{
  items: readonly ActionMenuItem<K>[]
  /** Accessible name of the button. */
  label: string
}>()
const emit = defineEmits<{ select: [key: K] }>()

const open = ref(false)
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const list = ref<HTMLElement>()

const entries = () => [
  ...(list.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
]

async function show(focus: 'first' | 'last') {
  open.value = true
  await nextTick()
  const all = entries()
  ;(focus === 'first' ? all[0] : all.at(-1))?.focus()
}

function close(refocus: boolean) {
  open.value = false
  if (refocus) trigger.value?.focus()
}

function choose(key: K) {
  close(true)
  emit('select', key)
}

function onTriggerKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  void show(e.key === 'ArrowDown' ? 'first' : 'last')
}

function onListKey(e: KeyboardEvent) {
  const all = entries()
  const at = all.indexOf(document.activeElement as HTMLButtonElement)
  const move: Record<string, () => number> = {
    ArrowDown: () => (at + 1) % all.length,
    ArrowUp: () => (at - 1 + all.length) % all.length,
    Home: () => 0,
    End: () => all.length - 1,
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close(true)
  } else if (e.key === 'Tab') {
    close(false)
  } else if (move[e.key]) {
    e.preventDefault()
    all[move[e.key]!()]?.focus()
  }
}

function onOutside(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) close(false)
}
watch(open, (isOpen) =>
  isOpen
    ? document.addEventListener('pointerdown', onOutside, true)
    : document.removeEventListener('pointerdown', onOutside, true),
)
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      :aria-label="label"
      :title="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      class="flex size-11 items-center justify-center rounded-ctl border border-rule"
      :class="open && 'bg-panel'"
      @click="open ? close(false) : show('first')"
      @keydown="onTriggerKey"
    >
      <AppIcon name="more" />
    </button>
    <div
      v-if="open"
      ref="list"
      role="menu"
      :aria-label="label"
      class="absolute top-[calc(100%+4px)] right-0 z-20 min-w-56 rounded-ctl border border-rule bg-paper py-1 shadow-[0_6px_24px_rgb(0_0_0/0.14)]"
      @keydown="onListKey"
    >
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        role="menuitem"
        tabindex="-1"
        class="flex h-11 w-full items-center gap-3 px-3.5 text-left hover:bg-panel focus-visible:bg-panel"
        @click="choose(item.key)"
      >
        <AppIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>
