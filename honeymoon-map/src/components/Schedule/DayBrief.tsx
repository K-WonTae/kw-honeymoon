import { useState } from 'react'
import type { DayPlan } from '../../types/trip'
import type { FxSetting } from '../../lib/money'
import { eurToKrwText } from '../../lib/money'
import type { UserDataApi } from '../../hooks/useUserData'
import { AlertCard } from './AlertCard'
import { GuidePanel } from './GuidePanel'
import { ReservationBox } from './ReservationBox'

interface Props {
  day: DayPlan
  fx: FxSetting
  user: UserDataApi
}

/**
 * 일정 위 한 줄 요약 — 주의사항 · 예상비용 · 현금(비중) · 숙소 · 예약&멘트 · 완벽 가이드.
 * 일정(items)을 뺀 그 날의 모든 안내가 여기 들어간다. 처음엔 접혀 있고(모바일에서 일정 카드가
 * 바로 보이게), 눌러서 펼친다. ScheduleList 가 key={day.day} 로 붙이므로 Day 를 바꾸면 다시 접힌다.
 */
export function DayBrief({ day, fx, user }: Props) {
  const [open, setOpen] = useState(false)
  const [resOpen, setResOpen] = useState(false)

  const hasCost = typeof day.estimatedCostForTwo === 'number'
  const hasCash = typeof day.cashForTwo === 'number'
  const heavy = hasCash && (day.cashForTwo ?? 0) >= 100
  const alertCount = day.alerts.length
  const guideCount = day.guide?.sections.length ?? 0
  // 예약&멘트: 워크인은 체크 대상이 아니라 "예약 필요" 건수와 그중 미완료만 센다
  const resCount = day.reservations.length
  const resNeeded = day.reservations.filter((r) => r.reservationLevel !== 'walk-in')
  const resPending = resNeeded.filter((r) => user.getReservationState(r.id).status !== 'done').length
  // 예상 비용 중 현금 비중 (%) — 둘 다 있고 비용이 0 이 아닐 때만
  const cashRatio =
    hasCost && hasCash && (day.estimatedCostForTwo ?? 0) > 0
      ? Math.round(((day.cashForTwo ?? 0) / (day.estimatedCostForTwo ?? 1)) * 100)
      : null

  if (!hasCost && !hasCash && !alertCount && !day.hotel && !guideCount && !resCount) return null

  return (
    <section className={`day-brief ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="day-brief-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={open ? '접기' : '주의사항·비용·현금·예약·가이드 펼치기'}
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
          {resCount > 0 && (
            <span className={`brief-chip res ${resPending > 0 ? 'pending' : ''}`}>
              <span aria-hidden>📒</span> 예약 {resCount}
              {resPending > 0 ? ` · 미완료 ${resPending}` : ''}
            </span>
          )}
          {guideCount > 0 && (
            <span className="brief-chip guide">
              <span aria-hidden>📖</span> 가이드 {guideCount}
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
                {cashRatio !== null && (
                  <span className="cash-line-ratio">· 비용의 약 {cashRatio}%</span>
                )}
                <span className="cash-line-rest">· 나머지는 카드 결제 OK</span>
              </div>
              {day.cashNote && <div className="cash-line-note">{day.cashNote}</div>}
            </div>
          )}
          <AlertCard alerts={day.alerts} />
          {resCount > 0 && (
            <section className={`res-panel guide-section ${resOpen ? 'open' : ''}`}>
              <button
                type="button"
                className="guide-section-toggle"
                aria-expanded={resOpen}
                onClick={() => setResOpen((v) => !v)}
              >
                <span className="guide-section-icon" aria-hidden>
                  📒
                </span>
                <span className="guide-section-head">
                  <span className="guide-section-title">예약 & 멘트</span>
                  <span className="guide-section-summary">
                    {Array.from(new Set(day.reservations.map((r) => r.placeName))).join(' · ')}
                  </span>
                </span>
                {resNeeded.length > 0 && (
                  <span className={`guide-section-progress ${resPending === 0 ? 'done' : ''}`}>
                    {resNeeded.length - resPending}/{resNeeded.length}
                  </span>
                )}
                <span className="guide-section-caret" aria-hidden>
                  {resOpen ? '▲' : '▼'}
                </span>
              </button>
              {resOpen && (
                <div className="guide-section-body">
                  <ReservationBox reservations={day.reservations} user={user} embedded />
                </div>
              )}
            </section>
          )}
          {day.guide && guideCount > 0 && <GuidePanel day={day.day} guide={day.guide} />}
        </div>
      )}
    </section>
  )
}
