import { useState } from 'react'
import type { DayPlan, ItemTransport, MappablePoint, RouteSummary } from '../../types/trip'
import type { LegSelection } from './ScheduleList'
import { buildNavUrl, buildRouteUrl, toTravelMode } from '../../lib/navUrl'
import { formatDistance, formatDuration } from '../../lib/routes'
import { TRANSPORT_ICON, TRANSPORT_LABEL, shortTitle, type DayLeg } from '../../lib/tripUtils'
import { renderInline } from './GuidePanel'

interface Props {
  day: DayPlan
  legs: DayLeg[]
  points: MappablePoint[]
  summary: RouteSummary
  selectedLeg: LegSelection | null
  onSelectLeg: (fromId: string, toId: string) => void
}

/** 한 구간의 이동수단 집계 — 패널 머리에 "도보 7 · 택시 2 · 기차 1" 로 보여 준다 */
function countByTransport(legs: DayLeg[]): [ItemTransport, number][] {
  const m = new Map<ItemTransport, number>()
  legs.forEach((l) => m.set(l.transport, (m.get(l.transport) ?? 0) + 1))
  return Array.from(m.entries())
}

/**
 * 🧭 동선 — 그 날 장소와 장소 사이의 이동을 시간 순으로 한 구간씩.
 * 구간 머리를 누르면 지도에서 그 구간만 강조되고(폰에서는 지도 탭으로 넘어간다),
 * 「네비」는 현재 위치에서 도착지까지 구글맵 길찾기를, 「경로」는 출발지→도착지 계획 경로를 새 탭으로 연다.
 * 단계 안내는 데이터의 transfer(있으면)·없으면 두 장소 사이의 이동 카드 제목으로 채운다.
 */
export function RoutePanel({ day, legs, points, summary, selectedLeg, onSelectLeg }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const pointById = new Map(points.map((p) => [p.item.id, p]))
  const legStat = new Map(summary.legs.map((l) => [`${l.fromId}>${l.toId}`, l]))
  const counts = countByTransport(legs)

  if (legs.length === 0) {
    return (
      <div className="route-panel">
        <p className="route-empty">이 날은 장소 사이 이동 구간이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="route-panel">
      <div className="route-head">
        <div className="route-head-title">
          🧭 Day {day.day} 동선 <span className="route-head-count">{legs.length}구간</span>
        </div>
        <div className="route-head-chips">
          {counts.map(([t, n]) => (
            <span key={t} className={`route-chip route-chip-${t}`}>
              {TRANSPORT_ICON[t]} {TRANSPORT_LABEL[t]} {n}
            </span>
          ))}
          {summary.totalDistanceMeters != null && (
            <span className="route-chip">
              📏 {formatDistance(summary.totalDistanceMeters)} · ⏱️ {formatDuration(summary.totalDurationSeconds)}
              {summary.hasEstimate ? ' (추정)' : ''}
            </span>
          )}
        </div>
        <p className="route-head-note">
          구간을 누르면 지도에 그 길만 보입니다. 🧭 네비는 지금 있는 곳에서 도착지까지, ↗ 경로는 계획한 출발지→도착지를 구글맵으로 엽니다.
        </p>
      </div>

      <ol className="route-list">
        {legs.map((leg, idx) => {
          const key = leg.key
          const active = !!selectedLeg && selectedLeg.fromId === leg.from.id && selectedLeg.toId === leg.to.id
          const stat = legStat.get(key)
          const toPoint = pointById.get(leg.to.id)
          const fromPoint = pointById.get(leg.from.id)
          const travel = toTravelMode(leg.transport)
          const navUrl = buildNavUrl(leg.to, travel, toPoint?.lat, toPoint?.lng)
          const routeUrl = buildRouteUrl(
            { ...leg.from, lat: fromPoint?.lat ?? leg.from.lat, lng: fromPoint?.lng ?? leg.from.lng },
            { ...leg.to, lat: toPoint?.lat ?? leg.to.lat, lng: toPoint?.lng ?? leg.to.lng },
            travel,
          )
          const steps =
            leg.transfer?.steps && leg.transfer.steps.length > 0
              ? leg.transfer.steps
              : leg.between.map((b) => (b.note ? `${b.title} — ${b.note}` : b.title))
          const isCollapsed = !!collapsed[key]
          const statText =
            stat && !stat.excluded && stat.distanceMeters != null
              ? `${stat.estimated ? '≈' : ''}${formatDistance(stat.distanceMeters)} · ${formatDuration(stat.durationSeconds)}`
              : leg.transfer?.duration ?? ''

          return (
            <li
              key={key}
              className={`leg-card leg-${leg.transport} ${active ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}`}
              id={`leg-${leg.from.id}-${leg.to.id}`}
            >
              <button
                type="button"
                className="leg-head"
                onClick={() => onSelectLeg(leg.from.id, leg.to.id)}
                title="이 구간만 지도에서 보기"
                aria-pressed={active}
              >
                <span className="leg-num">{idx + 1}</span>
                <span className="leg-head-main">
                  <span className="leg-time">
                    {leg.depart}
                    {leg.arrive ? ` → ${leg.arrive}` : ''}
                  </span>
                  <span className="leg-route">
                    {shortTitle(leg.from.title)} <span aria-hidden>→</span> {shortTitle(leg.to.title)}
                  </span>
                </span>
                <span className={`leg-mode leg-mode-${leg.transport}`}>
                  {TRANSPORT_ICON[leg.transport]} {TRANSPORT_LABEL[leg.transport]}
                  {statText ? <span className="leg-stat">{statText}</span> : null}
                </span>
              </button>

              <button
                type="button"
                className="leg-fold"
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))}
              >
                {isCollapsed ? '▼ 단계 보기' : '▲ 단계 접기'}
              </button>

              {!isCollapsed && (
                <div className="leg-body">
                  {leg.transfer?.board && <div className="leg-board">🎫 {renderInline(leg.transfer.board)}</div>}
                  {steps.length > 0 ? (
                    <ol className="leg-steps">
                      {steps.map((s, i) => (
                        <li key={i}>{renderInline(s)}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="leg-steps-empty">
                      {leg.transfer?.duration ? `${TRANSPORT_LABEL[leg.transport]} ${leg.transfer.duration}` : '바로 이동'}
                    </p>
                  )}
                  {(leg.transfer?.cost || leg.transfer?.tip) && (
                    <div className="leg-meta">
                      {leg.transfer?.cost && <span className="leg-cost">💶 {renderInline(leg.transfer.cost)}</span>}
                      {leg.transfer?.tip && <span className="leg-tip">💡 {renderInline(leg.transfer.tip)}</span>}
                    </div>
                  )}
                  <div className="leg-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSelectLeg(leg.from.id, leg.to.id)}>
                      🗺️ 지도에서 보기
                    </button>
                    {navUrl && (
                      <a className="btn btn-nav btn-sm" href={navUrl} target="_blank" rel="noopener noreferrer">
                        🧭 네비 실행
                      </a>
                    )}
                    {routeUrl && (
                      <a className="btn btn-sm" href={routeUrl} target="_blank" rel="noopener noreferrer">
                        ↗ 구글맵 경로
                      </a>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
