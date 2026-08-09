// ────────────────────────────────────────────────────────────────────────────
// 통합 데이터 모델 (단일 기준)
// 지시서_00 §4 의 통합 모델을 그대로 옮긴 것이다.
// 새 일정/장소를 추가할 때는 반드시 이 스키마를 따른다.
// ────────────────────────────────────────────────────────────────────────────

export type TransportMode = 'walking' | 'transit' | 'driving'

/** 카드/항목 단위의 세부 이동수단(지도 모드와 별개로 표기용) */
export type ItemTransport =
  | 'walking'
  | 'transit'
  | 'driving'
  | 'train'
  | 'taxi'
  | 'vaporetto'
  | 'flight'

export type PlaceType =
  | 'airport'
  | 'station'
  | 'hotel'
  | 'restaurant'
  | 'cafe'
  | 'sightseeing'
  | 'tour_meeting'
  | 'shopping'

export type ReservationLevel = 'required' | 'recommended' | 'walk-in'

export type Meal = 'lunch' | 'dinner' | 'dessert'

export interface ScheduleItem {
  id: string // "D2-08"
  sequence: number
  startTime: string // "13:00"
  endTime?: string // "13:45"
  title: string // "점심: Trattoria Luzzi"
  note?: string
  recommendedMenu?: string[] // 식당/카페 추천 메뉴

  // ── 지도 표시 여부 ──
  mappable: boolean // 물리적 장소면 true, "기상/비행/취침" 등이면 false
  type?: PlaceType // mappable일 때만
  placeName?: string // 지오코딩/검색용 정확한 이름
  placeId?: string // 있으면 우선 사용
  lat?: number | null
  lng?: number | null

  reservationLevel?: ReservationLevel
  transportFromPrevious?: ItemTransport
  estimatedCost?: number // EUR
  completed?: boolean // 사용자 입력, localStorage (런타임에서 덮어씀)
}

export interface Reservation {
  id: string
  placeName: string
  meal?: Meal
  reservationLevel: ReservationLevel
  recommendedTiming?: string // "6주 전"
  messageEN?: string
  messageIT?: string
  messageKO?: string // 한국어 뜻(참고용 — 실제 발송은 EN/IT)
  note?: string
}

export interface DayPlan {
  day: number // 1~9
  date: string // "2026-10-20"
  weekday: string // "화"
  city: string
  title: string
  hotel?: string
  defaultTransportMode: TransportMode
  estimatedCostForTwo?: number // EUR
  /** 그 날 손에 쥐고 있어야 할 현금(2인·EUR). 카드로 안 되거나 현금이 훨씬 편한 몫만. */
  cashForTwo?: number
  /** 현금이 "어디에" 필요한지 한 줄 설명 (cashForTwo 가 있을 때만 의미 있음) */
  cashNote?: string
  alerts: string[] // 경고 카드 문구
  items: ScheduleItem[]
  reservations: Reservation[]
}

/** 식당 공통 가이드(날짜 비종속). 식당 탭 하단에 렌더 — 참고문서(식당 가이드) 반영 */
export interface DiningTips {
  /** 예약 공통 팁 + 복붙용 멘트 템플릿(전화 EN/IT·도착·허니문 어필) */
  reservation: string[]
  /** 이탈리아 식당 문화 꿀팁(코페르토·물·주문 순서 등) */
  culture: string[]
}

export interface Trip {
  tripId: string
  title: string // "이탈리아 허니문 9일"
  startDate: string // "2026-10-19"
  endDate: string // "2026-10-27"
  travelerCount: number // 2
  homeCurrency: string // "KRW"
  baseCurrency: string // "EUR"
  days: DayPlan[]
  /** 식당 문화·예약 공통 팁 (있으면 식당 탭에 표시) */
  diningTips?: DiningTips
}

// ── 런타임 파생 타입 ───────────────────────────────────────────────────────

/** 지도에 찍히는, 좌표/PlaceId 를 가진 mappable 항목 (마커 번호 부여 후) */
export interface MappablePoint {
  item: ScheduleItem
  /** 그 날 mappable 항목들 사이의 1-base 마커 번호 */
  markerNumber: number
  lat: number
  lng: number
}

/** Routes/직선거리 계산 결과 (구간 1개) */
export interface RouteLeg {
  fromId: string
  toId: string
  mode: TransportMode
  /** 이 구간의 실제 이동수단 (train/flight/vaporetto 등). 표기/속도 추정에 사용 */
  transport: ItemTransport
  distanceMeters: number | null
  durationSeconds: number | null
  /** Routes API 가 아니라 좌표 기반 직선거리 추정이면 true */
  estimated: boolean
  /** 비행 등 전체 이동시간/거리 합산에서 제외되는 구간이면 true */
  excluded: boolean
  /** Routes API 가 돌려준 실제 경로(인코딩 폴리라인). 없으면 직선으로 폴백 */
  polyline?: string
}

export interface RouteSummary {
  legs: RouteLeg[]
  totalDistanceMeters: number | null
  totalDurationSeconds: number | null
  /** 하나라도 추정값이 섞였는지 */
  hasEstimate: boolean
  /** Routes API 미사용(키 없음 등)으로 전부 계산 불가하면 true */
  unavailable: boolean
}
