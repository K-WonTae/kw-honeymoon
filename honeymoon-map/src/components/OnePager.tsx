import type { Trip, PlaceType } from '../types/trip'
import type { FxSetting } from '../lib/money'
import { eurToKrwText, formatEur } from '../lib/money'

export type PaperDensity = 'highlights' | 'all'

interface Props {
  trip: Trip
  fx: FxSetting
  density: PaperDensity
}

const TYPE_ICON: Record<PlaceType, string> = {
  airport: '✈️',
  station: '🚆',
  hotel: '🏨',
  restaurant: '🍽️',
  cafe: '☕',
  sightseeing: '📸',
  tour_meeting: '🚩',
  shopping: '🛍️',
}

/**
 * 원페이퍼: 9일 전체 일정을 A4 한 장(스크롤 없이)에 담는 압축 보기.
 * - 'highlights' : 지도에 찍히는 장소(mappable)만 → 진짜 A4 한 장에 들어감(기본).
 * - 'all'        : 모든 행(준비/취침 등 포함) → 더 빽빽함.
 * 마커 번호는 AllDaysView/지도와 동일하게 "그 날 mappable 순서" 기준.
 */
export function OnePager({ trip, fx, density }: Props) {
  const totalEur = trip.days.reduce((sum, d) => sum + (d.estimatedCostForTwo ?? 0), 0)

  return (
    <div className={`onepager density-${density}`} id="onepager-sheet">
      <div className="op-head">
        <h2 className="op-title">🇮🇹 {trip.title}</h2>
        <div className="op-meta">
          {trip.startDate.replace(/-/g, '.')} ~ {trip.endDate.replace(/-/g, '.')} · {trip.travelerCount}인
          <span className="op-meta-sep">·</span>
          💶 누적 {formatEur(totalEur)} ({eurToKrwText(totalEur, fx.eurToKrw)})
          <span className="op-meta-sep">·</span>
          {density === 'highlights' ? '핵심 장소만' : '전체 일정'}
        </div>
      </div>

      <div className="op-grid">
        {trip.days.map((day) => {
          let n = 0
          // density 에 따라 표시할 행 결정 (번호는 항상 mappable 순서로 매김)
          const rows = day.items
            .map((item) => {
              const num = item.mappable ? ++n : undefined
              return { item, num }
            })
            .filter(({ item }) => (density === 'highlights' ? item.mappable : true))

          return (
            <section className="op-day" key={day.day}>
              <header className="op-day-head">
                <span className="op-day-num">D{day.day}</span>
                <span className="op-day-info">
                  <strong className="op-day-when">
                    {day.date.slice(5).replace('-', '/')} ({day.weekday}) · {day.city}
                  </strong>
                  <span className="op-day-title">{day.title}</span>
                </span>
              </header>

              <ul className="op-items">
                {rows.map(({ item, num }) => (
                  <li
                    key={item.id}
                    className={`op-item ${item.mappable ? 'place' : 'plain'}`}
                  >
                    <span className="op-time">{item.startTime}</span>
                    {num != null ? (
                      <span className="op-num">{num}</span>
                    ) : (
                      <span className="op-dot" aria-hidden>
                        ·
                      </span>
                    )}
                    <span className="op-text">
                      {item.type ? (
                        <span className="op-ico" aria-hidden>
                          {TYPE_ICON[item.type]}{' '}
                        </span>
                      ) : null}
                      {item.title}
                    </span>
                  </li>
                ))}
              </ul>

              {(day.hotel || typeof day.estimatedCostForTwo === 'number') && (
                <footer className="op-day-foot">
                  {day.hotel ? <span>🏨 {day.hotel}</span> : null}
                  {typeof day.estimatedCostForTwo === 'number' ? (
                    <span>💶 €{day.estimatedCostForTwo}</span>
                  ) : null}
                </footer>
              )}
            </section>
          )
        })}
      </div>

      <div className="op-foot-note">
        🗺️ 번호는 각 날짜 지도 마커 순서와 같습니다 · A4 세로 1장 인쇄/PDF 저장에 맞춰져 있습니다.
      </div>
    </div>
  )
}
