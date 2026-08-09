import { AdvancedMarker } from '@vis.gl/react-google-maps'
import type { MappablePoint } from '../../types/trip'
import { markerColor, placeTypeMeta } from '../../lib/tripUtils'

interface Props {
  point: MappablePoint
  selected: boolean
  dimmed: boolean
  onClick: (id: string) => void
}

/** 번호가 들어간 지도 마커 (장소 유형별 색상) */
export function NumberedMarker({ point, selected, dimmed, onClick }: Props) {
  const color = markerColor(point.item.type)
  const meta = placeTypeMeta(point.item.type)
  return (
    <AdvancedMarker
      position={{ lat: point.lat, lng: point.lng }}
      zIndex={selected ? 1000 : point.markerNumber}
      onClick={() => onClick(point.item.id)}
      title={`${point.markerNumber}. ${point.item.title}`}
    >
      <div
        className={`map-pin ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''}`}
        style={{ background: color }}
      >
        <span className="map-pin-num">{point.markerNumber}</span>
        {meta && <span className="map-pin-icon" aria-hidden>{meta.icon}</span>}
      </div>
    </AdvancedMarker>
  )
}
