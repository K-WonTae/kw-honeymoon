import { useCallback, useEffect, useState } from 'react'
import type { AttachmentMeta } from '../hooks/useUserData'
import { getBlob } from '../lib/attachments'

// 첨부 「보기」는 새 탭(window.open + blob: URL)에 기대지 않고 앱 안에서 바로 띄운다.
// 팝업 차단·설치형(PWA) 창·모바일 브라우저에서 새 탭 방식은 열리지 않거나 빈 화면이 되기 때문.

interface Viewing {
  meta: AttachmentMeta
  url: string
  /** 보기용으로 새로 만든 object URL 이면 닫을 때 우리가 revoke 한다 (썸네일 URL 은 소유자가 따로 정리) */
  owned: boolean
}

/** 보기 상태 관리. thumbs 에 이미 object URL 이 있으면 재사용하고, 없으면 IndexedDB 에서 꺼내 만든다. */
export function useAttachmentViewer(thumbs: Record<string, string>) {
  const [viewing, setViewing] = useState<Viewing | null>(null)

  const view = useCallback(
    async (meta: AttachmentMeta) => {
      const cached = thumbs[meta.id]
      if (cached) {
        setViewing({ meta, url: cached, owned: false })
        return
      }
      const blob = await getBlob(meta.id)
      if (!blob) {
        alert('파일을 찾을 수 없습니다.')
        return
      }
      setViewing({ meta, url: URL.createObjectURL(blob), owned: true })
    },
    [thumbs],
  )

  const closeViewer = useCallback(() => {
    if (viewing?.owned) URL.revokeObjectURL(viewing.url)
    setViewing(null)
  }, [viewing])

  return { viewing, view, closeViewer }
}

interface ViewerProps {
  meta: AttachmentMeta
  url: string
  onClose: () => void
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 전체 화면 첨부 뷰어: 이미지는 <img>(탭하면 실제 크기 ↔ 맞춤), PDF 는 <iframe>. 그 외는 저장만. */
export function AttachmentViewer({ meta, url, onClose }: ViewerProps) {
  const [zoomed, setZoomed] = useState(false)
  const isImage = meta.type.startsWith('image/')
  const isPdf = meta.type === 'application/pdf'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function download() {
    const a = document.createElement('a')
    a.href = url
    a.download = meta.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="viewer-backdrop" role="dialog" aria-modal="true" aria-label={meta.name}>
      <div className="viewer-head">
        <div className="viewer-title">
          <span className="viewer-name" title={meta.name}>
            {meta.name}
          </span>
          <span className="viewer-size">{fmtSize(meta.size)}</span>
        </div>
        <div className="viewer-actions">
          <a className="attach-btn" href={url} target="_blank" rel="noopener" title="브라우저 새 탭에서 열기">
            새 탭
          </a>
          <button type="button" className="attach-btn" onClick={download} title="다운로드">
            저장
          </button>
          <button type="button" className="attach-btn viewer-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
      </div>

      <div
        className={`viewer-body${zoomed ? ' zoomed' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        {isImage ? (
          <img
            className="viewer-img"
            src={url}
            alt={meta.name}
            title={zoomed ? '탭하면 화면에 맞춤' : '탭하면 실제 크기'}
            onClick={() => setZoomed((z) => !z)}
          />
        ) : isPdf ? (
          <iframe className="viewer-frame" src={url} title={meta.name} />
        ) : (
          <div className="viewer-fallback">
            <strong>이 형식은 미리보기를 지원하지 않습니다.</strong>
            <span>「저장」으로 내려받아 여세요.</span>
          </div>
        )}
      </div>
    </div>
  )
}
