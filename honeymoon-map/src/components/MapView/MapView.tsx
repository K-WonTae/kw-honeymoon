import { useEffect, useMemo, useState } from 'react'
import { AdvancedMarker, Map as GoogleMap, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import type { ItemTransport, MappablePoint, RouteLeg, TransportMode } from '../../types/trip'
import type { LegSelection } from '../Schedule/ScheduleList'
import { NumberedMarker } from './NumberedMarker'
import { MapControls } from './MapControls'

interface Props {
  points: MappablePoint[]
  legs: RouteLeg[]
  selectedItemId: string | null
  selectedLeg: LegSelection | null
  mode: TransportMode
  mapId: string
  onModeChange: (m: TransportMode) => void
  onSelectItem: (id: string) => void
  onShowAll: () => void
}

const ROME = { lat: 41.9028, lng: 12.4964 }

/** 이동수단별 경로 색상 */
function legColor(t: ItemTransport): string {
  switch (t) {
    case 'walking':
      return '#2563eb' // 파랑 — 도보
    case 'transit':
    case 'train':
      return '#7c3aed' // 보라 — 대중교통/열차
    case 'driving':
    case 'taxi':
      return '#ea580c' // 주황 — 차/택시
    case 'vaporetto':
      return '#0891b2' // 청록 — 수상버스
    default:
      return '#2563eb'
  }
}

/**
 * 한 구간의 경로선. Routes API 의 실제 경로(encoded polyline)가 있으면 도로/도보를 따라 그리고,
 * 없으면(키 없음·실패·비행 등) 두 지점을 직선으로 잇는다.
 */
function LegLine({
  encoded,
  fromLat,
  fromLng,
  toLat,
  toLng,
  color,
  weight,
  opacity,
  zIndex,
}: {
  encoded?: string
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  color: string
  weight: number
  opacity: number
  zIndex: number
}) {
  const map = useMap()
  const mapsLib = useMapsLibrary('maps')
  const geometryLib = useMapsLibrary('geometry')

  const path = useMemo(() => {
    if (encoded && geometryLib) {
      try {
        return geometryLib.encoding.decodePath(encoded)
      } catch {
        /* fall through */
      }
    }
    return [
      { lat: fromLat, lng: fromLng },
      { lat: toLat, lng: toLng },
    ]
  }, [encoded, geometryLib, fromLat, fromLng, toLat, toLng])

  useEffect(() => {
    if (!map || !mapsLib) return
    const line = new mapsLib.Polyline({
      path,
      geodesic: !encoded,
      strokeColor: color,
      strokeOpacity: opacity,
      strokeWeight: weight,
      zIndex,
    })
    line.setMap(map)
    return () => line.setMap(null)
  }, [map, mapsLib, path, color, opacity, weight, zIndex, encoded])

  return null
}

export function MapView({
  points,
  legs,
  selectedItemId,
  selectedLeg,
  mode,
  mapId,
  onModeChange,
  onSelectItem,
  onShowAll,
}: Props) {
  const map = useMap()
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)

  const pointsById = useMemo(() => {
    const m = new Map<string, MappablePoint>()
    points.forEach((p) => m.set(p.item.id, p))
    return m
  }, [points])

  const hasSegment = !!selectedLeg

  // 그릴 구간(비행 제외 + 양 끝 좌표 존재)
  const renderLegs = useMemo(
    () =>
      legs
        .filter((l) => !l.excluded && pointsById.has(l.fromId) && pointsById.has(l.toId))
        .map((l) => ({
          leg: l,
          from: pointsById.get(l.fromId)!,
          to: pointsById.get(l.toId)!,
        })),
    [legs, pointsById],
  )

  const segmentEndpoints = useMemo(() => {
    if (!selectedLeg) return null
    const from = pointsById.get(selectedLeg.fromId)
    const to = pointsById.get(selectedLeg.toId)
    if (!from || !to) return null
    return [
      { lat: from.lat, lng: from.lng },
      { lat: to.lat, lng: to.lng },
    ]
  }, [selectedLeg, pointsById])

  function fitAll() {
    if (!map || points.length === 0) return
    if (points.length === 1) {
      map.panTo({ lat: points[0].lat, lng: points[0].lng })
      map.setZoom(14)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }))
    map.fitBounds(bounds, 64)
  }

  const pointsKey = points.map((p) => `${p.lat},${p.lng}`).join('|')
  useEffect(() => {
    fitAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pointsKey])

  useEffect(() => {
    if (!map || !segmentEndpoints) return
    const bounds = new google.maps.LatLngBounds()
    segmentEndpoints.forEach((p) => bounds.extend(p))
    map.fitBounds(bounds, 110)
  }, [map, segmentEndpoints])

  useEffect(() => {
    if (!map || selectedLeg || !selectedItemId) return
    const p = points.find((pt) => pt.item.id === selectedItemId)
    if (p) {
      map.panTo({ lat: p.lat, lng: p.lng })
      if ((map.getZoom() ?? 0) < 14) map.setZoom(15)
    }
  }, [map, selectedItemId, selectedLeg, points])

  function handleLocate() {
    if (!navigator.geolocation) {
      alert('이 브라우저에서는 현재 위치를 사용할 수 없습니다.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserLoc(loc)
        if (map) {
          map.panTo(loc)
          map.setZoom(15)
        }
        setLocating(false)
      },
      () => {
        setLocating(false)
        alert('현재 위치를 가져오지 못했습니다. 위치 권한을 확인하세요.')
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <div className="mapview">
      <GoogleMap
        mapId={mapId}
        defaultCenter={points[0] ? { lat: points[0].lat, lng: points[0].lng } : ROME}
        defaultZoom={13}
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        reuseMaps
      >
        {renderLegs.map(({ leg, from, to }) => {
          const isSel =
            !!selectedLeg && leg.fromId === selectedLeg.fromId && leg.toId === selectedLeg.toId
          const dimmed = hasSegment && !isSel
          return (
            <LegLine
              key={`${leg.fromId}->${leg.toId}`}
              encoded={leg.polyline}
              fromLat={from.lat}
              fromLng={from.lng}
              toLat={to.lat}
              toLng={to.lng}
              color={isSel ? '#1d4ed8' : legColor(leg.transport)}
              weight={isSel ? 7 : 4}
              opacity={dimmed ? 0.25 : isSel ? 1 : 0.85}
              zIndex={isSel ? 10 : 1}
            />
          )
        })}

        {points.map((p) => {
          const isSel =
            p.item.id === selectedItemId ||
            p.item.id === selectedLeg?.fromId ||
            p.item.id === selectedLeg?.toId
          return (
            <NumberedMarker
              key={p.item.id}
              point={p}
              selected={isSel}
              dimmed={hasSegment && !isSel}
              onClick={onSelectItem}
            />
          )
        })}

        {userLoc && (
          <AdvancedMarker position={userLoc} zIndex={2000} title="현재 위치">
            <div className="user-loc-dot" />
          </AdvancedMarker>
        )}
      </GoogleMap>

      <MapControls
        mode={mode}
        onModeChange={onModeChange}
        onShowAll={() => {
          onShowAll()
          fitAll()
        }}
        onLocate={handleLocate}
        onSegmentView={() => {
          if (!map || !segmentEndpoints) return
          const bounds = new google.maps.LatLngBounds()
          segmentEndpoints.forEach((p) => bounds.extend(p))
          map.fitBounds(bounds, 110)
        }}
        segmentActive={hasSegment}
        locating={locating}
      />

      {points.length === 0 && (
        <div className="map-empty-note">
          이 날짜에는 지도에 표시할 좌표가 아직 없습니다. 잠시 후 다시 시도하거나 일정표를 확인하세요.
        </div>
      )}
    </div>
  )
}
