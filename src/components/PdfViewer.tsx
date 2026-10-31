import { useEffect, useRef, useState } from 'react'

/**
 * Renders every page of a PDF to canvas with pdf.js, so PDFs look the same in every browser
 * (iframe viewers are blank in some embedded browsers and show one page on iOS).
 */
export function PdfViewer({ url, name }: { url: string; name: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
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
        host.current.replaceChildren()
        const width = host.current.clientWidth || 700
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
          const page = await doc.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (width / base.width) * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = 'pdf-page'
          canvas.setAttribute('aria-label', `Page ${n}`)
          host.current?.appendChild(canvas)
          await page.render({ canvas, viewport }).promise
          if (n === 1) setState('ready')
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
  }, [url])

  return (
    <div className="pdf">
      <div className="pdf-pages" ref={host} />
      {state === 'loading' && <div className="pdf-status"><span className="spinner" /> Loading {name}…</div>}
      {state === 'error' && (
        <div className="pdf-status">
          Couldn’t preview this PDF.{' '}
          <a href={url} target="_blank" rel="noreferrer">Open it in a new tab</a>
        </div>
      )}
      {pages > 0 && <span className="pdf-count">{pages} {pages === 1 ? 'page' : 'pages'}</span>}
    </div>
  )
}
