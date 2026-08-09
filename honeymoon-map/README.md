# 🇮🇹 이탈리아 허니문 9일 · 여행 동선 웹앱

2026.10.19 ~ 10.27 부산↔인천↔로마·피렌체·베네치아·밀라노 2인 신혼여행 동선을, 여행 현장에서
휴대폰으로 바로 열어 쓰도록 만든 인터랙티브 지도/일정 웹앱입니다.

- **왼쪽 일정표 · 오른쪽 지도**의 좌우 분할 화면 (드래그로 너비 조절, 모바일은 탭 전환)
- Day 1~9 전체 30분 단위 일정, 장소 유형·예약 뱃지, 경고 카드, 예약 멘트(EN/IT) 복사
- 번호 마커 + 전체 경로 Polyline + 장소/구간 강조 + 전체보기/현재위치/구간보기/이동수단 토글
- 일정표 ↔ 지도 양방향 연동, 구간별·전체 거리/시간(Routes API, 캐싱, 키 없을 때 폴백)
- 방문 체크 · 메모 · 체크리스트는 `localStorage`에 영속화
- Google Maps 네비 실행 버튼(새 탭, 현재 위치 기준, 이동수단 반영)

## 기술 스택

- Vite + React + TypeScript
- 지도: Google Maps Platform (Maps JavaScript API + Routes API + Places/Geocoding)
- 지도 React 연동: [`@vis.gl/react-google-maps`](https://visgl.github.io/react-google-maps/)

## 실행 방법

```bash
npm install
cp .env.example .env     # 키를 넣을 .env 생성 (Windows: copy .env.example .env)
npm run dev              # http://localhost:5173
```

빌드/미리보기:

```bash
npm run build
npm run preview
```

> **API 키가 없어도 실행됩니다.** 지도와 거리/시간 자동계산만 비활성화되고, 일정표·예약
> 멘트·체크리스트·네비 버튼·방문 체크는 그대로 동작합니다(지시서 폴백 원칙).

## Google Maps API 키 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들고 결제를 연결합니다.
2. 다음 API를 **사용 설정**합니다.
   - Maps JavaScript API
   - Routes API
   - Geocoding API (좌표 없는 장소 런타임 지오코딩용)
   - Places API (선택, 향후 장소 검색/추가용)
3. **API 및 서비스 → 사용자 인증 정보**에서 API 키를 발급합니다.
4. 프로젝트 루트의 `.env`에 키를 넣습니다.

   ```env
   VITE_GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE
   # (선택) Advanced Marker 전용 Map ID. 없으면 비워두면 DEMO_MAP_ID 사용
   VITE_GOOGLE_MAPS_MAP_ID=
   ```

### 보안: Google Cloud Console 제한 설정 (권장)

- **애플리케이션 제한 → HTTP 리퍼러**: 배포 도메인과 `http://localhost:5173/*` 만 허용
- **API 제한**: 위 4개 API로만 제한
- **개발용/운영용 키 분리**: dev 키는 localhost, prod 키는 운영 도메인으로
- 키는 절대 커밋하지 않습니다(`.env`는 `.gitignore`에 포함됨). 클라이언트 키는 브라우저에 노출되므로
  리퍼러·API 제한이 사실상의 보안선입니다.

## 데이터 / 폴더 구조

```
src/
├─ data/trip.json           # 9일 전체 변환 데이터 (핵심 산출물)
├─ types/trip.ts            # 통합 데이터 타입 (단일 기준)
├─ lib/
│  ├─ routes.ts             # Routes API 호출 + localStorage 캐싱 + 직선거리 폴백
│  ├─ navUrl.ts             # Google Maps 길찾기/검색 URL 생성
│  ├─ geocode.ts            # placeId/placeName → 좌표 런타임 지오코딩(캐싱)
│  └─ tripUtils.ts          # 마커 포인트 빌드 · 뱃지/아이콘/색상 메타
├─ hooks/
│  ├─ useRouteSummary.ts    # 구간별·전체 거리/시간 계산
│  ├─ useUserData.ts        # 방문 체크·메모·체크리스트 (localStorage)
│  └─ useLocalStorage.ts
├─ components/
│  ├─ SplitLayout.tsx       # 좌우 분할 + 드래그 리사이즈 + 모바일 탭
│  ├─ DayTabs.tsx · TopBar.tsx
│  ├─ Schedule/             # ScheduleList · ScheduleCard · AlertCard · ReservationBox
│  └─ MapView/              # MapView · NumberedMarker · MapControls
├─ App.tsx · main.tsx
```

데이터 모델·변환 규칙·새 일정 추가 절차는 [`CLAUDE.md`](./CLAUDE.md)에 정리되어 있습니다.

## 비고

- 마커/경로/거리·시간은 **`mappable: true` 항목만** 대상으로 합니다(`기상/조식/비행/취침` 등은
  일정표에만 표시).
- 좌표가 비어 있는 mappable 항목은 `placeId`(우선) 또는 `placeName`으로 런타임 지오코딩하며,
  결과는 `localStorage`에 캐싱합니다.
- Routes API 결과도 `from-to-mode` 키로 캐싱해 재호출 비용을 줄입니다.
- 운영 시간·휴무·환율은 시즌/임시휴무로 변동될 수 있으니 출발 1주 전 재확인하세요.
