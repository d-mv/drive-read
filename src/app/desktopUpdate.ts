import { ref } from 'vue'

import type { DesktopBridge } from '@/shared/desktop'

/** A newer desktop version to download (docs/DESKTOP.md: no self-update without notarising). */
export const desktopUpdate = ref<{ version: string; url: string } | null>(null)

/** Asks once at start; a failed check offers nothing. */
export async function checkDesktopUpdate(bridge: DesktopBridge) {
  desktopUpdate.value = await bridge.checkUpdate().catch(() => null)
}
