import type { HotelEntry } from '../lib/tripUtils'
import { needsBooking } from '../lib/tripUtils'
import type { UserDataApi } from '../hooks/useUserData'
import { navUrlFromParts, placeUrlFromParts } from '../lib/navUrl'
import { ReservationBox } from './Schedule/ReservationBox'

interface Props {
  hotels: HotelEntry[]
  user: UserDataApi
  onGoToItem: (day: number, itemId: string) => void
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  return iso.slice(5).replace('-', '/')
}

/** 숙소 한눈에 보기 — 3개 호텔 · 박수 · 체크인/아웃 · 예약 멘트 · 예약 완료 등록 */
export function HotelsView({ hotels, user, onGoToItem }: Props) {
  return (
    <div className="overview">
      <div className="overview-head">
        <h2>🏨 숙소 {hotels.length}곳</h2>
        <p className="overview-sub">
          9일 전체 숙소를 한 화면에서 확인하고 예약 멘트를 복사하세요. 메일을 보냈으면 「예약 완료 등록」에
          체크 — 일정 카드·전체일정·지도 탭에도 같이 표시됩니다.
        </p>
      </div>

      <div className="overview-list">
        {hotels.map((h) => {
          const parts = { placeId: h.placeId, placeName: h.placeName }
          const navUrl = navUrlFromParts(parts, 'transit')
          const placeUrl = placeUrlFromParts(parts)
          const bookable = h.reservations.filter(needsBooking)
          const done = bookable.filter((r) => user.isReservationDone(r)).length
          const allDone = bookable.length > 0 && done === bookable.length
          return (
            <div key={h.key} className="ov-card">
              <div className="ov-card-head">
                <div className="ov-title-wrap">
                  <span className="ov-name">{h.name}</span>
                  <span className="ov-city">{h.city}</span>
                </div>
                <span className="badge badge-nights">{h.nights}박</span>
                {bookable.length > 0 && (
                  <span className={`badge res-status ${allDone ? 'res-done' : 'res-pending'}`}>
                    {allDone ? '✅ 예약 완료' : `📒 예약 ${done}/${bookable.length} 완료`}
                  </span>
                )}
              </div>

              <div className="ov-meta">
                📅 {fmtDate(h.checkInDate)} 체크인 → {fmtDate(h.checkOutDate)} 체크아웃
              </div>

              {h.reservations.length > 0 && (
                <div className="ov-messages">
                  <ReservationBox reservations={h.reservations} user={user} embedded />
                </div>
              )}

              <div className="ov-actions">
                {h.checkInDay && h.checkInItemId && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => onGoToItem(h.checkInDay!, h.checkInItemId!)}
                  >
                    📅 Day {h.checkInDay} 일정에서 보기
                  </button>
                )}
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
    </div>
  )
}
