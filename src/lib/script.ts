// Structured scripts for Drama blocks: a title page, a reusable cast, and an ordered list of
// script elements. Stored in `block.data.script`; `block.body` always holds the plain-text
// version (screenplay-style) so word counts, previews and Manu AI keep working.

export type Setting = '' | 'INT.' | 'EXT.' | 'INT./EXT.'

export type Character = { id: string; name: string; age: string; description: string; color: number }

export type ScriptElement =
  | { id: string; type: 'scene'; setting: Setting; location: string; time: string }
  | { id: string; type: 'action'; text: string }
  | { id: string; type: 'dialogue'; character: string; parenthetical: string; text: string }
  | { id: string; type: 'transition'; text: string }
  | { id: string; type: 'note'; label: string; text: string }
  | { id: string; type: 'break'; text: string }

export type ElementType = ScriptElement['type']

export type Script = {
  version: 1
  meta: { title: string; format: string; genre: string; logline: string; author: string }
  cast: Character[]
  elements: ScriptElement[]
}

export const FORMATS = ['Short Film', 'Feature Film', 'Stage Play', 'Web Series', 'TV Pilot', 'Music Video', 'Commercial', 'Spoken Word']
export const GENRES = ['Drama', 'Psychological Drama', 'Thriller', 'Comedy', 'Romance', 'Horror', 'Sci-Fi', 'Fantasy', 'Mystery', 'Documentary', 'Coming-of-Age', 'Musical']
export const TIMES = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DUSK', 'DAWN', 'CONTINUOUS', 'LATER', 'MOMENTS LATER']
export const TRANSITIONS = ['CUT TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO BLACK.', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:']
export const NOTE_LABELS = ['Composition note', "Director's note", 'Camera', 'Sound', 'Music', 'Flashback', 'Montage']
export const BREAKS = ['END OF ACT ONE', 'INTERMISSION', 'END OF ACT TWO', 'THE END']

/** Eight distinct hues for telling characters apart in the editor. */
export const CAST_COLORS = ['#4b90ff', '#d96570', '#9b72cb', '#1aa37a', '#e08a2c', '#2bb3c0', '#c2569b', '#7f8c3a']

export const uid = () => crypto.randomUUID().slice(0, 8)

export function emptyScript(meta: Partial<Script['meta']> = {}): Script {
  return { version: 1, meta: { title: '', format: 'Short Film', genre: '', logline: '', author: '', ...meta }, cast: [], elements: [] }
}

export function newElement(type: ElementType, character = ''): ScriptElement {
  const id = uid()
  switch (type) {
    case 'scene':
      return { id, type, setting: 'INT.', location: '', time: 'DAY' }
    case 'dialogue':
      return { id, type, character, parenthetical: '', text: '' }
    case 'note':
      return { id, type, label: 'Composition note', text: '' }
    case 'transition':
      return { id, type, text: 'CUT TO:' }
    case 'break':
      return { id, type, text: 'END OF ACT ONE' }
    default:
      return { id, type: 'action', text: '' }
  }
}

export function newCharacter(name: string, cast: Character[], extra: Partial<Character> = {}): Character {
  const used = new Set(cast.map((c) => c.color))
  const color = CAST_COLORS.findIndex((_, i) => !used.has(i))
  return { id: uid(), name: name.trim().toUpperCase(), age: '', description: '', color: color === -1 ? cast.length % CAST_COLORS.length : color, ...extra }
}

export function isScript(value: unknown): value is Script {
  return !!value && typeof value === 'object' && (value as Script).version === 1 && Array.isArray((value as Script).elements)
}

export function sceneHeading(e: Extract<ScriptElement, { type: 'scene' }>) {
  return [e.setting, e.location.trim().toUpperCase()].filter(Boolean).join(' ') + (e.time.trim() ? ` - ${e.time.trim().toUpperCase()}` : '')
}

// ---- Plain text (screenplay-style; also what the Markdown drama preview understands) ----

export function toText(s: Script): string {
  const out: string[] = []
  const m = s.meta
  if (m.title) out.push(`TITLE: ${m.title}`)
  if (m.author) out.push(`WRITTEN BY: ${m.author}`)
  if (m.format) out.push(`FORMAT: ${m.format}`)
  if (m.genre) out.push(`GENRE: ${m.genre}`)
  if (m.logline) out.push(`LOGLINE: ${m.logline}`)
  if (s.cast.length) {
    out.push('', 'CHARACTERS:')
    for (const c of s.cast) out.push(`- ${c.name}${c.age ? ` (${c.age})` : ''}${c.description ? `: ${c.description}` : ''}`)
  }
  const name = (id: string) => s.cast.find((c) => c.id === id)?.name || 'UNKNOWN'
  for (const e of s.elements) {
    out.push('')
    if (e.type === 'scene') out.push(sceneHeading(e) || 'SCENE')
    else if (e.type === 'action') out.push(e.text)
    else if (e.type === 'dialogue') out.push(`@${name(e.character)}`, ...(e.parenthetical ? [`(${e.parenthetical.replace(/^\(|\)$/g, '')})`] : []), e.text)
    else if (e.type === 'transition') out.push(e.text.toUpperCase())
    else if (e.type === 'note') out.push(`> ${e.label ? `${e.label}: ` : ''}${e.text}`)
    else if (e.type === 'break') out.push('* * *', `->${e.text.toUpperCase()}<-`)
  }
  return out.join('\n').replace(/^\n+/, '')
}

// ---- Parsing existing script text into a structured script ----------------------------

const SCENE_RE = /^(?:SCENE\s+[\w-]+\s*[:.\-–—]\s*)?(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|INT\.?|EXT\.?)\s+(.+)$/i
const TRANSITION_RE = /^[A-Z0-9 .'’-]*(TO:|FADE OUT\.?|FADE IN:|FADE TO BLACK\.?|CUT TO BLACK\.?)$/
const NOTE_RE = /^((?:composition|director'?s?|camera|sound|music|shot)\s+note|note)\s*:\s*(.+)$/i
const BREAK_RE = /^(INTERMISSION|END OF ACT [A-Z0-9]+\.?|THE END\.?|ACT [A-Z0-9]+)$/i
const META_RE = /^(TITLE|FORMAT|GENRE|LOGLINE|WRITTEN BY|AUTHOR)\s*:\s*(.*)$/i
const CAST_LINE_RE = /^\s*[-*•]\s+(.+?)(?:\s*\(([^)]*)\))?\s*(?::\s*(.*))?$/
const INLINE_DIALOGUE_RE = /^([A-Z][A-Z0-9 .'’&-]{0,30}?)\s*(?:\(([^)]*)\))?\s*[:]?\s+(\S.*)$/

function normalizeSetting(raw: string): Setting {
  const s = raw.toUpperCase().replace(/\s+/g, '')
  if (s.startsWith('INT') && s.includes('EXT')) return 'INT./EXT.'
  if (s.startsWith('EXT') && s.includes('INT')) return 'INT./EXT.'
  if (s.startsWith('I/E')) return 'INT./EXT.'
  return s.startsWith('EXT') ? 'EXT.' : 'INT.'
}

function stripEmphasis(s: string) {
  return s.replace(/^\*(.+)\*$/, '$1').replace(/^_(.+)_$/, '$1')
}

/** Best-effort conversion of free-typed script text (Fountain-ish or "NAME (direction) line") into a Script. */
export function parseScript(text: string, fallbackTitle = ''): Script {
  const script = emptyScript({ title: fallbackTitle })
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const cast = script.cast
  const els = script.elements

  const findOrAdd = (raw: string) => {
    const name = raw.trim().replace(/^@/, '').toUpperCase()
    let c = cast.find((x) => x.name === name)
    if (!c) {
      c = newCharacter(name, cast)
      cast.push(c)
    }
    return c
  }

  let inCast = false
  let speech: Extract<ScriptElement, { type: 'dialogue' }> | null = null
  let sawScene = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const t = raw.trim()

    if (!t) {
      speech = null
      continue
    }

    // Fountain-style speech: "@NAME" then (parenthetical) and dialogue lines until a blank line.
    if (speech) {
      if (/^\(.*\)$/.test(t) && !speech.text) speech.parenthetical = t.slice(1, -1)
      else speech.text = speech.text ? `${speech.text}\n${t}` : t
      continue
    }

    let m: RegExpMatchArray | null
    if (!sawScene && (m = t.match(META_RE))) {
      const key = m[1].toUpperCase()
      const value = m[2].trim()
      if (key === 'TITLE') script.meta.title = value
      else if (key === 'FORMAT') script.meta.format = value
      else if (key === 'GENRE') script.meta.genre = value
      else if (key === 'LOGLINE') script.meta.logline = value
      else script.meta.author = value
      inCast = false
      continue
    }
    if (!sawScene && /^(CHARACTERS|CAST(?: OF CHARACTERS)?)\s*:?$/i.test(t)) {
      inCast = true
      continue
    }
    if (inCast && (m = raw.match(CAST_LINE_RE))) {
      // "CHLOE, MARCUS, & SAM (20s): Friends…" becomes three reusable characters.
      const names = m[1].split(/\s*(?:,|&|\band\b)\s*/i).map((n) => n.replace(/^&\s*/, '').trim()).filter(Boolean)
      for (const n of names) {
        const c = findOrAdd(n)
        c.age = m[2]?.trim() ?? c.age
        c.description = m[3]?.trim() ?? c.description
      }
      continue
    }
    inCast = false

    if (!sawScene && els.length === 0 && /^(SHORT FILM SCRIPT|SCREENPLAY|SCRIPT|STAGE PLAY)$/i.test(t)) continue

    if ((m = t.match(SCENE_RE))) {
      const rest = m[2]
      const dash = rest.match(/^(.*?)\s+[-–—]\s+(.+)$/)
      els.push({ id: uid(), type: 'scene', setting: normalizeSetting(m[1]), location: (dash ? dash[1] : rest).trim(), time: dash ? dash[2].trim() : '' })
      sawScene = true
      continue
    }
    if ((m = t.match(/^\.(?!\.)(.+)$/)) || (m = t.match(/^##\s+(.+)$/))) {
      els.push({ id: uid(), type: 'scene', setting: '', location: m[1].trim(), time: '' })
      sawScene = true
      continue
    }
    if ((m = t.match(/^#\s+(.+)$/)) || BREAK_RE.test(t) || /^(\* ?){3}$|^-{3,}$/.test(t)) {
      const label = m ? m[1] : /^(\* ?){3}$|^-{3,}$/.test(t) ? '' : t
      const next = lines[i + 1]?.trim().match(/^->\s*(.*?)\s*<-$/)
      if (next) i++
      els.push({ id: uid(), type: 'break', text: (next?.[1] ?? label).toUpperCase() })
      continue
    }
    if (TRANSITION_RE.test(t)) {
      els.push({ id: uid(), type: 'transition', text: t })
      continue
    }
    if ((m = t.match(NOTE_RE)) || (m = t.match(/^>\s*(?:([^:]{2,30}):\s*)?(.+)$/))) {
      const label = m[1] ? m[1].replace(/^./, (ch) => ch.toUpperCase()) : 'Note'
      els.push({ id: uid(), type: 'note', label, text: m[2].trim() })
      continue
    }
    if ((m = t.match(/^@\s*(.+)$/))) {
      speech = { id: uid(), type: 'dialogue', character: findOrAdd(m[1]).id, parenthetical: '', text: '' }
      els.push(speech)
      continue
    }
    // "LEO (Slams his glass down) Alright…" or "MAYA: Hey" — only for known names, or when a direction follows.
    if ((m = t.match(INLINE_DIALOGUE_RE)) && /[A-Z]/.test(m[1]) && m[1] === m[1].toUpperCase()) {
      const name = m[1].trim()
      const known = cast.some((c) => c.name === name)
      if (known || m[2] !== undefined || /^[A-Z][A-Z .'’-]*:/.test(t)) {
        els.push({ id: uid(), type: 'dialogue', character: findOrAdd(name).id, parenthetical: (m[2] ?? '').trim(), text: m[3].trim() })
        continue
      }
    }
    // A bare "NAME" line followed by text is a classic screenplay cue.
    if (/^[A-Z][A-Z0-9 .'’-]{1,30}$/.test(t) && !/[a-z]/.test(t) && lines[i + 1]?.trim()) {
      speech = { id: uid(), type: 'dialogue', character: findOrAdd(t.replace(/\s*\(.*\)$/, '')).id, parenthetical: '', text: '' }
      els.push(speech)
      continue
    }
    els.push({ id: uid(), type: 'action', text: stripEmphasis(t) })
  }

  // Drop empty speeches left by a cue with no lines.
  script.elements = els.filter((e) => e.type !== 'dialogue' || e.text || e.parenthetical)
  return script
}
