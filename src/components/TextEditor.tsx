import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { renderMarkdown } from '../lib/markdown'
import type { TextKind } from '../lib/supabase'
import { Help } from './Icons'

type Props = { kind: TextKind; value: string; onChange: (value: string) => void; autoFocus?: boolean }

type Tool = {
  id: string
  label: ReactNode
  name: string
  help: string
  shortcut?: string
  run: (ed: Ops) => void
  active?: (line: string) => boolean
}

// ---- Text operations ----------------------------------------------------------
// Changes go through execCommand('insertText') where possible so the browser's own
// undo/redo keeps working after toolbar edits.

type Ops = ReturnType<typeof ops>

function ops(ta: HTMLTextAreaElement) {
  const replace = (from: number, to: number, text: string, selStart: number, selEnd: number) => {
    ta.focus()
    ta.setSelectionRange(from, to)
    const ok = document.execCommand?.('insertText', false, text)
    if (!ok) {
      ta.setRangeText(text, from, to, 'end')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    }
    ta.setSelectionRange(selStart, selEnd)
  }

  const lineRange = () => {
    const v = ta.value
    const start = v.lastIndexOf('\n', ta.selectionStart - 1) + 1
    let end = v.indexOf('\n', Math.max(ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? 1 : 0), ta.selectionStart))
    if (end === -1) end = v.length
    return { start, end, lines: v.slice(start, end).split('\n') }
  }

  return {
    /** Wrap the selection in a marker (or unwrap it if already wrapped). */
    wrap(marker: string, placeholder: string) {
      const { selectionStart: s, selectionEnd: e, value: v } = ta
      const sel = v.slice(s, e)
      const m = marker.length
      if (v.slice(s - m, s) === marker && v.slice(e, e + m) === marker) {
        replace(s - m, e + m, sel, s - m, e - m)
      } else if (sel.startsWith(marker) && sel.endsWith(marker) && sel.length >= m * 2) {
        const inner = sel.slice(m, -m)
        replace(s, e, inner, s, s + inner.length)
      } else {
        const text = sel || placeholder
        replace(s, e, marker + text + marker, s + m, s + m + text.length)
      }
    },

    /** Give every selected line a prefix, replacing any other line style. Toggles off if all lines have it. */
    linePrefix(prefix: string | ((i: number) => string), has?: RegExp) {
      const { start, end, lines } = lineRange()
      const pre = (i: number) => (typeof prefix === 'function' ? prefix(i) : prefix)
      const toggles = Boolean(has || pre(0))
      const all = toggles && lines.every((l, i) => !l.trim() || (has ? has.test(l) : l.startsWith(pre(i))))
      const next = lines.map((l, i) => {
        if (!l.trim() && lines.length > 1) return l
        const bare = l.replace(STYLE, '')
        return all ? bare : pre(i) + bare
      })
      const text = next.join('\n')
      replace(start, end, text, start + (lines.length === 1 ? text.length : 0), start + text.length)
    },

    /** Wrap each selected line with start/end markers, toggling. */
    lineWrap(open: string, close: string) {
      const { start, end, lines } = lineRange()
      const has = lines.every((l) => l.startsWith(open) && l.endsWith(close))
      const text = lines.map((l) => (has ? l.slice(open.length, -close.length || undefined) : l ? open + l + close : l)).join('\n')
      replace(start, end, text, start, start + text.length)
    },

    /** Insert text on its own line(s) at the cursor, selecting `select` within it if given. */
    insertLines(text: string, select?: string) {
      const { selectionStart: s, selectionEnd: e, value: v } = ta
      const before = v.slice(0, s)
      const lead = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
      const after = v.slice(e)
      const trail = after.startsWith('\n') ? '\n' : '\n\n'
      const insert = lead + text + trail
      const i = select ? insert.indexOf(select) : -1
      const at = s + (i >= 0 ? i : insert.length)
      replace(s, e, insert, at, i >= 0 ? at + select!.length : at)
    },

    indent(delta: 1 | -1) {
      const { start, end, lines } = lineRange()
      const text = lines.map((l) => (delta > 0 ? '  ' + l : l.replace(/^ {1,2}/, ''))).join('\n')
      replace(start, end, text, start, start + text.length)
    },

    link() {
      const { selectionStart: s, selectionEnd: e, value: v } = ta
      const url = window.prompt('Paste the web address for this link', 'https://')
      if (!url || url === 'https://') return
      const label = v.slice(s, e) || 'link text'
      const text = `[${label}](${url.trim()})`
      replace(s, e, text, s + 1, s + 1 + label.length)
    },

    currentLine() {
      const v = ta.value
      const start = v.lastIndexOf('\n', ta.selectionStart - 1) + 1
      const end = v.indexOf('\n', ta.selectionStart)
      return v.slice(start, end === -1 ? undefined : end)
    },
  }
}

const STYLE = /^(#{1,3}\s+|>\s?|\s*[-•*]\s+|\s*\d+[.)]\s+|@\s*)/

// ---- Toolbar definitions ------------------------------------------------------

const SIZES: Tool[] = [
  { id: 'h1', label: 'Title', name: 'Title', help: 'The biggest text — use once, for the name of the piece.', run: (o) => o.linePrefix('# '), active: (l) => /^# /.test(l) },
  { id: 'h2', label: 'Heading', name: 'Heading', help: 'A large section heading, like "Act One" or "Chapter 2".', run: (o) => o.linePrefix('## '), active: (l) => /^## /.test(l) },
  { id: 'h3', label: 'Subheading', name: 'Subheading', help: 'A smaller heading inside a section, like "Scene 1" or "Verse".', run: (o) => o.linePrefix('### '), active: (l) => /^### /.test(l) },
  { id: 'p', label: 'Body', name: 'Body text', help: 'Normal text. Removes any heading, quote or list style from the line.', run: (o) => o.linePrefix(''), active: (l) => !STYLE.test(l) },
]

const STYLES: Tool[] = [
  { id: 'b', label: <b>B</b>, name: 'Bold', help: 'Make the selected words heavier.', shortcut: '⌘B', run: (o) => o.wrap('**', 'bold text') },
  { id: 'i', label: <i>I</i>, name: 'Italic', help: 'Slant the selected words — for emphasis, titles or thoughts.', shortcut: '⌘I', run: (o) => o.wrap('*', 'italic text') },
  { id: 'u', label: <u>U</u>, name: 'Underline', help: 'Underline the selected words.', shortcut: '⌘U', run: (o) => o.wrap('++', 'underlined text') },
  { id: 's', label: <s>S</s>, name: 'Strikethrough', help: 'Cross words out, but keep them visible.', run: (o) => o.wrap('~~', 'crossed out') },
]

const STRUCTURE: Tool[] = [
  { id: 'quote', label: '❝', name: 'Quote', help: 'Set a line apart as a quotation or epigraph.', run: (o) => o.linePrefix('> ', /^>/), active: (l) => /^>/.test(l) },
  { id: 'ul', label: '•', name: 'Bulleted list', help: 'Turn lines into a bulleted list.', run: (o) => o.linePrefix('- ', /^\s*[-•]\s/), active: (l) => /^\s*[-•]\s/.test(l) },
  { id: 'ol', label: '1.', name: 'Numbered list', help: 'Turn lines into a numbered list.', run: (o) => o.linePrefix((i) => `${i + 1}. `, /^\s*\d+[.)]\s/), active: (l) => /^\s*\d+[.)]\s/.test(l) },
  { id: 'center', label: '≡', name: 'Center', help: 'Center the line — good for poem titles and dedications.', run: (o) => o.lineWrap('->', '<-'), active: (l) => /^->.*<-$/.test(l) },
  { id: 'hr', label: '—', name: 'Divider', help: 'A thin line across the page to separate sections.', run: (o) => o.insertLines('---') },
  { id: 'link', label: '🔗', name: 'Link', help: 'Turn the selected words into a clickable link.', run: (o) => o.link() },
]

const EXTRAS: Record<TextKind, Tool[]> = {
  text: [],
  poetry: [
    { id: 'indent', label: '⇥', name: 'Indent', help: 'Push the line to the right — for cascading lines.', run: (o) => o.indent(1) },
    { id: 'outdent', label: '⇤', name: 'Outdent', help: 'Pull an indented line back to the left.', run: (o) => o.indent(-1) },
    { id: 'stanza', label: 'Stanza', name: 'New stanza', help: 'Start a new stanza (an empty line between groups of lines).', run: (o) => o.insertLines('New stanza…', 'New stanza…') },
    { id: 'break', label: '✦', name: 'Section break', help: 'Three stars to separate parts of a poem.', run: (o) => o.insertLines('* * *') },
  ],
  drama: [
    { id: 'scene', label: 'Scene', name: 'Scene heading', help: 'Where and when: INT. (inside) or EXT. (outside), the place, then DAY or NIGHT.', run: (o) => o.insertLines('INT. LOCATION - DAY', 'LOCATION') },
    { id: 'char', label: 'Character', name: 'Character', help: 'Who speaks. Type their dialogue on the lines right below the name.', run: (o) => o.insertLines('@NAME\nWhat they say.', 'NAME') },
    { id: 'paren', label: '(beat)', name: 'Parenthetical', help: 'How a line is said, e.g. (whispering). Put it between the name and the dialogue.', run: (o) => o.insertLines('(quietly)', 'quietly') },
    { id: 'trans', label: 'CUT TO:', name: 'Transition', help: 'How we move to the next scene, e.g. CUT TO: or FADE OUT.', run: (o) => o.insertLines('CUT TO:') },
    { id: 'action', label: 'Action', name: 'Action / stage direction', help: 'What we see happen. Written in the present tense.', run: (o) => o.insertLines('*She crosses to the window.*', 'She crosses to the window.') },
  ],
  prose: [
    { id: 'chapter', label: 'Chapter', name: 'Chapter', help: 'Start a new chapter with a heading.', run: (o) => o.insertLines('## Chapter title', 'Chapter title') },
    { id: 'break', label: '✦ ✦ ✦', name: 'Scene break', help: 'Jump in time or place within a chapter.', run: (o) => o.insertLines('* * *') },
  ],
}

const EXTRA_LABEL: Record<TextKind, string> = { text: '', poetry: 'Verse', drama: 'Script', prose: 'Story' }

// ---- Component ----------------------------------------------------------------

export function TextEditor({ kind, value, onChange, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [line, setLine] = useState('')
  const [guide, setGuide] = useState(false)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const html = useMemo(() => renderMarkdown(value, kind), [value, kind])

  useLayoutEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(ta.scrollHeight, 220)}px`
  }, [value, tab])

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true })
  }, [autoFocus])

  const run = (tool: Tool) => {
    if (!ref.current) return
    setTab('write')
    tool.run(ops(ref.current))
    syncLine()
  }

  const syncLine = () => ref.current && setLine(ops(ref.current).currentLine())

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return
    const tool = { b: STYLES[0], i: STYLES[1], u: STYLES[2] }[e.key.toLowerCase()]
    if (tool) {
      e.preventDefault()
      run(tool)
    }
  }

  const button = (t: Tool, cls = '') => (
    <button
      key={t.id}
      type="button"
      className={`tool ${cls} ${t.active?.(line) ? 'on' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(t)}
      title={`${t.name}${t.shortcut ? ` (${t.shortcut})` : ''} — ${t.help}`}
      aria-label={t.name}
    >
      {t.label}
    </button>
  )

  const extras = EXTRAS[kind]

  return (
    <div className={`editor kind-${kind}`}>
      <div className="editor-bar" role="toolbar" aria-label="Formatting">
        <div className="tool-group sizes" aria-label="Text size">
          {SIZES.map((t) => button(t, `size-${t.id}`))}
        </div>
        <div className="tool-group">{STYLES.map((t) => button(t, 'square'))}</div>
        <div className="tool-group">{STRUCTURE.map((t) => button(t, 'square'))}</div>
        {extras.length > 0 && (
          <div className="tool-group extras">
            <span className="tool-label">{EXTRA_LABEL[kind]}</span>
            {extras.map((t) => button(t))}
          </div>
        )}
        <div className="editor-bar-end">
          <div className="segmented only-narrow">
            <button type="button" className={tab === 'write' ? 'on' : ''} onClick={() => setTab('write')}>Write</button>
            <button type="button" className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>Preview</button>
          </div>
          <button type="button" className={`tool square ${guide ? 'on' : ''}`} onClick={() => setGuide((g) => !g)} title="How formatting works" aria-label="Formatting guide">
            <Help width={15} height={15} />
          </button>
        </div>
      </div>

      {guide && <Guide kind={kind} />}

      <div className={`editor-split show-${tab}`}>
        <div className="editor-write">
          <span className="pane-label mono-label">Write</span>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onKeyUp={syncLine}
            onClick={syncLine}
            onSelect={syncLine}
            spellCheck
            placeholder={PLACEHOLDER[kind]}
            aria-label="Block text"
          />
        </div>
        <div className="editor-preview">
          <span className="pane-label mono-label">Preview</span>
          {value.trim() ? (
            <div className={`md md-${kind}`} dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="muted preview-empty">Your formatted text appears here as you write.</p>
          )}
        </div>
      </div>
    </div>
  )
}

const PLACEHOLDER: Record<TextKind, string> = {
  text: 'Start typing. Use the buttons above to make headings, bold words or lists.',
  poetry: 'Write line by line. Leave an empty line between stanzas.',
  drama: 'Use “Scene” and “Character” above to format your script as you go.',
  prose: 'Write in paragraphs. Leave an empty line to start a new one.',
}

function Guide({ kind }: { kind: TextKind }) {
  const rows: [string, string][] = [
    ['Title / Heading / Subheading', 'Click on a line, then pick a size. "Body" makes it normal text again.'],
    ['B  I  U  S', 'Select words first, then click to make them bold, italic, underlined or crossed out.'],
    ['Lists, quotes, center', 'Click on a line (or select several) and press the button. Press again to undo it.'],
    ['New paragraph', 'Leave an empty line. A single Enter keeps lines together, like in a poem.'],
  ]
  if (kind === 'drama')
    rows.push(
      ['Scene', 'Lines starting with INT. or EXT. become scene headings.'],
      ['Character', 'A name starting with @ is who speaks; the lines below it are their dialogue, until an empty line.'],
      ['(beat)', 'Words in brackets under a character show how the line is said.'],
    )
  if (kind === 'poetry') rows.push(['Indent', 'Spaces at the start of a line are kept, so you can cascade lines.'])
  if (kind === 'prose') rows.push(['✦ ✦ ✦', 'A scene break: a jump in time or place.'])
  return (
    <dl className="guide">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
