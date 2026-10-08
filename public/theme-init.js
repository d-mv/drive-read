// Resolves the theme setting before first paint. Mirrors src/domain/settings.ts (resolveTheme)
// and src/stores/settings.ts (THEME_MIRROR_KEY). IndexedDB is async, so it reads a localStorage mirror.
;(function () {
  var setting = 'system'
  try {
    setting = localStorage.getItem('drive-read:theme') || 'system'
  } catch (e) {}
  var isDark =
    setting === 'dark' ||
    setting === 'low-contrast-dark' ||
    (setting === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  var theme =
    setting === 'system'
      ? (isDark ? 'dark' : 'light')
      : (setting || 'light')
  document.documentElement.dataset.theme = theme
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    var colors = {
      light: '#F3F0E8',
      dark: '#171614',
      'low-contrast-light': '#ECE7DC',
      'low-contrast-dark': '#262422',
    }
    meta.setAttribute('content', colors[theme] || '#F3F0E8')
  }
})()
