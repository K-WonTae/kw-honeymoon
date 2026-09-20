import { useState } from 'react'
import type { DayPlan } from '../../types/trip'
import type { FxSetting } from '../../lib/money'
import { eurToKrwText } from '../../lib/money'
import { AlertCard } from './AlertCard'

interface Props {
  day: DayPlan
  fx: FxSetting
}

/**
 * 일정 위 한 줄 요약 — 주의사항 · 예상비용 · 현금 · 숙소.
 * 처음엔 접혀 있고(모바일에서 일정 카드가 바로 보이게), 눌러서 펼친다.
 * ScheduleList 가 key={day.day} 로 붙이므로 Day 를 바꾸면 다시 접힌다.
 */
export function DayBrief({ day, fx }: Props) {
  const [open, setOpen] = useState(false)

  const hasCost = typeof day.estimatedCostForTwo === 'number'
  const hasCash = typeof day.cashForTwo === 'number'
  const heavy = hasCash && (day.cashForTwo ?? 0) >= 100
  const alertCount = day.alerts.length

  if (!hasCost && !hasCash && !alertCount && !day.hotel) return null

  return (
    <section className={`day-brief ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="day-brief-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={open ? '접기' : '주의사항·비용·현금 펼치기'}
      >
        <span className="day-brief-chips">
          {alertCount > 0 && (
            <span className="brief-chip warn">
              <span aria-hidden>⚠️</span> 주의 {alertCount}
            </span>
          )}
          {hasCost && (
            <span className="brief-chip">
              <span aria-hidden>💶</span> €{day.estimatedCostForTwo}
            </span>
          )}
          {hasCash && (
            <span className={`brief-chip cash ${heavy ? 'heavy' : ''}`}>
              <span aria-hidden>💵</span> 현금{' '}
              {(day.cashForTwo ?? 0) > 0 ? `€${day.cashForTwo}` : '불필요'}
            </span>
          )}
          {day.hotel && (
            <span className="brief-chip hotel">
              <span aria-hidden>🏨</span> {day.hotel}
            </span>
          )}
        </span>
        <span className="day-brief-caret" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="day-brief-body">
          {day.hotel && (
            <div className="hotel-line">
              🏨 숙소: <strong>{day.hotel}</strong>
            </div>
          )}
          {hasCost && (
            <div className="cost-line">
              💶 Day {day.day} 예상 비용(2인):{' '}
              <strong>
                약 €{day.estimatedCostForTwo} (
                {eurToKrwText(day.estimatedCostForTwo!, fx.eurToKrw)})
              </strong>
            </div>
          )}
          {hasCash && (
            <div className={`cash-line ${heavy ? 'heavy' : ''}`}>
              <div className="cash-line-top">
                💵 이 중 현금(2인):{' '}
                <strong>
                  {(day.cashForTwo ?? 0) > 0
                    ? `€${day.cashForTwo} (${eurToKrwText(day.cashForTwo!, fx.eurToKrw)})`
                    : '불필요'}
                </strong>
                <span className="cash-line-rest">· 나머지는 카드 결제 OK</span>
              </div>
              {day.cashNote && <div className="cash-line-note">{day.cashNote}</div>}
            </div>
          )}
          <AlertCard alerts={day.alerts} />
        </div>
      )}
    </section>
  )
}
