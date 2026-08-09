import { FX_STORAGE_KEY } from './money'
import { clearBlobs, getBlob, putBlob } from './attachments'
import type { AttachmentMeta, UserData } from '../hooks/useUserData'

const USERDATA_KEY = 'honeymoon:userdata:v1'
const SPLIT_KEY = 'honeymoon:splitRatio'

interface BackupAttachment {
  id: string
  itemId: string
  name: string
  type: string
  size: number
  dataBase64: string
}

interface BackupFile {
  schema: 'honeymoon-backup'
  version: 1
  exportedAt: string
  localStorage: Record<string, unknown>
  attachments: BackupAttachment[]
}

function readJsonKey(key: string): unknown {
  const raw = localStorage.getItem(key)
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function collectAttachmentMetas(userdata: unknown): { itemId: string; meta: AttachmentMeta }[] {
  const attachments = (userdata as Partial<UserData> | undefined)?.attachments ?? {}
  const out: { itemId: string; meta: AttachmentMeta }[] = []
  Object.entries(attachments).forEach(([itemId, metas]) => {
    ;(metas ?? []).forEach((meta) => out.push({ itemId, meta }))
  })
  return out
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res((r.result as string).split(',')[1])
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })
}

export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type })
}

export async function createBackup(): Promise<BackupFile> {
  const userdata = readJsonKey(USERDATA_KEY)
  const fx = readJsonKey(FX_STORAGE_KEY)
  const splitRatio = readJsonKey(SPLIT_KEY)

  const localStorageData: Record<string, unknown> = {}
  if (userdata !== undefined) localStorageData[USERDATA_KEY] = userdata
  if (fx !== undefined) localStorageData[FX_STORAGE_KEY] = fx
  if (splitRatio !== undefined) localStorageData[SPLIT_KEY] = splitRatio

  const attachments: BackupAttachment[] = []
  for (const { itemId, meta } of collectAttachmentMetas(userdata)) {
    const blob = await getBlob(meta.id)
    if (!blob) continue
    attachments.push({
      id: meta.id,
      itemId,
      name: meta.name,
      type: meta.type,
      size: meta.size,
      dataBase64: await blobToBase64(blob),
    })
  }

  return {
    schema: 'honeymoon-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    localStorage: localStorageData,
    attachments,
  }
}

export function downloadBackupFile(backup: BackupFile) {
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const d = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replaceAll('-', '')
  const a = document.createElement('a')
  a.href = url
  a.download = `honeymoon-backup-${d}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 3000)
}

export async function parseBackupFile(file: File): Promise<BackupFile> {
  const raw = await file.text()
  const parsed = JSON.parse(raw) as BackupFile
  if (parsed?.schema !== 'honeymoon-backup' || parsed?.version !== 1) {
    throw new Error('지원하지 않는 백업 파일입니다.')
  }
  if (!parsed.localStorage || !Array.isArray(parsed.attachments)) {
    throw new Error('백업 파일 형식이 올바르지 않습니다.')
  }
  return parsed
}

export async function restoreBackup(backup: BackupFile): Promise<void> {
  Object.entries(backup.localStorage).forEach(([key, value]) => {
    if (![USERDATA_KEY, FX_STORAGE_KEY, SPLIT_KEY].includes(key)) return
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  })

  await clearBlobs()
  for (const att of backup.attachments) {
    await putBlob(att.id, base64ToBlob(att.dataBase64, att.type || 'application/octet-stream'))
  }
}
