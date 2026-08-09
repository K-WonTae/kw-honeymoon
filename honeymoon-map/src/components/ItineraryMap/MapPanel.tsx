import { useEffect, useMemo } from 'react'
import { Map, useMap } from '@vis.gl/react-google-maps'
import type { PlaceDetails } from '../../hooks/usePlaceDetails'
import type { PlaceListItem } from './types'
import { PlaceMarker } from './PlaceMarker'

interface Props {
  entries: PlaceListItem[]
  details: Map<string, PlaceDetails>
  selectedId: string | null
  mapId: string
  onSelect: (placeId: string) => void
}

const ITALY = { lat: 43.4, lng: 12.0 }

export function MapPanel({ entries, details, selectedId, mapId, onSelect }: Props) {
  const map = useMap()

  // 좌표가 확보된 항목만 마커 대상 (placeId 중복 시 1개만 — 관광지가 여러 날 반복될 수 있음)
  const located = useMemo(() => {
    const seen = new Set<string>()
    const out: { e: PlaceListItem; loc: { lat: number; lng: number } }[] = []
    for (const e of entries) {
      if (seen.has(e.placeId)) continue
      const loc = details.get(e.placeId)?.location
      if (!loc) continue
      seen.add(e.placeId)
      out.push({ e, loc })
    }
    return out
  }, [entries, details])

  const boundsKey = located.map((x) => `${x.e.placeId}:${x.loc.lat},${x.loc.lng}`).join('|')

  // 좌표 집합이 바뀌면(카테고리 전환·로딩 완료) 전체가 보이도록 fitBounds
  useEffect(() => {
    if (!map || located.length === 0) return
    if (located.length === 1) {
      map.panTo(located[0].loc)
      map.setZoom(15)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    located.forEach((x) => bounds.extend(x.loc))
    map.fitBounds(bounds, 72)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boundsKey])

  // 카드 선택 시 해당 좌표로 이동
  useEffect(() => {
    if (!map || !selectedId) return
    const hit = located.find((x) => x.e.placeId === selectedId)
    if (hit) {
      map.panTo(hit.loc)
      if ((map.getZoom() ?? 0) < 15) map.setZoom(16)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId])

  return (
    <div className="mappanel">
      <Map
        mapId={mapId}
        defaultCenter={ITALY}
        defaultZoom={6}
        gestureHandling="greedy"
        clickableIcons={false}
        reuseMaps
      >
        {located.map((x) => {
          const d = details.get(x.e.placeId)
          return (
            <PlaceMarker
              key={x.e.placeId}
              position={x.loc}
              rating={d?.rating}
              label={d?.name || x.e.fallbackName}
              selected={x.e.placeId === selectedId}
              onClick={() => onSelect(x.e.placeId)}
            />
          )
        })}
      </Map>
      {located.length === 0 && (
        <div className="mappanel-loading">지도 데이터를 불러오는 중…</div>
      )}
    </div>
  )
}
