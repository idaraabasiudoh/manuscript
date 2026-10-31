export function formatBytes(n: number | null | undefined) {
  if (!n) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export const pad = (n: number) => String(n).padStart(2, '0')

export function wordCount(text: string) {
  return text.replace(/[#>*_~`@\-[\]()+]/g, ' ').split(/\s+/).filter(Boolean).length
}

// ---- Project names ------------------------------------------------------------

export const NAME_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/

/** Turns free text (or a pasted link) into a project name as the user types. */
export function toName(value: string) {
  const fromLink = value.match(/^https?:\/\/[^/]+\/([^/?#]+)/)
  return (fromLink ? fromLink[1] : value)
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48)
}

// ---- Per-browser memory -------------------------------------------------------

const RECENT_KEY = 'manuscript:recent'

export function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function rememberProject(name: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([name, ...getRecent().filter((n) => n !== name)].slice(0, 6)))
  } catch {
    /* storage unavailable */
  }
}

export function forgetProject(name: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(getRecent().filter((n) => n !== name)))
  } catch {
    /* storage unavailable */
  }
}

export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`manuscript:${key}`)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`manuscript:${key}`, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

/** A midpoint position between two neighbours (either may be missing). */
export function between(before?: number, after?: number) {
  if (before === undefined && after === undefined) return 1
  if (before === undefined) return after! - 1
  if (after === undefined) return before + 1
  return (before + after) / 2
}

/** A block's id in URLs: the first 8 characters of its UUID (resolved by prefix within the project). */
export const blockSlug = (id: string) => id.slice(0, 8)
