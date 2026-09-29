import type { Reservation, ReservationLevel } from '../../types/trip'

export type PlaceCategory = 'restaurant' | 'hotel' | 'sight'

/** 지도+리스트 페이지에서 쓰는 통합 항목 (카테고리 공통) */
export interface PlaceListItem {
  placeId: string
  fallbackName: string // Places Details 로딩 전/실패 시 표시 이름
  category: PlaceCategory
  city: string
  metaLine: string // "Day 2 점심 · 13:00–13:45" 등
  resLevel?: ReservationLevel
  /** 이 장소에 걸린 예약 중 체크 대상(워크인 제외) — 예약 완료 배지·등록 버튼용 */
  reservations?: Reservation[]
  note?: string
  goToDay: number
  goToItemId: string
}
