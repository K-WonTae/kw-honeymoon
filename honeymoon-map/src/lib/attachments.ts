// 첨부파일은 비공개 공용 저장소에 동기화하고 IndexedDB에 오프라인 캐시한다.
import { remoteFileUrl } from './syncTransport'

const DB_NAME = 'honeymoon'
const STORE = 'attachments'
const VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

/** id 키로 Blob 저장 */
export async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** id 로 Blob 조회 (없으면 null) */
export async function getCachedBlob(id: string): Promise<Blob | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
}

const downloads = new Map<string, Promise<Blob | null>>()
/** 기기 캐시가 없으면 암호로 보호된 공용 저장소에서 내려받는다. */
export async function getBlob(id: string): Promise<Blob | null> {
  let cached: Blob | null = null
  try { cached = await getCachedBlob(id) } catch { /* 온라인 보기 허용 */ }
  if (cached) return cached
  const existing = downloads.get(id)
  if (existing) return existing
  const download = (async () => {
    const url = await remoteFileUrl(id)
    if (!url) return null
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error('첨부를 내려받지 못했습니다. 인터넷 연결을 확인해 주세요.')
    const blob = await response.blob()
    try { await putBlob(id, blob) } catch { /* 캐시 실패가 파일 열기를 막지는 않는다 */ }
    return blob
  })().finally(() => downloads.delete(id))
  downloads.set(id, download)
  return download
}

/** id 의 Blob 삭제 */
export async function deleteBlob(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 저장된 모든 첨부 Blob 조회 */
export async function listBlobs(): Promise<{ id: string; blob: Blob }[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).openCursor()
    const out: { id: string; blob: Blob }[] = []
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) {
        resolve(out)
        return
      }
      out.push({ id: String(cursor.key), blob: cursor.value as Blob })
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

/** 모든 첨부 Blob 삭제 (백업 가져오기 전 덮어쓰기용) */
export async function clearBlobs(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
