import { useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, RotateCcw, Square } from 'lucide-react'
import { PEAK_COUNT, formatTime, recordingFormat, resample, voiceNoteName, type AudioMeta } from '../lib/audio'
import { AudioPlayer } from './AudioPlayer'

export type Recording = { file: File; meta: AudioMeta; url: string }

type Props = {
  /** Called with the finished take when the writer confirms it. */
  onUse: (rec: Recording) => void
  onCancel?: () => void
  /** Label for the confirm button. */
  useLabel?: string
  busy?: boolean
  /** Upload progress (0–1) to show on the confirm button while saving. */
  progress?: number | null
}

const MAX_SECONDS = 15 * 60
const LIVE_BARS = 44

type State = 'idle' | 'asking' | 'recording' | 'paused' | 'review' | 'error'

/** Records a voice note in the browser: live waveform while recording, then a review step. */
export function VoiceRecorder({ onUse, onCancel, useLabel = 'Use voice note', busy, progress }: Props) {
  const [state, setStateRaw] = useState<State>('idle')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [live, setLive] = useState<number[]>(() => Array(LIVE_BARS).fill(0.05))
  const [take, setTake] = useState<Recording | null>(null)

  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const chunks = useRef<Blob[]>([])
  const levels = useRef<number[]>([])
  const clock = useRef({ startedAt: 0, banked: 0 })
  const raf = useRef(0)
  // The clock and the animation loop read the state synchronously, so it lives in a ref too.
  const stateRef = useRef<State>('idle')
  const setState = (next: State) => {
    stateRef.current = next
    setStateRaw(next)
  }

  const stopHardware = () => {
    cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    ctx.current?.close().catch(() => {})
    ctx.current = null
  }

  useEffect(
    () => () => {
      if (recorder.current?.state !== 'inactive') recorder.current?.stop()
      stopHardware()
    },
    [],
  )
  useEffect(() => () => void (take && URL.revokeObjectURL(take.url)), [take])

  const now = () => clock.current.banked + (stateRef.current === 'recording' ? (performance.now() - clock.current.startedAt) / 1000 : 0)

  const start = async () => {
    setError('')
    const format = recordingFormat()
    if (!format || !navigator.mediaDevices?.getUserMedia) {
      setState('error')
      setError('This browser can’t record audio. Try a recent Chrome, Safari, Edge or Firefox.')
      return
    }
    setState('asking')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      stream.current = media
      const audioCtx = new AudioContext()
      ctx.current = audioCtx
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 1024
      audioCtx.createMediaStreamSource(media).connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)

      const rec = new MediaRecorder(media, { mimeType: format.mime, audioBitsPerSecond: 96000 })
      recorder.current = rec
      chunks.current = []
      levels.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = () => {
        const seconds = Math.round(now() * 10) / 10
        stopHardware()
        const type = format.mime.split(';')[0]
        const name = voiceNoteName()
        const file = new File(chunks.current, `${name.replace(/[^\w]+/g, '-').replace(/-+$/, '')}.${format.ext}`, { type })
        setTake({ file, url: URL.createObjectURL(file), meta: { duration: seconds, peaks: resample(levels.current, PEAK_COUNT) } })
        setState('review')
      }
      rec.start(250)
      clock.current = { startedAt: performance.now(), banked: 0 }
      setElapsed(0)
      setState('recording')

      let frame = 0
      const tick = () => {
        raf.current = requestAnimationFrame(tick)
        if (stateRef.current !== 'recording') return
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 3.2)
        levels.current.push(level)
        if (++frame % 3 === 0) setLive((l) => [...l.slice(1), Math.max(0.05, level)])
        const t = now()
        setElapsed(t)
        if (t >= MAX_SECONDS) stop()
      }
      raf.current = requestAnimationFrame(tick)
    } catch (e) {
      stopHardware()
      setState('error')
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      setError(denied ? 'Microphone access was blocked. Allow it in your browser’s address bar, then try again.' : 'No microphone found, or it’s in use by another app.')
    }
  }

  const pause = () => {
    if (recorder.current?.state !== 'recording') return
    recorder.current.pause()
    clock.current.banked = now()
    setState('paused')
  }

  const resume = () => {
    if (recorder.current?.state !== 'paused') return
    recorder.current.resume()
    clock.current.startedAt = performance.now()
    setState('recording')
  }

  const stop = () => {
    const rec = recorder.current
    if (!rec || rec.state === 'inactive') return
    if (rec.state === 'paused') rec.resume()
    clock.current.banked = now()
    stateRef.current = 'paused'
    rec.stop()
  }

  const again = () => {
    setTake(null)
    setLive(Array(LIVE_BARS).fill(0.05))
    start()
  }

  if (state === 'review' && take)
    return (
      <div className="recorder review">
        <AudioPlayer src={take.url} peaks={take.meta.peaks} duration={take.meta.duration} name="Your take" voice />
        <div className="recorder-actions">
          <button type="button" className="btn" onClick={again} disabled={busy}>
            <RotateCcw size={15} /> Record again
          </button>
          <button type="button" className="btn primary" onClick={() => onUse(take)} disabled={busy}>
            {busy ? (progress != null ? `Saving ${Math.round(progress * 100)}%` : 'Saving…') : useLabel}
          </button>
        </div>
      </div>
    )

  const active = state === 'recording' || state === 'paused'

  return (
    <div className={`recorder ${state}`}>
      <div className="recorder-stage">
        <button
          type="button"
          className="recorder-mic"
          onClick={active ? stop : start}
          disabled={state === 'asking'}
          aria-label={active ? 'Stop recording' : 'Start recording'}
          title={active ? 'Stop' : 'Record'}
        >
          <span className="recorder-halo" aria-hidden />
          {active ? <Square size={20} fill="currentColor" strokeWidth={0} /> : <Mic size={24} strokeWidth={2} />}
        </button>
        <div className="recorder-live" aria-hidden>
          {live.map((v, i) => (
            <i key={i} style={{ transform: `scaleY(${active ? v : 0.06})`, backgroundPosition: `${(i / (LIVE_BARS - 1)) * 100}% 0` }} />
          ))}
        </div>
        <div className="recorder-meta">
          <span className="recorder-time">{formatTime(elapsed)}</span>
          <span className="recorder-status">
            {state === 'idle' && 'Tap the mic to start'}
            {state === 'asking' && 'Allow microphone access…'}
            {state === 'recording' && (
              <>
                <span className="recorder-dot" /> Recording
              </>
            )}
            {state === 'paused' && 'Paused'}
            {state === 'error' && 'Couldn’t start'}
          </span>
        </div>
      </div>
      {error && <p className="hint error recorder-error">{error}</p>}
      <div className="recorder-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        {active && (
          <button type="button" className="btn" onClick={state === 'recording' ? pause : resume}>
            {state === 'recording' ? <Pause size={15} /> : <Play size={15} />} {state === 'recording' ? 'Pause' : 'Resume'}
          </button>
        )}
        {active ? (
          <button type="button" className="btn primary" onClick={stop}>
            <Square size={13} fill="currentColor" strokeWidth={0} /> Done
          </button>
        ) : (
          state !== 'asking' && (
            <button type="button" className="btn primary" onClick={start}>
              <Mic size={15} /> {state === 'error' ? 'Try again' : 'Start recording'}
            </button>
          )
        )}
      </div>
    </div>
  )
}
