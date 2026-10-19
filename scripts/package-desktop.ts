/**
 * Builds the macOS desktop app (Apple Silicon) for use on this Mac: the web build, the bundled
 * main process, and `desktop/release/mac-arm64/Drive Read.app`, ad-hoc signed. The app is never
 * distributed, so there is no certificate, notarisation or installer (docs/DESKTOP.md).
 *
 *   bun run desktop:package               build the .app
 *   bun run desktop:package -- --install  also copy it to /Applications, replacing an older copy
 *
 * The web build reads .env like `bun run build`, so the Google client id and logger key ship.
 */
import { rm } from 'node:fs/promises'

import { $ } from 'bun'

const APP = 'desktop/release/mac-arm64/Drive Read.app'
const INSTALLED = '/Applications/Drive Read.app'
const install = process.argv.includes('--install')

console.log('building the web app and the desktop shell')
await $`bun run build`.quiet()
await $`bun desktop/build.ts`
console.log('packing the .app')
await $`bunx electron-builder --mac dir --arm64`.quiet()

// Ad hoc: macOS runs it on this Mac; nothing to trust or renew.
await $`codesign --force --deep --sign - ${APP}`
await $`codesign --verify --deep --strict ${APP}`
console.log(`built ${APP}`)

if (install) {
  const running = await $`pgrep -f ${`${INSTALLED}/Contents/MacOS/`}`.nothrow().quiet()
  if (running.exitCode === 0) {
    console.error('Drive Read is running from /Applications: quit it, then run this again.')
    process.exit(1)
  }
  await rm(INSTALLED, { recursive: true, force: true })
  await $`ditto ${APP} ${INSTALLED}`
  console.log(`installed ${INSTALLED}`)
}
