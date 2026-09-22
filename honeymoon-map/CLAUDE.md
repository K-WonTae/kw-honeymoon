# CLAUDE.md — 프로젝트 컨벤션

이후 세션에서도 일관되게 유지할 규칙입니다. (지시서_00 §8)

## 데이터 모델

- **단일 기준은 [`src/types/trip.ts`](./src/types/trip.ts)** 입니다. `Trip → DayPlan → ScheduleItem / Reservation`.
- 실제 데이터는 [`src/data/trip.json`](./src/data/trip.json) 하나에 9일 전체가 동일 스키마로 들어 있습니다.
  새 일정/장소를 추가할 때도 **반드시 이 스키마**를 따릅니다(별도 데이터 모델을 새로 만들지 않음).
- 추후 DB 확장 시에도 이 타입을 진실의 원천으로 삼고 테이블을 그에 맞춥니다.

## 지도에 찍는 대상 — `mappable`

- 지도 마커·경로·거리/시간 계산은 **`mappable: true` 항목만** 대상으로 합니다.
- `mappable: true` : 공항·기차역·호텔·식당·카페/젤라또·관광지·투어 미팅·쇼핑/시장 등 **물리적 장소**.
- `mappable: false` : `기상·준비`, `호텔 조식`, `비행`, `환승`, `보안검색`, `취침`, `짐 보관/픽업`,
  `체크아웃` 등 좌표가 없는 행 → 일정표에만 표시. **애매하면 false** (지도 정돈 우선).
- **마커 번호**는 "그 날 좌표가 확보된 mappable 항목들의 순서"로 1부터 다시 매깁니다
  (일정 카드의 `sequence`와 별개). 카드↔마커 연동은 `item.id`로 합니다.
  → 계산은 `lib/tripUtils.ts`의 `buildMappablePoints()`가 담당.

## 좌표 / Place ID 채우는 규칙 (지시서 §5.2)

1. **호텔·식당**: 참고문서의 Google Maps 링크에서 `query_place_id` 값을 `placeId`로 넣고
   `lat/lng`는 `null` → 런타임 지오코딩. (예: Hotel Diocleziano → `ChIJcclrH6dhLxMRewY0e7iKP-A`)
2. **관광지·공항·역**: `placeId`는 비우고 `placeName`을 **구글에서 검색되는 정식 명칭**으로
   정확히 적어 런타임 지오코딩되게 합니다. (예: `"Colosseo, Roma"`, `"Duomo di Milano"`)
3. 그래도 못 찾으면 `lat/lng = null`, `placeId` 없음으로 두되 `mappable`은 유지 →
   지오코딩 실패 시 마커는 자동으로 **건너뜁니다**(`buildMappablePoints`).

## API 키 / 캐싱 / 폴백

- API 키는 **`.env`의 `VITE_GOOGLE_MAPS_API_KEY`로만** 주입. 코드에 하드코딩 금지.
- **Routes API 결과는 캐싱**합니다(`lib/routes.ts`, `localStorage` 키 `honeymoon:routecache:v1`,
  `from-to-mode` 키). 지오코딩 결과도 `honeymoon:geocache:v1`에 캐싱.
- **폴백 원칙: 지도가 실패해도 일정표는 항상 보인다.**
  - 키 없음/로드 실패 → 지도 영역은 안내 폴백, 일정표·예약 멘트·체크리스트·네비 버튼·방문 체크는 정상.
  - Routes API 미사용 시 거리/시간은 좌표가 있으면 **직선거리 추정값**(라벨에 ‘추정’ 명시), 없으면 `—`.
- 사용자 입력(방문 체크·메모·체크리스트)은 `localStorage`(`honeymoon:userdata:v1`)에 영속화.

## 네비 실행 URL (`lib/navUrl.ts`)

```
https://www.google.com/maps/dir/?api=1&destination={lat,lng | 인코딩 주소}
  &destination_place_id={placeId?}&travelmode={walking|transit|driving}
```

- origin은 비워 **현재 위치 기준**으로 열리게 하고, **새 탭**으로 엽니다.
- 항목 세부 이동수단(train/taxi/vaporetto/flight)은 `toTravelMode()`로 3종 travelmode에 매핑.

## 새 Day / 장소 추가 절차

1. `src/data/trip.json`의 `days[]`에 `DayPlan`을 추가(또는 기존 Day의 `items[]`에 행 추가).
   `id`는 `D{day}-{2자리 sequence}` 규칙, `sequence`는 그 날 시간 순.
2. 물리적 장소면 `mappable: true` + `type` 지정. 좌표 규칙(위 §)에 따라 `placeId` 또는 `placeName` 채움.
3. 식당/호텔이면 같은 Day의 `reservations[]`에 `Reservation`(예약 필요도·시점·EN/IT 멘트) 추가.
4. 경고가 필요하면 `alerts[]`에 한 줄. 비용은 `estimatedCostForTwo`(Day) / `estimatedCost`(항목, EUR·2인 기준).
   현금은 `cashForTwo`(Day, EUR·2인) + `cashNote`(어디에 쓰는지 한 줄). **`cashForTwo`는 그 날 예상비용 중
   "카드가 안 되거나 현금이 훨씬 편한 몫"만** 담습니다(전체 비용의 부분집합, 별도 합산 아님).
   `cashForTwo >= 100`이면 UI가 자동으로 주황 경고색으로 승격합니다.
5. 타입이 맞는지 `npm run build`(= `tsc -b && vite build`)로 확인.

## 완벽 가이드 — `guide` (일정 위 접이식 요약 안)

- `완벽가이드/D* … 완벽 가이드.md` 는 **타임라인만 `items[]` 로**, 나머지(투어 정보·확인 목록·변동 대응표·
  이동수단·상세·예산·꿀팁·이탈리아어·체크리스트·출처)는 **전부 `DayPlan.guide.sections[]`** 에 넣습니다.
  일정 탭에서 일정 카드 외의 모든 안내는 `DayBrief`(주의·비용·현금·숙소·📒 예약&멘트·📖 가이드) 한 곳에만
  둡니다. 예약&멘트(`ReservationBox embedded`)는 가이드가 없는 날에도 모든 날에 접이식 한 칸으로 들어갑니다.
- `GuideSection { id, icon, title, summary, blocks[] }` · `GuideBlock { title?, paragraphs?, bullets?, checklist?, table? }`.
  표는 `columns` 길이와 모든 `rows[i]` 길이가 같아야 하고, 문장 안의 `[텍스트](url)`·`**굵게**` 만 렌더됩니다.
  원문의 인라인 「([출처](url))」 표기는 본문에서 빼고 `sources` 섹션에 링크로 모읍니다.
- 가이드 체크리스트의 체크 상태는 `localStorage` `honeymoon:guidecheck:v1`
  (`{day}/{sectionId}/{blockIdx}/{itemIdx}` → boolean). 섹션 `id` 를 바꾸면 체크가 초기화됩니다.
- **item `id` 는 내장 첨부의 키**입니다(`attachments.json` 은 암호화돼 있어 재패킹 없이는 못 고침).
  현재 첨부가 걸린 id: `D1-01 D1-19 D4-08 D5-22 D6-07 D7-18 D9-02`. 일정을 재구성할 때 이 id 의
  의미(D4-08 = 피렌체 호텔 도착, D5-22 = La Giostra)가 유지되게 항목을 합치거나 나눕니다.

## 충돌 시 우선순위 (지시서 §10)

- **모델·범위**: 지시서_00 → **기능 동작**: `개발.md` → **데이터 값·문구·금액**: `참고문서.md`.
