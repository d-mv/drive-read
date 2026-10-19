/** Bundles the spike's main process into one ESM file Electron can load. */
const result = await Bun.build({
  entrypoints: [new URL('./main.ts', import.meta.url).pathname],
  outdir: new URL('./out', import.meta.url).pathname,
  naming: 'main.mjs',
  target: 'node',
  format: 'esm',
  external: ['electron'],
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
