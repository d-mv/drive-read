/**
 * Library key for a file opened from this device: `local-` + the first 32 hex digits of its
 * SHA-256. The doc says `local-<md5>`; Web Crypto has no MD5 (see implementation-notes.md).
 */
export async function localBookId(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return `local-${hex.slice(0, 32)}`
}
