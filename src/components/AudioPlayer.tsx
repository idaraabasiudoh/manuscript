import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Mic, Pause, Play } from 'lucide-react'
import { claimPlayback, fallbackPeaks, formatTime, resample } from '../lib/audio'

type Props = {
  src: string
  /** Shown above the waveform in the card layout. */
  name?: string
  peaks?: number[]
  /** Stored length, used when the browser can't read it from the file (recorded WebM often reports Infinity). */
  duration?: number
  /** "card" fills a file block; "inline" is a compact pill inside text. */
  variant?: 'card' | 'inline'
  voice?: boolean
}

const SPEEDS = [1, 1.25, 1.5, 2, 0.75]

/**
 * Audio player with a seekable waveform. Played bars fill with the accent gradient,
 * and while playing the bars just behind the playhead pulse to the beat of the progress.
 */
export function AudioPlayer({ src, name, peaks, duration: stored, variant = 'card', voice }: Props) {
  const audio = useRef<HTMLAudioElement>(null)
  const wave = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [length, setLength] = useState<number | undefined>(stored)
  const [speed, setSpeed] = useState(1)
  const [hover, setHover] = useState<number | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const [failed, setFailed] = useState(false)
  const bars = variant === 'card' ? 64 : 36
  const heights = useMemo(() => (peaks?.length ? resample(peaks, bars) : fallbackPeaks(src, bars)), [peaks, src, bars])

  useEffect(() => setLength((l) => l ?? stored), [stored])

  // Smooth progress while playing; timeupdate alone only fires ~4 times a second.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      if (audio.current) setTime(audio.current.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const onMeta = () => {
    const el = audio.current
    if (!el) return
    if (Number.isFinite(el.duration) && el.duration > 0) setLength(el.duration)
    else if (!stored) {
      // Chrome's recorded WebM has no duration until it's been read to the end: seek far, then back.
      const fix = () => {
        el.removeEventListener('durationchange', fix)
        if (Number.isFinite(el.duration)) setLength(el.duration)
        el.currentTime = 0
      }
      el.addEventListener('durationchange', fix)
      el.currentTime = 1e7
    }
  }

  const toggle = async () => {
    const el = audio.current
    if (!el) return
    if (el.paused) {
      claimPlayback(el)
      el.playbackRate = speed
      try {
        await el.play()
      } catch {
        setFailed(true)
      }
    } else el.pause()
  }

  const total = length && Number.isFinite(length) ? length : 0
  const progress = total ? Math.min(1, time / total) : 0

  const seekTo = (fraction: number) => {
    const el = audio.current
    if (!el || !total) return
    el.currentTime = Math.max(0, Math.min(total, fraction * total))
    setTime(el.currentTime)
  }

  const fractionAt = (e: PointerEvent) => {
    const r = wave.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  }

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 15 : 5
    if (e.key === 'ArrowRight') seekTo((time + step) / total)
    else if (e.key === 'ArrowLeft') seekTo((time - step) / total)
    else if (e.key === 'Home') seekTo(0)
    else if (e.key === 'End') seekTo(1)
    else if (e.key === ' ' || e.key === 'Enter') toggle()
    else return
    e.preventDefault()
  }

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    if (audio.current) audio.current.playbackRate = next
  }

  const playedBars = progress * bars

  return (
    <div className={`player ${variant} ${playing ? 'playing' : ''} ${scrubbing ? 'scrubbing' : ''}`} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={onMeta}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => (setPlaying(false), setTime(0), audio.current && (audio.current.currentTime = 0))}
        onTimeUpdate={(e) => !playing && setTime(e.currentTarget.currentTime)}
        onError={() => setFailed(true)}
      />
      {variant === 'card' && (
        <div className="player-head">
          <span className="player-badge">
            {voice ? <Mic size={13} strokeWidth={2} /> : <span className="player-eq" aria-hidden><i /><i /><i /></span>}
            {voice ? 'Voice note' : 'Audio'}
          </span>
          {name && <p className="player-name truncate">{name}</p>}
        </div>
      )}
      <div className="player-row">
        <button type="button" className="player-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={failed}>
          <span className="player-ring" aria-hidden />
          {playing ? <Pause size={variant === 'card' ? 20 : 15} fill="currentColor" strokeWidth={0} /> : <Play size={variant === 'card' ? 20 : 15} fill="currentColor" strokeWidth={0} className="player-play-icon" />}
        </button>
        <div
          ref={wave}
          className="player-wave"
          role="slider"
          tabIndex={0}
          aria-label={name ? `Seek ${name}` : 'Seek'}
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${formatTime(time)} of ${formatTime(total)}`}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            if (!total) return
            e.currentTarget.setPointerCapture(e.pointerId)
            setScrubbing(true)
            seekTo(fractionAt(e))
          }}
          onPointerMove={(e) => {
            const f = fractionAt(e)
            setHover(f)
            if (scrubbing) seekTo(f)
          }}
          onPointerUp={() => setScrubbing(false)}
          onPointerLeave={() => setHover(null)}
        >
          {heights.map((h, i) => {
            const state = i < Math.floor(playedBars) ? 'played' : i < playedBars ? 'edge' : hover !== null && i < hover * bars ? 'ghost' : ''
            const near = playing && i < playedBars && playedBars - i < 6
            return (
              <i
                key={i}
                className={`${state} ${near ? 'live' : ''}`}
                style={{ height: `${h * 100}%`, animationDelay: near ? `${-(i % 5) * 0.11}s` : undefined, backgroundPosition: `${(i / (bars - 1)) * 100}% 0` }}
              />
            )
          })}
          <span className="player-head-line" style={{ left: `${progress * 100}%` }} aria-hidden />
        </div>
        <span className="player-time">
          {failed ? 'Can’t play' : formatTime(variant === 'card' || time > 0 || playing ? time : total)}
          {variant === 'card' && !failed && <span className="player-total"> / {formatTime(total)}</span>}
        </span>
        <button type="button" className="player-speed" onClick={cycleSpeed} title="Playback speed" aria-label={`Playback speed ${speed}×`}>
          {speed}×
        </button>
      </div>
    </div>
  )
}
