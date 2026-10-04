/// <reference lib="webworker" />
/**
 * OPFS writes through a sync access handle (architecture doc: the form every engine supports).
 * A failed write deletes the partial file.
 */

type Msg =
  | { id: number; op: 'put'; path: string; blob: Blob }
  | { id: number; op: 'remove'; path: string }

async function dirFor(path: string, create: boolean) {
  const parts = path.split('/')
  const name = parts.pop()!
  let dir = await navigator.storage.getDirectory()
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create })
  return { dir, name }
}

async function put(path: string, blob: Blob) {
  const { dir, name } = await dirFor(path, true)
  const handle = await dir.getFileHandle(name, { create: true })
  const access = await handle.createSyncAccessHandle()
  try {
    access.truncate(0)
    const reader = blob.stream().getReader()
    let at = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      at += access.write(value, { at })
    }
    access.flush()
  } catch (e) {
    access.close()
    await dir.removeEntry(name).catch(() => {})
    throw e
  }
  access.close()
}

async function remove(path: string) {
  try {
    const { dir, name } = await dirFor(path, false)
    await dir.removeEntry(name)
  } catch {
    // Already gone.
  }
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data
  try {
    await (msg.op === 'put' ? put(msg.path, msg.blob) : remove(msg.path))
    self.postMessage({ id: msg.id, ok: true })
  } catch (err) {
    const ex = err as DOMException
    self.postMessage({
      id: msg.id,
      ok: false,
      name: ex.name ?? 'Error',
      message: ex.message ?? String(err),
    })
  }
}
