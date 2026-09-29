import { useState } from 'react'
import type {
  MappablePoint,
  Reservation,
  RouteLeg,
  ScheduleItem,
  TransportMode,
} from '../../types/trip'
import {
  needsBooking,
  placeTypeMeta,
  RESERVATION_META,
  transportLabel,
} from '../../lib/tripUtils'
import { buildNavUrl, toTravelMode } from '../../lib/navUrl'
import { formatDistance, formatDuration } from '../../lib/routes'
import type { FxSetting } from '../../lib/money'
import { eurToKrwText } from '../../lib/money'
import type { UserDataApi } from '../../hooks/useUserData'
import { mergeAttachments, useAttachmentLock } from '../../lib/builtinAttachments'
import { Attachments } from './Attachments'
import { ReservationBox } from './ReservationBox'

interface Props {
  item: ScheduleItem
  /** 이 항목에 걸린 예약(reservationsForItem). 워크인은 표시하지 않고 예약 필요·권장만 배지·📒 버튼이 붙는다 */
  reservations?: Reservation[]
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
  reservations,
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

  // 예약 완료 등록 — 이 항목에 걸린 예약 중 체크 대상(워크인 제외). 상태는 기기 저장(useUserData.reservations)이라
  // 식당·숙소·전체일정·지도 탭과 같은 값을 본다. 예약이 둘(호텔 늦은 체크인 + 허니문 어필)이면 둘 다 함께 토글.
  const bookable = (reservations ?? []).filter(needsBooking)
  const bookedCount = bookable.filter((r) => user.isReservationDone(r)).length
  const resDone = bookable.length > 0 && bookedCount === bookable.length
  const confirmationNos = bookable
    .map((r) => user.getReservationState(r.id).confirmationNo?.trim())
    .filter((c): c is string => !!c)

  // 네비 실행 URL — 카드의 항목 좌표(또는 해결된 좌표)와 현재 이동수단 반영
  const navUrl = item.mappable
    ? buildNavUrl(item, toTravelMode(item.transportFromPrevious ?? mode), point?.lat, point?.lng)
    : null

  const timeLabel = item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime

  // 첨부 = 배포에 내장된 것(암호 풀렸을 때) + 이 기기에서 올린 것.
  // 잠금이 풀리면 다시 그려서 빨간 점이 폰에서도 뜨게 한다 (기억한 암호로 자동 해제도 여기서 시작).
  useAttachmentLock()
  const attachments = mergeAttachments(item.id, user.getAttachments(item.id))
  const hasMemo = !!memo || checklist.length > 0 || attachments.length > 0
  const num = point?.markerNumber ?? markerNumber

  return (
    <div
      className={`card ${item.mappable ? 'mappable' : 'non-mappable'} ${
        selected ? 'selected' : ''
      } ${completed ? 'completed' : ''} ${highlight ? `card--${highlight}` : ''} ${
        bookable.length > 0 ? (resDone ? 'res-booked' : 'res-open') : ''
      }`}
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

          {(typeMeta || resMeta || bookable.length > 0 || transport || item.note || legToNext) && (
            <div className="card-sub">
              {typeMeta && (
                <span className="badge badge-type">
                  <span aria-hidden>{typeMeta.icon}</span> {typeMeta.label}
                </span>
              )}
              {resMeta && <span className={`badge ${resMeta.className}`}>{resMeta.label}</span>}
              {bookable.length > 0 && (
                <span
                  className={`badge res-status ${resDone ? 'res-done' : 'res-pending'}`}
                  title={resDone ? '예약 완료로 등록됨' : '📒 버튼으로 예약 완료를 등록하세요'}
                >
                  {resDone
                    ? '✅ 예약 완료'
                    : bookable.length > 1
                      ? `📒 예약 미완료 ${bookedCount}/${bookable.length}`
                      : '📒 예약 미완료'}
                </span>
              )}
              {confirmationNos.length > 0 && (
                <span className="card-note res-conf-note">🎫 {confirmationNos.join(' · ')}</span>
              )}
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
          {bookable.length > 0 && (
            <button
              className={`op op-res ${resDone ? 'done' : ''}`}
              aria-pressed={resDone}
              aria-label="예약 완료 등록"
              title="예약 완료 등록 (다시 누르면 해제)"
              onClick={() => bookable.forEach((r) => user.setReservationDone(r, !resDone))}
            >
              📒
            </button>
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
          {bookable.length > 0 && (
            <div className="card-res-box">
              <div className="card-res-title">📒 예약 완료 등록 · 예약번호</div>
              <ReservationBox reservations={bookable} user={user} embedded compact />
            </div>
          )}

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
