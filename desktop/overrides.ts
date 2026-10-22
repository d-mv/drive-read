/** Folders a test run may swap in: the web build and the profile (with its file grants). */
export interface DevOverrides {
  dist?: string
  userData?: string
}

/**
 * DR_DIST and DR_USER_DATA, for dev and test runs only. The packaged app ignores them: otherwise
 * whoever launches it could serve other pages as app://drive-read/ (with the files bridge) or
 * hand it a profile with their own grants.
 */
export function devOverrides(
  env: Readonly<Record<string, string | undefined>>,
  isPackaged: boolean,
): DevOverrides {
  if (isPackaged) return {}
  const out: DevOverrides = {}
  if (env.DR_DIST) out.dist = env.DR_DIST
  if (env.DR_USER_DATA) out.userData = env.DR_USER_DATA
  return out
}
