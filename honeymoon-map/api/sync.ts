import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BlobNotFoundError, head, issueSignedToken, presignUrl } from '@vercel/blob'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { authenticated, configured, sameOrigin, sessionCookie, verifyPassword } from '../server/syncAuth.js'
import { readShared, writeShared } from '../server/sharedStore.js'
import { validCells, type SyncOperation } from '../src/lib/syncModel.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const action = String(req.query.action ?? 'status')
  try {
    if (action === 'status' && req.method === 'GET') return res.json({ configured: configured(), authenticated: configured() && authenticated(req) })
    if (!configured()) return res.status(503).json({ error: '공용 저장소 연결이 필요합니다. Vercel에서 Private Blob 저장소를 연결해 주세요.' })
    if (action === 'session' && req.method === 'POST') {
      if (!sameOrigin(req)) return res.status(403).json({ error: '접근이 허용되지 않습니다.' })
      if (!await verifyPassword(req.body?.password)) return res.status(401).json({ error: '암호가 맞지 않습니다.' })
      sessionCookie(res)
      return res.json({ ok: true })
    }
    if (action === 'upload' && req.method === 'POST') {
      const result = await handleUpload({
        body: req.body as HandleUploadBody, request: req,
        onBeforeGenerateToken: async (pathname) => {
          if (!authenticated(req) || !sameOrigin(req)) throw new Error('공유 암호를 입력해 주세요.')
          if (!/^honeymoon\/files\/att-[a-zA-Z0-9-]{1,180}$/.test(pathname)) throw new Error('Invalid path')
          return { addRandomSuffix: false, allowOverwrite: false, maximumSizeInBytes: 25 * 1024 * 1024,
            allowedContentTypes: ['image/*', 'application/pdf', 'application/octet-stream'], validUntil: Date.now() + 15 * 60 * 1000 }
        },
      })
      return res.json(result)
    }
    if (!authenticated(req)) return res.status(401).json({ error: '공유 암호를 입력해 주세요.' })
    if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ error: '접근이 허용되지 않습니다.' })
    if (action === 'session' && req.method === 'DELETE') {
      sessionCookie(res, true)
      return res.json({ ok: true })
    }
    if (action === 'state' && req.method === 'GET') return res.json({ cells: (await readShared()).doc.cells })
    if (action === 'state' && req.method === 'POST') {
      const op = req.body as SyncOperation
      if (!op || !/^[a-zA-Z0-9-]{10,100}$/.test(op.id) || !validCells(op.cells) ||
        (op.insertOnly !== undefined && typeof op.insertOnly !== 'boolean') || JSON.stringify(op).length > 1024 * 1024) {
        return res.status(400).json({ error: '저장할 데이터 형식이 올바르지 않습니다.' })
      }
      return res.json({ cells: (await writeShared(op)).cells })
    }
    if (action === 'file' && req.method === 'GET') {
      const id = String(req.query.id ?? '')
      if (!/^att-[a-zA-Z0-9-]{1,180}$/.test(id)) return res.status(400).json({ error: 'Invalid file' })
      const pathname = 'honeymoon/files/' + id
      try { await head(pathname) } catch (e) {
        if (e instanceof BlobNotFoundError) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' })
        throw e
      }
      const token = await issueSignedToken({ pathname, operations: ['get'], validUntil: Date.now() + 5 * 60 * 1000 })
      const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname, access: 'private' })
      return res.json({ url: presignedUrl })
    }
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' })
  } catch (e) {
    console.error('Shared sync failed:', e instanceof Error ? e.name : 'UnknownError')
    return res.status(503).json({ error: '공유 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
  }
}
