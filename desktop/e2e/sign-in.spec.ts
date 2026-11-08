import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test'

import { fakeGoogle } from '../../e2e/fake-google'

const MAIN = resolve('desktop/out/main.mjs')
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ')

/** Google's OAuth endpoints for installed apps: consent approves at once. */
interface OAuthLog {
  auth: URLSearchParams[]
  token: URLSearchParams[]
  revoke: URLSearchParams[]
}

let root: string
let oauth: Server
let base: string
let log: OAuthLog
let app: ElectronApplication | undefined

const body = (req: import('node:http').IncomingMessage) =>
  new Promise<URLSearchParams>((done) => {
    let s = ''
    req.on('data', (c) => (s += c))
    req.on('end', () => done(new URLSearchParams(s)))
  })

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dr-sign-in-'))
  log = { auth: [], token: [], revoke: [] }
  oauth = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname === '/auth') {
      log.auth.push(url.searchParams)
      const back = new URL(url.searchParams.get('redirect_uri')!)
      back.searchParams.set('code', 'the-code')
      back.searchParams.set('state', url.searchParams.get('state')!)
      res.writeHead(302, { Location: back.toString() }).end()
      return
    }
    const form = await body(req)
    if (url.pathname === '/token') {
      log.token.push(form)
      const refresh = form.get('grant_type') === 'authorization_code' ? { refresh_token: 'r1' } : {}
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({ access_token: 'fake-token', expires_in: 3599, scope: SCOPES, ...refresh }),
      )
      return
    }
    if (url.pathname === '/revoke') log.revoke.push(form)
    res.writeHead(200).end()
  })
  await new Promise<void>((done) => oauth.listen(0, '127.0.0.1', done))
  base = `http://127.0.0.1:${(oauth.address() as AddressInfo).port}`
})

test.afterEach(async () => {
  await app?.close()
  app = undefined
  oauth.close()
  await rm(root, { recursive: true, force: true })
})

async function launch(): Promise<Page> {
  app = await electron.launch({
    args: [MAIN],
    env: { ...process.env, DR_USER_DATA: join(root, 'profile'), DR_FAKE_GOOGLE: base },
  })
  const page = await app.firstWindow()
  await fakeGoogle(page)
  return page
}

const signInFile = () => join(root, 'profile', 'drive-sign-in.bin')

test('signs in through the browser and stays signed in after a restart', async () => {
  let page = await launch()
  await page.getByRole('button', { name: 'Connect Google Drive' }).click()
  await expect(page.getByRole('heading', { name: 'Add from Drive' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stocks', exact: true })).toBeVisible()

  const asked = log.auth[0]!
  expect(asked.get('client_id')).toBe('e2e-desktop')
  expect(asked.get('code_challenge_method')).toBe('S256')
  expect(log.token[0]!.get('grant_type')).toBe('authorization_code')
  await access(signInFile())

  await app!.close()
  page = await launch()
  // No tap: the saved sign-in gives a token at start.
  await expect.poll(() => log.token.some((t) => t.get('grant_type') === 'refresh_token')).toBe(true)
  await page.getByRole('button', { name: 'Connect Google Drive' }).click()
  await expect(page.getByRole('button', { name: 'Stocks', exact: true })).toBeVisible()
  // Straight to Drive: the browser was not asked again.
  expect(log.auth).toHaveLength(1)
})

test('Disconnect Drive revokes the saved sign-in and forgets it', async () => {
  const page = await launch()
  await page.getByRole('button', { name: 'Connect Google Drive' }).click()
  await expect(page.getByRole('button', { name: 'Stocks', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Disconnect Drive' }).click()
  await expect(page.getByRole('button', { name: 'Connect Google Drive' })).toBeVisible()
  expect(log.revoke.map((r) => r.get('token'))).toEqual(['r1'])
  await expect(access(signInFile())).rejects.toThrow('ENOENT')
})
