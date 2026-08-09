import { AdvancedMarker } from '@vis.gl/react-google-maps'

interface Props {
  position: { lat: number; lng: number }
  rating?: number
  label: string
  selected: boolean
  onClick: () => void
}

/** 평점 배지(흰 알약 + ★) 형태의 커스텀 마커 */
export function PlaceMarker({ position, rating, label, selected, onClick }: Props) {
  return (
    <AdvancedMarker position={position} onClick={onClick} title={label} zIndex={selected ? 1000 : 1}>
      <div className={`rating-pin ${selected ? 'selected' : ''}`}>
        <span className="rating-star" aria-hidden>
          ★
        </span>
        <span className="rating-val">{typeof rating === 'number' ? rating.toFixed(1) : '–'}</span>
      </div>
    </AdvancedMarker>
  )
}
