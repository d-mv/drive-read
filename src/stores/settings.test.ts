import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '@/domain/settings'

import { THEME_MIRROR_KEY, useSettings } from './settings'
import { setupServices } from './test-services'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('settings', () => {
  it('starts from the defaults', async () => {
    await setupServices()
    const settings = useSettings()
    await settings.load()
    expect(settings.value).toEqual(DEFAULT_SETTINGS)
  })

  it('persists each change and reloads it', async () => {
    await setupServices()
    const settings = useSettings()
    await settings.load()
    await settings.stepSize(1)
    await settings.stepLineHeight(-1)
    await settings.setTypeface('grotesk')
    await settings.setMargins('wide')
    await settings.setAlign('justify')
    await settings.setLibraryView('list')

    setActivePinia(createPinia())
    const fresh = useSettings()
    await fresh.load()
    expect(fresh.value).toMatchObject({
      size: 20,
      lineHeight: 1.6,
      typeface: 'grotesk',
      margins: 'wide',
      align: 'justify',
      libraryView: 'list',
    })
  })

  it('applies the theme to the page and mirrors it for the pre-paint script', async () => {
    await setupServices()
    const settings = useSettings()
    await settings.load()
    await settings.setTheme('dark')
    expect(settings.resolvedTheme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('dark')
  })

  it('trusts the synchronous theme mirror over a stored theme whose write did not land', async () => {
    const { services } = await setupServices()
    await services.db.putSettings({ ...DEFAULT_SETTINGS, theme: 'light' })
    localStorage.setItem(THEME_MIRROR_KEY, 'dark')
    const settings = useSettings()
    await settings.load()
    expect(settings.value.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('ignores a mirror value that is not a theme', async () => {
    await setupServices()
    localStorage.setItem(THEME_MIRROR_KEY, 'neon')
    const settings = useSettings()
    await settings.load()
    expect(settings.value.theme).toBe('system')
  })

  it('toggleTheme flips what is on screen', async () => {
    await setupServices()
    const settings = useSettings()
    await settings.load()
    await settings.setTheme('light')
    await settings.toggleTheme()
    expect(settings.value.theme).toBe('dark')
    await settings.toggleTheme()
    expect(settings.value.theme).toBe('light')

    await settings.setTheme('low-contrast-light')
    expect(document.documentElement.dataset.theme).toBe('low-contrast-light')
    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('low-contrast-light')
    await settings.toggleTheme()
    expect(settings.value.theme).toBe('low-contrast-dark')
    expect(document.documentElement.dataset.theme).toBe('low-contrast-dark')
  })
})
