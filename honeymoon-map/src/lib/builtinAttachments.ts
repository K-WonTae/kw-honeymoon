import { useEffect, useState } from 'react'
import manifestRaw from '../data/attachments.json'
import type { AttachmentMeta } from '../hooks/useUserData'
import { getBlob } from './attachments'

// 내장 첨부: 배포에 함께 올라가는 티켓·바우처.
// 브라우저 저장소(IndexedDB)에 기대지 않으므로 기기·브라우저를 바꿔도 그대로 보인다.
//
// 파일은 public/att/*.bin 에 AES-GCM 으로 암호화돼 있고, 목록(파일명·호텔명·일정 연결)도
// 통째로 암호화해 manifest 에 넣는다. 암호를 풀기 전에는 「몇 개가 잠겨 있다」만 알 수 있다.
// 생성: node scripts/pack-attachments.mjs --backup <백업.json> --password <암호>

export interface BuiltinAttachmentMeta extends AttachmentMeta {
  builtin: true
  /** public/ 기준 경로 (예: att/b-01.bin) */
  file: string
  /** 이 파일 전용 AES-GCM IV (base64) */
  iv: string
}

/** 화면에서 다루는 첨부 = 사용자가 올린 것(IndexedDB) 또는 내장된 것(암호화 파일) */
export type AnyAttachmentMeta = AttachmentMeta & {
  builtin?: true
  file?: string
  iv?: string
}

interface IndexEntry {
  id: string
  name: string
  type: string
  size: number
  file: string
  iv: string
}

interface Manifest {
  version: number
  /** 잠긴 상태에서도 보여줄 수 있는 유일한 정보 */
  count: number
  kdf: { salt: string; iterations: number }
  /** 암호 확인용 샘플 암호문. 내장 첨부가 없으면 null */
  check: { iv: string; data: string } | null
  /** itemId → 파일 목록 을 암호화한 것 */
  index: { iv: string; data: string } | null
}

const manifest = manifestRaw as unknown as Manifest
const PW_STORAGE_KEY = 'honeymoon:attachpw:v1'
const CHECK_PLAINTEXT = 'honeymoon-attachments-ok'

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ── 잠금 상태 ────────────────────────────────────────────
let cryptoKey: CryptoKey | null = null
let index: Record<string, IndexEntry[]> | null = null
const blobCache = new Map<string, Blob>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

export function isUnlocked(): boolean {
  return cryptoKey !== null && index !== null
}

/** 내장 첨부 총 개수 (잠겨 있어도 안다) */
export function builtinTotal(): number {
  return manifest.count ?? 0
}

/** 해당 일정의 내장 첨부. 잠겨 있으면 빈 배열. */
export function builtinFor(itemId: string): BuiltinAttachmentMeta[] {
  if (!index) return []
  return (index[itemId] ?? []).map((e) => ({ ...e, builtin: true as const }))
}

/**
 * 내장 첨부 + 이 기기에서 올린 첨부를 한 목록으로 (내장이 앞).
 * 내장에 이미 들어간 파일을 예전에 이 기기에서도 올렸다면 같은 것이 두 번 보이므로,
 * 같은 일정·같은 이름·같은 크기면 내장 쪽만 남긴다.
 */
export function mergeAttachments(itemId: string, userMetas: AttachmentMeta[]): AnyAttachmentMeta[] {
  const builtins = builtinFor(itemId)
  if (builtins.length === 0) return userMetas
  const seen = new Set(builtins.map((b) => `${b.name}\u0000${b.size}`))
  return [...builtins, ...userMetas.filter((m) => !seen.has(`${m.name}\u0000${m.size}`))]
}

async function deriveKey(password: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64ToBytes(manifest.kdf.salt) as BufferSource,
      iterations: manifest.kdf.iterations,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
}

async function decryptPart(
  key: CryptoKey,
  part: { iv: string; data: string },
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(part.iv) as BufferSource },
    key,
    b64ToBytes(part.data) as BufferSource,
  )
}

/** 암호를 검증하고 목록을 풀어 기억한다. 맞으면 true. */
export async function unlock(password: string, remember = true): Promise<boolean> {
  if (!manifest.check || !manifest.index) return false

  let key: CryptoKey
  try {
    key = await deriveKey(password)
  } catch {
    return false
  }

  try {
    const plain = await decryptPart(key, manifest.check)
    if (new TextDecoder().decode(plain) !== CHECK_PLAINTEXT) return false
    const raw = await decryptPart(key, manifest.index)
    index = JSON.parse(new TextDecoder().decode(raw)) as Record<string, IndexEntry[]>
  } catch {
    return false // 암호 불일치 (GCM 인증 실패)
  }

  cryptoKey = key
  if (remember) {
    try {
      localStorage.setItem(PW_STORAGE_KEY, password)
    } catch {
      /* 저장 못 해도 이번 세션은 열린 상태 */
    }
  }
  notify()
  return true
}

/** 기억한 암호를 지우고 다시 잠근다. */
export function lock() {
  cryptoKey = null
  index = null
  blobCache.clear()
  try {
    localStorage.removeItem(PW_STORAGE_KEY)
  } catch {
    /* 무시 */
  }
  notify()
}

/** 앱 시작 시 기억해둔 암호로 자동 해제 (실패하면 조용히 잠긴 채로 둔다).
 *  일정 카드마다 호출돼도 PBKDF2 는 한 번만 돌도록 진행 중인 약속을 공유한다. */
let autoUnlocking: Promise<boolean> | null = null
export function tryAutoUnlock(): Promise<boolean> {
  if (isUnlocked()) return Promise.resolve(true)
  if (autoUnlocking) return autoUnlocking
  let saved: string | null = null
  try {
    saved = localStorage.getItem(PW_STORAGE_KEY)
  } catch {
    return Promise.resolve(false)
  }
  if (!saved) return Promise.resolve(false)
  autoUnlocking = unlock(saved, false).finally(() => {
    autoUnlocking = null
  })
  return autoUnlocking
}

/** 내장 첨부 1개를 내려받아 복호화한다. 잠겨 있으면 null. */
export async function getBuiltinBlob(meta: AnyAttachmentMeta): Promise<Blob | null> {
  if (!meta.file || !meta.iv) return null
  const cached = blobCache.get(meta.id)
  if (cached) return cached
  if (!cryptoKey) return null

  const res = await fetch(`${import.meta.env.BASE_URL}${meta.file}`)
  if (!res.ok) return null
  const cipher = await res.arrayBuffer()
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(meta.iv) as BufferSource },
      cryptoKey,
      cipher,
    )
  } catch {
    return null
  }
  const blob = new Blob([plain], { type: meta.type || 'application/octet-stream' })
  blobCache.set(meta.id, blob)
  return blob
}

/** 출처를 가리지 않고 첨부 바이너리를 가져온다. */
export function loadAttachmentBlob(meta: AnyAttachmentMeta): Promise<Blob | null> {
  return meta.builtin ? getBuiltinBlob(meta) : getBlob(meta.id)
}

/** 잠금 상태를 구독하는 훅 */
export function useAttachmentLock() {
  const [unlocked, setUnlocked] = useState(isUnlocked)

  useEffect(() => {
    const fn = () => setUnlocked(isUnlocked())
    listeners.add(fn)
    void tryAutoUnlock()
    return () => {
      listeners.delete(fn)
    }
  }, [])

  return { unlocked, total: builtinTotal() }
}
