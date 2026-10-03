import test from 'node:test'
import assert from 'node:assert/strict'
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import { BlobPreconditionFailedError, get, put } from '@vercel/blob'
import { readShared, writeShared } from '../server/sharedStore'
import { cellKey, type SharedDocument } from '../src/lib/syncModel'

test('real Blob SDK preserves strong ETags through reads and repeated updates', async () => {
  const previousDispatcher = getGlobalDispatcher()
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN
  const previousApi = process.env.VERCEL_BLOB_API_URL
  const agent = new MockAgent()
  agent.disableNetConnect()
  setGlobalDispatcher(agent)
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_regression_testonly'
  process.env.VERCEL_BLOB_API_URL = 'https://blob-api.test'
  const path = 'honeymoon/shared-v1.json'
  const reservation = cellKey('reservations', 'hotel', 'status')
  const memo = cellKey('reservations', 'hotel', 'memo')
  let doc: SharedDocument = { version: 1, cells: { [reservation]: 'pending', [memo]: 'keep existing memo' }, applied: {} }
  let revision = 1
  let writes = 0
  const tag = () => `"revision-${revision}"`
  const header = (headers: unknown, name: string) => {
    if (Array.isArray(headers)) {
      for (let i = 0; i < headers.length; i += 2) if (String(headers[i]).toLowerCase() === name) return String(headers[i + 1])
      return undefined
    }
    return Object.entries(headers as Record<string, string>).find(([key]) => key.toLowerCase() === name)?.[1]
  }
  agent.get('https://regression.private.blob.vercel-storage.com')
    .intercept({ path: '/' + path + '?cache=0', method: 'GET' })
    .reply((options) => ({
      statusCode: 200, data: JSON.stringify(doc), responseOptions: { headers: {
        'content-type': 'application/json',
        etag: header(options.headers, 'accept-encoding') === 'identity' ? tag() : 'W/' + tag(),
      } },
    })).persist()
  agent.get('https://blob-api.test')
    .intercept({ path: /\?pathname=honeymoon%2Fshared-v1.json$/, method: 'PUT' })
    .reply((options) => {
      if (header(options.headers, 'x-if-match') !== tag()) {
        return { statusCode: 412, data: { error: { code: 'precondition_failed' } } }
      }
      doc = JSON.parse(String(options.body)) as SharedDocument
      revision++; writes++
      return { statusCode: 200, data: { pathname: path, url: 'https://regression.private.blob.vercel-storage.com/' + path, etag: tag() } }
    }).persist()
  try {
    // Reproduce the production failure at the SDK/HTTP boundary, not with a fake storage class.
    const compressed = await get(path, { access: 'private', useCache: false })
    assert.ok(compressed && compressed.statusCode === 200)
    assert.match(compressed.blob.etag, /^W\//)
    await compressed.stream.cancel()
    await assert.rejects(() => put(path, JSON.stringify(doc), {
      access: 'private', addRandomSuffix: false, ifMatch: compressed.blob.etag,
    }), BlobPreconditionFailedError)
    assert.equal(writes, 0)

    assert.equal((await readShared()).etag, tag())
    await writeShared({ id: 'first-save', cells: { [reservation]: 'done' } })
    await writeShared({ id: 'second-save', cells: { [reservation]: 'pending' } })
    assert.equal(writes, 2)
    assert.equal((await readShared()).doc.cells[reservation], 'pending')
    assert.equal(doc.cells[memo], 'keep existing memo')
  } finally {
    setGlobalDispatcher(previousDispatcher)
    await agent.close()
    if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = previousToken
    if (previousApi === undefined) delete process.env.VERCEL_BLOB_API_URL; else process.env.VERCEL_BLOB_API_URL = previousApi
  }
})
