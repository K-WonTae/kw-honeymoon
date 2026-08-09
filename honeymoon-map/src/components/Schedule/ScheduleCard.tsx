import { useState } from 'react'
import type { MappablePoint, RouteLeg, ScheduleItem, TransportMode } from '../../types/trip'
import {
  placeTypeMeta,
  RESERVATION_META,
  transportLabel,
} from '../../lib/tripUtils'
import { buildNavUrl, toTravelMode } from '../../lib/navUrl'
import { formatDistance, formatDuration } from '../../lib/routes'
import type { FxSetting } from '../../lib/money'
import { eurToKrwText } from '../../lib/money'
import type { UserDataApi } from '../../hooks/useUserData'
import { Attachments } from './Attachments'

interface Props {
  item: ScheduleItem
  point?: MappablePoint
  /** point 없이도 마커 번호만 표시하고 싶을 때 (전체일정 페이지 등) */
  markerNumber?: number
  legToNext?: RouteLeg
  nextLabel?: string
  selected: boolean
  legSelected: boolean
  highlight?: 'now' | 'next'
  mode: TransportMode
  fx?: FxSetting
  user: UserDataApi
  onSelect: (id: string) => void
  onSelectLeg: (fromId: string, toId: string) => void
}

export function ScheduleCard({
  item,
  point,
  markerNumber,
  legToNext,
  nextLabel,
  selected,
  legSelected,
  highlight,
  mode,
  fx,
  user,
  onSelect,
  onSelectLeg,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')

  const typeMeta = placeTypeMeta(item.type)
  const resMeta = item.reservationLevel ? RESERVATION_META[item.reservationLevel] : undefined
  const transport = transportLabel(item.transportFromPrevious)
  const completed = user.isCompleted(item.id)
  const memo = user.getMemo(item.id)
  const checklist = user.getChecklist(item.id)

  // 네비 실행 URL — 카드의 항목 좌표(또는 해결된 좌표)와 현재 이동수단 반영
  const navUrl = item.mappable
    ? buildNavUrl(item, toTravelMode(item.transportFromPrevious ?? mode), point?.lat, point?.lng)
    : null

  const timeLabel = item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime

  const attachments = user.getAttachments(item.id)
  const hasMemo = !!memo || checklist.length > 0 || attachments.length > 0
  const num = point?.markerNumber ?? markerNumber

  return (
    <div
      className={`card ${item.mappable ? 'mappable' : 'non-mappable'} ${
        selected ? 'selected' : ''
      } ${completed ? 'completed' : ''} ${highlight ? `card--${highlight}` : ''}`}
      id={`card-${item.id}`}
    >
      <div className="card-row" onClick={() => item.mappable && onSelect(item.id)}>
        <div className="card-time">{timeLabel}</div>

        {num ? (
          <span className="marker-num" aria-label={`마커 ${num}`}>
            {num}
          </span>
        ) : (
          <span className="marker-dot" aria-hidden />
        )}

        <div className="card-main">
          <div className="card-title">{item.title}</div>
          {highlight && <span className={`time-badge time-badge-${highlight}`}>{highlight === 'now' ? '지금' : '다음'}</span>}

          {(typeMeta || resMeta || transport || item.note || legToNext) && (
            <div className="card-sub">
              {typeMeta && (
                <span className="badge badge-type">
                  <span aria-hidden>{typeMeta.icon}</span> {typeMeta.label}
                </span>
              )}
              {resMeta && <span className={`badge ${resMeta.className}`}>{resMeta.label}</span>}
              {transport && <span className="badge badge-transport">↳ {transport}</span>}
              {typeof item.estimatedCost === 'number' && (
                <span className="badge badge-cost">
                  €{item.estimatedCost}
                  {fx ? ` · ${eurToKrwText(item.estimatedCost, fx.eurToKrw)}` : ''}
                </span>
              )}
              {item.note && <span className="card-note">{item.note}</span>}
              {item.recommendedMenu && item.recommendedMenu.length > 0 && (
                <span className="card-note menu-note">
                  🍴 추천: {item.recommendedMenu.join(' · ')}
                </span>
              )}
              {legToNext && (
                <button
                  className={`leg-chip ${legSelected ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectLeg(legToNext.fromId, legToNext.toId)
                  }}
                  title={nextLabel ? `이 구간만 지도 보기 → ${nextLabel}` : '이 구간만 지도 보기'}
                >
                  {legToNext.excluded
                    ? '✈ 비행'
                    : `↓ ${legToNext.estimated ? '≈' : ''}${formatDistance(
                        legToNext.distanceMeters,
                      )}·${formatDuration(legToNext.durationSeconds)}`}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="card-ops" onClick={(e) => e.stopPropagation()}>
          {navUrl && (
            <a
              className="op op-nav"
              href={navUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="네비 실행"
            >
              🧭
            </a>
          )}
          <button
            className={`op op-visit ${completed ? 'done' : ''}`}
            aria-pressed={completed}
            title="방문 완료"
            onClick={() => user.toggleCompleted(item.id)}
          >
            ✓
          </button>
          <button
            className={`op op-memo ${hasMemo ? 'has' : ''}`}
            aria-expanded={expanded}
            title="메모·체크리스트"
            onClick={() => setExpanded((v) => !v)}
          >
            📝
          </button>
        </div>
      </div>

      {expanded && (
        <div className="card-extra" onClick={(e) => e.stopPropagation()}>
          <textarea
            className="memo-input"
            placeholder="메모 입력…"
            value={memo}
            onChange={(e) => user.setMemo(item.id, e.target.value)}
            rows={2}
          />

          <ul className="checklist">
            {checklist.map((c) => (
              <li key={c.id} className={c.checked ? 'checked' : ''}>
                <label>
                  <input
                    type="checkbox"
                    checked={c.checked}
                    onChange={() => user.toggleChecklist(item.id, c.id)}
                  />
                  <span>{c.text}</span>
                </label>
                <button
                  className="checklist-remove"
                  aria-label="삭제"
                  onClick={() => user.removeChecklist(item.id, c.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <form
            className="checklist-add"
            onSubmit={(e) => {
              e.preventDefault()
              user.addChecklist(item.id, draft)
              setDraft('')
            }}
          >
            <input
              type="text"
              placeholder="체크리스트 항목 추가…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-ghost">
              추가
            </button>
          </form>

          <Attachments itemId={item.id} user={user} />
        </div>
      )}
    </div>
  )
}
