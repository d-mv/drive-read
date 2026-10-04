# Changelog

## 0.1.0 — 2026-10-04

First build: steps 1–3 of the architecture doc (shell, local reader, library). No Google Drive yet.

- Shell: Vite 8, Vue 3.5, Pinia 4, Vue Router 5, Tailwind 4 semantic tokens (light and dark),
  self-hosted Literata, Space Grotesk and IBM Plex Mono, pre-paint theme script, PWA with an
  "Update available" prompt, file handler for `.epub`.
- Reader: EPUB through foliate-js (vendored submodule) behind the `BookEngine` interface;
  chapter-segmented progress bar, contents panel (J/K/Enter/Esc), text settings (typeface, size,
  line spacing, margins, alignment, theme), keyboard paging, swipe on touch.
- Library: open EPUB files from this device into OPFS, covers, Continue row, filters with counts,
  search, sort, grid and list, remove. Reading position saved to IndexedDB on every page turn.
- Logger API client (batched, fire-and-forget); sends nothing until an ingest key is set.
- The production CSP is served by `vite preview`; an e2e test proves a script inside a book does not run.
