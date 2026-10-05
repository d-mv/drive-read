/**
 * Prints the Caddyfile for the app container. The CSP comes from csp.ts, the single source
 * also used by `vite preview` and the e2e update test.
 * Run: bun scripts/caddyfile.ts > Caddyfile
 */
import { CSP } from '../csp'

console.log(`{
\tadmin off
\tauto_https off
}

:80 {
\troot * /srv
\tencode zstd gzip

\theader {
\t\tContent-Security-Policy "${CSP}"
\t\tX-Content-Type-Options nosniff
\t\tReferrer-Policy strict-origin-when-cross-origin
\t\tPermissions-Policy "camera=(), microphone=(), geolocation=()"
\t}

\t# Hashed build output never changes under the same name. The two rules must not overlap:
\t# Caddy applies an unconditional header after a matched one.
\t@assets path /assets/*
\theader @assets Cache-Control "public, max-age=31536000, immutable"
\t# Everything else (index.html, sw.js, manifest, SPA routes) is revalidated, or updates never arrive.
\t@revalidate not path /assets/*
\theader @revalidate Cache-Control "no-cache"

\ttry_files {path} /index.html
\tfile_server
}`)
