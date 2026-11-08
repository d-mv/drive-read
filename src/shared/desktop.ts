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

/**
 * Google sign-in in main (the desktop OAuth flow). The page only ever sees short-lived access
 * tokens; the refresh token stays in main, encrypted in the keychain.
 * `signed-out`: no saved sign-in, or Google no longer accepts it.
 */
export type DesktopAuthError =
  | 'cancelled'
  | 'denied'
  | 'scopes-missing'
  | 'unavailable'
  | 'signed-out'

export type DesktopAuthReply =
  | { ok: true; accessToken: string; expiresAt: number }
  | { ok: false; reason: DesktopAuthError }

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
  /** Signs in with Google in the system browser and saves the sign-in. */
  connect(): Promise<DesktopAuthReply>
  /** An access token from the saved sign-in, without asking. `renew`: not the cached one. */
  token(renew: boolean): Promise<DesktopAuthReply>
  /** Withdraws the app's access at Google and forgets the saved sign-in. */
  disconnect(): Promise<void>
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
  authConnect: 'auth:connect',
  authToken: 'auth:token',
  authDisconnect: 'auth:disconnect',
} as const

declare global {
  interface Window {
    driveReadDesktop?: DesktopBridge
  }
}
