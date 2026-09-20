import type { DayPlan, RouteSummary, TransportMode } from '../types/trip'
import { formatDistance, formatDuration } from '../lib/routes'
import { formatRomeClock } from '../lib/time'

interface Props {
  day: DayPlan
  summary: RouteSummary
  mode: TransportMode
  now: Date
  onModeChange: (m: TransportMode) => void
  onShowAll: () => void
  onOpenSettings: () => void
  progressDone: number
  progressTotal: number
}

const MODES: { key: TransportMode; label: string; icon: string }[] = [
  { key: 'walking', label: '도보', icon: '🚶' },
  { key: 'transit', label: '대중교통', icon: '🚆' },
  { key: 'driving', label: '자동차', icon: '🚗' },
]

/**
 * 상단 바: Day 요약 · 전체 이동거리/시간 · 이동수단 토글 · 전체보기.
 * 모바일(<=900px)에서는 CSS 로 한 줄 요약으로 줄어든다 — 통계는 아이콘+숫자만,
 * 버튼은 아이콘만, 이동수단 토글은 숨김(지도 위 컨트롤에 같은 토글이 있다).
 */
export function TopBar({
  day,
  summary,
  mode,
  now,
  onModeChange,
  onShowAll,
  onOpenSettings,
  progressDone,
  progressTotal,
}: Props) {
  const distance = formatDistance(summary.totalDistanceMeters)
  const duration = formatDuration(summary.totalDurationSeconds)
  const est = summary.hasEstimate ? ' (추정)' : ''
  const pct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0
  const clock = formatRomeClock(now)

  return (
    <header className="topbar">
      <div className="topbar-row1">
        <div className="topbar-title">
          <strong>
            Day {day.day} · {day.date.replace(/-/g, '.')} ({day.weekday})
            <span className="topbar-clock-inline"> · 🇮🇹 {clock}</span>
          </strong>
          <span className="topbar-subtitle">
            {day.title}
            <span className="topbar-clock"> · 🇮🇹 현지 시각 {clock}</span>
          </span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={onOpenSettings} title="설정">
            <span aria-hidden>⚙️</span>
            <span className="btn-label">설정</span>
          </button>
          <button className="btn btn-showall" onClick={onShowAll} title="전체 경로/마커 보기">
            <span aria-hidden>🧭</span>
            <span className="btn-label">전체보기</span>
          </button>
        </div>
      </div>

      <div className="topbar-row2">
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-label">전체 이동거리</span>
            <span className="stat-icon" aria-hidden>📏</span>
            <span className="stat-value">
              {distance}
              {summary.totalDistanceMeters != null ? est : ''}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">전체 예상 이동시간</span>
            <span className="stat-icon" aria-hidden>⏱️</span>
            <span className="stat-value">
              {duration}
              {summary.totalDurationSeconds != null ? est : ''}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">방문 진행률</span>
            <span className="stat-icon" aria-hidden>✓</span>
            <span className="stat-value">
              {progressDone}/{progressTotal} · {pct}%
            </span>
          </div>
        </div>

        <div className="mode-toggle" role="group" aria-label="이동수단 선택">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`mode-btn ${mode === m.key ? 'active' : ''}`}
              aria-pressed={mode === m.key}
              onClick={() => onModeChange(m.key)}
            >
              <span aria-hidden>{m.icon}</span> {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="progress-bar" aria-hidden>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </header>
  )
}
