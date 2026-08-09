import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

type MobileTab = 'schedule' | 'map'

interface Props {
  left: ReactNode
  right: ReactNode
  /** 모바일 탭 상태(상위에서 제어) */
  mobileTab: MobileTab
  onMobileTabChange: (t: MobileTab) => void
}

const MIN_PX = 320 // 좌/우 최소 너비
const STORAGE_KEY = 'honeymoon:splitRatio'

/**
 * 좌우 분할 + 가운데 드래그 핸들 + 모바일 탭 전환.
 * 데스크톱: 좌 35% / 우 65% 기본, 드래그로 조절, 최소 너비 제한.
 * 모바일(<=900px): 상단 일정/지도 탭으로 전환.
 */
export function SplitLayout({ left, right, mobileTab, onMobileTabChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState<number>(() => {
    const raw = Number(localStorage.getItem(STORAGE_KEY))
    return raw >= 0.15 && raw <= 0.85 ? raw : 0.35
  })
  const [dragging, setDragging] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(ratio))
  }, [ratio])

  const onPointerMove = useCallback((e: PointerEvent) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const total = rect.width
    const min = MIN_PX / total
    const max = 1 - MIN_PX / total
    const next = Math.min(max, Math.max(min, x / total))
    setRatio(next)
  }, [])

  const stopDrag = useCallback(() => setDragging(false), [])

  useEffect(() => {
    if (!dragging) return
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopDrag)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopDrag)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [dragging, onPointerMove, stopDrag])

  if (isMobile) {
    return (
      <div className="split mobile">
        <div className="mobile-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mobileTab === 'schedule'}
            className={mobileTab === 'schedule' ? 'active' : ''}
            onClick={() => onMobileTabChange('schedule')}
          >
            🗒️ 일정
          </button>
          <button
            role="tab"
            aria-selected={mobileTab === 'map'}
            className={mobileTab === 'map' ? 'active' : ''}
            onClick={() => onMobileTabChange('map')}
          >
            🗺️ 지도
          </button>
        </div>
        <div className="mobile-panel">{mobileTab === 'schedule' ? left : right}</div>
      </div>
    )
  }

  return (
    <div className="split desktop" ref={containerRef}>
      <div className="pane left" style={{ width: `${ratio * 100}%` }}>
        {left}
      </div>
      <div
        className={`split-handle ${dragging ? 'dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        onPointerDown={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        title="드래그하여 패널 크기 조절"
      >
        <span className="grip" />
      </div>
      <div className="pane right" style={{ width: `${(1 - ratio) * 100}%` }}>
        {right}
      </div>
    </div>
  )
}

export type { MobileTab }
