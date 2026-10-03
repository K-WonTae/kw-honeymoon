import test from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { applyOperation, cellKey, emptyUserData, toCells, type SharedDocument, type SyncOperation } from '../src/lib/syncModel'

test('deleted pending attachments do not block other edits, including after reload or during a file lookup', async () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } })
  const network = { onLine: true }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: network })
  const attachmentKey = cellKey('attachments', 'day', 'att-deleted-test')
  const memoKey = cellKey('memos', 'day')
  const statusKey = cellKey('reservations', 'hotel', 'status')
  const meta = { id: 'att-deleted-test', name: 'deleted.html', type: 'text/html', size: 10 }
  // Reload with the original binary already deleted, but all four changes still durable.
  const pending: SyncOperation[] = [
    { id: 'add-file', cells: { [attachmentKey]: meta, [memoKey]: 'Keep this memo' } },
    { id: 'booking', cells: { [statusKey]: 'done' } },
    { id: 'delete-file', cells: { [attachmentKey]: null } },
    { id: 'check', cells: { [cellKey('completed', 'day')]: true } },
  ]
  values.set('honeymoon:sync:queue:v1', JSON.stringify(pending))
  values.set('honeymoon:sync:migrated:v1', 'true')
  let doc: SharedDocument = { version: 1, cells: {}, applied: {} }
  let fileLookups = 0
  let loseNextResponse = true
  let blockFile: Promise<void> | undefined
  let fileLookupStarted: (() => void) | undefined
  const published: SyncOperation[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input), 'https://kw-honeymoon.vercel.app')
    const action = url.searchParams.get('action')
    if (action === 'status') return Response.json({ configured: true, authenticated: true })
    if (action === 'file') {
      fileLookups++
      fileLookupStarted?.()
      if (blockFile) await blockFile
      return Response.json({ error: 'missing' }, { status: 404 })
    }
    if (action === 'state' && options?.method === 'POST') {
      const op = JSON.parse(String(options.body)) as SyncOperation
      published.push(op)
      doc = applyOperation(doc, op)
      if (loseNextResponse) { loseNextResponse = false; throw new TypeError('Connection interrupted') }
    }
    if (action === 'state') return Response.json({ cells: doc.cells })
    throw new Error('Unexpected test request: ' + action)
  }
  try {
    const sync = await import('../src/lib/sharedSync')
    await sync.synchronize()
    assert.equal(doc.cells[memoKey], 'Keep this memo')
    assert.equal(JSON.parse(values.get('honeymoon:sync:queue:v1')!).length, 4, 'a lost response retains all unacknowledged changes')
    await sync.synchronize()
    assert.deepEqual(JSON.parse(values.get('honeymoon:sync:queue:v1')!), [])
    assert.equal(fileLookups, 0, 'a deleted file must not require its missing original')
    assert.equal(doc.cells[attachmentKey], null)
    assert.equal(doc.cells[memoKey], 'Keep this memo')
    assert.equal(doc.cells[statusKey], 'done')
    assert.equal(doc.cells[cellKey('completed', 'day')], true)
    assert.ok(published.every((op) => !op.cells[attachmentKey]), 'the obsolete attachment is never published')
    assert.equal(toCells(JSON.parse(values.get('honeymoon:userdata:v1')!))[attachmentKey], undefined)

    // An undeleted missing file still waits safely for its original.
    const nextMeta = { ...meta, id: 'att-delete-during-lookup' }
    const nextKey = cellKey('attachments', 'day', nextMeta.id)
    sync.setSharedData((data) => ({ ...data, attachments: { day: [nextMeta] } }))
    await sync.synchronize()
    assert.equal(JSON.parse(values.get('honeymoon:sync:queue:v1')!).length, 1)
    assert.equal(doc.cells[nextKey], undefined)

    // The user deletes it while the retry is checking the remote original.
    let releaseFile!: () => void
    blockFile = new Promise<void>((resolve) => { releaseFile = resolve })
    const lookupStarted = new Promise<void>((resolve) => { fileLookupStarted = resolve })
    const syncing = sync.synchronize()
    await lookupStarted
    sync.setSharedData((data) => ({ ...data, attachments: {}, memos: { ...data.memos, second: 'Another edit' } }))
    releaseFile()
    await syncing
    assert.deepEqual(JSON.parse(values.get('honeymoon:sync:queue:v1')!), [])
    assert.equal(doc.cells[nextKey], null)
    assert.equal(doc.cells[cellKey('memos', 'second')], 'Another edit')
    assert.equal(doc.cells[memoKey], 'Keep this memo')
    assert.equal(doc.cells[statusKey], 'done')
    assert.deepEqual(JSON.parse(values.get('honeymoon:userdata:v1')!).attachments, emptyUserData().attachments)
  } finally { globalThis.fetch = realFetch }
})
