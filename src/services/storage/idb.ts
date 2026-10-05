/**
 * The few promise helpers db.ts needs over raw IndexedDB (replaces the `idb` package, which
 * stopped receiving releases in May 2025).
 */

/** Resolves with the request's result, rejects with its error. */
export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.addEventListener('success', () => resolve(req.result))
    req.addEventListener('error', () => reject(req.error))
  })
}

/** Resolves when the transaction commits, rejects with the error that aborted it. */
export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener('complete', () => resolve())
    // A failed request aborts the transaction; by then tx.error holds the cause.
    tx.addEventListener('abort', () =>
      reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError')),
    )
  })
}

/**
 * Opens `name` at `version`, running `upgrade` with the version it had (0 when new). The
 * connection closes itself when another tab opens a newer version, so that upgrade is not
 * blocked; this tab's next reload picks the new version up.
 */
export function openDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase, oldVersion: number) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.addEventListener('upgradeneeded', (e) => upgrade(req.result, e.oldVersion))
    req.addEventListener('error', () => reject(req.error))
    req.addEventListener('success', () => {
      const db = req.result
      db.addEventListener('versionchange', () => db.close())
      resolve(db)
    })
  })
}
