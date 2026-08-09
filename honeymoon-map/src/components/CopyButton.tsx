import { useState } from 'react'

interface Props {
  text: string
  label: string
}

/** 클립보드 복사 버튼 (클립보드 API 미지원 시 execCommand 폴백) */
export function CopyButton({ text, label }: Props) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* 무시 */
      }
      document.body.removeChild(ta)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={onCopy}>
      {copied ? '✓ 복사됨' : `${label} 복사`}
    </button>
  )
}
