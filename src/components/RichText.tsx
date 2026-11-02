import { useMemo } from 'react'
import { renderSegments, toggleTask } from '../lib/markdown'
import { publicUrl, type TextKind, type VoiceMeta } from '../lib/supabase'
import { AudioPlayer } from './AudioPlayer'

type Props = {
  src: string
  kind: TextKind
  voices?: Record<string, VoiceMeta>
  onDoubleClick?: () => void
  /** Called with the new text when a checklist box is ticked. Without it, boxes are read-only. */
  onChange?: (src: string) => void
}

const isCheck = (t: EventTarget) => t instanceof HTMLInputElement && t.classList.contains('md-check')

/**
 * Formatted block text with voice notes mounted as real players. Each run of text is
 * still escaped-then-formatted HTML; players keep their state while the text around them changes.
 */
export function RichText({ src, kind, voices, onDoubleClick, onChange }: Props) {
  const segments = useMemo(() => renderSegments(src, kind), [src, kind])
  let audioIndex = 0
  return (
    <div
      className={`md md-${kind} ${onChange ? 'tasks-on' : ''}`}
      onClick={(e) => {
        if (!isCheck(e.target)) return
        e.stopPropagation()
        if (!onChange) return e.preventDefault()
        onChange(toggleTask(src, Number((e.target as HTMLInputElement).dataset.line)))
      }}
      // Quick ticking shouldn't open the editor.
      onDoubleClick={(e) => !isCheck(e.target) && onDoubleClick?.()}
    >
      {segments.map((s, i) =>
        'html' in s ? (
          <div key={`t${i}`} className="md-seg" dangerouslySetInnerHTML={{ __html: s.html }} />
        ) : (
          <div key={`a${s.audio.path}-${audioIndex++}`} className="md-audio">
            <AudioPlayer src={publicUrl(s.audio.path)} name={s.audio.label} peaks={voices?.[s.audio.path]?.peaks} duration={voices?.[s.audio.path]?.duration} variant="inline" voice />
          </div>
        ),
      )}
    </div>
  )
}
