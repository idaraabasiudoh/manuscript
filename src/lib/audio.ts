// Voice notes and audio playback helpers: recording format, waveform peaks, time
// formatting, and a tiny bus so only one player on the page plays at a time.

/** Bars stored per recording. Players resample to however many bars they draw. */
export const PEAK_COUNT = 64

export type AudioMeta = { duration?: number; peaks?: number[] }

/** The best format this browser can record: Opus in WebM (Chrome, Firefox, Edge), AAC in MP4 (Safari). */
export function recordingFormat(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const options = [
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/mp4', ext: 'm4a' },
    { mime: 'audio/webm', ext: 'webm' },
    { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
  ]
  return options.find((o) => MediaRecorder.isTypeSupported?.(o.mime)) ?? null
}

/** Downsamples any list of levels to `n` bars, normalised so the loudest is 1. */
export function resample(levels: number[], n: number): number[] {
  if (!levels.length) return []
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i / n) * levels.length)
    const to = Math.max(from + 1, Math.floor(((i + 1) / n) * levels.length))
    let max = 0
    for (let j = from; j < to && j < levels.length; j++) max = Math.max(max, levels[j])
    out.push(max)
  }
  const top = Math.max(...out, 0.0001)
  // A gentle curve so quiet speech still shows shape next to loud peaks.
  return out.map((v) => Math.round(Math.max(0.06, Math.pow(v / top, 0.7)) * 100) / 100)
}

/** Reads an uploaded audio file and returns its length and waveform, or {} if the browser can't decode it. */
export async function audioMeta(file: Blob): Promise<AudioMeta> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx || file.size > 60 * 1024 * 1024) return {}
    const ctx = new Ctx()
    try {
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
      const data = buffer.getChannelData(0)
      const step = Math.max(1, Math.floor(data.length / (PEAK_COUNT * 8)))
      const levels: number[] = []
      for (let i = 0; i < data.length; i += step) {
        let sum = 0
        const end = Math.min(i + step, data.length)
        for (let j = i; j < end; j++) sum += data[j] * data[j]
        levels.push(Math.sqrt(sum / (end - i)))
      }
      return { duration: Math.round(buffer.duration * 10) / 10, peaks: resample(levels, PEAK_COUNT) }
    } finally {
      ctx.close().catch(() => {})
    }
  } catch {
    return {}
  }
}

/** A stable, natural-looking waveform for audio with no stored peaks, seeded by its name. */
export function fallbackPeaks(seed: string, n = PEAK_COUNT): number[] {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507)), ((h >>> 0) % 1000) / 1000)
  return Array.from({ length: n }, (_, i) => {
    const swell = 0.55 + 0.45 * Math.sin((i / n) * Math.PI)
    return Math.round(Math.max(0.12, swell * (0.35 + rand() * 0.65)) * 100) / 100
  })
}

export function formatTime(sec: number | undefined) {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

// ---- One player at a time --------------------------------------------------------

let current: HTMLAudioElement | null = null

/** Call when a player starts: pauses whichever player was playing before. */
export function claimPlayback(el: HTMLAudioElement) {
  if (current && current !== el) current.pause()
  current = el
}

/** Name for a new recording, e.g. "Voice note 31 Oct, 14.05". */
export function voiceNoteName(at = new Date()) {
  const day = at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.')
  return `Voice note ${day}, ${time}`
}
