import { useEffect, useRef, useState } from 'react'
import type { Trip } from '../types/trip'
import type { UserDataApi } from '../hooks/useUserData'
import type { FxSetting } from '../lib/money'
import { eurToKrwText, formatEur } from '../lib/money'
import { mappableItems } from '../lib/tripUtils'
import { AlertCard } from './Schedule/AlertCard'
import { ScheduleCard } from './Schedule/ScheduleCard'
import { OnePager, type PaperDensity } from './OnePager'

type Layout = 'cards' | 'paper'

interface Props {
  trip: Trip
  user: UserDataApi
  fx: FxSetting
  onGoToDay: (day: number) => void
}

/** 그 날 방문 진행률(장소 = mappable 기준) */
function dayProgress(trip: Trip, dayNum: number, user: UserDataApi) {
  const day = trip.days.find((d) => d.day === dayNum)!
  const ids = mappableItems(day).map((i) => i.id)
  const total = ids.length
  const done = user.completedCount(ids)
  return { total, done, complete: total > 0 && done === total }
}

const noop = () => {}

export function AllDaysView({ trip, user, fx, onGoToDay }: Props) {
  // 보기 방식: 카드형(기존) vs 원페이퍼(A4 한 장 압축)
  const [layout, setLayout] = useState<Layout>('cards')
  const [density, setDensity] = useState<PaperDensity>('highlights')

  // 접힘 상태: 완료된 날은 접힘, 미완료는 펼침으로 시작 (기본=미완료 다 보임)
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {}
    for (const d of trip.days) init[d.day] = dayProgress(trip, d.day, user).complete
    return init
  })

  // 완료 전이 감지용 (마운트 시점 완료 상태로 시드 → 마운트 중 오발동 방지)
  const prevComplete = useRef<Record<number, boolean>>(
    Object.fromEntries(trip.days.map((d) => [d.day, dayProgress(trip, d.day, user).complete])),
  )

  // 어떤 날이 "미완료 → 완료"로 바뀌면 자동으로 접는다 (수동 펼침은 유지)
  useEffect(() => {
    setCollapsed((prev) => {
      let changed = false
      const next = { ...prev }
      for (const d of trip.days) {
        const complete = dayProgress(trip, d.day, user).complete
        const was = prevComplete.current[d.day] ?? false
        if (complete && !was) {
          next[d.day] = true
          changed = true
        }
        prevComplete.current[d.day] = complete
      }
      return changed ? next : prev
    })
    // user.data 가 바뀔 때(체크/메모 등)마다 재평가
  }, [user.data, trip])

  function toggle(dayNum: number) {
    setCollapsed((prev) => ({ ...prev, [dayNum]: !prev[dayNum] }))
  }

  const totalEur = trip.days.reduce((sum, d) => sum + (d.estimatedCostForTwo ?? 0), 0)

  return (
    <div className="alldays">
      <div className="alldays-head no-print">
        <div className="alldays-head-top">
          <h2>📋 전체 일정 한눈에 보기</h2>
          <div className="alldays-toolbar">
            <div className="seg" role="group" aria-label="보기 방식">
              <button
                className={`seg-btn ${layout === 'cards' ? 'active' : ''}`}
                onClick={() => setLayout('cards')}
              >
                🗂️ 카드형
              </button>
              <button
                className={`seg-btn ${layout === 'paper' ? 'active' : ''}`}
                onClick={() => setLayout('paper')}
              >
                📄 원페이퍼
              </button>
            </div>
            {layout === 'paper' && (
              <>
                <div className="seg" role="group" aria-label="원페이퍼 밀도">
                  <button
                    className={`seg-btn ${density === 'highlights' ? 'active' : ''}`}
                    onClick={() => setDensity('highlights')}
                    title="지도에 찍히는 핵심 장소만 — A4 한 장에 깔끔히"
                  >
                    핵심만
                  </button>
                  <button
                    className={`seg-btn ${density === 'all' ? 'active' : ''}`}
                    onClick={() => setDensity('all')}
                    title="준비·이동·취침 등 모든 행 포함 (더 빽빽)"
                  >
                    전체
                  </button>
                </div>
                <button className="btn btn-sm btn-showall" onClick={() => window.print()}>
                  🖨️ 인쇄 / PDF
                </button>
              </>
            )}
          </div>
        </div>
        <p className="alldays-sub">
          {layout === 'cards'
            ? '9일 전체 일정입니다. 방문 완료는 모든 화면과 공유되며, 한 날의 장소를 모두 완료하면 그 날은 자동으로 접힙니다. 날짜 제목을 눌러 접고 펼 수 있습니다.'
            : '9일 전체 일정을 스크롤 없이 A4 한 장에 압축했습니다. “인쇄 / PDF”로 저장해 들고 다니세요. 핵심만/전체로 밀도를 조절할 수 있습니다.'}
        </p>
        <div className="alldays-total">
          💶 9일 누적 예상비용(2인): <strong>{formatEur(totalEur)}</strong> ·{' '}
          <strong>{eurToKrwText(totalEur, fx.eurToKrw)}</strong>
        </div>
      </div>

      {layout === 'paper' && <OnePager trip={trip} fx={fx} density={density} />}

      {layout === 'cards' && (
      <div className="alldays-list">
        {trip.days.map((day) => {
          const prog = dayProgress(trip, day.day, user)
          const isCollapsed = collapsed[day.day]
          // 그 날 mappable 항목의 1-base 마커 번호
          let n = 0
          return (
            <section
              key={day.day}
              className={`day-block ${prog.complete ? 'complete' : ''}`}
            >
              <header className="day-block-head">
                <button
                  className="day-block-toggle"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(day.day)}
                >
                  <span className="day-block-caret" aria-hidden>
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                  <span className="day-block-title">
                    <strong>Day {day.day}</strong>
                    <span className="day-block-date">
                      {day.date.slice(5).replace('-', '/')} ({day.weekday}) · {day.city}
                    </span>
                  </span>
                </button>
                <span className={`day-progress-chip ${prog.complete ? 'done' : ''}`}>
                  {prog.complete ? '✓ 완료' : `${prog.done}/${prog.total}`}
                </span>
                <button
                  className="btn btn-ghost btn-sm day-block-map"
                  onClick={() => onGoToDay(day.day)}
                  title="이 날을 지도와 함께 보기"
                >
                  🗺️ 지도
                </button>
              </header>

              {!isCollapsed && (
                <div className="day-block-body">
                  <div className="day-block-meta">
                    {day.title}
                    {day.hotel ? ` · 🏨 ${day.hotel}` : ''}
                    {typeof day.estimatedCostForTwo === 'number'
                      ? ` · 💶 €${day.estimatedCostForTwo} (${eurToKrwText(
                          day.estimatedCostForTwo,
                          fx.eurToKrw,
                        )})`
                      : ''}
                  </div>
                  <AlertCard alerts={day.alerts} />
                  <div className="card-list">
                    {day.items.map((item) => {
                      const num = item.mappable ? ++n : undefined
                      return (
                        <ScheduleCard
                          key={item.id}
                          item={item}
                          markerNumber={num}
                          selected={false}
                          legSelected={false}
                          mode={day.defaultTransportMode}
                          fx={fx}
                          user={user}
                          onSelect={noop}
                          onSelectLeg={noop}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>
      )}
    </div>
  )
}
