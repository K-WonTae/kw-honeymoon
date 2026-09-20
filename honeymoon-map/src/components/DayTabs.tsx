import type { DayPlan } from '../types/trip'

interface Props {
  days: DayPlan[]
  selectedDay: number
  /** '전체 일정' 보기가 활성화됐는지 */
  allActive: boolean
  onSelect: (day: number) => void
  onSelectAll: () => void
}

/**
 * Day 1~9 선택 탭 (+ 맨 앞 '전체' 버튼, 가로 스크롤).
 * 한 줄 알약 모양 — 데스크톱은 "Day 2 · 10/20 (화) · Rome", 모바일은 "D2 · 10/20(화)" 로 줄어든다(CSS).
 */
export function DayTabs({ days, selectedDay, allActive, onSelect, onSelectAll }: Props) {
  return (
    <div className="day-tabs" role="tablist" aria-label="Day 선택">
      <button
        role="tab"
        aria-selected={allActive}
        className={`day-tab day-tab-all ${allActive ? 'active' : ''}`}
        onClick={onSelectAll}
        title="모든 날짜 일정을 한눈에"
      >
        <span className="day-tab-num">📋 전체</span>
      </button>
      {days.map((d) => (
        <button
          key={d.day}
          role="tab"
          aria-selected={!allActive && d.day === selectedDay}
          className={`day-tab ${!allActive && d.day === selectedDay ? 'active' : ''}`}
          onClick={() => onSelect(d.day)}
          title={`Day ${d.day} · ${d.city} — ${d.title}`}
        >
          <span className="day-tab-num">
            <span className="day-tab-num-long">Day </span>
            <span className="day-tab-num-short">D</span>
            {d.day}
          </span>
          <span className="day-tab-date">
            {d.date.slice(5).replace('-', '/')}
            <span className="day-tab-wd">({d.weekday})</span>
          </span>
          <span className="day-tab-city">{d.city}</span>
        </button>
      ))}
    </div>
  )
}
