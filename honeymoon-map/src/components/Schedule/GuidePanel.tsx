import { useState, type ReactNode } from 'react'
import type { DayGuide, GuideBlock, GuideSection } from '../../types/trip'
import { useLocalStorage } from '../../hooks/useLocalStorage'

interface Props {
  day: number
  guide: DayGuide
}

const CHECK_KEY = 'honeymoon:guidecheck:v1'

/** `[텍스트](url)` 링크와 `**굵게**` 만 푸는 아주 작은 인라인 렌더러 — 가이드 문장은 이 둘만 쓴다 */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) {
      out.push(
        <a key={k++} href={m[2]} target="_blank" rel="noopener noreferrer">
          {m[1]}
        </a>,
      )
    } else {
      out.push(<strong key={k++}>{m[3]}</strong>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Block({
  block,
  checkId,
  checked,
  onToggle,
}: {
  block: GuideBlock
  checkId: string
  checked: Record<string, boolean>
  onToggle: (key: string) => void
}) {
  return (
    <div className="guide-block">
      {block.title && <h5 className="guide-block-title">{block.title}</h5>}
      {block.paragraphs?.map((p, i) => (
        <p key={`p${i}`} className="guide-p">
          {renderInline(p)}
        </p>
      ))}
      {block.table && (
        <div className="guide-table-wrap">
          <table className="guide-table">
            <thead>
              <tr>
                {block.table.columns.map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    // data-label: 폰 너비에선 표를 세로로 쌓고 열 이름을 앞에 붙인다 (styles.css)
                    <td key={ci} data-label={block.table!.columns[ci]}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {block.bullets && block.bullets.length > 0 && (
        <ul className="guide-bullets">
          {block.bullets.map((b, i) => (
            <li key={i}>{renderInline(b)}</li>
          ))}
        </ul>
      )}
      {block.checklist && block.checklist.length > 0 && (
        <ul className="guide-checklist">
          {block.checklist.map((c, i) => {
            const key = `${checkId}/${i}`
            const done = !!checked[key]
            return (
              <li key={i} className={done ? 'checked' : ''}>
                <label>
                  <input type="checkbox" checked={done} onChange={() => onToggle(key)} />
                  <span>{renderInline(c)}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Section({
  day,
  section,
  checked,
  onToggle,
}: {
  day: number
  section: GuideSection
  checked: Record<string, boolean>
  onToggle: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  // 이 섹션의 체크리스트 진행률 (칩에 "3/6" 로 보여준다)
  let total = 0
  let done = 0
  section.blocks.forEach((b, bi) => {
    b.checklist?.forEach((_, i) => {
      total++
      if (checked[`${day}/${section.id}/${bi}/${i}`]) done++
    })
  })

  return (
    <section className={`guide-section ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="guide-section-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="guide-section-icon" aria-hidden>
          {section.icon}
        </span>
        <span className="guide-section-head">
          <span className="guide-section-title">{section.title}</span>
          {section.summary && <span className="guide-section-summary">{section.summary}</span>}
        </span>
        {total > 0 && (
          <span className={`guide-section-progress ${done === total ? 'done' : ''}`}>
            {done}/{total}
          </span>
        )}
        <span className="guide-section-caret" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="guide-section-body">
          {section.blocks.map((b, bi) => (
            <Block
              key={bi}
              block={b}
              checkId={`${day}/${section.id}/${bi}`}
              checked={checked}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * 완벽 가이드 — 일정(items) 을 뺀 나머지 전부(투어 정보·이동수단·예산·꿀팁·이탈리아어·체크리스트…)를
 * 섹션별 아코디언으로. DayBrief 본문 맨 아래에 붙는다. 체크리스트만 기기에 저장한다.
 */
export function GuidePanel({ day, guide }: Props) {
  const [checked, setChecked] = useLocalStorage<Record<string, boolean>>(CHECK_KEY, {})
  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="guide-panel">
      <div className="guide-panel-head">
        <span aria-hidden>📖</span> 완벽 가이드
        {guide.source && <span className="guide-panel-source">{guide.source}</span>}
      </div>
      <div className="guide-sections">
        {guide.sections.map((s) => (
          <Section key={s.id} day={day} section={s} checked={checked} onToggle={toggle} />
        ))}
      </div>
    </div>
  )
}
