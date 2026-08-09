import type { PlaceDetails } from '../../hooks/usePlaceDetails'
import type { PlaceCategory, PlaceListItem } from './types'
import { PlaceCard } from './PlaceCard'

interface Props {
  title: string
  narrative: string
  category: PlaceCategory
  onCategoryChange: (c: PlaceCategory) => void
  entries: PlaceListItem[]
  details: Map<string, PlaceDetails>
  selectedId: string | null
  loading: boolean
  onSelect: (placeId: string) => void
  onGoToItem: (day: number, itemId: string) => void
}

const CATEGORIES: { key: PlaceCategory; label: string }[] = [
  { key: 'restaurant', label: '🍽️ 식당' },
  { key: 'hotel', label: '🏨 숙소' },
  { key: 'sight', label: '📸 관광지' },
]

// 도시 표시 순서(일정 순)
const CITY_ORDER = ['로마', 'Rome', '피렌체', 'Florence', '베네치아', 'Venice', 'Venice/Mestre', '밀라노', 'Milan']

function cityRank(city: string): number {
  const i = CITY_ORDER.findIndex((c) => city.includes(c) || c.includes(city))
  return i === -1 ? 99 : i
}

export function SidebarPanel({
  title,
  narrative,
  category,
  onCategoryChange,
  entries,
  details,
  selectedId,
  loading,
  onSelect,
  onGoToItem,
}: Props) {
  // 도시별 섹션 그룹핑 (등장 순 유지)
  const cities: string[] = []
  entries.forEach((e) => {
    if (!cities.includes(e.city)) cities.push(e.city)
  })
  cities.sort((a, b) => cityRank(a) - cityRank(b))

  return (
    <div className="sidebar-panel">
      <div className="sidebar-header">
        <h2>{title}</h2>
        <p className="sidebar-narrative">{narrative}</p>
        <div className="ov-filter" role="group" aria-label="카테고리">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`ov-filter-btn ${category === c.key ? 'active' : ''}`}
              onClick={() => onCategoryChange(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
        {loading && <div className="sidebar-loading">평점·사진 불러오는 중…</div>}
      </div>

      <div className="sidebar-scroll">
        {cities.map((city) => (
          <section key={city} className="city-section">
            <h3 className="city-title">{city}</h3>
            {entries
              .filter((e) => e.city === city)
              .map((e) => (
                <PlaceCard
                  key={e.placeId + e.goToItemId}
                  entry={e}
                  details={details.get(e.placeId)}
                  selected={selectedId === e.placeId}
                  onSelect={onSelect}
                  onGoToItem={onGoToItem}
                />
              ))}
          </section>
        ))}
      </div>
    </div>
  )
}
