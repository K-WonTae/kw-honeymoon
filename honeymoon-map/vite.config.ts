import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 등록은 main.tsx 의 virtual:pwa-register 로 — 새 버전이 활성화되면 자동 새로고침해
      // 옛 페이지(옛 첨부 목록·키)가 새 첨부 파일을 받아 못 여는 상태를 막는다.
      injectRegister: null,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: '이탈리아 허니문',
        short_name: '허니문',
        description: '이탈리아 허니문 9일 일정',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // bin = 암호화된 내장 첨부. 현지에서 데이터가 안 터져도 티켓을 열 수 있도록 미리 캐시한다.
        globPatterns: ['**/*.{js,css,html,json,ico,png,svg,woff2,bin}'],
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/(maps\.googleapis\.com|maps\.gstatic\.com)\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // 같은 네트워크(LAN)의 다른 기기에서 접속 가능하도록 외부 인터페이스에 바인딩.
  // dev: `npm run dev`, 빌드 미리보기: `npm run preview` 모두 노출.
  server: { host: true },
  preview: { host: true },
})
