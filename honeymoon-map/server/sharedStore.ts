import { BlobPreconditionFailedError, get, head, put } from '@vercel/blob'
import { applyOperation, type SharedDocument, type SyncOperation } from '../src/lib/syncModel.js'

const PATH = 'honeymoon/shared-v1.json'
export async function sharedStorageDiagnostics(readTag: string | undefined) {
  const metadata = await head(PATH)
  const identity = await get(PATH, { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' } })
  const identityTag = identity?.blob.etag
  await identity?.stream?.cancel()
  return {
    hasReadTag: !!readTag, hasMetadataTag: !!metadata.etag, hasIdentityTag: !!identityTag,
    readTagMatchesMetadata: readTag === metadata.etag,
    identityTagMatchesMetadata: identityTag === metadata.etag,
    weakReadTag: readTag?.startsWith('W/') ?? false,
  }
}
export async function readShared() {
  // Compression rewrites the HTTP ETag to W/"...", which cannot be used for Blob CAS writes.
  const result = await get(PATH, { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' } })
  if (!result) return { doc: { version: 1, cells: {}, applied: {} } as SharedDocument, etag: undefined }
  if (result.statusCode !== 200) throw new Error('Unexpected storage response')
  if (!result.blob.etag || result.blob.etag.startsWith('W/')) throw new Error('Shared storage returned an unusable version tag')
  const doc = await new Response(result.stream).json() as SharedDocument
  if (doc.version !== 1 || !doc.cells || !doc.applied) throw new Error('Invalid shared document')
  return { doc, etag: result.blob.etag }
}

// Compare-and-swap retries merge against the newest state, including during initial creation.
export interface SharedStorage {
  read: () => Promise<{ doc: SharedDocument; etag: string | undefined }>
  write: (doc: SharedDocument, etag: string | undefined) => Promise<void>
}
const blobStorage: SharedStorage = {
  read: readShared,
  write: async (doc, etag) => {
    await put(PATH, JSON.stringify(doc), {
      access: 'private', addRandomSuffix: false, contentType: 'application/json',
      ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
    })
  },
}
export async function writeShared(op: SyncOperation, storage: SharedStorage = blobStorage) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { doc, etag } = await storage.read()
    if (doc.applied[op.id]) return doc
    const next = applyOperation(doc, op)
    try {
      await storage.write(next, etag)
      return next
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue
      // Another writer may have created the file between the first read and put.
      if (!etag && (await storage.read()).etag) continue
      throw error
    }
  }
  throw new Error('Concurrent writes; retry later')
}
