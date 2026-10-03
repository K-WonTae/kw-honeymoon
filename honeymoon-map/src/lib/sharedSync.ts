import { useSyncExternalStore } from 'react'
import type { AttachmentMeta, UserData } from '../hooks/useUserData'
import { getCachedBlob, getBlob } from './attachments'
import { emptyUserData, toCells, fromCells, diffCells, type Cells, type SyncOperation } from './syncModel'
import { SyncError, syncRequest, remoteFileUrl, uploadRemoteFile } from './syncTransport'

const DATA_KEY = 'honeymoon:userdata:v1'
const QUEUE_KEY = 'honeymoon:sync:queue:v1'
const MIGRATED_KEY = 'honeymoon:sync:migrated:v1'
interface Pending extends SyncOperation { migration?: boolean }
export type SyncPhase = 'checking' | 'setup' | 'locked' | 'syncing' | 'synced' | 'offline' | 'error'
interface SyncState { phase: SyncPhase; message: string; pending: number; lastSynced: string }
function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function persist(key: string, value: unknown) { localStorage.setItem(key, JSON.stringify(value)) }

let data: UserData = { ...emptyUserData(), ...read<Partial<UserData>>(DATA_KEY, {}) }
const legacy = toCells(data)
let queue = read<Pending[]>(QUEUE_KEY, [])
let state: SyncState = { phase: 'checking', message: '공유 연결 확인 중…', pending: queue.length, lastSynced: '' }
let running: Promise<void> | null = null
let started = false
let authenticated = false
let migrated = read(MIGRATED_KEY, false)
let generation = 0
const listeners = new Set<() => void>()
const prefetched = new Set<string>()
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const notify = () => listeners.forEach((fn) => fn())
function status(phase: SyncPhase, message: string) {
  state = { ...state, phase, message, pending: queue.length }
  notify()
}
function saveQueue(next: Pending[]) {
  persist(QUEUE_KEY, next) // retain original queue if persistence fails
  queue = next
}
function updateFromRemote(cells: Cells) {
  const merged = { ...cells }
  for (const op of queue) {
    for (const [key, value] of Object.entries(op.cells)) {
      if (!op.insertOnly || !Object.prototype.hasOwnProperty.call(merged, key)) merged[key] = value
    }
  }
  const next = fromCells(merged)
  if (JSON.stringify(next) !== JSON.stringify(data)) {
    persist(DATA_KEY, next)
    data = next
    notify()
  }
}
export function setSharedData(value: UserData | ((prev: UserData) => UserData)) {
  const next = typeof value === 'function' ? value(data) : value
  const cells = diffCells(toCells(data), toCells(next))
  if (!Object.keys(cells).length) return
  try {
    saveQueue([...read<Pending[]>(QUEUE_KEY, queue), { id: crypto.randomUUID(), cells }])
    data = next
    persist(DATA_KEY, next)
    status(authenticated && navigator.onLine ? 'syncing' : state.phase, authenticated ? '변경을 공유 중…' : state.message)
    if (authenticated) void synchronize()
  } catch {
    status('error', '이 기기의 저장 공간이 부족합니다. 백업을 내보낸 뒤 저장 공간을 확보해 주세요.')
  }
}

async function ensureFiles(op: Pending, remote: Cells): Promise<Cells> {
  const cells = { ...op.cells }
  for (const [key, value] of Object.entries(cells)) {
    if (JSON.parse(key)[0] !== 'attachments' || value === null) continue
    if (op.insertOnly && Object.prototype.hasOwnProperty.call(remote, key)) continue
    const meta = value as AttachmentMeta
    const blob = await getCachedBlob(meta.id)
    if (blob) await uploadRemoteFile(meta.id, blob)
    else if (!await remoteFileUrl(meta.id)) {
      if (!op.migration) throw new Error(`${meta.name}: 원본 파일을 찾을 수 없습니다. 파일을 다시 첨부해 주세요.`)
      // Metadata left behind by the old app without a local file cannot be migrated.
      delete cells[key]
    }
  }
  return cells
}

async function prefetchFiles() {
  for (const metas of Object.values(data.attachments)) {
    for (const meta of metas) {
      if (!authenticated || !navigator.onLine) return
      if (prefetched.has(meta.id)) continue
      prefetched.add(meta.id)
      try { await getBlob(meta.id) } catch { /* on-demand viewing can retry */ }
    }
  }
}

export function synchronize(): Promise<void> {
  if (running) return running
  const currentGeneration = generation
  running = Promise.resolve().then(async () => {
    try {
      if (!navigator.onLine) { status('offline', '오프라인 · 연결되면 자동 공유합니다.'); return }
      const connection = await syncRequest<{ configured: boolean; authenticated: boolean }>('status')
      if (currentGeneration !== generation) return
      authenticated = connection.authenticated
      if (!connection.configured) { status('setup', '공유 저장소 연결이 필요합니다.'); return }
      if (!authenticated) { status('locked', '공유 암호를 입력하면 모든 기기에서 함께 볼 수 있습니다.'); return }
      if (queue.length || state.phase !== 'synced') status('syncing', '예약 상태와 첨부파일을 공유 중…')
      let remote = (await syncRequest<{ cells: Cells }>('state')).cells
      if (!migrated && !queue.some((op) => op.migration)) {
        const cells = Object.fromEntries(Object.entries(legacy).filter(([key]) => !Object.prototype.hasOwnProperty.call(remote, key)))
        saveQueue([{ id: crypto.randomUUID(), cells, insertOnly: true, migration: true }, ...queue])
      }
      updateFromRemote(remote)
      while (queue.length && currentGeneration === generation && authenticated) {
        const op = queue[0]
        const cells = await ensureFiles(op, remote)
        if (currentGeneration !== generation) return
        remote = (await syncRequest<{ cells: Cells }>('state', { id: op.id, cells, insertOnly: op.insertOnly })).cells
        // Only remove the operation acknowledged by the server; edits made during upload remain queued.
        saveQueue(read<Pending[]>(QUEUE_KEY, queue).filter((pending) => pending.id !== op.id))
        if (op.migration) { persist(MIGRATED_KEY, true); migrated = true }
        updateFromRemote(remote)
      }
      if (currentGeneration !== generation) return
      state = { ...state, lastSynced: new Date().toISOString() }
      status('synced', '공유 완료 · 다른 기기에도 자동 반영됩니다.')
      void prefetchFiles()
    } catch (e) {
      if (currentGeneration !== generation) return
      if (e instanceof SyncError && e.status === 401) {
        authenticated = false
        status('locked', '공유 암호를 다시 입력해 주세요.')
      } else status(navigator.onLine ? 'error' : 'offline', e instanceof Error ? e.message : '공유에 실패했습니다. 자동으로 다시 시도합니다.')
    } finally { running = null }
  })
  return running
}

export async function connectShared(password: string) {
  await syncRequest('session', { password })
  // Finish a status request started before login, so its stale response cannot relock the session.
  if (running) await running
  authenticated = true
  await synchronize()
}
export async function disconnectShared() {
  await syncRequest('session', undefined, 'DELETE')
  generation++
  authenticated = false
  status('locked', '이 기기의 공유 연결을 잠갔습니다.')
}
function start() {
  if (started) return
  started = true
  void synchronize()
  window.addEventListener('online', () => { void synchronize() })
  window.addEventListener('offline', () => status('offline', '오프라인 · 연결되면 자동 공유합니다.'))
  window.addEventListener('focus', () => { void synchronize() })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void synchronize() })
  // Separate browser tabs must never independently write stale local snapshots.
  window.addEventListener('storage', (event) => {
    if (event.key === QUEUE_KEY) queue = read<Pending[]>(QUEUE_KEY, [])
    if (event.key === DATA_KEY) { data = { ...emptyUserData(), ...read<Partial<UserData>>(DATA_KEY, {}) }; notify() }
    if (event.key === MIGRATED_KEY) migrated = read(MIGRATED_KEY, false)
    if (event.key === QUEUE_KEY) void synchronize()
  })
  window.setInterval(() => { if (!document.hidden && authenticated) void synchronize() }, 5_000)
}
export function useSharedData(): [UserData, typeof setSharedData] {
  start()
  return [useSyncExternalStore(subscribe, () => data), setSharedData]
}
export function useSharedSync() {
  start()
  return useSyncExternalStore(subscribe, () => state)
}
