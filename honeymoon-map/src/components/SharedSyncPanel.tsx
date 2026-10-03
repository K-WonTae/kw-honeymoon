import { useState } from 'react'
import { connectShared, disconnectShared, synchronize, useSharedSync } from '../lib/sharedSync'
import { unlock } from '../lib/builtinAttachments'

export function SharedSyncPanel() {
  const sync = useSharedSync()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function connect(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await connectShared(password.trim())
      await unlock(password.trim())
      setPassword('')
    } catch (e) { setError(e instanceof Error ? e.message : '연결 실패') }
    finally { setBusy(false) }
  }
  return <section className="shared-sync-panel" aria-label="기기 간 공유">
    <div className="shared-sync-head"><strong>☁️ PC · 휴대폰 함께 보기</strong><span role="status">{sync.message}</span></div>
    {sync.phase === 'locked' && <form className="attach-lock-row" onSubmit={connect}>
      <input className="attach-lock-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        placeholder="기존 첨부 암호" aria-label="공유 암호" autoComplete="current-password" />
      <button type="submit" className="btn" disabled={busy || !password.trim()}>{busy ? '연결 중…' : '공유 연결'}</button>
    </form>}
    {sync.phase === 'setup' && <p>Vercel 프로젝트의 Storage에서 <strong>Private Blob</strong> 저장소를 연결하고 다시 배포하면 사용할 수 있습니다.</p>}
    {sync.phase !== 'locked' && sync.phase !== 'setup' && <div className="shared-sync-actions">
      <button className="btn btn-ghost btn-sm" onClick={() => { void synchronize() }}>지금 동기화</button>
      {sync.phase === 'synced' && <button className="btn btn-ghost btn-sm" onClick={async () => {
        try { await disconnectShared() } catch (e) { setError((e as Error).message) }
      }}>이 기기 공유 연결 끊기</button>}
    </div>}
    {sync.pending > 0 && <p>공유 대기 변경 {sync.pending}건 · 이 기기에 보관되어 있습니다.</p>}
    {error && <p className="attach-lock-error" role="alert">{error}</p>}
    {sync.phase === 'locked' && <p>PC와 휴대폰에서 같은 암호를 한 번 입력하세요. 기존 예약 체크·메모·첨부도 자동으로 옮깁니다.</p>}
  </section>
}
