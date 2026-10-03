import test from 'node:test'
import assert from 'node:assert/strict'
import { BlobPreconditionFailedError } from '@vercel/blob'
import { writeShared, type SharedStorage } from '../server/sharedStore'
import { applyOperation, cellKey, diffCells, emptyUserData, fromCells, toCells, validCells, type SharedDocument } from '../src/lib/syncModel'

const empty = (): SharedDocument => ({ version: 1, cells: {}, applied: {} })
test('two devices creating the store concurrently preserve both bookings', async () => {
  let doc = empty()
  let revision = 0
  let reads = 0
  let release!: () => void
  const barrier = new Promise<void>((r) => { release = r })
  const store: SharedStorage = {
    read: async () => {
      const snapshot = { doc: structuredClone(doc), etag: revision ? String(revision) : undefined }
      if (++reads <= 2) { if (reads === 2) release(); await barrier }
      return snapshot
    },
    write: async (next, etag) => {
      if (etag !== (revision ? String(revision) : undefined)) throw new BlobPreconditionFailedError()
      doc = structuredClone(next); revision++
    },
  }
  const hotel = cellKey('reservations', 'hotel', 'status')
  const dinner = cellKey('reservations', 'dinner', 'status')
  await Promise.all([
    writeShared({ id: 'pc-operation', cells: { [hotel]: 'done' } }, store),
    writeShared({ id: 'phone-operation', cells: { [dinner]: 'done' } }, store),
  ])
  assert.equal(doc.cells[hotel], 'done'); assert.equal(doc.cells[dinner], 'done')
  assert.equal(revision, 2)
})

test('existing-store CAS conflicts re-read and merge independent edits', async () => {
  let doc = empty(); let revision = 1
  let injected = false
  const memo = cellKey('reservations', 'hotel', 'memo')
  const status = cellKey('reservations', 'hotel', 'status')
  const store: SharedStorage = {
    read: async () => ({ doc: structuredClone(doc), etag: String(revision) }),
    write: async (next, etag) => {
      if (!injected) {
        injected = true
        doc = applyOperation(doc, { id: 'phone-memo', cells: { [memo]: 'late check-in' } }); revision++
      }
      if (etag !== String(revision)) throw new BlobPreconditionFailedError()
      doc = next; revision++
    },
  }
  await writeShared({ id: 'pc-booking', cells: { [status]: 'done' } }, store)
  assert.deepEqual(doc.cells, { [memo]: 'late check-in', [status]: 'done' })
})

test('lost-response retries do not undo later changes', () => {
  const key = cellKey('reservations', 'hotel', 'status')
  const original = { id: 'first-operation', cells: { [key]: 'done' } }
  const doc = applyOperation(applyOperation(empty(), original), { id: 'later-operation', cells: { [key]: 'pending' } })
  assert.equal(applyOperation(doc, original).cells[key], 'pending')
})

test('old-device migration preserves current bookings and deleted file tombstones', () => {
  const status = cellKey('reservations', 'hotel', 'status')
  const file = cellKey('attachments', 'D1-01', 'att-old')
  const doc = applyOperation(empty(), { id: 'new', cells: { [status]: 'done', [file]: null } })
  const migrated = applyOperation(doc, { id: 'migration', insertOnly: true, cells: {
    [status]: 'pending', [file]: { id: 'att-old', name: 'old.pdf', size: 10, type: 'application/pdf' },
    [cellKey('memos', 'D1-01')]: 'bring passport',
  } })
  assert.equal(migrated.cells[status], 'done')
  assert.equal(migrated.cells[file], null)
  assert.equal(fromCells(migrated.cells).attachments['D1-01'], undefined)
  assert.equal(fromCells(migrated.cells).memos['D1-01'], 'bring passport')
})

test('checklist entries merge independently and deletion generates a tombstone', () => {
  const data = emptyUserData()
  data.checklists.day = [{ id: 'first', text: 'passport', checked: false }, { id: 'second', text: 'tickets', checked: true }]
  data.reservations.hotel = { confirmationNo: 'ABC', updatedAt: '' }
  const cells = toCells(data)
  assert.deepEqual(fromCells(cells), data)
  assert.equal(fromCells(cells).reservations.hotel.status, undefined)
  data.checklists.day.shift()
  assert.deepEqual(diffCells(cells, toCells(data)), { [cellKey('checklists', 'day', 'first')]: null })
})

test('reject malformed paths, prototype pollution and attachment paths', () => {
  assert.equal(validCells({ [cellKey('completed', '__proto__')]: true }), false)
  assert.equal(validCells({ 'not-json': true }), false)
  assert.equal(validCells({ [cellKey('reservations', 'hotel', 'status')]: 'wrong' }), false)
  assert.equal(validCells({ [cellKey('attachments', 'day', '../state.json')]: { id: '../state.json', name: 'x', size: 1, type: 'image/png' } }), false)
  assert.equal(validCells({ [cellKey('completed', 'day')]: false }), true)
})
