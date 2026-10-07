<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { keyAction, keyInput } from '@/app/keymap'
import { browserWakeLock, createWakeLock } from '@/app/wakeLock'
import AppIcon from '@/components/AppIcon.vue'
import ContentsPanel from '@/components/ContentsPanel.vue'
import ProgressSegments from '@/components/ProgressSegments.vue'
import TextSettings from '@/components/TextSettings.vue'
import { formatPercent } from '@/domain/book'
import { paginatorLayout } from '@/domain/settings'
import type { Locator } from '@/services/engine/types'
import { isSome } from '@/shared/result'
import { READER_FONTS } from '@/styles/fonts'
import { readerCss } from '@/styles/reader-theme'
import { authErrorCopy, offerLabel } from '@/app/copy'
import { useAuth } from '@/stores/auth'
import { useSync } from '@/stores/sync'
import { useLibrary } from '@/stores/library'
import { type ReaderError, useReader } from '@/stores/reader'
import { useSettings } from '@/stores/settings'

/** The reader (canvas: "Reader, light", "Reader with contents, dark", phone "Reader"). */
const { id } = defineProps<{ id: string }>()

const router = useRouter()
const reader = useReader()
const settings = useSettings()
const library = useLibrary()
const auth = useAuth()
const sync = useSync()

/** Another device's newer position, or the losing side of a conflict: offered once. */
const offer = computed(() => sync.offers[id])

/** The file changed in Drive since it was downloaded (sync/driveCheck.ts): offered until taken or declined. */
const versionDeclined = ref(false)
const newVersion = computed(
  () => !!reader.book?.driveVersion && !versionDeclined.value && reader.status.kind === 'ready',
)
async function getNewVersion() {
  await library.acceptNewVersion(id)
  await open()
}

async function jumpToOffer() {
  const o = sync.takeOffer(id)
  if (o) await reader.goTo(o.locator)
}

const host = ref<HTMLElement>()
const panel = ref<'none' | 'contents' | 'settings'>('none')
const contentsButton = ref<HTMLButtonElement>()
const settingsButton = ref<HTMLButtonElement>()

const starts = computed(() => reader.toc.map((t) => t.start))
const fraction = computed(() => reader.position?.fraction ?? 0)
const chapterLabel = computed(() =>
  reader.chapter ? reader.toc[reader.chapter.index]?.label : undefined,
)
const pad = (n: number) => String(n).padStart(2, '0')

const ERRORS: Record<ReaderError, string> = {
  'not-found': 'This book is not in your library.',
  'missing-file':
    'The file for this book is no longer on this device. The browser may have cleared it to free space.',
  unreadable: "This file can't be opened. It may be protected or damaged.",
  reconnect: 'This book is still in your Drive. Reconnect Drive to download it to this device.',
  offline: "This book isn't on this device yet. It opens once you're back online.",
  'missing-in-drive': 'Missing in Drive: the file was deleted or you no longer have access to it.',
  'download-failed': "The download didn't finish.",
  'storage-full': 'Not enough space on this device. Remove some downloaded books and try again.',
}

/** The one action that fixes each error, besides going back. */
type FixAction = 'reconnect' | 'retry' | 'remove' | 'free-space'
const ACTION: Partial<Record<ReaderError, FixAction>> = {
  'missing-file': 'remove',
  'missing-in-drive': 'remove',
  reconnect: 'reconnect',
  offline: 'retry',
  'download-failed': 'retry',
  'storage-full': 'free-space',
}
const ACTION_LABEL: Record<FixAction, string> = {
  reconnect: 'Reconnect Drive',
  retry: 'Try again',
  remove: 'Remove book',
  'free-space': 'Free space',
}

function token(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Theme and text settings, pushed into the book frame whenever either changes. */
function applyTheme() {
  const s = settings.value
  reader.setTheme({
    css: readerCss(
      {
        paper: token('--color-paper'),
        ink: token('--color-ink'),
        ink2: token('--color-ink2'),
        signal: token('--color-signal'),
      },
      s,
      READER_FONTS,
    ),
    maxInlineSize: paginatorLayout(s.margins).maxInlineSize,
  })
}
watch(() => [settings.value, settings.resolvedTheme], applyTheme, { deep: true, immediate: true })

async function open() {
  panel.value = 'none'
  if (host.value) await reader.open(id, host.value, { onKeydown })
}

function back() {
  void router.push({ name: 'library' })
}

async function closePanel() {
  const was = panel.value
  panel.value = 'none'
  await nextTick()
  ;(was === 'contents' ? contentsButton : settingsButton).value?.focus()
}

function togglePanel(p: 'contents' | 'settings') {
  if (panel.value === p) void closePanel()
  else panel.value = p
}

async function goTo(loc: Locator) {
  await reader.goTo(loc)
  // On a phone the contents cover the page: close them so the reader sees where they went.
  if (matchMedia('(max-width: 767px)').matches) panel.value = 'none'
}

function onKeydown(e: KeyboardEvent) {
  const action = keyAction('reader', keyInput(e))
  if (!isSome(action) || reader.status.kind !== 'ready') return
  // Inside a panel only Escape (handled by the panel) applies.
  if (panel.value !== 'none' && action.value !== 'back') return
  const run: Partial<Record<typeof action.value, () => void>> = {
    next: () => void reader.next(),
    prev: () => void reader.prev(),
    contents: () => togglePanel('contents'),
    settings: () => togglePanel('settings'),
    theme: () => void settings.toggleTheme(),
    back: () => (panel.value !== 'none' ? void closePanel() : back()),
    ...(reader.zoomable && {
      'zoom-in': () => void reader.zoomBy(1),
      'zoom-out': () => void reader.zoomBy(-1),
      'zoom-reset': () => void reader.zoomBy(0),
    }),
  }
  const fn = run[action.value]
  if (!fn) return
  e.preventDefault()
  fn()
}

async function fix(action: FixAction) {
  if (action === 'free-space') {
    void router.push({ name: 'library', query: { show: 'downloaded' } })
    return
  }
  if (action === 'remove') {
    await library.remove(id)
    return back()
  }
  if (action === 'reconnect' && !(await auth.connect())) return
  await open()
}

/** Keeps the screen on while reading; lets it sleep after idle minutes (app/wakeLock.ts). */
const wakeLock = createWakeLock(browserWakeLock())
watch(
  () => reader.status.kind === 'ready',
  (ready) => void (ready ? wakeLock.start() : wakeLock.stop()),
)
watch(
  () => reader.position,
  () => void wakeLock.activity(),
)

/** A closed tab never calls close(): report the reading session whenever the tab is hidden. */
function onVisibility() {
  if (document.visibilityState === 'hidden') reader.flushSession()
  else void wakeLock.visible()
}

onMounted(() => {
  addEventListener('keydown', onKeydown)
  document.addEventListener('visibilitychange', onVisibility)
  // Opening a book pulls, so a position read elsewhere is offered right away.
  void open().then(() => sync.syncNow())
})
watch(
  () => id,
  () => void open().then(() => sync.syncNow()),
)
onBeforeUnmount(() => {
  removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', onVisibility)
  void wakeLock.stop()
  reader.close()
})
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden">
    <header
      class="flex h-14 flex-none items-center gap-1 border-b border-rule px-2 sm:gap-2 sm:px-[clamp(8px,2vw,28px)]"
    >
      <button
        type="button"
        aria-label="Back to library"
        class="flex size-11 flex-none items-center justify-center"
        @click="back"
      >
        <AppIcon name="back" />
      </button>
      <div class="mr-auto flex min-w-0 items-baseline gap-2.5">
        <span class="truncate font-medium">{{ reader.book?.title }}</span>
        <span class="hidden truncate text-sm text-ink2 sm:inline">{{ reader.book?.author }}</span>
      </div>
      <button
        ref="contentsButton"
        type="button"
        aria-label="Contents"
        :aria-pressed="panel === 'contents'"
        :disabled="reader.status.kind !== 'ready'"
        class="flex size-11 flex-none items-center justify-center rounded-ctl disabled:opacity-40"
        :class="panel === 'contents' && 'bg-ink text-paper'"
        @click="togglePanel('contents')"
      >
        <AppIcon name="contents" />
      </button>
      <button
        ref="settingsButton"
        type="button"
        aria-label="Text settings"
        :aria-pressed="panel === 'settings'"
        class="flex size-11 flex-none items-center justify-center rounded-ctl font-read text-[17px]"
        :class="panel === 'settings' && 'bg-ink text-paper'"
        @click="togglePanel('settings')"
      >
        Aa
      </button>
      <button
        type="button"
        aria-label="Switch theme"
        class="hidden size-11 flex-none items-center justify-center rounded-ctl sm:flex"
        @click="settings.toggleTheme()"
      >
        <AppIcon name="theme" />
      </button>
    </header>

    <div class="relative flex min-h-0 flex-1">
      <ContentsPanel
        v-if="panel === 'contents'"
        :toc="reader.toc"
        :current-index="reader.chapter?.index ?? null"
        class="absolute inset-0 z-10 md:static md:w-[320px] md:min-w-[240px] md:flex-none md:border-r md:border-rule"
        @go="goTo"
        @close="closePanel"
      />

      <div class="hidden flex-[0_0_clamp(44px,6vw,88px)] items-center justify-center md:flex">
        <button
          type="button"
          aria-label="Previous page"
          class="flex size-11 items-center justify-center text-ink2"
          @click="reader.prev()"
        >
          <AppIcon name="chevron-left" />
        </button>
      </div>

      <main class="relative min-w-0 flex-1 overflow-hidden">
        <div
          v-if="newVersion && !offer"
          role="status"
          class="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule bg-panel px-5 py-1.5 text-sm"
        >
          <span class="mr-auto py-2">A newer version of this book is in your Drive.</span>
          <button
            type="button"
            class="h-11 font-medium underline underline-offset-[3px]"
            @click="getNewVersion"
          >
            Get it
          </button>
          <button type="button" class="h-11 text-ink2" @click="versionDeclined = true">
            Not now
          </button>
        </div>
        <div
          v-if="offer && reader.status.kind === 'ready'"
          role="status"
          class="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule bg-panel px-5 py-1.5 text-sm"
        >
          <span class="mr-auto py-2">{{ offerLabel(offer) }}</span>
          <button
            type="button"
            class="h-11 font-medium underline underline-offset-[3px]"
            @click="jumpToOffer"
          >
            Jump
          </button>
          <button type="button" class="h-11 text-ink2" @click="sync.takeOffer(id)">Stay</button>
        </div>
        <div
          ref="host"
          class="absolute inset-0"
          :aria-busy="reader.status.kind === 'loading' || reader.status.kind === 'downloading'"
        />
        <div
          v-if="reader.status.kind === 'downloading'"
          role="status"
          class="absolute inset-0 flex flex-col items-start justify-center gap-3 bg-paper px-7 sm:mx-auto sm:max-w-[480px]"
        >
          <p class="text-base">Downloading from Drive…</p>
          <div class="h-1 w-full bg-track">
            <div class="h-1 bg-signal" :style="{ width: `${reader.status.fraction * 100}%` }" />
          </div>
          <span class="tabular font-mono text-xs text-ink2">{{
            formatPercent(reader.status.fraction)
          }}</span>
        </div>
        <div
          v-if="reader.status.kind === 'error'"
          role="alert"
          class="absolute inset-0 flex flex-col items-start justify-center gap-4 bg-paper px-7 sm:mx-auto sm:max-w-[480px]"
        >
          <p class="text-base">{{ ERRORS[reader.status.error] }}</p>
          <div class="flex gap-3">
            <button
              type="button"
              class="h-11 rounded-ctl bg-ink px-4 font-medium text-paper"
              @click="back"
            >
              Back to library
            </button>
            <button
              v-if="ACTION[reader.status.error]"
              type="button"
              class="h-11 rounded-ctl border border-ink px-4 disabled:opacity-50"
              :disabled="auth.busy"
              @click="fix(ACTION[reader.status.error]!)"
            >
              {{ ACTION_LABEL[ACTION[reader.status.error]!] }}
            </button>
          </div>
          <p
            v-if="reader.status.error === 'reconnect' && auth.error"
            class="text-[13px] text-signal"
          >
            {{ authErrorCopy(auth.error) }}
          </p>
        </div>
      </main>

      <div class="hidden flex-[0_0_clamp(44px,6vw,88px)] items-center justify-center md:flex">
        <button
          type="button"
          aria-label="Next page"
          class="flex size-11 items-center justify-center text-ink2"
          @click="reader.next()"
        >
          <AppIcon name="chevron-right" />
        </button>
      </div>

      <TextSettings
        v-if="panel === 'settings'"
        :settings="settings.value"
        :fixed-layout="reader.book?.format === 'pdf'"
        class="absolute right-0 bottom-0 left-0 z-20 shadow-[0_-8px_24px_rgb(0_0_0/0.12)] sm:top-2 sm:right-[clamp(8px,2vw,28px)] sm:bottom-auto sm:left-auto sm:rounded-ctl sm:shadow-[0_8px_24px_rgb(0_0_0/0.12)]"
        @typeface="settings.setTypeface"
        @size="settings.stepSize"
        @line-height="settings.stepLineHeight"
        @margins="settings.setMargins"
        @align="settings.setAlign"
        @theme="settings.setTheme"
        @close="closePanel"
      />
    </div>

    <footer
      class="flex flex-none flex-col gap-2.5 border-t border-rule px-5 pt-3.5 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-[clamp(16px,3vw,40px)]"
    >
      <ProgressSegments :starts="starts" :fraction="fraction" />
      <div
        class="tabular flex flex-wrap items-baseline gap-x-3.5 gap-y-1 font-mono text-xs text-ink2"
      >
        <span v-if="reader.chapter" class="text-ink"
          >{{ pad(reader.chapter.index + 1) }} / {{ pad(reader.toc.length) }}</span
        >
        <span v-if="chapterLabel" class="hidden truncate font-ui text-[13px] sm:inline">{{
          chapterLabel
        }}</span>
        <div
          v-if="reader.zoomable && reader.status.kind === 'ready'"
          role="group"
          aria-label="Zoom"
          class="flex items-center"
        >
          <button
            type="button"
            aria-label="Zoom out"
            class="flex size-11 items-center justify-center text-ink disabled:opacity-35"
            :disabled="reader.zoom <= 1"
            @click="reader.zoomBy(-1)"
          >
            <AppIcon name="minus" :size="16" />
          </button>
          <button
            type="button"
            class="h-11 min-w-12 text-ink"
            :aria-label="`${Math.round(reader.zoom * 100)}%, fit to width`"
            @click="reader.zoomBy(0)"
          >
            {{ Math.round(reader.zoom * 100) }}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            class="flex size-11 items-center justify-center text-ink disabled:opacity-35"
            :disabled="reader.zoom >= 3"
            @click="reader.zoomBy(1)"
          >
            <AppIcon name="plus" :size="16" />
          </button>
        </div>
        <span v-if="reader.page" class="ml-auto"
          >Page {{ reader.page.current }} of {{ reader.page.total }}</span
        >
        <span v-else-if="reader.chapterMinutesLeft !== null" class="ml-auto">
          {{
            reader.chapterMinutesLeft < 1 ? 'Under a minute' : `${reader.chapterMinutesLeft} min`
          }}
          left in chapter
        </span>
        <span
          class="min-w-9 text-right text-ink"
          :class="reader.chapterMinutesLeft === null && !reader.page && 'ml-auto'"
          >{{ formatPercent(fraction) }}</span
        >
      </div>
    </footer>
  </div>
</template>
