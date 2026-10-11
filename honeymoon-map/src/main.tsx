import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

// 새 배포(재패킹된 첨부·새 번들)가 서비스워커에 활성화되면 바로 새로고침한다.
// 그래야 열려 있던 옛 페이지가 새 첨부 파일을 받아 「파일을 찾을 수 없습니다」가 되지 않는다.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
