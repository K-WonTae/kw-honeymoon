import { useEffect, useRef } from 'react'
import type { PlaceDetails } from '../../hooks/usePlaceDetails'
import type { PlaceListItem } from './types'
import { RESERVATION_META } from '../../lib/tripUtils'

interface Props {
  entry: PlaceListItem
  details?: PlaceDetails
  selected: boolean
  onSelect: (placeId: string) => void
  onGoToItem: (day: number, itemId: string) => void
}

export function PlaceCard({ entry, details, selected, onSelect, onGoToItem }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const resMeta = entry.resLevel ? RESERVATION_META[entry.resLevel] : undefined

  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selected])

  const name = details?.name || entry.fallbackName

  return (
    <div
      ref={ref}
      className={`place-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(entry.placeId)}
    >
      <div className="place-thumb">
        {details?.photoUrl ? (
          <img src={details.photoUrl} alt={name} loading="lazy" />
        ) : (
          <div className="place-thumb-ph" aria-hidden>
            {details ? '🍽️' : ''}
          </div>
        )}
      </div>

      <div className="place-info">
        <div className="place-name">{name}</div>

        <div className="place-rating">
          {typeof details?.rating === 'number' ? (
            <>
              <span className="r-star">★</span> {details.rating.toFixed(1)}
              {details.ratingCount ? (
                <span className="r-count">({details.ratingCount.toLocaleString()})</span>
              ) : null}
            </>
          ) : (
            <span className="r-loading">평점 불러오는 중…</span>
          )}
        </div>

        <div className="place-meta">{entry.metaLine}</div>

        <div className="place-badges">
          {resMeta && <span className={`badge ${resMeta.className}`}>{resMeta.label}</span>}
          {entry.note && <span className="place-note">{entry.note}</span>}
        </div>

        <div className="place-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onGoToItem(entry.goToDay, entry.goToItemId)}
          >
            📅 일정에서 보기
          </button>
          {details?.mapsUrl && (
            <a
              className="btn btn-sm"
              href={details.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              🗺️ 구글맵
            </a>
          )}
        </div>

        {details?.photoAttribution && (
          <div
            className="place-attr"
            // Google 제공 출처 표기 HTML (표기 의무)
            dangerouslySetInnerHTML={{ __html: details.photoAttribution }}
          />
        )}
      </div>
    </div>
  )
}
