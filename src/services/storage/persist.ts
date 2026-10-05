import { track } from '@/services/events'

/**
 * Asks the browser to keep this app's storage (books in OPFS) under storage pressure, and reports
 * the answer with current usage (storage.persisted). Called once books are stored.
 */
export async function requestPersistence(): Promise<void> {
  const storage = navigator.storage
  if (!storage?.persist || !storage.estimate) return
  const granted =
    (await storage.persisted?.().catch(() => false)) || (await storage.persist().catch(() => false))
  const { usage = 0, quota = 0 } = await storage.estimate().catch(() => ({ usage: 0, quota: 0 }))
  const mb = (n: number) => Math.round(n / 1048576)
  track('storage.persisted', { granted, usage_mb: mb(usage), quota_mb: mb(quota) })
}
