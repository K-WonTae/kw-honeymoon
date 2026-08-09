import { useEffect, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'

/**
 * place_id → Places Details 런타임 페치.
 * Google ToS: 평점/사진/영업시간은 영구 저장 금지 → 세션 메모리 캐시만 사용한다.
 * (placeId 자체는 정적 저장 OK → trip.json 에 보관)
 */
export interface PlaceDetails {
  placeId: string
  name: string
  rating?: number
  ratingCount?: number
  types: string[]
  location?: { lat: number; lng: number }
  photoUrl?: string
  photoAttribution?: string // Google 제공 HTML (출처 표기 의무)
  weekdayHours?: string[]
  mapsUrl?: string
}

// 세션 메모리 캐시 (localStorage 등 영구 저장 X)
const memoryCache = new Map<string, PlaceDetails>()

const FIELDS = [
  'place_id',
  'name',
  'rating',
  'user_ratings_total',
  'types',
  'geometry',
  'photos',
  'opening_hours',
  'url',
]

export function usePlaceDetails(placeIds: string[]): {
  details: Map<string, PlaceDetails>
  loading: boolean
} {
  const placesLib = useMapsLibrary('places')
  const [, setVersion] = useState(0)
  const [loading, setLoading] = useState(false)
  const key = placeIds.join(',')

  useEffect(() => {
    if (!placesLib || placeIds.length === 0) return
    const missing = placeIds.filter((id) => !memoryCache.has(id))
    if (missing.length === 0) return

    let cancelled = false
    setLoading(true)
    const svc = new placesLib.PlacesService(document.createElement('div'))

    const fetchOne = (id: string) =>
      new Promise<void>((resolve) => {
        svc.getDetails({ placeId: id, fields: FIELDS }, (r, status) => {
          if (status === placesLib.PlacesServiceStatus.OK && r) {
            let photoUrl: string | undefined
            let photoAttribution: string | undefined
            const photo = r.photos?.[0]
            if (photo) {
              try {
                photoUrl = photo.getUrl({ maxWidth: 256, maxHeight: 256 })
              } catch {
                /* 무시 */
              }
              photoAttribution = photo.html_attributions?.[0]
            }
            memoryCache.set(id, {
              placeId: id,
              name: r.name ?? '',
              rating: r.rating ?? undefined,
              ratingCount: r.user_ratings_total ?? undefined,
              types: r.types ?? [],
              location: r.geometry?.location
                ? { lat: r.geometry.location.lat(), lng: r.geometry.location.lng() }
                : undefined,
              photoUrl,
              photoAttribution,
              weekdayHours: r.opening_hours?.weekday_text ?? undefined,
              mapsUrl: r.url ?? undefined,
            })
          } else {
            // 실패 시에도 최소 항목을 넣어 무한 재요청 방지
            memoryCache.set(id, { placeId: id, name: '', types: [] })
          }
          resolve()
        })
      })

    ;(async () => {
      for (const id of missing) {
        if (cancelled) break
        await fetchOne(id)
        if (!cancelled) setVersion((v) => v + 1) // 카드가 점진적으로 채워지도록
        await new Promise((r) => setTimeout(r, 60))
      }
      if (!cancelled) setLoading(false)
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib, key])

  const details = new Map<string, PlaceDetails>()
  placeIds.forEach((id) => {
    const d = memoryCache.get(id)
    if (d) details.set(id, d)
  })
  return { details, loading }
}
