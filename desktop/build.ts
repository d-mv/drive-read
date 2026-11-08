/**
 * Bundles the desktop main process (ESM) and preload (CommonJS: sandboxed preloads cannot be
 * modules) into desktop/out/. The web build is separate: `bun run build` → dist/.
 */
const out = new URL('./out', import.meta.url).pathname
const entry = (name: string) => new URL(`./${name}.ts`, import.meta.url).pathname

/**
 * The desktop OAuth client (DESKTOP.md, phase 3) is baked into main only, never into the page.
 * Google treats an installed app's client secret as not confidential; the app is never shipped.
 */
const baked = (name: string) => JSON.stringify(process.env[name] ?? '')

const builds = await Promise.all([
  Bun.build({
    entrypoints: [entry('main')],
    outdir: out,
    naming: 'main.mjs',
    target: 'node',
    format: 'esm',
    external: ['electron'],
    define: {
      'process.env.DESKTOP_GOOGLE_CLIENT_ID': baked('DESKTOP_GOOGLE_CLIENT_ID'),
      'process.env.DESKTOP_GOOGLE_CLIENT_SECRET': baked('DESKTOP_GOOGLE_CLIENT_SECRET'),
    },
  }),
  Bun.build({
    entrypoints: [entry('preload')],
    outdir: out,
    naming: 'preload.cjs',
    target: 'node',
    format: 'cjs',
    external: ['electron'],
  }),
])

const failed = builds.flatMap((b) => (b.success ? [] : b.logs))
if (failed.length > 0) {
  for (const log of failed) console.error(log)
  process.exit(1)
}
