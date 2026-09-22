import { useEffect, useMemo, useRef } from 'react'
import type { DayPlan, MappablePoint, RouteSummary, TransportMode } from '../../types/trip'
import type { UserDataApi } from '../../hooks/useUserData'
import type { FxSetting } from '../../lib/money'
import { DayBrief } from './DayBrief'
import { ScheduleCard } from './ScheduleCard'

export interface LegSelection {
  fromId: string
  toId: string
}

interface Props {
  day: DayPlan
  points: MappablePoint[]
  summary: RouteSummary
  highlights: Record<string, 'now' | 'next'>
  selectedItemId: string | null
  selectedLeg: LegSelection | null
  mode: TransportMode
  fx: FxSetting
  user: UserDataApi
  onSelect: (id: string) => void
  onSelectLeg: (fromId: string, toId: string) => void
}

export function ScheduleList({
  day,
  points,
  summary,
  highlights,
  selectedItemId,
  selectedLeg,
  mode,
  fx,
  user,
  onSelect,
  onSelectLeg,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  const pointByItemId = useMemo(() => {
    const m = new Map<string, MappablePoint>()
    points.forEach((p) => m.set(p.item.id, p))
    return m
  }, [points])

  const legByFromId = useMemo(() => {
    const m = new Map<string, RouteSummary['legs'][number]>()
    summary.legs.forEach((l) => m.set(l.fromId, l))
    return m
  }, [summary.legs])

  const nextTitleByFromId = useMemo(() => {
    const m = new Map<string, string>()
    for (let i = 0; i < points.length - 1; i++) {
      m.set(points[i].item.id, points[i + 1].item.title)
    }
    return m
  }, [points])

  // 선택된 카드를 목록 안에서 보이도록 스크롤 (지도→일정 연동)
  useEffect(() => {
    if (!selectedItemId) return
    const el = document.getElementById(`card-${selectedItemId}`)
    if (el && listRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedItemId])

  return (
    <div className="schedule" ref={listRef}>
      {/* 주의사항·비용·현금·숙소·예약&멘트·가이드 — 일정 카드 밖의 모든 안내. 접힌 한 줄로 시작, Day 가 바뀌면 다시 접힘 */}
      <DayBrief key={day.day} day={day} fx={fx} user={user} />

      <div className="card-list">
        {day.items.map((item) => (
          <ScheduleCard
            key={item.id}
            item={item}
            point={pointByItemId.get(item.id)}
            legToNext={legByFromId.get(item.id)}
            nextLabel={nextTitleByFromId.get(item.id)}
            selected={selectedItemId === item.id}
            legSelected={selectedLeg?.fromId === item.id}
            highlight={highlights[item.id]}
            mode={mode}
            fx={fx}
            user={user}
            onSelect={onSelect}
            onSelectLeg={onSelectLeg}
          />
        ))}
      </div>
    </div>
  )
}
