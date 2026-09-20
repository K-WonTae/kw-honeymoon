import { useEffect, useMemo, useState } from 'react'
import type { Trip } from '../types/trip'
import type { UserDataApi } from '../hooks/useUserData'
import { deleteBlob } from '../lib/attachments'
import {
  loadAttachmentBlob,
  mergeAttachments,
  useAttachmentLock,
  type AnyAttachmentMeta,
} from '../lib/builtinAttachments'
import { AttachmentLock } from './AttachmentLock'
import { AttachmentViewer, useAttachmentViewer } from './AttachmentViewer'

interface Props {
  trip: Trip
  user: UserDataApi
  onGoToItem: (day: number, itemId: string) => void
}

interface AttachmentEntry {
  day: number
  date: string
  weekday: string
  city: string
  itemId: string
  itemTitle: string
  time: string
  meta: AnyAttachmentMeta
}

function iconFor(type: string): string {
  if (type.startsWith('image/')) return '🖼️'
  if (type === 'application/pdf') return '📄'
  return '📎'
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function itemTime(startTime: string, endTime?: string): string {
  return endTime ? `${startTime}~${endTime}` : startTime
}

export function AttachmentsOverview({ trip, user, onGoToItem }: Props) {
  const { unlocked, total: builtinTotal } = useAttachmentLock()

  const entries = useMemo<AttachmentEntry[]>(() => {
    return trip.days.flatMap((day) =>
      day.items.flatMap((item) =>
        mergeAttachments(item.id, user.getAttachments(item.id)).map((meta) => ({
          day: day.day,
          date: day.date,
          weekday: day.weekday,
          city: day.city,
          itemId: item.id,
          itemTitle: item.title,
          time: itemTime(item.startTime, item.endTime),
          meta,
        })),
      ),
    )
    // unlocked: 암호가 풀리면 내장 첨부가 목록에 합류한다
  }, [trip, user, unlocked])

  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const attachmentKey = entries.map((entry) => entry.meta.id).join(',')

  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    ;(async () => {
      const next: Record<string, string> = {}
      for (const entry of entries) {
        const meta = entry.meta
        if (!meta.type.startsWith('image/')) continue
        const blob = await loadAttachmentBlob(meta)
        if (cancelled) break
        if (blob) {
          const url = URL.createObjectURL(blob)
          created.push(url)
          next[meta.id] = url
        }
      }
      if (!cancelled) setThumbs(next)
    })()
    return () => {
      cancelled = true
      created.forEach((url) => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentKey])

  // 보기는 앱 안 뷰어로 (새 탭은 팝업 차단·PWA·모바일에서 안 열림)
  const { viewing, view, closeViewer } = useAttachmentViewer(thumbs)

  async function downloadBlob(meta: AnyAttachmentMeta) {
    const cached = thumbs[meta.id]
    const blob = cached ? null : await loadAttachmentBlob(meta)
    const url = cached ?? (blob ? URL.createObjectURL(blob) : null)
    if (!url) {
      alert('파일을 찾을 수 없습니다.')
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.download = meta.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (!cached) window.setTimeout(() => URL.revokeObjectURL(url), 8000)
  }

  async function onRemove(entry: AttachmentEntry) {
    try {
      await deleteBlob(entry.meta.id)
    } catch {
      /* 무시 */
    }
    user.removeAttachment(entry.itemId, entry.meta.id)
  }

  const grouped = useMemo(() => {
    return trip.days
      .map((day) => ({
        day,
        entries: entries.filter((entry) => entry.day === day.day),
      }))
      .filter((group) => group.entries.length > 0)
  }, [entries, trip.days])

  return (
    <div className="overview attachments-overview">
      <div className="overview-head">
        <h2>📎 첨부 {entries.length}개</h2>
        <p className="overview-sub">
          Day별로 올린 티켓, 바우처, QR, PDF를 한 화면에서 확인하고 바로 열 수 있습니다.
        </p>
      </div>

      {!unlocked && builtinTotal > 0 && <AttachmentLock total={builtinTotal} />}

      {grouped.length === 0 && (unlocked || builtinTotal === 0) ? (
        <div className="attachment-empty-state">
          <strong>아직 올린 첨부파일이 없습니다.</strong>
          <span>각 일정 카드의 메모 버튼을 열어 티켓, 바우처, QR, PDF를 추가해두면 여기서 모아볼 수 있습니다.</span>
        </div>
      ) : (
        <div className="attachments-day-list">
          {grouped.map(({ day, entries: dayEntries }) => (
            <section key={day.day} className="attachment-day">
              <div className="attachment-day-head">
                <div>
                  <h3>
                    Day {day.day} · {day.city}
                  </h3>
                  <p>
                    {day.date.replace(/-/g, '.')} ({day.weekday}) · {day.title}
                  </p>
                </div>
                <span className="attachment-count">{dayEntries.length}개</span>
              </div>

              <div className="attachment-files">
                {dayEntries.map((entry) => (
                  <article key={entry.meta.id} className="attachment-file">
                    {thumbs[entry.meta.id] ? (
                      <img
                        className="attachment-preview"
                        src={thumbs[entry.meta.id]}
                        alt={entry.meta.name}
                      />
                    ) : (
                      <span className="attachment-preview attachment-preview-icon" aria-hidden>
                        {iconFor(entry.meta.type)}
                      </span>
                    )}

                    <div className="attachment-file-main">
                      <span className="attachment-file-name" title={entry.meta.name}>
                        {entry.meta.name}
                      </span>
                      <span className="attachment-file-meta">
                        {entry.time} · {entry.itemTitle} · {fmtSize(entry.meta.size)}
                      </span>
                    </div>

                    <div className="attachment-file-actions">
                      <button type="button" className="attach-btn" onClick={() => view(entry.meta)}>
                        보기
                      </button>
                      <button
                        type="button"
                        className="attach-btn"
                        onClick={() => downloadBlob(entry.meta)}
                        title="다운로드"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        className="attach-btn"
                        onClick={() => onGoToItem(entry.day, entry.itemId)}
                      >
                        일정
                      </button>
                      {!entry.meta.builtin && (
                        <button
                          type="button"
                          className="attach-btn danger"
                          onClick={() => onRemove(entry)}
                          title="삭제"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {viewing && <AttachmentViewer meta={viewing.meta} url={viewing.url} onClose={closeViewer} />}
    </div>
  )
}
