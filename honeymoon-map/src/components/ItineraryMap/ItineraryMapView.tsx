import { useMemo, useState } from 'react'
import type { Trip } from '../../types/trip'
import {
  MEAL_LABEL,
  collectHotels,
  collectRestaurants,
  collectSights,
} from '../../lib/tripUtils'
import { usePlaceDetails } from '../../hooks/usePlaceDetails'
import { MapPanel } from './MapPanel'
import { SidebarPanel } from './SidebarPanel'
import type { PlaceCategory, PlaceListItem } from './types'

interface Props {
  trip: Trip
  mapId: string
  onGoToItem: (day: number, itemId: string) => void
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  return iso.slice(5).replace('-', '/')
}

const META: Record<PlaceCategory, { title: string; narrative: string }> = {
  restaurant: {
    title: '식당·카페 14곳',
    narrative: '로마·피렌체·베네치아·밀라노 4개 도시의 식당·카페. 마커/카드를 누르면 양쪽이 함께 강조됩니다.',
  },
  hotel: {
    title: '숙소 3곳',
    narrative: '9일간 묵는 호텔 3곳. 평점·사진은 실시간으로 불러옵니다.',
  },
  sight: {
    title: '관광지',
    narrative: '9일 일정의 관광지·시장·투어 미팅 장소. 같은 곳을 여러 날 방문하면 카드가 날짜별로 나뉩니다.',
  },
}

export function ItineraryMapView({ trip, mapId, onGoToItem }: Props) {
  const [category, setCategory] = useState<PlaceCategory>('restaurant')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 카테고리별 통합 항목 목록
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
        title={meta.title}
        narrative={meta.narrative}
        category={category}
        onCategoryChange={handleCategory}
        entries={entries}
        details={details}
        selectedId={selectedId}
        loading={loading}
        onSelect={setSelectedId}
        onGoToItem={onGoToItem}
      />
    </div>
  )
}
