/**
 * Spike server: serves the Drive access spike on http://localhost:5173 with the
 * Content-Security-Policy proposed in the architecture doc, so CSP violations show up
 * while exercising GIS, the Picker and the Drive API.
 *
 * Run: bun spikes/drive-access/serve.ts (reads spikes/drive-access/.env)
 */

const dir = import.meta.dir

// Verbatim from the architecture doc, Deployment > Caddy.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://apis.google.com",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com",
  'frame-src blob: https://accounts.google.com https://docs.google.com',
  "img-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline' blob:",
  "font-src 'self' blob: data:",
  "worker-src 'self' blob:",
].join('; ')

const config = {
  clientId: Bun.env.VITE_GOOGLE_CLIENT_ID ?? '',
  apiKey: Bun.env.VITE_GOOGLE_API_KEY ?? '',
  appId: Bun.env.VITE_GOOGLE_APP_ID ?? '',
}

const missing = ['VITE_GOOGLE_CLIENT_ID', 'VITE_GOOGLE_API_KEY', 'VITE_GOOGLE_APP_ID'].filter(
  (k) => !Bun.env[k],
)
if (missing.length > 0) console.warn(`Missing in .env: ${missing.join(', ')}`)

const built = await Bun.build({ entrypoints: [`${dir}/spike.ts`], target: 'browser' })
if (!built.success) throw new AggregateError(built.logs, 'spike.ts build failed')
const spikeJs = await built.outputs[0]!.text()

const headers = (type: string) => ({
  'content-type': type,
  'content-security-policy': CSP,
  'cache-control': 'no-store',
})

// OAuth authorized origin is http://localhost:5173; other ports only for smoke tests.
const port = Number(Bun.env.PORT ?? 5173)
if (port !== 5173) console.warn(`Port ${port}: Google sign-in will reject this origin`)

const server = Bun.serve({
  port,
  hostname: 'localhost',
  routes: {
    '/': () => new Response(Bun.file(`${dir}/index.html`), { headers: headers('text/html') }),
    '/spike.js': () => new Response(spikeJs, { headers: headers('text/javascript') }),
    '/config.json': () => Response.json(config, { headers: headers('application/json') }),
    '/manifest.webmanifest': () =>
      new Response(Bun.file(`${dir}/manifest.webmanifest`), {
        headers: headers('application/manifest+json'),
      }),
    '/icon.svg': () => new Response(Bun.file(`${dir}/icon.svg`), { headers: headers('image/svg+xml') }),
  },
  fetch: () => new Response('Not found', { status: 404 }),
})

console.log(`Drive access spike on ${server.url}`)
