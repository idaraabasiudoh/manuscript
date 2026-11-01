import { useMemo } from 'react'
import { renderSegments } from '../lib/markdown'
import { publicUrl, type TextKind, type VoiceMeta } from '../lib/supabase'
import { AudioPlayer } from './AudioPlayer'

/**
 * Formatted block text with voice notes mounted as real players. Each run of text is
 * still escaped-then-formatted HTML; players keep their state while the text around them changes.
 */
export function RichText({ src, kind, voices, onDoubleClick }: { src: string; kind: TextKind; voices?: Record<string, VoiceMeta>; onDoubleClick?: () => void }) {
  const segments = useMemo(() => renderSegments(src, kind), [src, kind])
  let audioIndex = 0
  return (
    <div className={`md md-${kind}`} onDoubleClick={onDoubleClick}>
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
