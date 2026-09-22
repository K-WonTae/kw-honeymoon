import type { Reservation } from '../../types/trip'
import { RESERVATION_META } from '../../lib/tripUtils'
import type { UserDataApi } from '../../hooks/useUserData'
import { CopyButton } from '../CopyButton'

interface Props {
  reservations: Reservation[]
  user: UserDataApi
  /** true 면 제목·바깥 section 없이 목록만 — DayBrief 접이식 안에 넣을 때 */
  embedded?: boolean
}

const MEAL_LABEL: Record<string, string> = {
  lunch: '점심',
  dinner: '저녁',
  dessert: '디저트',
}

/** 예약 멘트 박스: EN/IT 복사 버튼 + 예약 필요도/시점 */
export function ReservationBox({ reservations, user, embedded = false }: Props) {
  if (!reservations.length) return null
  const list = (
      <div className="reservation-list">
        {reservations.map((r) => {
          const meta = RESERVATION_META[r.reservationLevel]
          const state = user.getReservationState(r.id)
          const needsReservation = r.reservationLevel !== 'walk-in'
          return (
            <div key={r.id} className="reservation-box">
              <div className="reservation-head">
                <span className="reservation-name">{r.placeName}</span>
                {r.meal && <span className="reservation-meal">{MEAL_LABEL[r.meal] ?? r.meal}</span>}
                <span className={`badge ${meta.className}`}>{meta.label}</span>
                {needsReservation && (
                  <span className={`badge ${state.status === 'done' ? 'res-done' : 'res-pending'}`}>
                    {state.status === 'done' ? '예약 완료' : '예약 미완료'}
                  </span>
                )}
              </div>
              {r.recommendedTiming && (
                <div className="reservation-timing">예약 시점: {r.recommendedTiming}</div>
              )}
              {r.note && <div className="reservation-note">{r.note}</div>}
              {needsReservation ? (
                <div className="reservation-user">
                  <label className="visit-check">
                    <input
                      type="checkbox"
                      checked={state.status === 'done'}
                      onChange={(e) =>
                        user.setReservationStatus(r.id, e.target.checked ? 'done' : 'pending')
                      }
                    />
                    <span>예약 완료</span>
                  </label>
                  <input
                    className="reservation-input"
                    type="text"
                    placeholder="예약번호 / 확인코드"
                    value={state.confirmationNo ?? ''}
                    onChange={(e) => user.setReservationConfirmation(r.id, e.target.value)}
                  />
                  <input
                    className="reservation-input"
                    type="text"
                    placeholder="예약 메모"
                    value={state.memo ?? ''}
                    onChange={(e) => user.setReservationMemo(r.id, e.target.value)}
                  />
                </div>
              ) : (
                <div className="reservation-note">워크인 항목 — 예약 체크 불필요</div>
              )}
              {(r.messageEN || r.messageIT || r.messageKO) && (
                <div className="reservation-messages">
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
            </div>
          )
        })}
      </div>
  )
  if (embedded) return list
  return (
    <section className="reservation-section">
      <h3 className="section-title">📒 예약 & 멘트</h3>
      {list}
    </section>
  )
}
