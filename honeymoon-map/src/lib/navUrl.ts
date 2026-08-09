import type { ItemTransport, ScheduleItem, TransportMode } from '../types/trip'

/**
 * Google Maps Directions URL 생성.
 * 지시서 §6 / 개발.md §4.5 형식:
 *   https://www.google.com/maps/dir/?api=1&destination={...}&travelmode={walking|transit|driving}
 * origin 은 비워 현재 위치 기준으로 길찾기가 열리게 한다.
 */

/** 항목별 세부 이동수단 → Google travelmode 로 정규화 */
export function toTravelMode(mode: ItemTransport | TransportMode | undefined): TransportMode {
  switch (mode) {
    case 'walking':
      return 'walking'
    case 'driving':
    case 'taxi':
      return 'driving'
    case 'transit':
    case 'train':
    case 'vaporetto':
    case 'flight':
      return 'transit'
    default:
      return 'transit'
  }
}

/** 목적지 토큰: placeId > lat,lng > placeName(인코딩) 우선순위 */
function destinationToken(item: ScheduleItem): string | null {
  if (typeof item.lat === 'number' && typeof item.lng === 'number') {
    return `${item.lat},${item.lng}`
  }
  if (item.placeName) {
    return encodeURIComponent(item.placeName)
  }
  return null
}

/**
 * 네비 실행 URL.
 * placeId 가 있으면 destination_place_id 파라미터를 함께 붙여 정확도를 높인다.
 * 현재 위치 기준이므로 origin 은 생략한다.
 */
export function buildNavUrl(
  item: ScheduleItem,
  mode: TransportMode,
  resolvedLat?: number | null,
  resolvedLng?: number | null,
): string | null {
  const lat = typeof item.lat === 'number' ? item.lat : resolvedLat
  const lng = typeof item.lng === 'number' ? item.lng : resolvedLng

  let destination: string | null = null
  if (typeof lat === 'number' && typeof lng === 'number') {
    destination = `${lat},${lng}`
  } else {
    destination = destinationToken(item)
  }
  if (!destination) return null

  const params = new URLSearchParams()
  params.set('api', '1')
  params.set('destination', destination)
  if (item.placeId) params.set('destination_place_id', item.placeId)
  params.set('travelmode', mode)

  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** 좌표/PlaceId/이름 조각으로부터 네비 URL (개요 리스트용) */
export function navUrlFromParts(
  parts: { placeId?: string; placeName?: string; lat?: number | null; lng?: number | null },
  mode: TransportMode,
): string | null {
  const item = {
    id: '',
    sequence: 0,
    startTime: '',
    title: parts.placeName ?? '',
    mappable: true,
    ...parts,
  } as ScheduleItem
  return buildNavUrl(item, mode)
}

/** 좌표/PlaceId/이름 조각으로부터 장소 보기 링크 (개요 리스트용) */
export function placeUrlFromParts(parts: {
  placeId?: string
  placeName?: string
  lat?: number | null
  lng?: number | null
}): string | null {
  const item = {
    id: '',
    sequence: 0,
    startTime: '',
    title: parts.placeName ?? '',
    mappable: true,
    ...parts,
  } as ScheduleItem
  return buildPlaceUrl(item)
}

/** 단순 장소 보기 링크 (검색). placeId 우선. */
export function buildPlaceUrl(item: ScheduleItem): string | null {
  if (item.placeId) {
    const q = encodeURIComponent(item.placeName ?? item.title)
    return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${item.placeId}`
  }
  if (typeof item.lat === 'number' && typeof item.lng === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`
  }
  if (item.placeName) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.placeName)}`
  }
  return null
}
