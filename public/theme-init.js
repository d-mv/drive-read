// Resolves the theme setting before first paint. Mirrors src/domain/settings.ts (resolveTheme)
// and src/stores/settings.ts (THEME_MIRROR_KEY). IndexedDB is async, so it reads a localStorage mirror.
;(function () {
  var setting = 'system'
  try {
    setting = localStorage.getItem('drive-read:theme') || 'system'
  } catch (e) {}
  var dark =
    setting === 'dark' ||
    (setting === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  var theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#171614' : '#F3F0E8')
})()
