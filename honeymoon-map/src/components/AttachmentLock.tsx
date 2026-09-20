import { useState } from 'react'
import { unlock } from '../lib/builtinAttachments'

interface Props {
  /** 잠겨 있는 내장 첨부 개수 */
  total: number
}

/** 내장 첨부(배포에 함께 올라간 암호화 티켓) 잠금 해제 카드. 암호는 이 기기에 기억된다. */
export function AttachmentLock({ total }: Props) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const pw = password.trim()
    if (!pw) return
    setBusy(true)
    setFailed(false)
    const ok = await unlock(pw)
    setBusy(false)
    if (ok) setPassword('')
    else setFailed(true)
  }

  return (
    <form className="attach-lock" onSubmit={submit}>
      <div className="attach-lock-main">
        <strong>🔒 티켓·바우처 {total}개가 잠겨 있습니다</strong>
        <span>
          암호를 한 번 입력하면 이 기기에 기억됩니다. 폰·PC 어디서 열어도 같은 파일이 보입니다.
        </span>
      </div>
      <div className="attach-lock-row">
        <input
          type="password"
          className="attach-lock-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="암호"
          autoComplete="current-password"
          aria-label="첨부 암호"
        />
        <button type="submit" className="btn" disabled={busy || !password.trim()}>
          {busy ? '여는 중…' : '열기'}
        </button>
      </div>
      {failed && <p className="attach-lock-error">암호가 맞지 않습니다.</p>}
    </form>
  )
}
