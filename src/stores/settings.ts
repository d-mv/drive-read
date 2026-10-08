import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import {
  type Align,
  DEFAULT_SETTINGS,
  type Margins,
  nextTheme,
  type ResolvedTheme,
  resolveTheme,
  type Settings,
  stepLineHeight as stepLineHeightOf,
  stepSize as stepSizeOf,
  type ThemeSetting,
  type Typeface,
} from '@/domain/settings'
import { useServices } from '@/services'
import { unwrapOr } from '@/shared/result'

/** Read by public/theme-init.js before first paint. */
export const THEME_MIRROR_KEY = 'drive-read:theme'
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#F3F0E8',
  dark: '#171614',
  'low-contrast-light': '#ECE7DC',
  'low-contrast-dark': '#262422',
} as const
const THEME_SETTINGS: readonly string[] = [
  'system',
  'light',
  'dark',
  'low-contrast-light',
  'low-contrast-dark',
] satisfies ThemeSetting[]

function readThemeMirror(): ThemeSetting | null {
  try {
    const v = localStorage.getItem(THEME_MIRROR_KEY)
    return v && THEME_SETTINGS.includes(v) ? (v as ThemeSetting) : null
  } catch {
    return null
  }
}

/** Theme and text settings. One setter per setting; each persists. */
export const useSettings = defineStore('settings', () => {
  // Read before the theme watch below rewrites the mirror.
  const mirrored = readThemeMirror()
  const value = ref<Settings>({ ...DEFAULT_SETTINGS, theme: mirrored ?? DEFAULT_SETTINGS.theme })
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
  const prefersDark = ref(media?.matches ?? false)
  media?.addEventListener('change', (e) => (prefersDark.value = e.matches))

  const resolvedTheme = computed(() => resolveTheme(value.value.theme, prefersDark.value))

  watch(
    [resolvedTheme, () => value.value.theme],
    ([theme, setting]) => {
      document.documentElement.dataset.theme = theme
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', THEME_COLOR[theme])
      try {
        localStorage.setItem(THEME_MIRROR_KEY, setting)
      } catch {
        // Private mode: the pre-paint script falls back to system.
      }
    },
    { flush: 'sync', immediate: true },
  )

  async function load() {
    const stored = {
      ...DEFAULT_SETTINGS,
      ...unwrapOr(await useServices().db.getSettings(), DEFAULT_SETTINGS),
    }
    // The mirror is written synchronously on every change, so it is never older than IndexedDB,
    // whose last write may not have landed before the page closed.
    value.value = mirrored ? { ...stored, theme: mirrored } : stored
  }

  async function set<K extends keyof Settings>(key: K, v: Settings[K]) {
    value.value = { ...value.value, [key]: v }
    await useServices().db.putSettings({ ...value.value })
  }

  return {
    value,
    resolvedTheme,
    load,
    setTheme: (t: ThemeSetting) => set('theme', t),
    toggleTheme: () => set('theme', nextTheme(value.value.theme, prefersDark.value)),
    setTypeface: (t: Typeface) => set('typeface', t),
    stepSize: (dir: 1 | -1) => set('size', stepSizeOf(value.value.size, dir)),
    stepLineHeight: (dir: 1 | -1) =>
      set('lineHeight', stepLineHeightOf(value.value.lineHeight, dir)),
    setMargins: (m: Margins) => set('margins', m),
    setAlign: (a: Align) => set('align', a),
    setLibraryView: (v: Settings['libraryView']) => set('libraryView', v),
  }
})
