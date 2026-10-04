/**
 * Option / Result as plain tagged data plus data-first functions.
 * Values are serializable (structuredClone, postMessage, IndexedDB) and compare with toEqual.
 * Constructors use `const` type parameters so literals (e.g. `{ kind: 'x' }`) don't widen.
 */

export type Some<T> = { readonly _tag: 'Some'; readonly value: T }
export type None = { readonly _tag: 'None' }
export type Option<T> = Some<T> | None

export type Ok<T> = { readonly _tag: 'Ok'; readonly value: T }
export type Err<E> = { readonly _tag: 'Err'; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

// --- constructors -------------------------------------------------------------

export function Some<const T>(value: T): Some<T> {
  return { _tag: 'Some', value }
}

export const None: None = Object.freeze({ _tag: 'None' })

export function option<T>(value: T | null | undefined): Option<T> {
  return value === null || value === undefined ? None : Some(value)
}

export function Ok<const T>(value: T): Ok<T> {
  return { _tag: 'Ok', value }
}

export function Err<const E>(error: E): Err<E> {
  return { _tag: 'Err', error }
}

// --- guards -------------------------------------------------------------------

export function isSome<T>(o: Option<T>): o is Some<T> {
  return o._tag === 'Some'
}

export function isNone<T>(o: Option<T>): o is None {
  return o._tag === 'None'
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r._tag === 'Ok'
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return r._tag === 'Err'
}

// --- combinators (work on both Option and Result) ------------------------------

export function map<T, U>(o: Option<T>, fn: (value: T) => U): Option<U>
export function map<T, E, U>(r: Result<T, E>, fn: (value: T) => U): Result<U, E>
export function map<T, E, U>(
  x: Option<T> | Result<T, E>,
  fn: (value: T) => U,
): Option<U> | Result<U, E> {
  if (x._tag === 'Some') return Some(fn(x.value))
  if (x._tag === 'Ok') return Ok(fn(x.value))
  return x
}

export function andThen<T, U>(o: Option<T>, fn: (value: T) => Option<U>): Option<U>
export function andThen<T, E, U, F>(
  r: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F>
export function andThen<T, E, U, F>(
  x: Option<T> | Result<T, E>,
  fn: (value: T) => Option<U> | Result<U, F>,
): Option<U> | Result<U, E | F> {
  if (x._tag === 'Some' || x._tag === 'Ok') return fn(x.value)
  return x
}

export function mapErr<T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return r._tag === 'Err' ? Err(fn(r.error)) : r
}

export function unwrapOr<T>(o: Option<T>, fallback: T): T
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T
export function unwrapOr<T, E>(x: Option<T> | Result<T, E>, fallback: T): T {
  return x._tag === 'Some' || x._tag === 'Ok' ? x.value : fallback
}

export function unwrapOrElse<T>(o: Option<T>, fn: () => T): T
export function unwrapOrElse<T, E>(r: Result<T, E>, fn: (error: E) => T): T
export function unwrapOrElse<T, E>(x: Option<T> | Result<T, E>, fn: (error: E) => T): T {
  if (x._tag === 'Some' || x._tag === 'Ok') return x.value
  return fn(x._tag === 'Err' ? x.error : (undefined as E))
}

export function toNullable<T>(o: Option<T>): T | null {
  return o._tag === 'Some' ? o.value : null
}

export function match<T, R>(o: Option<T>, arms: { some: (value: T) => R; none: () => R }): R
export function match<T, E, R>(
  r: Result<T, E>,
  arms: { ok: (value: T) => R; err: (error: E) => R },
): R
export function match<T, E, R>(
  x: Option<T> | Result<T, E>,
  arms: { some: (value: T) => R; none: () => R } | { ok: (value: T) => R; err: (error: E) => R },
): R {
  switch (x._tag) {
    case 'Some':
      return (arms as { some: (value: T) => R }).some(x.value)
    case 'None':
      return (arms as { none: () => R }).none()
    case 'Ok':
      return (arms as { ok: (value: T) => R }).ok(x.value)
    case 'Err':
      return (arms as { err: (error: E) => R }).err(x.error)
  }
}

// --- throwing code → Result ----------------------------------------------------

export async function attempt<T, E = Error>(fn: () => T): Promise<Result<Awaited<T>, E>> {
  try {
    return Ok(await fn())
  } catch (error) {
    return Err(error as E)
  }
}

export function attemptSync<T, E = Error>(fn: () => T): Result<T, E> {
  try {
    return Ok(fn())
  } catch (error) {
    return Err(error as E)
  }
}
