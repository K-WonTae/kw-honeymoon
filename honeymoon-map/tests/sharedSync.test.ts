import test from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { applyOperation, cellKey, emptyUserData, toCells, type SharedDocument, type SyncOperation } from '../src/lib/syncModel'

test('client migrates, retries, preserves offline edits and downloads files on another device', async () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } })
  const network = { onLine: true }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: network })
  const original = emptyUserData()
  original.reservations.old = { status: 'done', updatedAt: 'old-device' }
  original.memos.day = 'PC note'
  values.set('honeymoon:userdata:v1', JSON.stringify(original))
  let doc: SharedDocument = { version: 1, cells: {
    [cellKey('reservations', 'old', 'status')]: 'pending',
    [cellKey('reservations', 'phone', 'status')]: 'done',
  }, applied: {} }
  let loseNextResponse = false
  let fileExists = false
  let session = true
  let blockStatus: Promise<void> | undefined
  const pdf = new Blob(['test ticket contents'], { type: 'application/pdf' })
  const realFetch = globalThis.fetch
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input), 'https://kw-honeymoon.vercel.app')
    if (url.hostname === 'files.example') return new Response(pdf)
    const action = url.searchParams.get('action')
    if (action === 'session') { session = true; return Response.json({ ok: true }) }
    if (action === 'status') {
      const current = session
      if (blockStatus) { const blocked = blockStatus; blockStatus = undefined; await blocked }
      return Response.json({ configured: true, authenticated: current })
    }
    if (action === 'file') return fileExists ? Response.json({ url: 'https://files.example/ticket' }) : Response.json({ error: 'missing' }, { status: 404 })
    if (action === 'state' && options?.method === 'POST') {
      const op = JSON.parse(String(options.body)) as SyncOperation
      doc = applyOperation(doc, op)
      if (loseNextResponse) { loseNextResponse = false; throw new TypeError('Connection interrupted') }
    }
    if (action === 'state') return Response.json({ cells: doc.cells })
    throw new Error('Unexpected test request: ' + action)
  }
  try {
    const sync = await import('../src/lib/sharedSync')
    await sync.synchronize()
    assert.equal(doc.cells[cellKey('reservations', 'old', 'status')], 'pending')
    assert.equal(doc.cells[cellKey('memos', 'day')], 'PC note')
    assert.equal(values.get('honeymoon:sync:migrated:v1'), 'true')

    network.onLine = false
    sync.setSharedData((data) => ({ ...data, completed: { ...data.completed, day: true } }))
    await sync.synchronize()
    assert.equal(doc.cells[cellKey('completed', 'day')], undefined)
    assert.equal(JSON.parse(values.get('honeymoon:sync:queue:v1')!).length, 1)
    doc = applyOperation(doc, { id: 'phone-edit', cells: { [cellKey('reservations', 'phone', 'memo')]: 'Phone note' } })
    network.onLine = true
    await sync.synchronize()
    assert.equal(doc.cells[cellKey('completed', 'day')], true)
    assert.equal(doc.cells[cellKey('reservations', 'phone', 'memo')], 'Phone note')

    // Original succeeded on the server, but the client did not receive its response.
    loseNextResponse = true
    sync.setSharedData((data) => ({ ...data, memos: { ...data.memos, day: 'first edit' } }))
    await sync.synchronize()
    assert.equal(JSON.parse(values.get('honeymoon:sync:queue:v1')!).length, 1)
    doc = applyOperation(doc, { id: 'later-phone-edit', cells: { [cellKey('memos', 'day')]: 'newer phone edit' } })
    await sync.synchronize()
    assert.equal(doc.cells[cellKey('memos', 'day')], 'newer phone edit')
    assert.deepEqual(JSON.parse(values.get('honeymoon:sync:queue:v1')!), [])

    // A stale metadata record with no binary is retained as pending, never published as a broken file.
    const meta = { id: 'att-ticket-test', name: 'ticket.pdf', type: 'application/pdf', size: pdf.size }
    sync.setSharedData((data) => ({ ...data, attachments: { ...data.attachments, day: [meta] } }))
    await sync.synchronize()
    assert.equal(doc.cells[cellKey('attachments', 'day', meta.id)], undefined)
    assert.equal(JSON.parse(values.get('honeymoon:sync:queue:v1')!).length, 1)
    fileExists = true
    await sync.synchronize()
    assert.deepEqual(doc.cells[cellKey('attachments', 'day', meta.id)], meta)
    const { getBlob } = await import('../src/lib/attachments')
    assert.equal(await (await getBlob(meta.id))!.text(), await pdf.text())
    assert.equal(toCells(JSON.parse(values.get('honeymoon:userdata:v1')!))[cellKey('memos', 'day')], 'newer phone edit')

    // A pre-login response arrives after login: connecting still starts a fresh sync.
    session = false
    let releaseStatus!: () => void
    blockStatus = new Promise<void>((resolve) => { releaseStatus = resolve })
    const checking = sync.synchronize()
    await new Promise<void>((resolve) => setImmediate(resolve))
    const connecting = sync.connectShared('test-password')
    await new Promise<void>((resolve) => setImmediate(resolve))
    releaseStatus()
    await Promise.all([checking, connecting])
    const appliedBefore = Object.keys(doc.applied).length
    sync.setSharedData((data) => ({ ...data, completed: { ...data.completed, newday: true } }))
    await sync.synchronize()
    assert.equal(Object.keys(doc.applied).length, appliedBefore + 1)
    assert.equal(doc.cells[cellKey('completed', 'newday')], true)
  } finally { globalThis.fetch = realFetch }
})
