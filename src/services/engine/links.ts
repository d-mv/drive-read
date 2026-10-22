/**
 * The URL a book link may open outside the reader, or null. Only absolute http(s) links leave the
 * book: other schemes (javascript:, data:, file:, mailto:, app protocols) are dropped.
 */
export function externalUrl(href: string): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
}
