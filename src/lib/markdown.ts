// A small, safe formatter for block text. Everything is HTML-escaped before any
// formatting is applied, so user content can never inject markup.
//
//   # Title   ## Heading   ### Subheading
//   **bold**  *italic*  ++underline++  ~~strike~~  [text](https://…)
//   > quote   - bullet   1. numbered   ---  divider   * * *  scene break   ->centered<-
//
// Drama blocks also understand screenplay lines:
//   INT. / EXT. scene headings · @NAME character cues (+ dialogue below) · (beat) · CUT TO:
import type { TextKind } from './supabase'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function inline(raw: string) {
  let s = esc(raw)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) =>
    /^(https?:|mailto:)/i.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>` : text,
  )
  s = s.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\+\+(?=\S)(.+?)(?<=\S)\+\+/g, '<u>$1</u>')
  s = s.replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<s>$1</s>')
  s = s.replace(/(^|[^\w*])\*(?=\S)(.+?)(?<=\S)\*(?!\w)/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<em>$2</em>')
  return s
}

/** Keeps poetry indentation: leading spaces become non-breaking. */
function indented(line: string) {
  const m = line.match(/^[ \t]+/)
  if (!m) return inline(line)
  const width = m[0].replace(/\t/g, '    ').length
  return '&nbsp;'.repeat(width) + inline(line.slice(m[0].length))
}

const SCENE = /^(\.(?=[^.])|(INT|EXT|EST|INT\.?\/EXT|I\/E)[. ])/i
const TRANSITION = /^[A-Z0-9 .'’-]*(TO:|FADE OUT\.|FADE IN:|FADE TO BLACK\.|CUT TO BLACK\.)$/

export function renderMarkdown(src: string, kind: TextKind = 'text') {
  const out: string[] = []
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const screenplay = kind === 'drama'

  let para: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  let quote: string[] = []
  let dialogue: string[] | null = null

  const flush = () => {
    if (para.length) out.push(`<p>${para.join('<br>')}</p>`)
    if (list) out.push(`<${list.tag}>${list.items.map((i) => (i.startsWith('<li') ? `${i}</li>` : `<li>${i}</li>`)).join('')}</${list.tag}>`)
    if (quote.length) out.push(`<blockquote>${quote.join('<br>')}</blockquote>`)
    if (dialogue) out.push(`<div class="sp-dialogue">${dialogue.join('')}</div>`)
    para = []
    list = null
    quote = []
    dialogue = null
  }

  for (const line of lines) {
    const t = line.trim()

    if (!t) {
      flush()
      continue
    }

    // Inside a screenplay speech: parentheticals and dialogue until a blank line.
    if (dialogue) {
      if (/^\(.*\)$/.test(t)) dialogue.push(`<p class="sp-paren">${inline(t)}</p>`)
      else dialogue.push(`<p class="sp-line">${inline(t)}</p>`)
      continue
    }

    let m: RegExpMatchArray | null
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) {
      flush()
      const level = m[1].length
      out.push(`<h${level}>${inline(m[2])}</h${level}>`)
    } else if (/^(-{3,}|_{3,})$/.test(t)) {
      flush()
      out.push('<hr>')
    } else if (/^(\* ?){3}$/.test(t) || t === '⁂') {
      flush()
      out.push('<p class="md-break" aria-label="Scene break">✦ ✦ ✦</p>')
    } else if ((m = t.match(/^->\s*(.*?)\s*<-$/))) {
      flush()
      out.push(`<p class="md-center">${inline(m[1])}</p>`)
    } else if ((m = t.match(/^>\s?(.*)$/))) {
      if (!quote.length) flush()
      quote.push(inline(m[1]))
    } else if ((m = line.match(/^\s*[-•]\s+(.*)$/)) || (!screenplay && (m = line.match(/^\s*\*\s+(.*)$/)))) {
      if (list?.tag !== 'ul') flush()
      list ??= { tag: 'ul', items: [] }
      list.items.push(inline(m[1]))
    } else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
      if (list?.tag !== 'ol') flush()
      list ??= { tag: 'ol', items: [] }
      // Keep the writer's numbering, even when items are split by blank lines or paragraphs.
      list.items.push(`<li value="${Number(m[1])}">${inline(m[2])}`)
    } else if (screenplay && SCENE.test(t)) {
      flush()
      out.push(`<p class="sp-scene">${inline(t.replace(/^\./, ''))}</p>`)
    } else if (screenplay && (m = t.match(/^@\s*(.+)$/))) {
      flush()
      out.push(`<p class="sp-character">${inline(m[1].toUpperCase())}</p>`)
      dialogue = []
    } else if (screenplay && TRANSITION.test(t)) {
      flush()
      out.push(`<p class="sp-transition${/^FADE IN/.test(t) ? ' open' : ''}">${inline(t)}</p>`)
    } else {
      if (list || quote.length) flush()
      para.push(kind === 'poetry' ? indented(line) : inline(t))
    }
  }
  flush()
  return out.join('\n')
}
