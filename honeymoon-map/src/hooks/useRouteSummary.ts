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

    function summarize(legs: RouteLeg[]): RouteSummary {
      const counted = legs.filter((l) => !l.excluded)
      return {
        legs,
        totalDistanceMeters: counted.reduce((s, l) => s + (l.distanceMeters ?? 0), 0),
        totalDurationSeconds: counted.reduce((s, l) => s + (l.durationSeconds ?? 0), 0),
        hasEstimate: counted.some((l) => l.estimated),
        unavailable: false,
      }
    }

    /** 구간의 실제 이동수단 — 고정 구간(열차·수상버스·항공)은 토글 무시, 나머지는 현재 토글(mode) */
    function effectiveTransport(b: MappablePoint): ItemTransport {
      const hint = b.item.transportFromPrevious
      return hint && FIXED_TRANSPORTS.includes(hint) ? hint : mode
    }

    function flightLeg(a: MappablePoint, b: MappablePoint): RouteLeg {
      // 항공 구간은 거리/시간 합산에서 제외 (걸어서/차로 잴 수 없음)
      return {
        fromId: a.item.id,
        toId: b.item.id,
        mode: 'transit',
        transport: 'flight',
        distanceMeters: null,
        durationSeconds: null,
        estimated: false,
        excluded: true,
      }
    }

    // Day 를 바꾸면 Routes API 응답을 기다리는 동안 이전 Day 의 합계가 그대로 남아
    // "피렌체 도보 날에 43km" 처럼 보였다 → 먼저 직선거리 추정으로 채워 두고 API 결과로 바꾼다.
    setSummary(
      summarize(
        points.slice(0, -1).map((a, i) => {
          const b = points[i + 1]
          if (b.item.transportFromPrevious === 'flight') return flightLeg(a, b)
          const effective = effectiveTransport(b)
          const est = estimateLeg({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }, effective)
          return {
            fromId: a.item.id,
            toId: b.item.id,
            mode: toTravelMode(effective),
            transport: effective,
            distanceMeters: est.distanceMeters,
            durationSeconds: est.durationSeconds,
            estimated: true,
            excluded: false,
          }
        }),
      ),
    )

    async function run() {
      const legs: RouteLeg[] = []
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]
        const b = points[i + 1]
        const hint = b.item.transportFromPrevious
        const effective = effectiveTransport(b)

        if (hint === 'flight') {
          legs.push(flightLeg(a, b))
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
      setSummary(summarize(legs))
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, mode, apiKey, routesEnabled])

  return summary
}
