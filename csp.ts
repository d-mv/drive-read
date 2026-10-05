/**
 * The production Content-Security-Policy (architecture doc, Deployment), plus the Logger origin.
 * script-src allows neither blob: nor 'unsafe-inline', so scripts inside a book cannot run.
 * Served by `vite preview` so the built app is tested under it; Caddy serves the same header.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com https://logger-api.mlnkv.net",
  'frame-src blob: https://accounts.google.com',
  "img-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline' blob:",
  "font-src 'self' blob: data:",
  "worker-src 'self' blob:",
].join('; ')
