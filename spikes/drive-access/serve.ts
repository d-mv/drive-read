/**
 * Spike server: serves the Drive access spike on http://localhost:5173 with the
 * Content-Security-Policy proposed in the architecture doc, so CSP violations show up
 * while exercising GIS, the Picker and the Drive API.
 *
 * Run from the repo root: bun spikes/drive-access/serve.ts (Bun loads the root .env)
 */

const dir = import.meta.dir

// The architecture doc's CSP minus the Picker hosts (apis.google.com, docs.google.com).
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com",
  'frame-src blob: https://accounts.google.com',
  "img-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline' blob:",
  "font-src 'self' blob: data:",
  "worker-src 'self' blob:",
].join('; ')

const config = { clientId: Bun.env.VITE_GOOGLE_CLIENT_ID ?? '' }
if (!config.clientId) console.warn('Missing in .env: VITE_GOOGLE_CLIENT_ID')

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
