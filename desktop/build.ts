/**
 * Bundles the desktop main process (ESM) and preload (CommonJS: sandboxed preloads cannot be
 * modules) into desktop/out/. The web build is separate: `bun run build` → dist/.
 */
const out = new URL('./out', import.meta.url).pathname
const entry = (name: string) => new URL(`./${name}.ts`, import.meta.url).pathname

const builds = await Promise.all([
  Bun.build({
    entrypoints: [entry('main')],
    outdir: out,
    naming: 'main.mjs',
    target: 'node',
    format: 'esm',
    external: ['electron'],
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
