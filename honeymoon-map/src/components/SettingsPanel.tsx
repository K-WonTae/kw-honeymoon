import { useEffect, useRef, useState } from 'react'
import type { FxSetting } from '../lib/money'
import { createBackup, downloadBackupFile, parseBackupFile, restoreBackup } from '../lib/backup'
import { lock, useAttachmentLock } from '../lib/builtinAttachments'
import { AttachmentLock } from './AttachmentLock'

interface Props {
  open: boolean
  fx: FxSetting
  onSaveRate: (rate: number) => void
  onClose: () => void
}

export function SettingsPanel({ open, fx, onSaveRate, onClose }: Props) {
  const [rateDraft, setRateDraft] = useState(String(fx.eurToKrw))
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { unlocked, total: builtinTotal } = useAttachmentLock()

  useEffect(() => {
    if (open) setRateDraft(String(fx.eurToKrw))
  }, [open, fx.eurToKrw])

  if (!open) return null

  function saveRate() {
    const n = Number(rateDraft)
    if (!Number.isFinite(n) || n <= 0) {
      alert('환율은 0보다 큰 숫자로 입력해 주세요.')
      return
    }
    onSaveRate(n)
  }

  async function exportBackup() {
    setBusy(true)
    try {
      downloadBackupFile(await createBackup())
    } catch (e) {
      alert('백업 내보내기 실패: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function importBackup(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const backup = await parseBackupFile(file)
      const ok = window.confirm(
        '기존 방문체크·메모·예약상태·환율·첨부파일을 모두 덮어씁니다. 계속할까요?',
      )
      if (!ok) return
      await restoreBackup(backup)
      alert('백업을 가져왔습니다. 화면을 새로고침합니다.')
      window.location.reload()
    } catch (e) {
      alert('백업 가져오기 실패: ' + (e as Error).message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="settings-backdrop" role="dialog" aria-modal="true" aria-label="설정">
      <div className="settings-panel">
        <div className="settings-head">
          <h2>⚙️ 설정</h2>
          <button className="settings-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <section className="settings-section">
          <h3>환율 설정</h3>
          <p className="settings-help">실시간 환율 API 없이 오프라인에서도 쓰도록 수동 환율을 사용합니다.</p>
          <label className="fx-input-row">
            <span>1 EUR =</span>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={rateDraft}
              onChange={(e) => setRateDraft(e.target.value)}
            />
            <span>KRW</span>
            <button className="btn btn-showall" onClick={saveRate}>
              저장
            </button>
          </label>
          <p className="settings-help">
            현재 저장값: €1 = ₩{fx.eurToKrw.toLocaleString('ko-KR')} · 갱신{' '}
            {new Date(fx.updatedAt).toLocaleString('ko-KR')}
          </p>
          <p className="settings-help warn">환율은 참고용입니다. 출발 전 최신 환율로 갱신하세요.</p>
        </section>

        {builtinTotal > 0 && (
          <section className="settings-section">
            <h3>내장 첨부 잠금</h3>
            <p className="settings-help">
              티켓·바우처 {builtinTotal}개는 앱에 함께 들어 있어 어느 기기에서 열어도 보입니다.
              암호로 잠겨 있어 사이트 주소만으로는 열 수 없습니다.
            </p>
            {unlocked ? (
              <div className="settings-actions">
                <span className="settings-help">🔓 이 기기에서는 열려 있습니다.</span>
                <button className="btn btn-ghost" onClick={lock}>
                  이 기기에서 잠그기
                </button>
              </div>
            ) : (
              <AttachmentLock total={builtinTotal} />
            )}
          </section>
        )}

        <section className="settings-section">
          <h3>백업 / 가져오기</h3>
          <p className="settings-help">
            방문체크·메모·체크리스트·예약상태·환율·첨부파일을 JSON 파일 하나로 저장합니다.
            Google Places 평점/사진/영업시간과 지도 캐시는 포함하지 않습니다.
          </p>
          <div className="settings-actions">
            <button className="btn" onClick={exportBackup} disabled={busy}>
              백업 내보내기
            </button>
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
              백업 가져오기
            </button>
            {/* accept 를 걸면 폰 파일 선택창에서 백업 JSON 이 회색으로 잠겨 못 고르는 일이 있어
                형식 제한은 두지 않고 parseBackupFile 에서 내용으로 검사한다. */}
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(e) => importBackup(e.target.files?.[0])}
            />
          </div>
          <p className="settings-help warn">
            가져오기는 기존 데이터를 덮어씁니다. 티켓 PDF 원본은 구글 드라이브/메일에도 따로 보관하세요.
          </p>
        </section>
      </div>
    </div>
  )
}
