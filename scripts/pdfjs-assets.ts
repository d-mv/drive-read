import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Plugin } from 'vite'

/**
 * Serves pdf.js's data files at /pdfjs/: standard fonts (PDFs that name Helvetica, Times… without
 * embedding them), CMaps (CJK text), ICC profiles, and the WebAssembly image decoders (JPEG 2000,
 * JBIG2, colour). Emitted into the build under fixed names, since pdf.js asks for them by name
 * under one base URL each; served from node_modules in dev. JavaScript fallbacks and the
 * scripting engine (quickjs) are left out: the app allows WebAssembly and runs no PDF scripts.
 */
const ROOT = 'node_modules/pdfjs-dist'
const DIRS: Record<string, (name: string) => boolean> = {
  standard_fonts: (n) => /\.(pfb|ttf)$/.test(n),
  cmaps: (n) => n.endsWith('.bcmap'),
  iccs: (n) => n.endsWith('.icc'),
  wasm: (n) => ['openjpeg.wasm', 'jbig2.wasm', 'qcms_bg.wasm'].includes(n),
}

/** Published path → file on disk. */
export function pdfjsAssetFiles(root = ROOT): Map<string, string> {
  const files = new Map<string, string>()
  for (const [dir, keep] of Object.entries(DIRS))
    for (const name of readdirSync(join(root, dir)).filter(keep))
      files.set(`pdfjs/${dir}/${name}`, join(root, dir, name))
  return files
}

const TYPES: Record<string, string> = { wasm: 'application/wasm' }

export function pdfjsAssets(): Plugin {
  const files = pdfjsAssetFiles()
  return {
    name: 'drive-read:pdfjs-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files.get((req.url ?? '').split('?')[0]!.replace(/^\//, ''))
        if (!file) return next()
        res.setHeader('content-type', TYPES[file.split('.').pop()!] ?? 'application/octet-stream')
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [fileName, file] of files)
        this.emitFile({ type: 'asset', fileName, source: readFileSync(file) })
    },
  }
}
