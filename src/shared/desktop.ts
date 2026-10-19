/**
 * The desktop bridge: what the Electron preload exposes as `window.driveReadDesktop`.
 * Shared by `desktop/preload.ts` and the renderer; types only, no runtime code.
 *
 * The page never names a path to grant: `keep` takes a File the user chose (picker, drop, Finder)
 * and the preload derives its path, so a page cannot ask main to read an arbitrary file.
 */

export type DesktopReadError = 'missing' | 'denied'

export type DesktopReadResult =
  | { ok: true; bytes: Uint8Array<ArrayBuffer> }
  | { ok: false; reason: DesktopReadError }

export interface DesktopBridge {
  /** Lets main read this file from now on. Its absolute path, or null when it isn't on disk. */
  keep(file: File): Promise<string | null>
  /** The bytes of a kept file, or why not. */
  read(path: string): Promise<DesktopReadResult>
}

export const BRIDGE_KEY = 'driveReadDesktop'

/** IPC channels between preload and main. */
export const IPC = {
  keep: 'files:keep',
  read: 'files:read',
} as const

declare global {
  interface Window {
    driveReadDesktop?: DesktopBridge
  }
}
