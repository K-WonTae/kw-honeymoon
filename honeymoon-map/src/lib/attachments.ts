// 첨부파일(티켓·PDF·QR 등)의 바이너리를 IndexedDB에 저장.
// 용량이 큰 파일도 담을 수 있어 localStorage보다 적합하다.
// (메타데이터 = 이름/타입/크기는 useUserData(localStorage)에 따로 보관)

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
export async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
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
