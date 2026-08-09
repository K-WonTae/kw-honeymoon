import { useEffect, useRef, useState } from 'react'
import type { AttachmentMeta, UserDataApi } from '../../hooks/useUserData'
import { deleteBlob, getBlob, putBlob } from '../../lib/attachments'

interface Props {
  itemId: string
  user: UserDataApi
}

function iconFor(type: string): string {
  if (type.startsWith('image/')) return '🖼️'
  if (type === 'application/pdf') return '📄'
  return '📎'
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 항목별 첨부파일: 업로드(이미지/PDF) → 썸네일·보기·다운로드·삭제. 바이너리는 IndexedDB 영속화. */
export function Attachments({ itemId, user }: Props) {
  const metas = user.getAttachments(itemId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const idKey = metas.map((m) => m.id).join(',')

  // 이미지 첨부의 썸네일용 object URL 생성 (패널 열렸을 때만)
  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    ;(async () => {
      const next: Record<string, string> = {}
      for (const m of metas) {
        if (!m.type.startsWith('image/')) continue
        const blob = await getBlob(m.id)
        if (cancelled) break
        if (blob) {
          const url = URL.createObjectURL(blob)
          created.push(url)
          next[m.id] = url
        }
      }
      if (!cancelled) setThumbs(next)
    })()
    return () => {
      cancelled = true
      created.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey])

  async function onAdd(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    for (const file of Array.from(files)) {
      // 안전장치: 너무 큰 파일 경고 (그래도 진행)
      if (file.size > 25 * 1024 * 1024) {
        alert(`${file.name} 은(는) 25MB를 넘습니다. 저장에 실패할 수 있어요.`)
      }
      const id = `att-${itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      try {
        await putBlob(id, file)
        user.addAttachment(itemId, {
          id,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
        })
      } catch (e) {
        alert('첨부 저장 실패: ' + (e as Error).message)
      }
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function openBlob(m: AttachmentMeta, download: boolean) {
    const cached = thumbs[m.id]
    const blob = cached ? null : await getBlob(m.id)
    const url = cached ?? (blob ? URL.createObjectURL(blob) : null)
    if (!url) {
      alert('파일을 찾을 수 없습니다.')
      return
    }
    if (download) {
      const a = document.createElement('a')
      a.href = url
      a.download = m.name
      document.body.appendChild(a)
      a.click()
      a.remove()
    } else {
      window.open(url, '_blank', 'noopener')
    }
    if (!cached) window.setTimeout(() => URL.revokeObjectURL(url), 8000)
  }

  async function onRemove(m: AttachmentMeta) {
    try {
      await deleteBlob(m.id)
    } catch {
      /* 무시 */
    }
    user.removeAttachment(itemId, m.id)
  }

  return (
    <div className="attach">
      <div className="attach-head">
        <span className="attach-title">📎 첨부파일 · 티켓/PDF/QR</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {busy ? '저장 중…' : '+ 파일 추가'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={(e) => onAdd(e.target.files)}
        />
      </div>

      {metas.length > 0 ? (
        <ul className="attach-list">
          {metas.map((m) => (
            <li key={m.id} className="attach-item">
              {thumbs[m.id] ? (
                <img className="attach-thumb" src={thumbs[m.id]} alt={m.name} />
              ) : (
                <span className="attach-icon" aria-hidden>
                  {iconFor(m.type)}
                </span>
              )}
              <span className="attach-name" title={m.name}>
                {m.name}
              </span>
              <span className="attach-size">{fmtSize(m.size)}</span>
              <button type="button" className="attach-btn" onClick={() => openBlob(m, false)}>
                보기
              </button>
              <button
                type="button"
                className="attach-btn"
                onClick={() => openBlob(m, true)}
                title="다운로드"
              >
                ⬇
              </button>
              <button
                type="button"
                className="attach-btn danger"
                onClick={() => onRemove(m)}
                title="삭제"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="attach-empty">예매 티켓·바우처 QR·PDF를 올려두면 현장에서 바로 열어볼 수 있어요.</p>
      )}
    </div>
  )
}
