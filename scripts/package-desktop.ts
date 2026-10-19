/**
 * Builds the macOS desktop app (Apple Silicon) into desktop/release/: the web build, the bundled
 * main process, the .app (electron-builder), a signature with the local self-signed certificate,
 * and a drag-to-Applications .dmg (hdiutil). All local; no CI (docs/DESKTOP.md, phase 5).
 *
 *   bun scripts/package-desktop.ts             signed with the "Drive Read Local" certificate
 *   bun scripts/package-desktop.ts --adhoc     ad-hoc signature (no certificate yet; the
 *                                              keychain may ask again after every update)
 *   bun scripts/package-desktop.ts --release   also writes public/desktop-version.json, so the
 *                                              next web deploy offers this version
 *
 * The web build uses .env like `bun run build`, so the logger key and client id ship.
 */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

const IDENTITY = 'Drive Read Local'
const RELEASE_DIR = 'desktop/release'
const APP = `${RELEASE_DIR}/mac-arm64/Drive Read.app`

const args = new Set(process.argv.slice(2))
const adhoc = args.has('--adhoc')
const release = args.has('--release')

const { version } = JSON.parse(await readFile('package.json', 'utf8')) as { version: string }
const dmg = `${RELEASE_DIR}/Drive-Read-${version}-arm64.dmg`
/** Where the .dmg is published; DR_DOWNLOAD_URL overrides it. */
const downloadUrl =
  process.env.DR_DOWNLOAD_URL ??
  `https://github.com/d-mv/drive-read/releases/download/desktop-v${version}/Drive-Read-${version}-arm64.dmg`

if (!adhoc) {
  // Without -v: a self-signed certificate counts even if it is not marked trusted.
  const identities = await $`security find-identity -p codesigning`.text()
  if (!identities.includes(`"${IDENTITY}"`)) {
    console.error(
      `No "${IDENTITY}" code-signing certificate in the keychain. Create it (docs/DESKTOP.md, ` +
        '"Signing certificate"), or pass --adhoc.',
    )
    process.exit(1)
  }
}

console.log(`Drive Read ${version}: building`)
await $`bun run build`.quiet()
await $`bun desktop/build.ts`
await $`bunx electron-builder --mac dir --arm64`.quiet()

console.log(adhoc ? 'signing ad hoc' : `signing as "${IDENTITY}"`)
await $`codesign --force --deep --sign ${adhoc ? '-' : IDENTITY} ${APP}`
await $`codesign --verify --deep --strict ${APP}`

console.log(`making ${dmg}`)
const stage = await mkdtemp(join(tmpdir(), 'dr-dmg-'))
try {
  await $`ditto ${APP} ${join(stage, 'Drive Read.app')}`
  await symlink('/Applications', join(stage, 'Applications'))
  await mkdir(RELEASE_DIR, { recursive: true })
  await $`hdiutil create -volname ${'Drive Read'} -srcfolder ${stage} -ov -format UDZO ${dmg}`.quiet()
} finally {
  await rm(stage, { recursive: true, force: true })
}

if (release) {
  const doc = { v: 1, version, url: downloadUrl }
  await writeFile('public/desktop-version.json', `${JSON.stringify(doc, null, 2)}\n`)
  console.log(`public/desktop-version.json → ${version}; publish ${dmg} at ${downloadUrl}`)
}
console.log('done')
