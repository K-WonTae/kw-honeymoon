import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
// 워커는 빌드 때 자산으로 복사돼 서비스워커가 미리 캐시한다 → 현지에서 데이터가 없어도 PDF 가 열린다.
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

// 첨부 PDF 를 앱 안에서 pdf.js 로 직접 그린다 (페이지별 캔버스, 폭 맞춤 · 확대/축소 · 두 번 탭 확대).
// <iframe> 은 안드로이드 크롬·아이폰 PWA 에서 빈 화면이나 다운로드로 빠져서 티켓 QR 을 못 보여 줬다.
// legacy 빌드를 쓰는 이유: 최신 빌드는 Safari 17.4 / Chrome 119 미만에서 Promise.withResolvers 가 없어 죽는다.

interface Props {
  /** 보기용 object URL (blob 이 없을 때 여기서 받는다) */
  url: string
  blob?: Blob
  name: string
  /** pdf.js 가 파일을 못 열면 호출 — 호출자는 iframe 등으로 폴백한다 */
  onFail: (reason: string) => void
}

type Pdfjs = typeof import('pdfjs-dist')
let pdfjsPromise: Promise<Pdfjs> | null = null
function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => {
      const lib = m as unknown as Pdfjs
      lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      return lib
    })
  }
  return pdfjsPromise
}

const ZOOM_STEPS = [0.75, 1, 1.5, 2, 3]
const GAP = 24 // 좌우 여백 합

interface PageInfo {
  page: PDFPageProxy
  /** scale 1 기준 크기 */
  width: number
  height: number
}

/** 페이지 하나 — 화면 근처에 오면 그린다. scale 이 바뀌면 다시 그린다. */
function PdfPage({
  info,
  number,
  scale,
  root,
}: {
  info: PageInfo
  number: number
  scale: number
  root: HTMLDivElement | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(number <= 2)
  const taskRef = useRef<RenderTask | null>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!el || !root || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setNear(true)),
      { root, rootMargin: '900px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [root])

  const cssWidth = Math.round(info.width * scale)
  const cssHeight = Math.round(info.height * scale)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !near) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const viewport = info.page.getViewport({ scale: scale * dpr })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    taskRef.current?.cancel()
    const task = info.page.render({ canvasContext: ctx, viewport, canvas })
    taskRef.current = task
    task.promise.catch(() => {
      /* 취소(스케일 변경) 또는 렌더 실패 — 다음 렌더가 덮어쓴다 */
    })
    return () => {
      task.cancel()
    }
  }, [info, scale, near])

  return (
    <div className="pdf-page" data-page={number} style={{ width: cssWidth, height: cssHeight }}>
      <canvas ref={canvasRef} style={{ width: cssWidth, height: cssHeight }} aria-label={`${number}쪽`} />
    </div>
  )
}

export function PdfViewer({ url, blob, name, onFail }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pages, setPages] = useState<PageInfo[]>([])
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [zoomIdx, setZoomIdx] = useState(1) // ZOOM_STEPS[1] = 폭 맞춤
  const [fitScale, setFitScale] = useState(1)
  const [current, setCurrent] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const lastTap = useRef(0)

  // 문서 열기
  useEffect(() => {
    let cancelled = false
    let opened: PDFDocumentProxy | null = null
    ;(async () => {
      try {
        const pdfjs = await loadPdfjs()
        const data = blob ? await blob.arrayBuffer() : await (await fetch(url)).arrayBuffer()
        const d = await pdfjs.getDocument({ data }).promise
        if (cancelled) {
          void d.destroy()
          return
        }
        opened = d
        const infos: PageInfo[] = []
        for (let n = 1; n <= d.numPages; n++) {
          const page = await d.getPage(n)
          const vp = page.getViewport({ scale: 1 })
          infos.push({ page, width: vp.width, height: vp.height })
          if (cancelled) return
        }
        setDoc(d)
        setPages(infos)
        setStatus('ready')
      } catch (e) {
        if (!cancelled) onFail((e as Error)?.message || String(e))
      }
    })()
    return () => {
      cancelled = true
      void opened?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, blob])

  // 폭 맞춤 배율 — 컨테이너 폭이 바뀌면(회전) 다시
  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el || pages.length === 0) return
    const maxW = Math.max(...pages.map((p) => p.width))
    const avail = Math.max(200, el.clientWidth - GAP)
    setFitScale(avail / maxW)
  }, [pages])
  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  // 현재 쪽 번호 — 스크롤 위치로
  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const mid = el.scrollTop + el.clientHeight / 2
    const nodes = el.querySelectorAll<HTMLElement>('.pdf-page')
    let n = 1
    nodes.forEach((node, i) => {
      if (node.offsetTop <= mid) n = i + 1
    })
    setCurrent(n)
  }

  const scale = fitScale * ZOOM_STEPS[zoomIdx]

  function zoom(delta: number) {
    setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + delta)))
  }

  // 두 번 탭: 폭 맞춤 ↔ 2배
  function onTap() {
    const now = Date.now()
    if (now - lastTap.current < 320) {
      setZoomIdx((i) => (i === 1 ? 3 : 1))
      lastTap.current = 0
    } else {
      lastTap.current = now
    }
  }

  return (
    <div className="pdf-viewer" data-pages={doc?.numPages ?? 0} data-status={status}>
      <div className="pdf-toolbar" role="toolbar" aria-label="PDF 보기">
        <span className="pdf-pagenum">
          {status === 'ready' ? `${current} / ${doc?.numPages ?? 0}쪽` : 'PDF 여는 중…'}
        </span>
        <span className="pdf-zoom">
          <button type="button" className="attach-btn" onClick={() => zoom(-1)} disabled={zoomIdx === 0} aria-label="축소">
            −
          </button>
          <button type="button" className="attach-btn" onClick={() => setZoomIdx(1)} aria-label="폭 맞춤">
            {Math.round(ZOOM_STEPS[zoomIdx] * 100)}%
          </button>
          <button
            type="button"
            className="attach-btn"
            onClick={() => zoom(1)}
            disabled={zoomIdx === ZOOM_STEPS.length - 1}
            aria-label="확대"
          >
            +
          </button>
        </span>
      </div>
      <div
        className={`pdf-pages ${ZOOM_STEPS[zoomIdx] > 1 ? 'zoomed' : ''}`}
        ref={(el) => {
          ;(scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el
          if (el !== root) setRoot(el)
        }}
        onScroll={onScroll}
        onClick={onTap}
        title={name}
      >
        {status === 'loading' && <div className="pdf-status">PDF 여는 중…</div>}
        {pages.map((info, i) => (
          <PdfPage key={i} info={info} number={i + 1} scale={scale} root={root} />
        ))}
      </div>
    </div>
  )
}
