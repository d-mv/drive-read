import { describe, expect, it } from 'vitest'

import { done, openDatabase, request } from './idb'

let n = 0
const name = () => `idb-test-${++n}`

describe('openDatabase', () => {
  it('runs the upgrade with the old version and resolves with the open database', async () => {
    const seen: number[] = []
    const db = await openDatabase(name(), 1, (d, old) => {
      seen.push(old)
      d.createObjectStore('things')
    })
    expect(seen).toEqual([0])
    expect([...db.objectStoreNames]).toEqual(['things'])
    db.close()
  })

  it('upgrades step by step from an older version, keeping data', async () => {
    const dbName = name()
    const v1 = await openDatabase(dbName, 1, (d) => d.createObjectStore('a'))
    const tx = v1.transaction('a', 'readwrite')
    tx.objectStore('a').put('kept', 'k')
    await done(tx)
    v1.close()

    const seen: number[] = []
    const v2 = await openDatabase(dbName, 2, (d, old) => {
      seen.push(old)
      if (old < 2) d.createObjectStore('b')
    })
    expect(seen).toEqual([1])
    expect(await request(v2.transaction('a').objectStore('a').get('k'))).toBe('kept')
    v2.close()
  })

  it('closes itself when a newer version elsewhere needs the database', async () => {
    const dbName = name()
    await openDatabase(dbName, 1, (d) => d.createObjectStore('a'))
    // Would block forever if the first connection stayed open.
    const v2 = await openDatabase(dbName, 2, (d) => d.createObjectStore('b'))
    expect([...v2.objectStoreNames].sort()).toEqual(['a', 'b'])
    v2.close()
  })
})

describe('request and done', () => {
  it('resolve with the request result and on commit', async () => {
    const db = await openDatabase(name(), 1, (d) => d.createObjectStore('s'))
    const tx = db.transaction('s', 'readwrite')
    const key = await request(tx.objectStore('s').put({ x: 1 }, 'one'))
    await done(tx)
    expect(key).toBe('one')
    expect(await request(db.transaction('s').objectStore('s').getAll())).toEqual([{ x: 1 }])
    db.close()
  })

  it('reject with the error that aborted the transaction', async () => {
    const db = await openDatabase(name(), 1, (d) => d.createObjectStore('s', { keyPath: 'id' }))
    const tx = db.transaction('s', 'readwrite')
    const store = tx.objectStore('s')
    const finished = done(tx)
    store.add({ id: 1 })
    const dup = request(store.add({ id: 1 }))
    await expect(dup).rejects.toMatchObject({ name: 'ConstraintError' })
    await expect(finished).rejects.toMatchObject({ name: 'ConstraintError' })
    expect(await request(db.transaction('s').objectStore('s').count())).toBe(0)
    db.close()
  })
})
