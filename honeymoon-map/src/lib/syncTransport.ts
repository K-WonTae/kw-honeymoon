import { uploadPresigned } from '@vercel/blob/client'

export class SyncError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function syncRequest<T>(action: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch('/api/sync?action=' + action, {
    method, credentials: 'same-origin', cache: 'no-store',
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new SyncError(result.error || '공유 저장소에 연결하지 못했습니다.', response.status)
  return result as T
}
export async function remoteFileUrl(id: string): Promise<string | null> {
  try { return (await syncRequest<{ url: string }>('file&id=' + encodeURIComponent(id))).url }
  catch (e) { if (e instanceof SyncError && e.status === 404) return null; throw e }
}
export async function uploadRemoteFile(id: string, blob: Blob) {
  // A retry after a lost upload response reuses the already-stored immutable file.
  if (await remoteFileUrl(id)) return
  if (blob.size > 25 * 1024 * 1024) throw new Error('공유 첨부는 파일당 25MB까지 지원합니다.')
  await uploadPresigned('honeymoon/files/' + id, blob, {
    access: 'private', handleUploadUrl: '/api/sync?action=upload',
    contentType: blob.type || 'application/octet-stream',
    multipart: blob.size > 5 * 1024 * 1024,
  })
}
