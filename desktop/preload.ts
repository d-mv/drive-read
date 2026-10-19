/**
 * The only bridge between the page and main (`window.driveReadDesktop`). Runs sandboxed, so it
 * is bundled as CommonJS. The page hands over File objects, never paths to grant: the path comes
 * from Electron, and a File the page built itself has none.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'

import { BRIDGE_KEY, type DesktopBridge, IPC } from '../src/shared/desktop'

const bridge: DesktopBridge = {
  async keep(file) {
    if (!(file instanceof File)) return null
    const path = webUtils.getPathForFile(file)
    return path ? ipcRenderer.invoke(IPC.keep, path) : null
  },
  read: (path) => ipcRenderer.invoke(IPC.read, path),
  onOpenPaths(cb) {
    ipcRenderer.on(IPC.opened, (_e, paths: unknown) => {
      if (Array.isArray(paths) && paths.every((p) => typeof p === 'string')) cb(paths)
    })
    ipcRenderer.send(IPC.ready)
  },
  onMenuOpen(cb) {
    ipcRenderer.on(IPC.menuOpen, () => cb())
  },
}

contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge)
