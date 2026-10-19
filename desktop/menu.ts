import { Menu, type MenuItemConstructorOptions } from 'electron'

/** The macOS menu bar: the standard menus plus File › Open… and Open Recent. */
export function setAppMenu(onOpen: () => void) {
  const file: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: onOpen },
      {
        label: 'Open Recent',
        role: 'recentDocuments',
        submenu: [{ label: 'Clear Menu', role: 'clearRecentDocuments' }],
      },
      { type: 'separator' },
      { role: 'close' },
    ],
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      file,
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  )
}
