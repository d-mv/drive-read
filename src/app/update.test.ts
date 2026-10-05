import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { activateWaiting, browserKind, noteVersion, VERSION_KEY } from './update'

beforeEach(() => localStorage.clear())

describe('noteVersion', () => {
  it('is a first run when no version was recorded', () => {
    expect(noteVersion('0.6.0')).toEqual({ kind: 'first-run' })
    expect(localStorage.getItem(VERSION_KEY)).toBe('0.6.0')
  })

  it('reports an update once, then nothing', () => {
    localStorage.setItem(VERSION_KEY, '0.5.0')
    expect(noteVersion('0.6.0')).toEqual({ kind: 'updated', from: '0.5.0', to: '0.6.0' })
    expect(noteVersion('0.6.0')).toEqual({ kind: 'same' })
  })

  it('stays quiet when storage is unavailable', () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(noteVersion('0.6.0')).toEqual({ kind: 'same' })
    spy.mockRestore()
  })
})

describe('applyUpdate', () => {
  it('acts once: further taps while updating do nothing, and the toast can say so', async () => {
    const { applyUpdate, updating } = await import('./update')
    const reload = vi.fn<(trigger: string) => void>()
    expect(updating.value).toBe(false)
    applyUpdate(reload)
    applyUpdate(reload)
    applyUpdate(reload)
    expect(updating.value).toBe(true)
    // happy-dom has no service worker: the one tap reloads straight away, once.
    expect(reload.mock.calls).toEqual([['no-service-worker']])
  })
})

describe('activateWaiting', () => {
  function fakes(opts: { waiting: boolean }) {
    const listeners: Record<string, (() => void)[]> = {}
    const waitingListeners: (() => void)[] = []
    const waiting = opts.waiting
      ? {
          state: 'installed' as string,
          postMessage: vi.fn<(m: unknown) => void>(),
          addEventListener: (_: 'statechange', cb: () => void) => waitingListeners.push(cb),
        }
      : null
    const sw = {
      controller: {},
      getRegistration: async () => ({ waiting }),
      addEventListener: (type: string, cb: () => void) => (listeners[type] ??= []).push(cb),
    }
    const reload = vi.fn<(trigger: string) => void>()
    const activate = () => {
      waiting!.state = 'activated'
      for (const cb of waitingListeners) cb()
    }
    const controllerChange = () => (listeners.controllerchange ?? []).forEach((cb) => cb())
    return { sw, waiting, reload, activate, controllerChange }
  }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('tells the waiting worker to take over and reloads once it is active', async () => {
    const f = fakes({ waiting: true })
    await activateWaiting(f.sw, f.reload)
    expect(f.waiting!.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(f.reload).not.toHaveBeenCalled()
    f.activate()
    f.controllerChange()
    expect(f.reload.mock.calls).toEqual([['activated']])
  })

  it('reloads on controllerchange if that comes first', async () => {
    const f = fakes({ waiting: true })
    await activateWaiting(f.sw, f.reload)
    f.controllerChange()
    expect(f.reload.mock.calls).toEqual([['controllerchange']])
  })

  it('reloads at once when no worker is waiting (an earlier tap already activated it)', async () => {
    const f = fakes({ waiting: false })
    await activateWaiting(f.sw, f.reload)
    expect(f.reload.mock.calls).toEqual([['no-waiting']])
  })

  it('reloads anyway after a few seconds if the browser never reports the switch', async () => {
    const f = fakes({ waiting: true })
    await activateWaiting(f.sw, f.reload)
    await vi.advanceTimersByTimeAsync(4000)
    expect(f.reload.mock.calls).toEqual([['timeout']])
  })
})

describe('browserKind', () => {
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      'ios-safari',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/141.0 Mobile/15E148 Safari/604.1',
      'ios-other',
    ],
    [
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36',
      'android-chrome',
    ],
    [
      'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 SamsungBrowser/28.0 Chrome/130 Mobile Safari/537.36',
      'android-other',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36 Chrome/141.0 Safari/537.36',
      'desktop-chrome',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      'desktop-safari',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.0; rv:141.0) Gecko/20100101 Firefox/141.0',
      'desktop-firefox',
    ],
  ])('%s → %s', (ua, kind) => {
    expect(browserKind(ua)).toBe(kind)
  })
})
