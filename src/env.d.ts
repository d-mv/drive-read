interface ImportMetaEnv {
  readonly VITE_LOGGER_API_BASE_URL?: string
  readonly VITE_LOGGER_INGEST_KEY?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** package.json version, injected by vite.config.ts. */
declare const __APP_VERSION__: string
