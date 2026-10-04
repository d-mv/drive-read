import '@fontsource-variable/literata/wght.css'
import '@fontsource-variable/literata/wght-italic.css'
import '@fontsource-variable/space-grotesk/wght.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@/styles/tokens.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { provideServices } from '@/services'
import { createEpubEngine } from '@/services/engine/epub'
import { logger } from '@/services/logger'
import { opfsBlobStore } from '@/services/storage/blobs'
import { openDb } from '@/services/storage/db'
import { localBookId } from '@/services/storage/hash'
import { useLibrary } from '@/stores/library'
import { useSettings } from '@/stores/settings'

import App from './App.vue'
import { currentDevice } from './device'
import { router } from './router'
import { registerServiceWorker } from './update'

declare global {
  interface Window {
    launchQueue?: { setConsumer(cb: (p: { files: FileSystemFileHandle[] }) => void): void }
  }
}

async function start() {
  provideServices({
    db: await openDb(),
    blobs: opfsBlobStore(),
    // PDF arrives with build step 6; the library only lets EPUB in until then.
    createEngine: () => createEpubEngine(),
    bookId: localBookId,
    now: () => new Date(),
    device: currentDevice(),
  })

  const app = createApp(App).use(createPinia())
  await Promise.all([useSettings().load(), useLibrary().load()])
  app.use(router).mount('#app')
  logger.info('app started', { books: useLibrary().books.length })

  // Opened from the OS ("Open with Drive Read"), where the browser supports file handlers.
  window.launchQueue?.setConsumer(async ({ files }) => {
    const opened = await Promise.all(files.map((h) => h.getFile()))
    const { added } = await useLibrary().importFiles(opened)
    if (added[0]) await router.push({ name: 'reader', params: { id: added[0].id } })
  })

  void registerServiceWorker()
}

void start()
