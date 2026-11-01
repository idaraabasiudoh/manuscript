import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw, ZoomIn } from 'lucide-react'

/** Full-screen view settings: the block's width as a % of the screen, and its text size. */
export type FullView = { width: number; text: number }

export const MIN_WIDTH = 20
export const DEFAULT_VIEW: FullView = { width: 60, text: 1 }
export const TEXT_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8]

export function ZoomControl({ view, onChange }: { view: FullView; onChange: (view: FullView) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])

  const step = TEXT_STEPS.indexOf(view.text) === -1 ? TEXT_STEPS.indexOf(1) : TEXT_STEPS.indexOf(view.text)
  const setText = (i: number) => onChange({ ...view, text: TEXT_STEPS[Math.max(0, Math.min(TEXT_STEPS.length - 1, i))] })
  const changed = view.width !== DEFAULT_VIEW.width || view.text !== DEFAULT_VIEW.text

  return (
    <div className="zoom" ref={box}>
      <button type="button" className={`icon-btn ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="Zoom and width" aria-expanded={open} title="Zoom and width">
        <ZoomIn size={18} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="zoom-panel" role="dialog" aria-label="Zoom and width">
          <label className="zoom-row">
            <span className="zoom-label">
              Width <b>{view.width}% of screen</b>
            </span>
            <input
              type="range"
              min={MIN_WIDTH}
              max={100}
              step={1}
              value={view.width}
              onChange={(e) => onChange({ ...view, width: Number(e.target.value) })}
              aria-label="Width"
            />
            <span className="zoom-ends">
              <span>{MIN_WIDTH}%</span>
              <span>100%</span>
            </span>
          </label>
          <div className="zoom-row">
            <span className="zoom-label">Text size</span>
            <div className="zoom-steps">
              <button type="button" className="icon-btn sm" onClick={() => setText(step - 1)} disabled={step === 0} aria-label="Smaller text">
                <Minus size={16} />
              </button>
              <span className="zoom-value">{Math.round(view.text * 100)}%</span>
              <button type="button" className="icon-btn sm" onClick={() => setText(step + 1)} disabled={step === TEXT_STEPS.length - 1} aria-label="Bigger text">
                <Plus size={16} />
              </button>
            </div>
          </div>
          <button type="button" className="zoom-reset" onClick={() => onChange(DEFAULT_VIEW)} disabled={!changed}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      )}
    </div>
  )
}
