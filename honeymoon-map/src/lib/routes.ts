import type { ItemTransport, TransportMode } from '../types/trip'
import type { LatLng } from './geocode'

/**
 * Routes API (computeRoutes) 호출 + localStorage 캐싱 + 직선거리 폴백.
 * 지시서 §6: 같은 from-to-mode 재호출 방지를 위해 결과를 캐싱한다.
 */

export interface LegResult {
  distanceMeters: number
  durationSeconds: number
  /** 직선거리 추정값이면 true */
  estimated: boolean
  /** Routes API 가 돌려준 실제 경로(인코딩 폴리라인) */
  polyline?: string
}

const CACHE_KEY = 'honeymoon:routecache:v2'

type RouteCache = Record<
  string,
  { distanceMeters: number; durationSeconds: number; polyline?: string }
>

function loadCache(): RouteCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as RouteCache) : {}
  } catch {
    return {}
  }
}

function saveCache(cache: RouteCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* 무시 */
  }
}

function cacheKey(from: LatLng, to: LatLng, mode: TransportMode): string {
  const r = (n: number) => n.toFixed(5)
  return `${r(from.lat)},${r(from.lng)}>${r(to.lat)},${r(to.lng)}:${mode}`
}

const MODE_MAP: Record<TransportMode, string> = {
  walking: 'WALK',
  transit: 'TRANSIT',
  driving: 'DRIVE',
}

/** 하버사인 직선거리 (m) */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 이동수단별 대략 속도(m/s)와 우회계수 — 직선거리 추정용 */
const TRANSPORT_PROFILE: Record<ItemTransport, { speed: number; detour: number }> = {
  walking: { speed: 1.35, detour: 1.3 },
  transit: { speed: 6.5, detour: 1.3 },
  driving: { speed: 8.5, detour: 1.3 },
  taxi: { speed: 8.5, detour: 1.3 },
  train: { speed: 42, detour: 1.15 }, // 도시간 고속열차 ≈150km/h (정차 포함 실효)
  vaporetto: { speed: 4, detour: 1.2 }, // 수상버스 ≈14km/h
  flight: { speed: 220, detour: 1.05 }, // 합산에선 제외되지만 안전용
}

/** 좌표 기반 직선거리 추정 leg (API 미사용/실패 시). 구간의 실제 이동수단 속도를 사용 */
export function estimateLeg(from: LatLng, to: LatLng, transport: ItemTransport): LegResult {
  const profile = TRANSPORT_PROFILE[transport] ?? TRANSPORT_PROFILE.transit
  const straight = haversineMeters(from, to)
  const distanceMeters = Math.round(straight * profile.detour)
  return {
    distanceMeters,
    durationSeconds: Math.round(distanceMeters / profile.speed),
    estimated: true,
  }
}

function parseDuration(d: unknown): number | null {
  if (typeof d === 'number') return d
  if (typeof d === 'string') {
    const m = d.match(/(\d+(\.\d+)?)s/)
    if (m) return Math.round(parseFloat(m[1]))
    const n = Number(d)
    if (!Number.isNaN(n)) return n
  }
  return null
}

/**
 * Routes API 한 구간 호출. 키가 없으면 null 반환(→ 폴백).
 * 결과는 캐싱한다.
 */
export async function computeLeg(
  from: LatLng,
  to: LatLng,
  mode: TransportMode,
  apiKey: string | undefined,
): Promise<LegResult | null> {
  const key = cacheKey(from, to, mode)
  const cache = loadCache()
  if (cache[key]) {
    return { ...cache[key], estimated: false }
  }

  if (!apiKey) return null

  try {
    const body: Record<string, unknown> = {
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: MODE_MAP[mode],
      polylineQuality: 'HIGH_QUALITY',
    }
    if (mode === 'driving') {
      body.routingPreference = 'TRAFFIC_UNAWARE'
    }

    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // 실제 경로 좌표(encodedPolyline)까지 함께 요청 — 추가 호출 없음
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) return null
    const json = await res.json()
    const route = json?.routes?.[0]
    if (!route) return null

    const distanceMeters = typeof route.distanceMeters === 'number' ? route.distanceMeters : null
    const durationSeconds = parseDuration(route.duration)
    if (distanceMeters == null || durationSeconds == null) return null
    const polyline: string | undefined = route.polyline?.encodedPolyline

    cache[key] = { distanceMeters, durationSeconds, polyline }
    saveCache(cache)
    return { distanceMeters, durationSeconds, estimated: false, polyline }
  } catch {
    return null
  }
}

// ── 표시용 포매터 ──────────────────────────────────────────────────────────

export function formatDistance(meters: number | null): string {
  if (meters == null) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min}분`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}시간 ${m}분` : `${h}시간`
}
