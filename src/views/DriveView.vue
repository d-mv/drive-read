<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { authErrorCopy, driveErrorCopy, formatSize } from '@/app/copy'
import AppIcon from '@/components/AppIcon.vue'
import AppNotice from '@/components/AppNotice.vue'
import { useAuth } from '@/stores/auth'
import { useDriveBrowser } from '@/stores/driveBrowser'

/**
 * "Add from Drive" (canvas: DriveFolders, MobileDriveFolder, MobileDriveReconnect): folders from
 * My Drive down. The search box shows matching books in place of the folder while it has text.
 */
const router = useRouter()
const auth = useAuth()
const browser = useDriveBrowser()

const query = ref('')
const searching = computed(() => query.value.trim() !== '')
const message = ref<string | null>(null)

const currentFolder = computed(() => browser.trail.at(-1))
const empty = computed(
  () =>
    browser.status.kind === 'ready' && browser.books.length === 0 && browser.folders.length === 0,
)

function load() {
  message.value = null
  if (searching.value) return browser.search(query.value)
  const here = currentFolder.value ?? { id: 'root', name: 'My Drive' }
  return browser.openFolder(here.id, here.name)
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch(query, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => void load(), 300)
})

async function reconnect() {
  if (await auth.connect()) await load()
}

async function addSelected() {
  message.value = await browser.addSelected()
}

async function addOne(id: string) {
  browser.clearSelection()
  browser.toggle(id)
  message.value = await browser.addSelected()
}

async function addFolder(id: string) {
  const m = await browser.addFolder(id)
  if (m) message.value = m
}

onMounted(() => void load())
onBeforeUnmount(() => clearTimeout(debounce))
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header
      class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-2 py-2 sm:px-[clamp(16px,3vw,40px)] sm:py-3"
    >
      <button
        type="button"
        aria-label="Back to library"
        class="flex size-11 items-center justify-center sm:-ml-3"
        @click="router.push({ name: 'library' })"
      >
        <AppIcon name="back" />
      </button>
      <h1 class="mr-auto text-[17px] font-semibold tracking-[-0.01em] sm:text-xl">
        Add from Drive
      </h1>
      <label
        class="order-last mx-3 mb-1 flex h-11 w-full items-center gap-2 rounded-ctl border px-3 sm:order-none sm:m-0 sm:w-auto sm:max-w-[480px] sm:flex-[1_1_320px]"
        :class="query ? 'border-ink' : 'border-rule'"
      >
        <AppIcon name="search" />
        <input
          v-model="query"
          type="search"
          aria-label="Search books in your Drive"
          placeholder="Search books in your Drive"
          :disabled="browser.status.kind === 'reconnect'"
          class="min-w-0 flex-1 bg-transparent outline-0 placeholder:text-ink2 disabled:opacity-50"
        />
      </label>
    </header>

    <div
      v-if="browser.status.kind === 'reconnect'"
      role="status"
      class="flex flex-col gap-3 border-b border-rule bg-panel px-5 py-4 sm:flex-row sm:items-center sm:px-[clamp(16px,3vw,40px)]"
    >
      <p class="text-sm sm:mr-auto">
        {{
          auth.status === 'disconnected'
            ? 'Connect Google Drive to browse and add your books.'
            : 'Drive access has expired. Books already in your library still open; reconnect to browse and add more.'
        }}
      </p>
      <button
        type="button"
        class="h-12 rounded-ctl bg-ink px-5 font-medium text-paper disabled:opacity-50 sm:h-11"
        :disabled="auth.busy"
        @click="reconnect"
      >
        {{ auth.status === 'disconnected' ? 'Connect Google Drive' : 'Reconnect Drive' }}
      </button>
      <p v-if="auth.error" role="alert" class="text-[13px] text-signal">
        {{ authErrorCopy(auth.error) }}
      </p>
    </div>

    <AppNotice v-if="message" :message="message" @dismiss="message = null" />

    <div
      v-if="searching"
      class="flex items-center gap-4 border-b border-rule px-5 sm:px-[clamp(16px,3vw,40px)]"
    >
      <span class="mr-auto truncate text-sm text-ink2"
        >Books in your Drive matching “{{ query.trim() }}”</span
      >
      <button
        type="button"
        class="h-11 text-sm underline underline-offset-[3px]"
        @click="query = ''"
      >
        Back to folders
      </button>
    </div>

    <nav
      v-if="!searching && browser.trail.length > 0"
      aria-label="Folder path"
      class="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 pt-2 sm:px-[clamp(16px,3vw,40px)]"
    >
      <ol class="mr-auto flex list-none flex-wrap items-center gap-0.5 p-0 text-sm">
        <li v-for="(t, i) in browser.trail" :key="t.id" class="flex items-center gap-0.5">
          <span v-if="i > 0" aria-hidden="true" class="text-track">/</span>
          <span
            v-if="i === browser.trail.length - 1"
            aria-current="page"
            class="flex h-11 items-center px-1.5 font-semibold"
            >{{ t.name }}</span
          >
          <button
            v-else
            type="button"
            class="h-11 px-1.5 text-ink2 underline underline-offset-[3px]"
            @click="browser.openFolder(t.id, t.name)"
          >
            {{ t.name }}
          </button>
        </li>
      </ol>
      <button
        v-if="currentFolder && currentFolder.id !== 'root' && browser.status.kind === 'ready'"
        type="button"
        class="h-11 rounded-ctl border border-ink px-4 font-medium disabled:opacity-50"
        :disabled="browser.busy"
        @click="addFolder(currentFolder.id)"
      >
        {{ browser.busy ? 'Adding…' : 'Add everything in this folder' }}
      </button>
    </nav>

    <main class="flex-1 px-3 pb-6 sm:px-[clamp(16px,3vw,40px)]">
      <p v-if="browser.status.kind === 'loading'" role="status" class="px-2 py-10 text-ink2">
        Loading your Drive…
      </p>
      <div
        v-else-if="browser.status.kind === 'error'"
        role="alert"
        class="flex flex-col items-start gap-3 px-2 py-10"
      >
        <p>{{ driveErrorCopy(browser.status.error) }}</p>
        <button type="button" class="h-11 rounded-ctl border border-ink px-4" @click="load">
          Try again
        </button>
      </div>
      <p v-else-if="empty" class="px-2 py-10 text-ink2">
        {{
          searching
            ? `No EPUB or PDF files in your Drive match “${query.trim()}”.`
            : 'This folder has no books or folders.'
        }}
      </p>

      <template v-else-if="browser.status.kind === 'ready'">
        <ul v-if="!searching && browser.folders.length > 0" class="m-0 list-none p-0">
          <li
            v-for="f in browser.folders"
            :key="f.id"
            class="flex items-center gap-2 border-t border-rule first:border-t-0"
          >
            <button
              type="button"
              class="grid min-h-14 min-w-0 flex-1 grid-cols-[24px_minmax(0,1fr)] items-center gap-x-3.5 px-2 text-left"
              @click="browser.openFolder(f.id, f.label)"
            >
              <AppIcon name="folder" class="text-ink2" />
              <span class="min-w-0">
                <span class="block truncate font-medium">{{ f.label }}</span>
                <span v-if="f.label !== f.raw" class="block truncate font-mono text-xs text-ink2">{{
                  f.raw
                }}</span>
              </span>
            </button>
            <button
              type="button"
              :aria-label="`Add folder ${f.label}`"
              class="h-9 w-28 flex-none rounded-ctl border border-rule text-sm disabled:opacity-50"
              :disabled="browser.busy"
              @click="addFolder(f.id)"
            >
              Add folder
            </button>
          </li>
        </ul>

        <ul
          class="m-0 list-none p-0"
          :class="!searching && browser.folders.length > 0 && 'border-t border-rule'"
        >
          <li
            v-for="b in browser.books"
            :key="b.id"
            class="grid min-h-16 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-2 border-t border-rule first:border-t-0 sm:grid-cols-[44px_minmax(0,1fr)_56px_80px_120px] sm:gap-x-3"
            :class="b.inLibrary && 'opacity-60'"
          >
            <label class="flex size-11 items-center justify-center">
              <input
                type="checkbox"
                :checked="b.selected"
                :disabled="!b.addable"
                :aria-label="`Select ${b.title}`"
                class="size-[18px] accent-ink"
                @change="browser.toggle(b.id)"
              />
            </label>
            <div class="min-w-0 py-2">
              <div class="truncate font-medium">{{ b.title }}</div>
              <div class="truncate text-[13px] text-ink2">
                <span v-if="b.author">{{ b.author }}</span>
                <span class="font-mono text-xs sm:hidden"
                  >{{ b.author ? ' · ' : '' }}{{ b.format }} · {{ formatSize(b.size) }}</span
                >
              </div>
            </div>
            <span class="hidden font-mono text-xs sm:inline">{{ b.format }}</span>
            <span class="tabular hidden text-right font-mono text-xs text-ink2 sm:inline">{{
              formatSize(b.size)
            }}</span>
            <span class="pr-2 text-right sm:pr-0">
              <span v-if="b.inLibrary" class="font-mono text-xs text-ink2">In library</span>
              <span v-else-if="b.format === 'PDF'" class="font-mono text-xs text-ink2"
                >PDF later</span
              >
              <button
                v-else
                type="button"
                :aria-label="`Add ${b.title}`"
                class="hidden h-9 min-w-16 rounded-ctl border border-ink px-3.5 text-sm sm:inline-block"
                @click="addOne(b.id)"
              >
                Add
              </button>
            </span>
          </li>
        </ul>
      </template>
    </main>

    <footer
      v-if="browser.selectedCount > 0"
      class="sticky bottom-0 flex flex-col gap-2 border-t border-rule bg-panel px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:gap-5 sm:px-[clamp(16px,3vw,40px)] sm:pb-3"
    >
      <div class="flex items-baseline justify-between gap-5 sm:mr-auto">
        <span>
          <span class="font-semibold">{{ browser.selectedCount }} selected</span>
          <span class="tabular ml-2 font-mono text-xs text-ink2">{{
            formatSize(browser.selectedBytes)
          }}</span>
        </span>
        <button type="button" class="h-11 text-ink2" @click="browser.clearSelection()">
          Clear
        </button>
      </div>
      <button
        type="button"
        class="h-12 rounded-ctl bg-ink px-5 font-medium text-paper disabled:opacity-50 sm:h-11"
        :disabled="browser.busy"
        @click="addSelected"
      >
        Add {{ browser.selectedCount }} {{ browser.selectedCount === 1 ? 'book' : 'books' }}
      </button>
    </footer>
  </div>
</template>
