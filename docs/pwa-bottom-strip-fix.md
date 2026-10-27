# Fix: light strip behind Android gesture bar (dark mode)

> **Status (0.24.5):** done, adapted to this repo. The pre-paint theme already lived in `public/theme-init.js` (an inline script would break the CSP), tokens are `--color-paper` with 4 themes, and no `dark:` variant is needed. Added the `html` background and light `color-scheme` (`src/styles/tokens.css`) and a dark manifest (`vite.config.ts`).

## Symptom
On Android (installed PWA, standalone mode), a light/beige strip sometimes appears at the very bottom of the screen, behind the system gesture handle, while the app is in dark mode. Its colour matches the light-theme surface colour.

## Root cause
Recent Android + Chrome draw installed PWAs edge-to-edge. The area behind the gesture/navigation bar is painted with the **root `<html>` element's background**, not `body` or the Vue app container. The strip shows the light colour when any of these hold:

1. The dark theme is applied to `body` / `#app` instead of `<html>`, so `html` keeps the light background.
2. The theme is applied after first paint (after Vue mounts), so cold starts briefly or permanently paint light. This explains "sometimes".
3. `<meta name="theme-color">` and/or manifest `background_color` are static light values, so Chrome tints the system bars light.
4. Overscroll past the end of the scroll container exposes the `html` background.

## Required changes

### 1. `index.html` — viewport, theme-color, pre-paint theme script
Add inside `<head>`, **before** any stylesheet or app script:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#161514">
<script>
  try {
    const t = localStorage.getItem('theme') ??
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = t;
  } catch {}
</script>
```

Replace `#161514` with the actual dark `--bg` value. Use the same `localStorage` key the existing theme toggle uses.

### 2. Global CSS — background on `html`, safe-area padding
```css
html {
  background: var(--bg);
  color-scheme: light dark;
}
html[data-theme="dark"]  { color-scheme: dark; }
html[data-theme="light"] { color-scheme: light; }

body {
  min-height: 100dvh;
  padding-bottom: env(safe-area-inset-bottom);
}
```

`--bg` must be defined per theme on `:root` / `html[data-theme=...]`, not on `body` or `#app`.

### 3. Tailwind v4 — drive `dark:` from the html attribute
In the main CSS file:

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

Remove any existing `dark` class handling on `body` / `#app`.

### 4. Theme toggle — update root and theme-color together
Wherever the theme is switched:

```js
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  try { localStorage.setItem('theme', theme); } catch {}
}
```

Call `applyTheme` on toggle and once on app start, so the meta tag matches the theme set by the pre-paint script.

### 5. Web app manifest
Set `background_color` and `theme_color` to the dark `--bg` value (or whichever theme is the default) so the splash screen and initial bar tint don't flash light.

## Acceptance criteria
- In dark mode, nothing light is visible behind the gesture bar on cold start, after toggling theme, after resuming from background, or when overscrolling at the bottom of the library list.
- In light mode, the strip matches the light background (no dark strip).
- Toggling theme updates the system bar area immediately, with no reload.
- Bottom content (last list item, buttons) is not hidden behind the gesture bar.
- No flash of the wrong theme on cold start.

## How to verify
Test on an Android device with the PWA installed (not just a browser tab), gesture navigation enabled. Kill the app, relaunch in dark mode, scroll to the bottom and overscroll, toggle theme twice, background and resume.
