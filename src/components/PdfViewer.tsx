import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from './Icons'

const ZOOMS = [1, 1.25, 1.5, 2, 3]

/**
 * Renders every page of a PDF to canvas with pdf.js, so PDFs look the same in every browser
 * (iframe viewers are blank in some embedded browsers and show one page on iOS).
 * Pages fit the block's width; zooming in makes them wider and the viewer scrolls both ways.
 */
export function PdfViewer({ url, name }: { url: string; name: string }) {
  const frame = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [zoom, setZoom] = useState(0)
  const [width, setWidth] = useState(0)

  // Re-render when the block's width changes (rotation, sidebar, window resize).
  useEffect(() => {
    const el = frame.current
    if (!el) return
    let t: ReturnType<typeof setTimeout>
    const ro = new ResizeObserver(([entry]) => {
      clearTimeout(t)
      t = setTimeout(() => setWidth((w) => (Math.abs(w - entry.contentRect.width) > 24 ? Math.round(entry.contentRect.width) : w)), 150)
    })
    ro.observe(el)
    return () => (ro.disconnect(), clearTimeout(t))
  }, [])

  useEffect(() => {
    if (!width) return
    let cancelled = false
    let destroy: (() => void) | undefined

    ;(async () => {
      try {
        const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const task = pdfjs.getDocument({ url })
        destroy = () => void task.destroy()
        const doc = await task.promise
        if (cancelled || !host.current) return
        setPages(doc.numPages)
        const target = Math.max(200, width - 32) * ZOOMS[zoom]
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
          const page = await doc.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (target / base.width) * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = `${target}px`
          canvas.className = 'pdf-page'
          canvas.setAttribute('aria-label', `Page ${n}`)
          await page.render({ canvas, viewport }).promise
          if (n === 1 && !cancelled) {
            host.current?.replaceChildren(canvas)
            setState('ready')
          } else host.current?.appendChild(canvas)
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e)
          setState('error')
        }
      }
    })()

    return () => {
      cancelled = true
      destroy?.()
    }
  }, [url, zoom, width])

  return (
    <div className="pdf" ref={frame}>
      <div className="pdf-scroll">
        <div className="pdf-pages" ref={host} />
      </div>
      {state === 'loading' && <div className="pdf-status"><span className="spinner" /> Loading {name}…</div>}
      {state === 'error' && (
        <div className="pdf-status">
          Couldn’t preview this PDF.{' '}
          <a href={url} target="_blank" rel="noreferrer">Open it in a new tab</a>
        </div>
      )}
      {pages > 0 && (
        <div className="pdf-bar">
          <span>{pages} {pages === 1 ? 'page' : 'pages'}</span>
          <button onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} aria-label="Zoom out">
            <Minus width={13} height={13} />
          </button>
          <span className="pdf-zoom">{Math.round(ZOOMS[zoom] * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} aria-label="Zoom in">
            <Plus width={13} height={13} />
          </button>
        </div>
      )}
    </div>
  )
}
