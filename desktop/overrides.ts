/**
 * What a test run may swap in: the web build, the profile (with its file grants) and Google's
 * sign-in endpoints (a local fake, signed in without a browser or the keychain).
 */
export interface DevOverrides {
  dist?: string
  userData?: string
  fakeGoogle?: string
}

/**
 * DR_DIST, DR_USER_DATA and DR_FAKE_GOOGLE, for dev and test runs only. The packaged app ignores them: otherwise
 * whoever launches it could serve other pages as app://drive-read/ (with the files bridge) or
 * hand it a profile with their own grants, or catch its sign-in.
 */
export function devOverrides(
  env: Readonly<Record<string, string | undefined>>,
  isPackaged: boolean,
): DevOverrides {
  if (isPackaged) return {}
  const out: DevOverrides = {}
  if (env.DR_DIST) out.dist = env.DR_DIST
  if (env.DR_USER_DATA) out.userData = env.DR_USER_DATA
  if (env.DR_FAKE_GOOGLE) out.fakeGoogle = env.DR_FAKE_GOOGLE
  return out
}
