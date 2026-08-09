import type { DayPlan } from '../types/trip'

interface Props {
  days: DayPlan[]
  selectedDay: number
  /** '전체 일정' 보기가 활성화됐는지 */
  allActive: boolean
  onSelect: (day: number) => void
  onSelectAll: () => void
}

/** Day 1~9 선택 탭 (+ 맨 앞 '전체' 버튼, 가로 스크롤) */
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
        <span className="day-tab-date">9일 전체</span>
        <span className="day-tab-city">한눈에 보기</span>
      </button>
      {days.map((d) => (
        <button
          key={d.day}
          role="tab"
          aria-selected={!allActive && d.day === selectedDay}
          className={`day-tab ${!allActive && d.day === selectedDay ? 'active' : ''}`}
          onClick={() => onSelect(d.day)}
        >
          <span className="day-tab-num">Day {d.day}</span>
          <span className="day-tab-date">
            {d.date.slice(5).replace('-', '/')} ({d.weekday})
          </span>
          <span className="day-tab-city">{d.city}</span>
        </button>
      ))}
    </div>
  )
}
