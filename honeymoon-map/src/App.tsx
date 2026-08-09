import { useEffect, useMemo, useRef, useState } from 'react'
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps'
import tripData from './data/trip.json'
import type { ScheduleItem, Trip, TransportMode } from './types/trip'
import {
  buildMappablePoints,
  collectHotels,
  collectRestaurants,
  mappableItems,
} from './lib/tripUtils'
import { geocodeItems, type LatLng } from './lib/geocode'
import { itemEndAt, itemStartAt, romeToday } from './lib/time'
import { useRouteSummary } from './hooks/useRouteSummary'
import { useUserData, type UserDataApi } from './hooks/useUserData'
import { useFxRate } from './hooks/useFxRate'
import { DayTabs } from './components/DayTabs'
import { TopBar } from './components/TopBar'
import { SplitLayout, type MobileTab } from './components/SplitLayout'
import { ScheduleList, type LegSelection } from './components/Schedule/ScheduleList'
import { MapView } from './components/MapView/MapView'
import { HotelsView } from './components/HotelsView'
import { RestaurantsView } from './components/RestaurantsView'
import { ItineraryMapView } from './components/ItineraryMap/ItineraryMapView'
import { AllDaysView } from './components/AllDaysView'
import { AttachmentsOverview } from './components/AttachmentsOverview'
import { SettingsPanel } from './components/SettingsPanel'

type View = 'schedule' | 'alldays' | 'hotels' | 'restaurants' | 'placemap' | 'attachments'
type Highlight = 'now' | 'next'

const trip = tripData as Trip

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID'

/** APIProvider 내부에서 현재 Day 의 mappable 항목을 지오코딩해 좌표를 상위로 올린다. */
function GeocodeBridge({
  items,
  onResolved,
}: {
  items: ScheduleItem[]
  onResolved: (m: Map<string, LatLng>) => void
}) {
  const geoLib = useMapsLibrary('geocoding')
  const itemsKey = items.map((i) => i.id).join(',')

  useEffect(() => {
    if (!geoLib || items.length === 0) return
    let cancelled = false
    const geocoder = new geoLib.Geocoder()
    geocodeItems(geocoder, items).then((m) => {
      if (!cancelled && m.size) onResolved(m)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoLib, itemsKey])

  return null
}

/** API 키가 없을 때의 지도 폴백 (일정표는 항상 동작) */
function MapFallback() {
  return (
    <div className="map-fallback">
      <div className="map-fallback-inner">
        <div className="map-fallback-icon">🗺️</div>
        <h2>지도 비활성화</h2>
        <p>
          환경변수 <code>VITE_GOOGLE_MAPS_API_KEY</code> 에 Google Maps API 키를 넣으면 지도가
          활성화됩니다.
        </p>
        <p className="muted">
          키가 없어도 일정표·예약 멘트·체크리스트·네비 버튼·방문 체크는 정상 동작합니다. 거리/시간은
          좌표 확보 시 직선거리 추정(‘추정’ 표시)으로 보완됩니다.
        </p>
      </div>
    </div>
  )
}

/** 그 날의 장소(mappable)를 모두 방문 완료했는지 */
function isDayComplete(dayNum: number, user: UserDataApi): boolean {
  const d = trip.days.find((x) => x.day === dayNum)
  if (!d) return false
  const ids = d.items.filter((i) => i.mappable).map((i) => i.id)
  return ids.length > 0 && user.completedCount(ids) === ids.length
}

/** 아직 완료되지 않은 첫 번째 Day (없으면 1일차) */
function firstIncompleteDay(user: UserDataApi): number {
  for (const d of trip.days) {
    if (!isDayComplete(d.day, user)) return d.day
  }
  return trip.days[0].day
}

function validDate(d: Date | null): d is Date {
  return !!d && !Number.isNaN(d.getTime())
}

function scheduleHighlights(day: Trip['days'][number], now: Date): Record<string, Highlight> {
  if (day.date !== romeToday(now)) return {}
  const nowMs = now.getTime()
  const starts = day.items.map((item) => ({ item, start: itemStartAt(day, item) }))
  const out: Record<string, Highlight> = {}

  let current: ScheduleItem | null = null
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].start
    if (!validDate(start)) continue
    const nextStart = starts.slice(i + 1).find((x) => validDate(x.start))?.start ?? null
    const end = itemEndAt(day, starts[i].item) ?? nextStart
    const endMs = validDate(end) ? end.getTime() : start.getTime() + 30 * 60 * 1000
    if (start.getTime() <= nowMs && nowMs < endMs) {
      current = starts[i].item
      break
    }
  }

  if (current) out[current.id] = 'now'

  const next = starts
    .filter((x) => validDate(x.start) && x.start.getTime() > nowMs)
    .sort((a, b) => a.start!.getTime() - b.start!.getTime())[0]?.item
  if (next && next.id !== current?.id) out[next.id] = 'next'

  return out
}

function AppInner() {
  const user = useUserData()
  const { fx, saveRate } = useFxRate()
  const [view, setView] = useState<View>('schedule')
  const [now, setNow] = useState(() => new Date())
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 첫 진입 시 '첫 미완료 Day'를 기본 선택
  const [selectedDay, setSelectedDay] = useState(() => firstIncompleteDay(user))
  const [mode, setMode] = useState<TransportMode>(
    () =>
      (trip.days.find((d) => d.day === firstIncompleteDay(user)) ?? trip.days[0])
        .defaultTransportMode,
  )
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedLeg, setSelectedLeg] = useState<LegSelection | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>('schedule')
  const [coords, setCoords] = useState<Map<string, LatLng>>(new Map())

  const day = useMemo(() => trip.days.find((d) => d.day === selectedDay) ?? trip.days[0], [selectedDay])
  const dayMappableItems = useMemo(() => mappableItems(day), [day])
  const points = useMemo(() => buildMappablePoints(day, coords), [day, coords])

  const hotels = useMemo(() => collectHotels(trip), [])
  const restaurants = useMemo(() => collectRestaurants(trip), [])

  // 탭 순서: 미완료 Day 먼저(일자 순), 완료(100%) Day는 맨 뒤로
  const orderedDays = useMemo(
    () => [
      ...trip.days.filter((d) => !isDayComplete(d.day, user)),
      ...trip.days.filter((d) => isDayComplete(d.day, user)),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.data],
  )

  const routesEnabled = !!API_KEY
  const summary = useRouteSummary(points, mode, API_KEY, routesEnabled)
  const highlights = useMemo(() => scheduleHighlights(day, now), [day, now])

  const progressTotal = dayMappableItems.length
  const progressDone = user.completedCount(dayMappableItems.map((i) => i.id))

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  // Day 선택 (탭): 이동수단 기본값 적용 + 선택 초기화
  function selectDay(dayNum: number) {
    const d = trip.days.find((x) => x.day === dayNum) ?? trip.days[0]
    setSelectedDay(dayNum)
    setMode(d.defaultTransportMode)
    setSelectedItemId(null)
    setSelectedLeg(null)
  }

  // 숙소/식당 개요에서 특정 항목 → 일정 뷰로 이동 + 강조
  function goToItem(dayNum: number, itemId: string) {
    const d = trip.days.find((x) => x.day === dayNum) ?? trip.days[0]
    setView('schedule')
    setSelectedDay(dayNum)
    setMode(d.defaultTransportMode)
    setSelectedItemId(itemId)
    setSelectedLeg(null)
    setMobileTab('schedule')
  }

  // 전체일정/탭에서 특정 Day → 단일 일정(지도) 뷰로 이동
  function openDay(dayNum: number) {
    setView('schedule')
    selectDay(dayNum)
  }

  // 각 Day 완료 상태 추적 (마운트 시 시드 → 마운트 중 오발동 방지)
  const dayCompleteRef = useRef<Record<number, boolean> | null>(null)
  if (dayCompleteRef.current === null) {
    const init: Record<number, boolean> = {}
    for (const dp of trip.days) {
      const ids = mappableItems(dp).map((i) => i.id)
      init[dp.day] = ids.length > 0 && user.completedCount(ids) === ids.length
    }
    dayCompleteRef.current = init
  }

  // 현재 보고 있는 Day의 장소를 모두 완료하면 자동으로 '첫 미완료 Day'로 이동 (일정 뷰에서만)
  useEffect(() => {
    const ref = dayCompleteRef.current!
    let selectedJustCompleted = false
    let firstIncomplete: number | null = null
    for (const dp of trip.days) {
      const ids = mappableItems(dp).map((i) => i.id)
      const complete = ids.length > 0 && user.completedCount(ids) === ids.length
      const was = ref[dp.day] ?? false
      if (!complete && firstIncomplete === null) firstIncomplete = dp.day
      if (dp.day === selectedDay && complete && !was) selectedJustCompleted = true
      ref[dp.day] = complete
    }
    if (
      view === 'schedule' &&
      selectedJustCompleted &&
      firstIncomplete != null &&
      firstIncomplete !== selectedDay
    ) {
      openDay(firstIncomplete)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.data, selectedDay, view])

  function mergeCoords(m: Map<string, LatLng>) {
    setCoords((prev) => {
      const next = new Map(prev)
      m.forEach((v, k) => next.set(k, v))
      return next
    })
  }

  function handleSelectItem(id: string) {
    setSelectedItemId(id)
    setSelectedLeg(null)
    setMobileTab('map')
  }

  function handleSelectLeg(fromId: string, toId: string) {
    setSelectedLeg({ fromId, toId })
    setSelectedItemId(null)
    setMobileTab('map')
  }

  function handleShowAll() {
    setSelectedItemId(null)
    setSelectedLeg(null)
  }

  const mapPane = API_KEY ? (
    <MapView
      points={points}
      legs={summary.legs}
      selectedItemId={selectedItemId}
      selectedLeg={selectedLeg}
      mode={mode}
      mapId={MAP_ID}
      onModeChange={setMode}
      onSelectItem={handleSelectItem}
      onShowAll={handleShowAll}
    />
  ) : (
    <MapFallback />
  )

  const schedulePane = (
    <ScheduleList
      day={day}
      points={points}
      summary={summary}
      highlights={highlights}
      selectedItemId={selectedItemId}
      selectedLeg={selectedLeg}
      mode={mode}
      fx={fx}
      user={user}
      onSelect={handleSelectItem}
      onSelectLeg={handleSelectLeg}
    />
  )

  return (
    <>
      {API_KEY && <GeocodeBridge items={dayMappableItems} onResolved={mergeCoords} />}
      <div className="app">
        <header className="app-header">
          <div className="brand">
            <span className="brand-flag" aria-hidden>🇮🇹</span>
            <span className="brand-title">{trip.title}</span>
            <span className="brand-dates">
              {trip.startDate.replace(/-/g, '.')} ~ {trip.endDate.replace(/-/g, '.')}
            </span>
            <nav className="view-switch" aria-label="보기 전환">
              <button
                className={view === 'schedule' || view === 'alldays' ? 'active' : ''}
                onClick={() => setView('schedule')}
              >
                🗒️ 일정
              </button>
              <button
                className={view === 'hotels' ? 'active' : ''}
                onClick={() => setView('hotels')}
              >
                🏨 숙소
              </button>
              <button
                className={view === 'restaurants' ? 'active' : ''}
                onClick={() => setView('restaurants')}
              >
                🍽️ 식당
              </button>
              <button
                className={view === 'placemap' ? 'active' : ''}
                onClick={() => setView('placemap')}
              >
                🗺️ 지도
              </button>
              <button
                className={view === 'attachments' ? 'active' : ''}
                onClick={() => setView('attachments')}
              >
                📎 첨부
              </button>
            </nav>
          </div>
          {(view === 'schedule' || view === 'alldays') && (
            <DayTabs
              days={orderedDays}
              selectedDay={selectedDay}
              allActive={view === 'alldays'}
              onSelect={openDay}
              onSelectAll={() => setView('alldays')}
            />
          )}
        </header>

        {view === 'schedule' && (
          <>
            <TopBar
              day={day}
              summary={summary}
              mode={mode}
              now={now}
              onModeChange={setMode}
              onShowAll={handleShowAll}
              onOpenSettings={() => setSettingsOpen(true)}
              progressDone={progressDone}
              progressTotal={progressTotal}
            />
            <SplitLayout
              left={schedulePane}
              right={mapPane}
              mobileTab={mobileTab}
              onMobileTabChange={setMobileTab}
            />
          </>
        )}

        {view === 'alldays' && <AllDaysView trip={trip} user={user} fx={fx} onGoToDay={openDay} />}

        {view === 'hotels' && <HotelsView hotels={hotels} onGoToItem={goToItem} />}
        {view === 'restaurants' && (
          <RestaurantsView
            restaurants={restaurants}
            user={user}
            fx={fx}
            onGoToItem={goToItem}
            diningTips={trip.diningTips}
          />
        )}
        {view === 'placemap' &&
          (API_KEY ? (
            <ItineraryMapView trip={trip} mapId={MAP_ID} onGoToItem={goToItem} />
          ) : (
            <MapFallback />
          ))}
        {view === 'attachments' && (
          <AttachmentsOverview trip={trip} user={user} onGoToItem={goToItem} />
        )}
        <SettingsPanel
          open={settingsOpen}
          fx={fx}
          onSaveRate={saveRate}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
    </>
  )
}

export default function App() {
  if (API_KEY) {
    return (
      <APIProvider apiKey={API_KEY} libraries={['geocoding', 'marker', 'maps', 'places', 'geometry']}>
        <AppInner />
      </APIProvider>
    )
  }
  return <AppInner />
}
