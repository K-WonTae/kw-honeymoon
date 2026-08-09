import type { TransportMode } from '../../types/trip'

interface Props {
  mode: TransportMode
  onModeChange: (m: TransportMode) => void
  onShowAll: () => void
  onLocate: () => void
  onSegmentView: () => void
  segmentActive: boolean
  locating: boolean
}

const MODES: { key: TransportMode; icon: string; label: string }[] = [
  { key: 'walking', icon: '🚶', label: '도보' },
  { key: 'transit', icon: '🚆', label: '대중교통' },
  { key: 'driving', icon: '🚗', label: '자동차' },
]

/** 지도 위 컨트롤: 전체보기 / 현재위치 / 구간보기 / 이동수단 */
export function MapControls({
  mode,
  onModeChange,
  onShowAll,
  onLocate,
  onSegmentView,
  segmentActive,
  locating,
}: Props) {
  return (
    <div className="map-controls">
      <div className="map-controls-group">
        <button className="map-ctrl" onClick={onShowAll} title="전체 경로/마커 보기">
          🧭 전체보기
        </button>
        <button className="map-ctrl" onClick={onLocate} title="현재 위치로 이동" disabled={locating}>
          {locating ? '⏳' : '📍'} 현재위치
        </button>
        <button
          className={`map-ctrl ${segmentActive ? 'active' : ''}`}
          onClick={onSegmentView}
          title="선택한 구간만 보기"
          disabled={!segmentActive}
        >
          ↔️ 구간보기
        </button>
      </div>
      <div className="map-controls-group mode" role="group" aria-label="이동수단">
        {MODES.map((m) => (
          <button
            key={m.key}
            className={`map-ctrl mode ${mode === m.key ? 'active' : ''}`}
            aria-pressed={mode === m.key}
            onClick={() => onModeChange(m.key)}
            title={m.label}
          >
            {m.icon}
          </button>
        ))}
      </div>
    </div>
  )
}
