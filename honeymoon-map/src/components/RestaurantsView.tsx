import { useMemo, useState } from 'react'
import type { DiningTips, ReservationLevel } from '../types/trip'
import type { UserDataApi } from '../hooks/useUserData'
import {
  MEAL_LABEL,
  RESERVATION_META,
  needsBooking,
  placeTypeMeta,
  type RestaurantEntry,
} from '../lib/tripUtils'
import { eurToKrwText, type FxSetting } from '../lib/money'
import { navUrlFromParts, placeUrlFromParts } from '../lib/navUrl'
import { CopyButton } from './CopyButton'

interface Props {
  restaurants: RestaurantEntry[]
  user: UserDataApi
  fx: FxSetting
  onGoToItem: (day: number, itemId: string) => void
  diningTips?: DiningTips
}

type Filter = 'all' | ReservationLevel

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'required', label: '예약 필수' },
  { key: 'recommended', label: '예약 권장' },
  { key: 'walk-in', label: '워크인' },
]

/** 식당 한눈에 보기 — 9일 전체 식당/카페 · 예약 필요도 필터 · EN/IT 멘트 · 예약 완료 등록 */
export function RestaurantsView({ restaurants, user, fx, onGoToItem, diningTips }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [incompleteOnly, setIncompleteOnly] = useState(false)

  const counts = useMemo(() => {
    const c = { required: 0, recommended: 0, 'walk-in': 0 } as Record<ReservationLevel, number>
    restaurants.forEach((r) => {
      if (r.reservationLevel) c[r.reservationLevel] += 1
    })
    return c
  }, [restaurants])

  // 예약 완료 체크 대상 = 예약 원본이 있고 워크인이 아닌 곳. 배지·필터·요약·등록 버튼이 전부 이 기준을 쓴다
  // (예약 원본이 없는 카페엔 일정 카드처럼 아무것도 붙지 않는다)
  const isBookable = (r: RestaurantEntry) => !!r.reservation && needsBooking(r.reservation)
  const isDone = (r: RestaurantEntry) => !!r.reservation && user.isReservationDone(r.reservation)
  const reservable = useMemo(() => restaurants.filter(isBookable), [restaurants])
  const doneCount = reservable.filter(isDone).length

  const list = useMemo(() => {
    const byLevel =
      filter === 'all' ? restaurants : restaurants.filter((r) => r.reservationLevel === filter)
    if (!incompleteOnly) return byLevel
    return byLevel.filter((r) => isBookable(r) && !isDone(r))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurants, filter, incompleteOnly, user])

  return (
    <div className="overview">
      <div className="overview-head">
        <h2>🍽️ 식당 {restaurants.length}곳</h2>
        <p className="overview-sub">
          예약 필수 {counts.required} · 권장 {counts.recommended} · 워크인 {counts['walk-in']} —
          예약 {reservable.length}개 중 {doneCount}개 완료 — 예약이 되면 「예약 완료 등록」을 누르세요.
          일정 카드·전체일정·지도 탭에도 같이 표시됩니다.
        </p>
        <div className="ov-filter" role="group" aria-label="예약 필요도 필터">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`ov-filter-btn ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
          <button
            className={`ov-filter-btn ${incompleteOnly ? 'active' : ''}`}
            onClick={() => setIncompleteOnly((v) => !v)}
          >
            미완료만 보기
          </button>
        </div>
      </div>

      <div className="overview-list">
        {list.map((r) => {
          const typeMeta = placeTypeMeta(r.type)
          const resMeta = r.reservationLevel ? RESERVATION_META[r.reservationLevel] : undefined
          const bookable = isBookable(r)
          const done = isDone(r)
          // 입력칸엔 원본(공백 포함), 배지엔 trim 값
          const rawConfirmationNo = r.reservation
            ? user.getReservationState(r.reservation.id).confirmationNo
            : undefined
          const confirmationNo = rawConfirmationNo?.trim()
          const parts = { placeId: r.placeId, placeName: r.placeName }
          const navUrl = navUrlFromParts(parts, 'transit')
          const placeUrl = placeUrlFromParts(parts)
          return (
            <div key={r.itemId} className={`ov-card ${bookable ? (done ? 'res-booked' : 'res-open') : ''}`}>
              <div className="ov-card-head">
                <div className="ov-title-wrap">
                  <span className="ov-name">{r.name}</span>
                  <span className="ov-city">
                    Day {r.day} · {r.date.slice(5).replace('-', '/')}({r.weekday}) · {r.city}
                    {r.meal ? ` · ${MEAL_LABEL[r.meal]}` : ''} · {r.time}
                  </span>
                </div>
                {resMeta && <span className={`badge ${resMeta.className}`}>{resMeta.label}</span>}
                {bookable && (
                  <span className={`badge res-status ${done ? 'res-done' : 'res-pending'}`}>
                    {done ? '✅ 예약 완료' : '📒 예약 미완료'}
                  </span>
                )}
              </div>

              <div className="badges">
                {confirmationNo && <span className="badge res-conf">🎫 {confirmationNo}</span>}
                {typeMeta && (
                  <span className="badge badge-type">
                    <span aria-hidden>{typeMeta.icon}</span> {typeMeta.label}
                  </span>
                )}
                {r.recommendedTiming && (
                  <span className="badge badge-timing">예약 {r.recommendedTiming}</span>
                )}
                {typeof r.estimatedCost === 'number' && (
                  <span className="badge badge-cost">
                    €{r.estimatedCost} · {eurToKrwText(r.estimatedCost, fx.eurToKrw)}
                  </span>
                )}
              </div>

              {r.note && <div className="ov-note">{r.note}</div>}
              {r.recommendedMenu && r.recommendedMenu.length > 0 && (
                <div className="ov-note menu-note">
                  🍴 추천 메뉴: {r.recommendedMenu.join(' · ')}
                </div>
              )}

              {(r.messageEN || r.messageIT || r.messageKO) && (
                <div className="ov-messages">
                  {r.messageEN && (
                    <div className="msg">
                      <div className="msg-head">
                        <span className="msg-lang">EN</span>
                        <CopyButton text={r.messageEN} label="EN" />
                      </div>
                      <p className="msg-text">{r.messageEN}</p>
                    </div>
                  )}
                  {r.messageIT && (
                    <div className="msg">
                      <div className="msg-head">
                        <span className="msg-lang">IT</span>
                        <CopyButton text={r.messageIT} label="IT" />
                      </div>
                      <p className="msg-text">{r.messageIT}</p>
                    </div>
                  )}
                  {r.messageKO && (
                    <div className="msg-ko">
                      <span className="msg-lang ko">한국어 뜻</span>
                      <p className="msg-ko-text">{r.messageKO}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="ov-actions">
                {bookable && (
                  <button
                    className={`btn ${done ? 'btn-ghost' : 'btn-res'}`}
                    onClick={() => user.setReservationDone(r.reservation!, !done)}
                  >
                    {done ? '↩ 예약 미완료로 되돌리기' : '✅ 예약 완료 등록'}
                  </button>
                )}
                {bookable && (
                  <input
                    className="reservation-input ov-res-input"
                    type="text"
                    placeholder="예약번호 / 확인코드"
                    value={rawConfirmationNo ?? ''}
                    onChange={(e) => user.setReservationConfirmation(r.reservation!.id, e.target.value)}
                    aria-label="예약번호"
                  />
                )}
                <button className="btn btn-ghost" onClick={() => onGoToItem(r.day, r.itemId)}>
                  📅 Day {r.day} 일정에서 보기
                </button>
                {placeUrl && (
                  <a className="btn" href={placeUrl} target="_blank" rel="noopener noreferrer">
                    🗺️ 지도에서 보기
                  </a>
                )}
                {navUrl && (
                  <a className="btn btn-nav" href={navUrl} target="_blank" rel="noopener noreferrer">
                    🧭 네비 실행
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {diningTips && (
        <div className="dining-tips">
          <section className="tips-block">
            <h3 className="tips-title">📞 예약 공통 팁 · 복붙 멘트</h3>
            <ul className="tips-list">
              {diningTips.reservation.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>
          <section className="tips-block">
            <h3 className="tips-title">🇮🇹 이탈리아 식당 문화 꿀팁</h3>
            <ul className="tips-list">
              {diningTips.culture.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
