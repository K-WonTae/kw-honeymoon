export const TRIP_TZ = 'Europe/Rome'

/** 특정 IANA 타임존 'ts' 순간의 벽시계 시각을 UTC 타임스탬프로 환산 (내부용) */
function wallClockInTz(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ts))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  let hh = get('hour')
  if (hh === 24) hh = 0
  return Date.UTC(get('year'), get('month') - 1, get('day'), hh, get('minute'), get('second'))
}

/** 특정 타임존의 '벽시계 날짜+시각'을 절대시각(Date)으로 변환. DST 자동 처리. */
export function zonedTimeToUtc(dateStr: string, timeStr: string, tz: string = TRIP_TZ): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0)
  const diff = asUtc - wallClockInTz(asUtc, tz)
  return new Date(asUtc + diff)
}

/** DayPlan.date + ScheduleItem.startTime 으로 일정의 절대 시작시각 */
export function itemStartAt(day: { date: string }, item: { startTime: string }): Date | null {
  if (!day?.date || !item?.startTime) return null
  return zonedTimeToUtc(day.date, item.startTime, TRIP_TZ)
}

export function itemEndAt(day: { date: string }, item: { endTime?: string }): Date | null {
  if (!day?.date || !item?.endTime) return null
  return zonedTimeToUtc(day.date, item.endTime, TRIP_TZ)
}

/** 현지(로마) 기준 오늘 날짜 "YYYY-MM-DD" */
export function romeToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TRIP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** 현지 시각 "HH:mm" 시계 표시용 */
export function formatRomeClock(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TRIP_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
}
