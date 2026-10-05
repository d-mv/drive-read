import '@fontsource-variable/literata/wght.css'
import '@fontsource-variable/literata/wght-italic.css'
import '@fontsource-variable/space-grotesk/wght.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@/styles/tokens.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { provideServices } from '@/services'
import { track } from '@/services/events'
import { createGis } from '@/services/auth/gis'
import { createAppData } from '@/services/drive/appdata'
import { createDriveApi } from '@/services/drive/client'
import { createEpubEngine } from '@/services/engine/epub'
import { createPdfEngine } from '@/services/engine/pdf'
import { opfsBlobStore } from '@/services/storage/blobs'
import { openDb } from '@/services/storage/db'
import { localBookId } from '@/services/storage/hash'
import { useAuth } from '@/stores/auth'
import { useLibrary } from '@/stores/library'
import { useSettings } from '@/stores/settings'
import { useSync } from '@/stores/sync'

import App from './App.vue'
import { currentDevice } from './device'
import { router } from './router'
import { startSyncTriggers } from './syncTriggers'
import { startInstallWatch } from './install'
import { reportStarted, startObservability, vueErrorEvent } from './observability'
import { registerServiceWorker } from './update'

declare global {
  interface Window {
    launchQueue?: { setConsumer(cb: (p: { files: FileSystemFileHandle[] }) => void): void }
  }
}

async function start() {
  const currentDeviceValue = currentDevice()
  provideServices({
    db: await openDb(),
    blobs: opfsBlobStore(),
    // Each engine is a lazy chunk: pdf.js loads only when a PDF opens.
    createEngine: (format) => (format === 'pdf' ? createPdfEngine() : createEpubEngine()),
    bookId: localBookId,
    now: () => new Date(),
    device: currentDeviceValue,
    gis: createGis(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''),
    drive: createDriveApi(),
    appdata: createAppData(),
  })

  startObservability(currentDeviceValue)
  const app = createApp(App).use(createPinia())
  app.config.errorHandler = (err, _instance, info) => {
    console.error(err)
    track('error.uncaught', vueErrorEvent(err, info))
  }
  useAuth().restore()
  await Promise.all([useSettings().load(), useLibrary().load(), useSync().load()])
  app.use(router).mount('#app')
  reportStarted(useLibrary().books.length)
  // Books the browser deleted under storage pressure go back to "Drive only".
  void useLibrary().verifyDownloads()

  // Opened from the OS ("Open with Drive Read"), where the browser supports file handlers.
  window.launchQueue?.setConsumer(async ({ files }) => {
    const opened = await Promise.all(files.map((h) => h.getFile()))
    const { added } = await useLibrary().importFiles(opened)
    if (added[0]) await router.push({ name: 'reader', params: { id: added[0].id } })
  })

  startSyncTriggers()
  startInstallWatch()
  void registerServiceWorker()
}

void start()
