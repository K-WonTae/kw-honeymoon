import { useMemo, useState } from 'react'
import type { Trip } from '../../types/trip'
import type { UserDataApi } from '../../hooks/useUserData'
import {
  MEAL_LABEL,
  collectHotels,
  collectRestaurants,
  collectSights,
  needsBooking,
} from '../../lib/tripUtils'
import { usePlaceDetails } from '../../hooks/usePlaceDetails'
import { MapPanel } from './MapPanel'
import { SidebarPanel } from './SidebarPanel'
import type { PlaceCategory, PlaceListItem } from './types'

interface Props {
  trip: Trip
  mapId: string
  /** 있으면 카드에 예약 완료 배지·등록 버튼이 붙는다 (일정·식당·숙소 탭과 같은 상태) */
  user?: UserDataApi
  onGoToItem: (day: number, itemId: string) => void
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  return iso.slice(5).replace('-', '/')
}

// 제목의 숫자는 실제 항목 수로 채운다(식당 탭과 같은 목록에서 placeId 가 있는 곳만 지도에 찍힌다)
const META: Record<PlaceCategory, { title: (n: number) => string; narrative: string }> = {
  restaurant: {
    title: (n) => `식당·카페 ${n}곳`,
    narrative: '로마·피렌체·베네치아·밀라노 4개 도시의 식당·카페 — 식당 탭과 같은 목록 중 지도 좌표가 있는 곳. 마커/카드를 누르면 양쪽이 함께 강조됩니다.',
  },
  hotel: {
    title: (n) => `숙소 ${n}곳`,
    narrative: '9일간 묵는 호텔. 평점·사진은 실시간으로 불러옵니다.',
  },
  sight: {
    title: (n) => `관광지 ${n}곳`,
    narrative: '9일 일정의 관광지·시장·투어 미팅 장소. 같은 곳을 여러 날 방문하면 카드가 날짜별로 나뉩니다.',
  },
}

export function ItineraryMapView({ trip, mapId, user, onGoToItem }: Props) {
  const [category, setCategory] = useState<PlaceCategory>('restaurant')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 카테고리별 통합 항목 목록 (예약 원본을 함께 실어 두고, 완료 여부는 카드가 user 로 그때그때 읽는다)
  const entriesByCategory = useMemo(() => {
    const restaurants: PlaceListItem[] = collectRestaurants(trip)
      .filter((r) => r.placeId)
      .map((r) => ({
        placeId: r.placeId!,
        fallbackName: r.name,
        category: 'restaurant' as const,
        city: r.city,
        metaLine: `Day ${r.day} ${r.meal ? MEAL_LABEL[r.meal] : ''} · ${r.time}`.replace(/ +/g, ' '),
        resLevel: r.reservationLevel,
        reservations: r.reservation && needsBooking(r.reservation) ? [r.reservation] : undefined,
        note: [
          r.recommendedTiming ? `예약 시점: ${r.recommendedTiming}` : undefined,
          r.recommendedMenu?.length ? `추천: ${r.recommendedMenu.join(' · ')}` : undefined,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
        goToDay: r.day,
        goToItemId: r.itemId,
      }))

    const hotels: PlaceListItem[] = collectHotels(trip)
      .filter((h) => h.placeId)
      .map((h) => ({
        placeId: h.placeId!,
        fallbackName: h.name,
        category: 'hotel' as const,
        city: h.city,
        metaLine: `${h.nights}박 · ${fmtDate(h.checkInDate)} 체크인 → ${fmtDate(h.checkOutDate)} 체크아웃`,
        reservations: h.reservations.filter(needsBooking),
        note: undefined,
        goToDay: h.checkInDay ?? 1,
        goToItemId: h.checkInItemId ?? '',
      }))

    const sights: PlaceListItem[] = collectSights(trip)
      .filter((s) => s.placeId)
      .map((s) => ({
        placeId: s.placeId!,
        fallbackName: s.name,
        category: 'sight' as const,
        city: s.city,
        metaLine: `Day ${s.day} · ${s.time}`,
        reservations: s.reservation ? [s.reservation] : undefined,
        note: s.note,
        goToDay: s.day,
        goToItemId: s.itemId,
      }))

    return { restaurant: restaurants, hotel: hotels, sight: sights }
  }, [trip])

  const entries = entriesByCategory[category]
  const placeIds = useMemo(() => Array.from(new Set(entries.map((e) => e.placeId))), [entries])
  const { details, loading } = usePlaceDetails(placeIds)

  function handleCategory(c: PlaceCategory) {
    setCategory(c)
    setSelectedId(null)
  }

  const meta = META[category]

  return (
    <div className="itinerary-map">
      <MapPanel
        entries={entries}
        details={details}
        selectedId={selectedId}
        mapId={mapId}
        onSelect={setSelectedId}
      />
      <SidebarPanel
        title={meta.title(entries.length)}
        narrative={meta.narrative}
        category={category}
        onCategoryChange={handleCategory}
        entries={entries}
        details={details}
        selectedId={selectedId}
        loading={loading}
        user={user}
        onSelect={setSelectedId}
        onGoToItem={onGoToItem}
      />
    </div>
  )
}
