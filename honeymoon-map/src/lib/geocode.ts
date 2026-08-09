import type { ScheduleItem } from '../types/trip'

/**
 * 좌표가 없는 mappable 항목을 런타임 지오코딩한다.
 * - placeId 가 있으면 placeId 로 (가장 정확)
 * - 없으면 placeName(주소/정식 명칭) 으로
 * 결과는 localStorage 에 캐싱해 호출 비용/반복 요청을 줄인다 (지시서 §6).
 */

export interface LatLng {
  lat: number
  lng: number
}

const CACHE_KEY = 'honeymoon:geocache:v1'

type GeoCache = Record<string, LatLng>

function loadCache(): GeoCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as GeoCache) : {}
  } catch {
    return {}
  }
}

function saveCache(cache: GeoCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* 용량 초과 등 무시 */
  }
}

/** 항목의 캐시 키 (placeId 우선, 없으면 placeName) */
export function geoCacheKey(item: ScheduleItem): string | null {
  if (item.placeId) return `pid:${item.placeId}`
  if (item.placeName) return `name:${item.placeName}`
  return null
}

/** 한 번 promise 화 한 google.maps.Geocoder.geocode 래퍼 */
function runGeocode(
  geocoder: google.maps.Geocoder,
  request: google.maps.GeocoderRequest,
): Promise<LatLng | null> {
  return new Promise((resolve) => {
    geocoder.geocode(request, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const loc = results[0].geometry.location
        resolve({ lat: loc.lat(), lng: loc.lng() })
      } else {
        resolve(null)
      }
    })
  })
}

/**
 * 단일 항목 지오코딩 (캐시 우선).
 * 실패 시 null → 호출부에서 마커를 건너뛴다.
 */
export async function geocodeItem(
  geocoder: google.maps.Geocoder,
  item: ScheduleItem,
): Promise<LatLng | null> {
  // 데이터에 좌표가 박혀 있으면 그대로
  if (typeof item.lat === 'number' && typeof item.lng === 'number') {
    return { lat: item.lat, lng: item.lng }
  }

  const key = geoCacheKey(item)
  if (!key) return null

  const cache = loadCache()
  if (cache[key]) return cache[key]

  let result: LatLng | null = null
  if (item.placeId) {
    result = await runGeocode(geocoder, { placeId: item.placeId })
  }
  if (!result && item.placeName) {
    result = await runGeocode(geocoder, { address: item.placeName })
  }

  if (result) {
    cache[key] = result
    saveCache(cache)
  }
  return result
}

/**
 * 여러 항목을 순차 지오코딩 (rate-limit 회피). 성공한 것만 Map 으로 반환.
 * key = item.id
 */
export async function geocodeItems(
  geocoder: google.maps.Geocoder,
  items: ScheduleItem[],
): Promise<Map<string, LatLng>> {
  const out = new Map<string, LatLng>()
  for (const item of items) {
    const r = await geocodeItem(geocoder, item)
    if (r) out.set(item.id, r)
  }
  return out
}
