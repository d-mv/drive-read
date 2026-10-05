<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { keyAction, keyInput } from '@/app/keymap'
import { formatSize, lastReadLabel, syncedLabel, syncNotice } from '@/app/copy'
import { appVersion } from '@/app/update'
import { canInstall, install, iosHint } from '@/app/install'
import { useOnline } from '@/app/useOnline'
import { useImportFiles } from '@/app/useImportFiles'
import AppIcon from '@/components/AppIcon.vue'
import AppNotice from '@/components/AppNotice.vue'
import BookCard from '@/components/BookCard.vue'
import BookRow from '@/components/BookRow.vue'
import ContinueRow from '@/components/ContinueRow.vue'
import { filterCounts, type LibraryFilter, type LibrarySort, selectBooks } from '@/domain/book'
import { isSome } from '@/shared/result'
import { useServices } from '@/services'
import { useAuth } from '@/stores/auth'
import { useLibrary } from '@/stores/library'
import { useSettings } from '@/stores/settings'
import { useSync } from '@/stores/sync'

/** The library (canvas: "Library, light" and the phone "Library"). */
const router = useRouter()
const library = useLibrary()
const settings = useSettings()
const sync = useSync()
const auth = useAuth()
const syncDismissed = ref(false)
const online = useOnline()
/** Space used on this device (books, covers, app), from navigator.storage.estimate(). */
const usedBytes = ref<number | null>(null)
onMounted(async () => {
  const est = await navigator.storage?.estimate?.().catch(() => null)
  if (est?.usage !== undefined) usedBytes.value = est.usage
})
const continueLastRead = computed(() => {
  const rec = continueEntry.value && library.progress[continueEntry.value.id]
  return rec ? lastReadLabel(rec, useServices().device.id) : null
})
const syncMessage = computed(() =>
  syncDismissed.value ? null : syncNotice(sync.status, sync.pending),
)
const { busy, message, pick } = useImportFiles()

const filter = ref<LibraryFilter>('all')
const sort = ref<LibrarySort>('recent')
const query = ref('')
const search = ref<HTMLInputElement>()

const counts = computed(() => filterCounts(library.items))
const shown = computed(() =>
  selectBooks(library.items, { filter: filter.value, query: query.value, sort: sort.value }),
)
const continueEntry = computed(() => library.items.find((i) => i.id === library.continueBook?.id))

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reading', label: 'Reading' },
  { value: 'unread', label: 'Unread' },
  { value: 'finished', label: 'Finished' },
]

const open = (id: string) => router.push({ name: 'reader', params: { id } })

async function remove(id: string, title: string) {
  if (!confirm(`Remove “${title}” from this device? Your reading position is removed too.`)) return
  await library.remove(id)
  if (library.books.length === 0) await router.replace({ name: 'welcome' })
}

function onKeydown(e: KeyboardEvent) {
  const action = keyAction('library', keyInput(e))
  if (!isSome(action)) return
  const run: Record<string, () => void> = {
    search: () => search.value?.focus(),
    resume: () => continueEntry.value && open(continueEntry.value.id),
    theme: () => void settings.toggleTheme(),
    blur: () => (document.activeElement as HTMLElement | null)?.blur(),
  }
  const fn = run[action.value]
  if (!fn) return
  e.preventDefault()
  fn()
}

onMounted(() => addEventListener('keydown', onKeydown))
onBeforeUnmount(() => removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header
      class="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule px-3 pt-4 pb-2 sm:px-[clamp(16px,3vw,40px)] sm:py-3"
    >
      <div class="mr-auto flex items-baseline gap-3 pl-2 sm:pl-0">
        <h1 class="text-2xl font-semibold tracking-[-0.01em] sm:text-xl">Library</h1>
        <span class="tabular hidden font-mono text-[13px] text-ink2 sm:inline">
          {{ library.books.length }} {{ library.books.length === 1 ? 'book' : 'books' }}
        </span>
      </div>
      <label
        class="order-last flex h-11 w-full items-center gap-2 rounded-ctl border border-rule pr-2.5 pl-3 sm:order-none sm:w-auto sm:max-w-[360px] sm:flex-[1_1_240px]"
      >
        <AppIcon name="search" />
        <input
          ref="search"
          v-model="query"
          type="search"
          aria-label="Search library"
          placeholder="Search title or author"
          class="min-w-0 flex-1 bg-transparent outline-0 placeholder:text-ink2"
        />
        <kbd
          class="hidden h-[22px] min-w-[22px] items-center justify-center rounded-[2px] border border-rule px-1.5 font-mono text-xs text-ink2 sm:flex"
          >/</kbd
        >
      </label>
      <RouterLink
        :to="{ name: 'drive' }"
        class="flex h-11 items-center gap-2 rounded-ctl border border-ink px-3.5 font-medium"
      >
        <AppIcon name="plus" />
        <span>Add from Drive</span>
      </RouterLink>
      <button
        type="button"
        aria-label="Open a file from this device"
        title="Open a file from this device"
        class="flex size-11 items-center justify-center rounded-ctl border border-rule disabled:opacity-50"
        :disabled="busy"
        @click="pick"
      >
        <AppIcon name="upload" />
      </button>
      <button
        v-if="auth.status !== 'disconnected'"
        type="button"
        title="Sync now"
        class="tabular h-11 px-1 font-mono text-xs text-ink2 underline-offset-[3px] hover:underline disabled:no-underline"
        :disabled="sync.status === 'syncing'"
        @click="sync.syncNow()"
      >
        {{ sync.status === 'syncing' ? 'Syncing…' : syncedLabel(sync.lastSyncAt) }}
      </button>
      <button
        type="button"
        aria-label="Switch theme"
        class="flex size-11 items-center justify-center rounded-ctl border border-rule"
        @click="settings.toggleTheme()"
      >
        <AppIcon name="theme" />
      </button>
    </header>

    <AppNotice
      v-if="syncMessage"
      :message="syncMessage"
      :action-label="sync.status === 'reconnect' ? 'Reconnect' : undefined"
      @action="auth.connect()"
      @dismiss="syncDismissed = true"
    />

    <AppNotice v-if="message" :message="message" @dismiss="message = null" />

    <ContinueRow
      v-if="continueEntry && !query"
      :book="continueEntry.book"
      :fraction="continueEntry.fraction ?? 0"
      :last-read="continueLastRead"
      @resume="open(continueEntry.id)"
    />

    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 pt-5 sm:px-[clamp(16px,3vw,40px)]">
      <div role="group" aria-label="Show" class="mr-auto flex flex-wrap gap-x-6">
        <button
          v-for="f in FILTERS"
          :key="f.value"
          type="button"
          :aria-pressed="filter === f.value"
          class="flex h-11 items-baseline gap-1.5 border-b-2 pt-3"
          :class="filter === f.value ? 'border-ink font-semibold' : 'border-transparent'"
          @click="filter = f.value"
        >
          <span>{{ f.label }}</span>
          <span class="tabular font-mono text-xs font-normal text-ink2">{{ counts[f.value] }}</span>
        </button>
      </div>
      <label class="relative flex h-11 items-center gap-1.5 text-ink2">
        <span class="sr-only">Sort by</span>
        <select v-model="sort" class="h-11 appearance-none bg-transparent pr-6 text-sm">
          <option value="recent">Sort: recent</option>
          <option value="title">Sort: title</option>
          <option value="author">Sort: author</option>
        </select>
        <AppIcon name="chevron-down" :size="16" class="pointer-events-none absolute right-0" />
      </label>
      <div
        role="group"
        aria-label="Layout"
        class="hidden h-11 w-[132px] grid-cols-2 overflow-hidden rounded-ctl border border-rule sm:grid"
      >
        <button
          type="button"
          :aria-pressed="settings.value.libraryView === 'grid'"
          class="text-sm"
          :class="settings.value.libraryView === 'grid' && 'bg-ink text-paper'"
          @click="settings.setLibraryView('grid')"
        >
          Grid
        </button>
        <button
          type="button"
          :aria-pressed="settings.value.libraryView === 'list'"
          class="text-sm"
          :class="settings.value.libraryView === 'list' && 'bg-ink text-paper'"
          @click="settings.setLibraryView('list')"
        >
          List
        </button>
      </div>
    </div>

    <p v-if="shown.length === 0" class="px-5 py-10 text-ink2 sm:px-[clamp(16px,3vw,40px)]">
      {{ query ? `Nothing matches “${query}”.` : 'No books here yet.' }}
    </p>

    <main
      v-else-if="settings.value.libraryView === 'grid'"
      class="hidden grid-cols-[repeat(auto-fill,minmax(min(168px,100%),1fr))] gap-x-8 gap-y-10 px-[clamp(16px,3vw,40px)] pt-6 pb-12 sm:grid"
    >
      <BookCard
        v-for="entry in shown"
        :key="entry.id"
        :book="entry.book"
        :fraction="entry.fraction"
        :online="online"
        @open="open(entry.id)"
        @remove="remove(entry.id, entry.title)"
      />
    </main>
    <!-- The phone always lists; the grid is a desktop layout. -->
    <ul
      v-if="shown.length > 0"
      class="m-0 list-none px-3 pt-2 pb-12 sm:px-[clamp(16px,3vw,40px)]"
      :class="settings.value.libraryView === 'grid' && 'sm:hidden'"
    >
      <BookRow
        v-for="entry in shown"
        :key="entry.id"
        :book="entry.book"
        :fraction="entry.fraction"
        :online="online"
        @open="open(entry.id)"
        @remove="remove(entry.id, entry.title)"
      />
    </ul>

    <footer
      class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule px-5 py-3 text-[13px] text-ink2 sm:px-[clamp(16px,3vw,40px)]"
    >
      <span class="tabular font-mono text-xs">Drive Read v{{ appVersion }}</span>
      <span v-if="usedBytes !== null" class="tabular font-mono text-xs"
        >{{ formatSize(usedBytes) }} on this device</span
      >
      <button
        v-if="canInstall"
        type="button"
        class="h-11 font-medium text-ink underline underline-offset-[3px]"
        @click="install"
      >
        Install app
      </button>
      <span v-else-if="iosHint">To install: Share, then Add to Home Screen.</span>
    </footer>
  </div>
</template>
