import { useEffect, useState } from 'react'
import type {
  ItemTransport,
  MappablePoint,
  RouteLeg,
  RouteSummary,
  TransportMode,
} from '../types/trip'
import { computeLeg, estimateLeg } from '../lib/routes'
import { toTravelMode } from '../lib/navUrl'

/** 이동수단 토글의 영향을 받지 않는 '고정' 구간(도시간/항공/수상). 데이터의 transport 그대로 사용. */
const FIXED_TRANSPORTS: ItemTransport[] = ['train', 'vaporetto', 'flight']

const EMPTY: RouteSummary = {
  legs: [],
  totalDistanceMeters: null,
  totalDurationSeconds: null,
  hasEstimate: false,
  unavailable: true,
}

/**
 * 정렬된 mappable 지점들 사이의 구간별·전체 거리/시간을 계산한다.
 * - Routes API(키 필요) 우선, 실패/키 없음 시 직선거리 추정으로 폴백
 * - 결과 자체는 routes.ts 내부에서 localStorage 캐싱
 *
 * @param points       markerNumber 순으로 정렬된 지점들 (lat/lng 보유)
 * @param mode         현재 이동수단
 * @param apiKey       VITE_GOOGLE_MAPS_API_KEY (없으면 추정만)
 * @param routesEnabled Routes API 호출 허용 여부 (지도 활성 시 true)
 */
export function useRouteSummary(
  points: MappablePoint[],
  mode: TransportMode,
  apiKey: string | undefined,
  routesEnabled: boolean,
): RouteSummary {
  const [summary, setSummary] = useState<RouteSummary>(EMPTY)

  // points 의 좌표/순서가 바뀔 때만 재계산하도록 시그니처 키 구성
  const signature = points.map((p) => `${p.item.id}@${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')

  useEffect(() => {
    let cancelled = false

    if (points.length < 2) {
      setSummary({ ...EMPTY, unavailable: points.length < 2 })
      return
    }

    async function run() {
      const legs: RouteLeg[] = []
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]
        const b = points[i + 1]
        const hint = b.item.transportFromPrevious
        // 고정 구간(열차·수상버스·항공)은 토글 무시하고 데이터 그대로,
        // 그 외 국지 이동(도보/택시/지하철 등)은 현재 이동수단 토글(mode)을 따른다.
        const effective: ItemTransport =
          hint && FIXED_TRANSPORTS.includes(hint) ? hint : mode

        // 항공 구간은 거리/시간 합산에서 제외 (걸어서/차로 잴 수 없음)
        if (hint === 'flight') {
          legs.push({
            fromId: a.item.id,
            toId: b.item.id,
            mode: 'transit',
            transport: 'flight',
            distanceMeters: null,
            durationSeconds: null,
            estimated: false,
            excluded: true,
          })
          continue
        }

        const travelMode: TransportMode = toTravelMode(effective)
        let res = routesEnabled
          ? await computeLeg(
              { lat: a.lat, lng: a.lng },
              { lat: b.lat, lng: b.lng },
              travelMode,
              apiKey,
            )
          : null
        let estimated = false
        if (!res) {
          res = estimateLeg({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }, effective)
          estimated = true
        }
        legs.push({
          fromId: a.item.id,
          toId: b.item.id,
          mode: travelMode,
          transport: effective,
          distanceMeters: res.distanceMeters,
          durationSeconds: res.durationSeconds,
          estimated: estimated || res.estimated,
          excluded: false,
          polyline: res.polyline,
        })
        if (cancelled) return
      }

      if (cancelled) return

      const counted = legs.filter((l) => !l.excluded)
      const totalDistanceMeters = counted.reduce((s, l) => s + (l.distanceMeters ?? 0), 0)
      const totalDurationSeconds = counted.reduce((s, l) => s + (l.durationSeconds ?? 0), 0)
      setSummary({
        legs,
        totalDistanceMeters,
        totalDurationSeconds,
        hasEstimate: counted.some((l) => l.estimated),
        unavailable: false,
      })
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, mode, apiKey, routesEnabled])

  return summary
}
