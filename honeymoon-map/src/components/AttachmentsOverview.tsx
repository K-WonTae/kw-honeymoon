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

/** 첨부가 붙어 있는 일정 카드 하나 */
interface AttachmentLink {
  day: number
  itemId: string
  itemTitle: string
  time: string
}

/** 목록의 한 줄 = 파일 하나. 같은 파일이 여러 카드에 걸려 있으면(왕복 e-티켓 등) links 가 여럿 */
interface AttachmentEntry {
  /** 목록에서 이 파일을 보여줄 Day (처음 걸린 카드의 날) */
  day: number
  meta: AnyAttachmentMeta
  links: AttachmentLink[]
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
    // 같은 파일(같은 id)이 여러 카드에 걸려 있으면 한 줄로 모은다 — 예: 왕복 e-티켓은 출국·귀국 카드 양쪽
    const byId = new Map<string, AttachmentEntry>()
    for (const day of trip.days) {
      for (const item of day.items) {
        for (const meta of mergeAttachments(item.id, user.getAttachments(item.id))) {
          const link: AttachmentLink = {
            day: day.day,
            itemId: item.id,
            itemTitle: item.title,
            time: itemTime(item.startTime, item.endTime),
          }
          const existing = byId.get(meta.id)
          if (existing) existing.links.push(link)
          else byId.set(meta.id, { day: day.day, meta, links: [link] })
        }
      }
    }
    return [...byId.values()]
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
        const blob = await loadAttachmentBlob(meta).catch(() => null)
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
    const blob = cached ? null : await loadAttachmentBlob(meta).catch((e) => { alert((e as Error).message); return null })
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
    for (const link of entry.links) user.removeAttachment(link.itemId, entry.meta.id)
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
                        {entry.links[0].time} · {entry.links[0].itemTitle} · {fmtSize(entry.meta.size)}
                        {entry.links.length > 1 &&
                          ` · Day ${entry.links
                            .slice(1)
                            .map((link) => link.day)
                            .join('·')} 카드에도`}
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
                      {entry.links.map((link) => (
                        <button
                          key={link.itemId}
                          type="button"
                          className="attach-btn"
                          onClick={() => onGoToItem(link.day, link.itemId)}
                          title={`${link.time} ${link.itemTitle}`}
                        >
                          {entry.links.length > 1 ? `D${link.day} 일정` : '일정'}
                        </button>
                      ))}
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
