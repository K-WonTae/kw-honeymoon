import type {
  DayPlan,
  ItemTransport,
  MappablePoint,
  Meal,
  PlaceType,
  Reservation,
  ReservationLevel,
  ScheduleItem,
  Trip,
} from '../types/trip'
import type { LatLng } from './geocode'

/** 그 날의 mappable 항목만 (일정 순서 유지) */
export function mappableItems(day: DayPlan): ScheduleItem[] {
  return day.items.filter((i) => i.mappable)
}

/**
 * mappable 항목 + 해결된 좌표 → 지도용 포인트.
 * 마커 번호는 "그 날 좌표가 확보된 mappable 항목들의 순서"로 1부터 다시 매긴다 (지시서 §4).
 * 좌표가 없는 항목(지오코딩 실패 등)은 건너뛴다.
 */
export function buildMappablePoints(day: DayPlan, coords: Map<string, LatLng>): MappablePoint[] {
  const out: MappablePoint[] = []
  let n = 0
  for (const item of day.items) {
    if (!item.mappable) continue
    let lat: number | null = typeof item.lat === 'number' ? item.lat : null
    let lng: number | null = typeof item.lng === 'number' ? item.lng : null
    if (lat == null || lng == null) {
      const c = coords.get(item.id)
      if (c) {
        lat = c.lat
        lng = c.lng
      }
    }
    if (lat == null || lng == null) continue
    n += 1
    out.push({ item, markerNumber: n, lat, lng })
  }
  return out
}

export const PLACE_TYPE_META: Record<PlaceType, { label: string; icon: string }> = {
  airport: { label: '공항', icon: '✈️' },
  station: { label: '기차역', icon: '🚉' },
  hotel: { label: '호텔', icon: '🏨' },
  restaurant: { label: '식당', icon: '🍽️' },
  cafe: { label: '카페/디저트', icon: '☕' },
  sightseeing: { label: '관광지', icon: '📸' },
  tour_meeting: { label: '투어 미팅', icon: '🧭' },
  shopping: { label: '쇼핑/시장', icon: '🛍️' },
}

export function placeTypeMeta(type?: PlaceType) {
  return type ? PLACE_TYPE_META[type] : undefined
}

export const RESERVATION_META: Record<
  ReservationLevel,
  { label: string; className: string }
> = {
  required: { label: '예약 필수', className: 'res-required' },
  recommended: { label: '예약 권장', className: 'res-recommended' },
  'walk-in': { label: '워크인', className: 'res-walkin' },
}

export const TRANSPORT_LABEL: Record<ItemTransport, string> = {
  walking: '도보',
  transit: '대중교통',
  driving: '자동차',
  train: '기차',
  taxi: '택시',
  vaporetto: '수상버스',
  flight: '항공',
}

export function transportLabel(t?: ItemTransport): string | undefined {
  return t ? TRANSPORT_LABEL[t] : undefined
}

// ── 전체 트립 집계 (숙소/식당 한눈에 보기) ────────────────────────────────

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
}

/** 일정 항목과 예약 항목이 같은 장소를 가리키는지 느슨하게 매칭 */
function matchesReservation(item: ScheduleItem, reservationPlaceName: string): boolean {
  const target = normName(reservationPlaceName)
  if (!target) return false
  const a = normName(item.placeName ?? '')
  const b = normName(item.title)
  return a.includes(target) || target.includes(a) || b.includes(target)
}

/** "2026-10-19" + days → "2026-10-20" (체크아웃일 계산, UTC 고정) */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** 도시명 정리: "Rome → Florence" → "Florence" (도착지 기준) */
function cleanCity(city: string): string {
  if (city.includes('→')) return city.split('→').pop()!.trim()
  return city.trim()
}

export interface HotelEntry {
  key: string
  name: string
  city: string
  placeId?: string
  placeName?: string
  checkInDay?: number
  checkInItemId?: string
  nights: number
  checkInDate?: string
  checkOutDate?: string
  reservations: Reservation[]
}

/** 9일 전체에서 숙소를 집계 (숙박일·체크인/아웃·예약 멘트 포함) */
export function collectHotels(trip: Trip): HotelEntry[] {
  const order: string[] = []
  const groups = new Map<string, { label: string; days: DayPlan[] }>()

  for (const d of trip.days) {
    if (!d.hotel) continue
    const label = d.hotel.replace(/\s*\(.*\)\s*$/, '').trim()
    if (!label || label.startsWith('비행기') || label === '집') continue
    const key = normName(label)
    if (!groups.has(key)) {
      groups.set(key, { label, days: [] })
      order.push(key)
    }
    groups.get(key)!.days.push(d)
  }

  const out: HotelEntry[] = []
  for (const key of order) {
    const g = groups.get(key)!
    let placeId: string | undefined
    let placeName: string | undefined
    let checkInDay: number | undefined
    let checkInItemId: string | undefined
    let checkInDate: string | undefined

    for (const d of g.days) {
      const ci = d.items.find((i) => i.type === 'hotel' && i.title.includes('체크인'))
      if (ci) {
        placeId = ci.placeId
        placeName = ci.placeName
        checkInDay = d.day
        checkInItemId = ci.id
        checkInDate = d.date
        break
      }
    }
    if (!checkInItemId) {
      for (const d of g.days) {
        const any = d.items.find((i) => i.type === 'hotel')
        if (any) {
          placeId = any.placeId
          placeName = any.placeName
          checkInDay = d.day
          checkInItemId = any.id
          break
        }
      }
    }

    const dates = g.days.map((d) => d.date).sort()
    const firstDate = checkInDate ?? dates[0]
    const lastDate = dates[dates.length - 1]
    const reservations: Reservation[] = []
    for (const d of g.days) {
      for (const r of d.reservations) {
        if (r.meal) continue
        const rn = normName(r.placeName)
        if (r.id.includes('HOTEL') || rn.includes(key) || key.includes(rn)) {
          reservations.push(r)
        }
      }
    }

    out.push({
      key,
      name: g.label,
      city: cleanCity(g.days[g.days.length - 1].city),
      placeId,
      placeName,
      checkInDay,
      checkInItemId,
      nights: g.days.length,
      checkInDate: firstDate,
      checkOutDate: addDaysISO(lastDate, 1),
      reservations,
    })
  }
  return out
}

function inferMeal(startTime: string): Meal | undefined {
  const h = parseInt(startTime.slice(0, 2), 10)
  if (Number.isNaN(h)) return undefined
  if (h >= 17) return 'dinner'
  if (h >= 11 && h < 16) return 'lunch'
  return undefined
}

export interface RestaurantEntry {
  itemId: string
  reservationId?: string
  day: number
  date: string
  weekday: string
  time: string
  name: string
  city: string
  type: PlaceType
  placeId?: string
  placeName?: string
  meal?: Meal
  reservationLevel?: ReservationLevel
  recommendedTiming?: string
  estimatedCost?: number
  note?: string
  recommendedMenu?: string[]
  messageEN?: string
  messageIT?: string
  messageKO?: string
}

/** 9일 전체에서 식당/카페를 집계 (예약 필요도·시점·EN/IT/KO 멘트 매칭) */
export function collectRestaurants(trip: Trip): RestaurantEntry[] {
  const out: RestaurantEntry[] = []
  for (const d of trip.days) {
    for (const item of d.items) {
      if (item.type !== 'restaurant' && item.type !== 'cafe') continue
      const res = d.reservations.find((r) => matchesReservation(item, r.placeName))
      out.push({
        itemId: item.id,
        reservationId: res?.id,
        day: d.day,
        date: d.date,
        weekday: d.weekday,
        time: item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime,
        name: item.placeName ?? item.title,
        city: cleanCity(d.city),
        type: item.type,
        placeId: item.placeId,
        placeName: item.placeName,
        meal: res?.meal ?? inferMeal(item.startTime),
        reservationLevel: item.reservationLevel ?? res?.reservationLevel,
        recommendedTiming: res?.recommendedTiming,
        estimatedCost: item.estimatedCost,
        note: res?.note ?? item.note,
        recommendedMenu: item.recommendedMenu,
        messageEN: res?.messageEN,
        messageIT: res?.messageIT,
        messageKO: res?.messageKO,
      })
    }
  }
  return out
}

export const MEAL_LABEL: Record<Meal, string> = {
  lunch: '점심',
  dinner: '저녁',
  dessert: '디저트',
}

export interface SightEntry {
  itemId: string
  day: number
  date: string
  weekday: string
  time: string
  name: string
  city: string
  placeId?: string
  type: PlaceType
  note?: string
}

/** 9일 전체에서 관광지/쇼핑/투어 미팅을 집계 (지도+리스트 페이지용) */
export function collectSights(trip: Trip): SightEntry[] {
  const types = new Set<PlaceType>(['sightseeing', 'shopping', 'tour_meeting'])
  const out: SightEntry[] = []
  for (const d of trip.days) {
    for (const it of d.items) {
      if (!it.type || !types.has(it.type)) continue
      out.push({
        itemId: it.id,
        day: d.day,
        date: d.date,
        weekday: d.weekday,
        time: it.endTime ? `${it.startTime}–${it.endTime}` : it.startTime,
        name: it.placeName ?? it.title,
        city: cleanCity(d.city),
        placeId: it.placeId,
        type: it.type,
        note: it.note,
      })
    }
  }
  return out
}

/** 마커 색상(장소 유형별) */
export function markerColor(type?: PlaceType): string {
  switch (type) {
    case 'hotel':
      return '#7b5cd6'
    case 'restaurant':
      return '#e8590c'
    case 'cafe':
      return '#c2410c'
    case 'airport':
      return '#1c7ed6'
    case 'station':
      return '#0ca678'
    case 'tour_meeting':
      return '#e64980'
    case 'shopping':
      return '#f08c00'
    case 'sightseeing':
    default:
      return '#b23a48'
  }
}
