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
  /** MD5 of a kept file (as Drive reports it), or null. Matches a local file to a Drive book. */
  md5(path: string): Promise<string | null>
  /**
   * Books macOS hands over (Finder, Dock, Open Recent) or a second launch passes on, already
   * kept. Registering says the page is ready: books that arrived earlier come now.
   */
  onOpenPaths(cb: (paths: string[]) => void): void
  /** File › Open… (⌘O) in the app menu. */
  onMenuOpen(cb: () => void): void
  /** A newer desktop version published for download, or null (also when offline). */
  checkUpdate(): Promise<{ version: string; url: string } | null>
}

export const BRIDGE_KEY = 'driveReadDesktop'

/** IPC channels between preload and main. */
export const IPC = {
  keep: 'files:keep',
  read: 'files:read',
  md5: 'files:md5',
  /** main → page: kept paths to open. */
  opened: 'files:opened',
  /** page → main: listening for `opened`. */
  ready: 'files:ready',
  /** main → page: File › Open… */
  menuOpen: 'menu:open',
  /** page → main: is a newer version published? */
  update: 'app:update',
} as const

declare global {
  interface Window {
    driveReadDesktop?: DesktopBridge
  }
}
