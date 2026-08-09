import type { HotelEntry } from '../lib/tripUtils'
import { navUrlFromParts, placeUrlFromParts } from '../lib/navUrl'
import { CopyButton } from './CopyButton'

interface Props {
  hotels: HotelEntry[]
  onGoToItem: (day: number, itemId: string) => void
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  return iso.slice(5).replace('-', '/')
}

/** 숙소 한눈에 보기 — 3개 호텔 · 박수 · 체크인/아웃 · 예약 멘트 */
export function HotelsView({ hotels, onGoToItem }: Props) {
  return (
    <div className="overview">
      <div className="overview-head">
        <h2>🏨 숙소 {hotels.length}곳</h2>
        <p className="overview-sub">9일 전체 숙소를 한 화면에서 확인하고 예약 멘트를 복사하세요.</p>
      </div>

      <div className="overview-list">
        {hotels.map((h) => {
          const parts = { placeId: h.placeId, placeName: h.placeName }
          const navUrl = navUrlFromParts(parts, 'transit')
          const placeUrl = placeUrlFromParts(parts)
          return (
            <div key={h.key} className="ov-card">
              <div className="ov-card-head">
                <div className="ov-title-wrap">
                  <span className="ov-name">{h.name}</span>
                  <span className="ov-city">{h.city}</span>
                </div>
                <span className="badge badge-nights">{h.nights}박</span>
              </div>

              <div className="ov-meta">
                📅 {fmtDate(h.checkInDate)} 체크인 → {fmtDate(h.checkOutDate)} 체크아웃
              </div>

              {h.reservations.length > 0 && (
                <div className="ov-messages">
                  {h.reservations.map((r) => (
                    <div key={r.id} className="msg">
                      <div className="msg-head">
                        <span className="msg-lang">{r.recommendedTiming ?? 'EN'}</span>
                        {r.messageEN && <CopyButton text={r.messageEN} label="EN" />}
                      </div>
                      {r.note && <div className="ov-note">{r.note}</div>}
                      {r.messageEN && <p className="msg-text">{r.messageEN}</p>}
                      {r.messageKO && (
                        <div className="msg-ko">
                          <span className="msg-lang ko">한국어 뜻</span>
                          <p className="msg-ko-text">{r.messageKO}</p>
                        </div>
                      )}
                    </div>
                  ))}
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
