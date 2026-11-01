import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref, type TextareaHTMLAttributes } from 'react'
import {
  AlignLeft,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  List,
  MessageSquareQuote,
  MoveRight,
  Plus,
  SeparatorHorizontal,
  StickyNote,
  Trash2,
  Undo2,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  BREAKS,
  FORMATS,
  GENRES,
  NOTE_LABELS,
  TIMES,
  TRANSITIONS,
  characterVars,
  mentionName,
  newCharacter,
  renameMentions,
  splitMentions,
  newElement,
  type Character,
  type ElementType,
  type Script,
  type ScriptElement,
  type Setting,
} from '../lib/script'

type Props = {
  script: Script
  onChange: (script: Script) => void
  /** Present when the block was converted from plain text; restores that text. */
  onRevert?: () => void
}

const TYPES: { type: ElementType; label: string; hint: string; icon: LucideIcon }[] = [
  { type: 'scene', label: 'Scene', hint: 'Where and when a scene happens', icon: Clapperboard },
  { type: 'action', label: 'Action', hint: 'What we see happen', icon: AlignLeft },
  { type: 'dialogue', label: 'Line', hint: 'A character speaks', icon: MessageSquareQuote },
  { type: 'transition', label: 'Transition', hint: 'How we move to the next shot', icon: MoveRight },
  { type: 'note', label: 'Note', hint: 'Camera, sound or what happens between scenes', icon: StickyNote },
  { type: 'break', label: 'Break', hint: 'End of an act, intermission', icon: SeparatorHorizontal },
]
const TYPE_META = Object.fromEntries(TYPES.map((t) => [t.type, t])) as Record<ElementType, (typeof TYPES)[number]>

export function ScriptEditor({ script, onChange, onRevert }: Props) {
  const [focusId, setFocusId] = useState<string>()
  const [menuAt, setMenuAt] = useState<string | null>(null)
  const { meta, cast, elements } = script

  const set = (patch: Partial<Script>) => onChange({ ...script, ...patch })
  const setMeta = (patch: Partial<Script['meta']>) => set({ meta: { ...meta, ...patch } })
  const setCharacter = (id: string, patch: Partial<Character>) => set({ cast: cast.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const setElement = (id: string, patch: Partial<ScriptElement>) =>
    set({ elements: elements.map((e) => (e.id === id ? ({ ...e, ...patch } as ScriptElement) : e)) })

  /** Renaming a character also updates their @mentions in action and note text. */
  const renameCharacter = (c: Character, name: string) =>
    set({
      cast: cast.map((x) => (x.id === c.id ? { ...x, name } : x)),
      elements: renameMentions(elements, c.name, name, cast.filter((x) => x.id !== c.id)),
    })

  const addCharacter = () => {
    const c = newCharacter('', cast)
    set({ cast: [...cast, c] })
    setFocusId(c.id)
  }

  const removeCharacter = (c: Character) => {
    const lines = elements.filter((e) => e.type === 'dialogue' && e.character === c.id).length
    if (lines && !window.confirm(`${c.name || 'This character'} has ${lines} ${lines === 1 ? 'line' : 'lines'}. Remove them from the cast anyway? Their lines stay, marked as UNKNOWN.`)) return
    set({ cast: cast.filter((x) => x.id !== c.id) })
  }

  /** Insert after `afterId` (or at the end). Lines default to whoever spoke before the previous speaker. */
  const insert = (type: ElementType, afterId?: string, character?: string) => {
    const index = afterId ? elements.findIndex((e) => e.id === afterId) + 1 : elements.length
    let speaker = character ?? ''
    if (type === 'dialogue' && !character) {
      const before = elements.slice(0, index).filter((e) => e.type === 'dialogue') as Extract<ScriptElement, { type: 'dialogue' }>[]
      const last = before.at(-1)
      const other = [...before].reverse().find((e) => e.character !== last?.character)
      speaker = other?.character ?? last?.character ?? cast[0]?.id ?? ''
    }
    const el = newElement(type, speaker)
    set({ elements: [...elements.slice(0, index), el, ...elements.slice(index)] })
    setFocusId(el.id)
    setMenuAt(null)
  }

  const move = (id: string, dir: -1 | 1) => {
    const i = elements.findIndex((e) => e.id === id)
    const j = i + dir
    if (j < 0 || j >= elements.length) return
    const next = [...elements]
    ;[next[i], next[j]] = [next[j], next[i]]
    set({ elements: next })
  }

  const remove = (id: string) => set({ elements: elements.filter((e) => e.id !== id) })

  // ⌘/Ctrl + Enter adds the next piece of the same kind right below.
  const onKeyDown = (e: KeyboardEvent, el: ScriptElement) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      insert(el.type === 'scene' || el.type === 'transition' || el.type === 'break' ? 'action' : el.type, el.id)
    }
  }

  let sceneNo = 0

  return (
    <div className="script-editor">
      {/* ---- Title page ---- */}
      <section className="se-section">
        <header className="se-head">
          <div>
            <h4>Title page</h4>
            <p className="se-sub">How the script introduces itself</p>
          </div>
        </header>
        <input className="se-title" value={meta.title} onChange={(e) => setMeta({ title: e.target.value })} placeholder="SCRIPT TITLE" aria-label="Script title" />
        <div className="se-grid">
          <label className="se-field">
            <span>Format</span>
            <Choice value={meta.format} options={FORMATS} onChange={(format) => setMeta({ format })} placeholder="Choose a format" label="Format" />
          </label>
          <label className="se-field">
            <span>Genre</span>
            <Choice value={meta.genre} options={GENRES} onChange={(genre) => setMeta({ genre })} placeholder="Choose a genre" label="Genre" />
          </label>
          <label className="se-field">
            <span>Written by</span>
            <input value={meta.author} onChange={(e) => setMeta({ author: e.target.value })} placeholder="Your name" />
          </label>
        </div>
        <label className="se-field">
          <span>Logline</span>
          <AutoText value={meta.logline} onChange={(e) => setMeta({ logline: e.target.value })} placeholder="One sentence: who wants what, and what stands in the way." />
        </label>
      </section>

      {/* ---- Cast ---- */}
      <section className="se-section">
        <header className="se-head">
          <div>
            <h4>Cast</h4>
            <p className="se-sub">{cast.length ? `${cast.length} ${cast.length === 1 ? 'character' : 'characters'} · reuse them for every line` : 'Create characters once, then give them lines'}</p>
          </div>
          <button type="button" className="btn se-head-btn" onClick={addCharacter}>
            <UserPlus size={16} /> Add character
          </button>
        </header>
        {cast.length > 0 && (
          <div className="se-cast">
            {cast.map((c) => (
              <div className="se-char has-ch" key={c.id} style={characterVars(c) as CSSProperties}>
                <div className="se-char-top">
                  <input
                    className="se-char-name"
                    value={c.name}
                    onChange={(e) => renameCharacter(c, e.target.value.toUpperCase())}
                    placeholder="NAME"
                    aria-label="Character name"
                    autoFocus={focusId === c.id}
                  />
                  <input className="se-char-age" value={c.age} onChange={(e) => setCharacter(c.id, { age: e.target.value })} placeholder="Age" aria-label="Age" />
                  <button type="button" className="icon-btn sm" onClick={() => removeCharacter(c)} aria-label={`Remove ${c.name || 'character'}`} title="Remove from cast">
                    <X size={16} />
                  </button>
                </div>
                <AutoText
                  className="se-char-desc"
                  value={c.description}
                  onChange={(e) => setCharacter(c.id, { description: e.target.value })}
                  placeholder="Who are they? What are they hiding?"
                  aria-label="Description"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Script ---- */}
      <section className="se-section">
        <header className="se-head">
          <div>
            <h4>Script</h4>
            <p className="se-sub">
              {elements.length ? `${elements.length} ${elements.length === 1 ? 'piece' : 'pieces'}` : 'Start with a scene'}
              <span className="se-shortcut"> · ⌘/Ctrl + Enter adds the next line</span>
            </p>
          </div>
        </header>

        {elements.length === 0 && <p className="se-empty">Add a scene, then action and lines for your characters.</p>}

        <ol className="se-elements">
          {elements.map((el, i) => {
            const meta = TYPE_META[el.type]
            const speaker = el.type === 'dialogue' ? cast.find((c) => c.id === el.character) : undefined
            if (el.type === 'scene') sceneNo++
            return (
              <li key={el.id} className={`se-el se-${el.type} ${speaker ? 'has-ch' : ''}`} style={characterVars(speaker) as CSSProperties}>
                <div className="se-el-head">
                  <span className="se-el-type" title={meta.hint}>
                    <meta.icon size={14} />
                    {el.type === 'scene' ? `Scene ${sceneNo}` : meta.label}
                  </span>
                  <div className="se-el-tools">
                    <button type="button" className="icon-btn sm" onClick={() => move(el.id, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                      <ChevronUp size={16} />
                    </button>
                    <button type="button" className="icon-btn sm" onClick={() => move(el.id, 1)} disabled={i === elements.length - 1} aria-label="Move down" title="Move down">
                      <ChevronDown size={16} />
                    </button>
                    <button type="button" className={`icon-btn sm ${menuAt === el.id ? 'on' : ''}`} onClick={() => setMenuAt(menuAt === el.id ? null : el.id)} aria-label="Insert below" aria-expanded={menuAt === el.id} title="Insert below">
                      <Plus size={16} />
                    </button>
                    <button type="button" className="icon-btn sm" onClick={() => remove(el.id)} aria-label="Delete" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {el.type === 'scene' && (
                  <div className="se-scene-row">
                    <select className="se-setting" value={el.setting} onChange={(e) => setElement(el.id, { setting: e.target.value as Setting })} aria-label="Inside or outside">
                      <option value="INT.">INT.</option>
                      <option value="EXT.">EXT.</option>
                      <option value="INT./EXT.">INT./EXT.</option>
                      <option value="">None</option>
                    </select>
                    <AutoText
                      className="se-loc"
                      value={el.location}
                      onChange={(e) => setElement(el.id, { location: e.target.value.replace(/\n/g, ' ').toUpperCase() })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) e.preventDefault()
                        onKeyDown(e, el)
                      }}
                      placeholder="LOCATION"
                      aria-label="Location"
                      autoFocus={focusId === el.id}
                    />
                    <Choice className="se-time" value={el.time} options={TIMES} onChange={(time) => setElement(el.id, { time: time.toUpperCase() })} placeholder="Time of day" label="Time of day" upper />
                  </div>
                )}

                {el.type === 'action' && (
                  <MentionText
                    className="se-text"
                    value={el.text}
                    cast={cast}
                    onChange={(text) => setElement(el.id, { text })}
                    onKeyDown={(e) => onKeyDown(e, el)}
                    placeholder="What do we see? Present tense. Type @ to name a character."
                    autoFocus={focusId === el.id}
                  />
                )}

                {el.type === 'dialogue' && (
                  <div className="se-speech">
                    <div className="se-speech-top">
                      <select
                        className="se-who"
                        value={speaker ? el.character : ''}
                        onChange={(e) => {
                          if (e.target.value === '__new') {
                            const name = window.prompt('New character name')
                            if (name?.trim()) {
                              const c = newCharacter(name, cast)
                              onChange({ ...script, cast: [...cast, c], elements: elements.map((x) => (x.id === el.id ? { ...x, character: c.id } : x)) })
                            }
                          } else setElement(el.id, { character: e.target.value })
                        }}
                        aria-label="Who speaks"
                      >
                        {!speaker && <option value="">Choose character</option>}
                        {cast.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || 'Unnamed'}
                          </option>
                        ))}
                        <option value="__new">New character…</option>
                      </select>
                      <AutoText
                        className="se-paren"
                        value={el.parenthetical}
                        onChange={(e) => setElement(el.id, { parenthetical: e.target.value.replace(/\n/g, ' ').replace(/^\(|\)$/g, '') })}
                        placeholder="Direction, e.g. quietly (optional)"
                        aria-label="Direction"
                      />
                    </div>
                    <AutoText
                      className="se-text se-line"
                      value={el.text}
                      onChange={(e) => setElement(el.id, { text: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, el)}
                      placeholder="What they say…"
                      autoFocus={focusId === el.id}
                    />
                  </div>
                )}

                {el.type === 'transition' && (
                  <Choice className="se-trans" value={el.text} options={TRANSITIONS} onChange={(text) => setElement(el.id, { text: text.toUpperCase() })} placeholder="Choose a transition" label="Transition" upper />
                )}

                {el.type === 'note' && (
                  <div className="se-note">
                    <Choice className="se-note-label" value={el.label} options={NOTE_LABELS} onChange={(label) => setElement(el.id, { label })} placeholder="Note type" label="Note type" />
                    <MentionText
                      className="se-text"
                      value={el.text}
                      cast={cast}
                      onChange={(text) => setElement(el.id, { text })}
                      onKeyDown={(e) => onKeyDown(e, el)}
                      placeholder="Camera moves, sound, or what happens between scenes… Type @ to name a character."
                      autoFocus={focusId === el.id}
                    />
                  </div>
                )}

                {el.type === 'break' && (
                  <Choice className="se-break" value={el.text} options={BREAKS} onChange={(text) => setElement(el.id, { text: text.toUpperCase() })} placeholder="Choose a break" label="Break" upper />
                )}

                {menuAt === el.id && <AddBar cast={cast} onAdd={(t, c) => insert(t, el.id, c)} onClose={() => setMenuAt(null)} compact />}
              </li>
            )
          })}
        </ol>

        <AddBar cast={cast} onAdd={(t, c) => insert(t, undefined, c)} />
      </section>

      {onRevert && (
        <button type="button" className="se-revert" onClick={() => window.confirm('Switch back to the plain text this script was converted from? Changes made in the script builder will be lost.') && onRevert()}>
          <Undo2 size={14} /> Switch back to plain text
        </button>
      )}
    </div>
  )
}

/**
 * A native OS dropdown of common choices, with "Other…" for typing your own.
 * Custom values (anything not in the list) show as a text field with a button back to the list.
 */
function Choice({
  value,
  options,
  onChange,
  placeholder,
  label,
  className = '',
  upper,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
  placeholder: string
  label: string
  className?: string
  upper?: boolean
}) {
  const known = options.includes(value)
  const [custom, setCustom] = useState(!known && value !== '')
  const input = useRef<HTMLTextAreaElement>(null)

  if (custom)
    return (
      <div className={`se-choice ${className}`}>
        <AutoText
          ref={input}
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(/\n/g, ' ')
            onChange(upper ? v.toUpperCase() : v)
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          placeholder={`Type a ${label.toLowerCase()}`}
          aria-label={label}
        />
        <button type="button" className="icon-btn sm" onClick={() => setCustom(false)} title="Choose from the list" aria-label="Choose from the list">
          <List size={16} />
        </button>
      </div>
    )

  return (
    <select
      className={className}
      value={known ? value : ''}
      aria-label={label}
      onChange={(e) => {
        if (e.target.value === '__other') {
          setCustom(true)
          onChange('')
          requestAnimationFrame(() => input.current?.focus())
        } else onChange(e.target.value)
      }}
    >
      {!known && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__other">Other…</option>
    </select>
  )
}

/** Buttons to add script pieces; every cast member gets a one-tap "line" button. */
function AddBar({ cast, onAdd, onClose, compact }: { cast: Character[]; onAdd: (type: ElementType, character?: string) => void; onClose?: () => void; compact?: boolean }) {
  return (
    <div className={`se-add ${compact ? 'compact' : ''}`}>
      <div className="se-add-group">
        <span className="se-add-label">{compact ? 'Insert below' : 'Add to script'}</span>
        <div className="se-add-row">
          {TYPES.filter((t) => t.type !== 'dialogue').map(({ type, label, hint, icon: Icon }) => (
            <button type="button" key={type} className="chip" onClick={() => onAdd(type)} title={hint}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        {onClose && (
          <button type="button" className="icon-btn sm se-add-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="se-add-group">
        <span className="se-add-label">Line for</span>
        <div className="se-add-row">
          {cast.length === 0 && <span className="se-add-hint">Add characters to the cast to give them lines</span>}
          {cast.map((c) => (
            <button type="button" key={c.id} className="chip se-cue-chip has-ch" style={characterVars(c) as CSSProperties} onClick={() => onAdd('dialogue', c.id)}>
              <MessageSquareQuote size={15} /> {c.name || 'Unnamed'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A textarea that grows with its content. */
function AutoText({ ref: outer, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(outer, () => ref.current!, [])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])
  useEffect(() => {
    if (props.autoFocus) ref.current?.focus({ preventScroll: false })
  }, [props.autoFocus])
  return <textarea rows={1} {...props} ref={ref} />
}

// ---- @mentions --------------------------------------------------------------------

/** "@" plus what's been typed of a name, right before the caret. */
const MENTION_QUERY = /(?:^|[\s([“"'‘—–-])@([\p{L}\p{N}][\p{L}\p{N} .'’-]{0,29}|)$/u

/**
 * Action and note text with @mentions. The textarea's own text is transparent and sits over a
 * copy of the same text where mentions are tinted in their character's colour (same font, same
 * wrapping, so they line up). Typing "@" opens a list of the cast at the caret.
 */
function MentionText({
  value,
  onChange,
  cast,
  onKeyDown,
  className = '',
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { value: string; onChange: (value: string) => void; cast: Character[] }) {
  const ta = useRef<HTMLTextAreaElement>(null)
  const marker = useRef<HTMLSpanElement>(null)
  const [focused, setFocused] = useState(false)
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const pendingCaret = useRef<number | null>(null)

  const named = cast.filter((c) => c.name.trim())
  const match = focused ? value.slice(0, caret).match(MENTION_QUERY) : null
  const at = match ? caret - match[1].length - 1 : -1
  const query = match?.[1].toLowerCase() ?? ''
  const options = match ? named.filter((c) => c.name.toLowerCase().startsWith(query)) : []
  const open = !!match && at !== dismissed && (options.length > 0 || (!named.length && !query))

  useEffect(() => setActive(0), [query])

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && ta.current) {
      ta.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
      setCaret(pendingCaret.current)
      pendingCaret.current = null
    }
  })

  // Place the list just under the caret, kept inside the field.
  useLayoutEffect(() => {
    if (!open || !marker.current || !ta.current) return setMenuPos(null)
    const width = ta.current.clientWidth
    const lineHeight = parseFloat(getComputedStyle(ta.current).lineHeight) || 24
    setMenuPos({ top: marker.current.offsetTop + lineHeight + 2, left: Math.max(0, Math.min(marker.current.offsetLeft - 8, width - 220)) })
  }, [open, caret, value])

  const sync = () => ta.current && setCaret(ta.current.selectionStart)

  const pick = (c: Character) => {
    const name = `@${mentionName(c.name)}`
    const after = value.slice(caret)
    const insert = after.startsWith(' ') ? name : `${name} `
    pendingCaret.current = at + insert.length + (after.startsWith(' ') ? 1 : 0)
    onChange(value.slice(0, at) + insert + after)
  }

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
        return
      }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault()
        pick(options[Math.min(active, options.length - 1)])
        return
      }
    }
    if (open && e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setDismissed(at)
      return
    }
    onKeyDown?.(e)
  }

  const parts = (text: string, key: string) =>
    splitMentions(text, cast).map((p, i) =>
      p.character ? (
        <mark key={`${key}${i}`} className="mention has-ch" style={characterVars(p.character) as CSSProperties}>
          {p.text}
        </mark>
      ) : (
        <span key={`${key}${i}`}>{p.text}</span>
      ),
    )

  return (
    <div className={`mention-field ${className}`}>
      <div className={`mention-backdrop ${className}`} aria-hidden>
        {open ? (
          <>
            {parts(value.slice(0, caret), 'a')}
            <span ref={marker} />
            {parts(value.slice(caret), 'b')}
          </>
        ) : (
          parts(value, 'v')
        )}
        {/* A trailing newline needs a character after it to take up its line. */}
        {value.endsWith('\n') || !value ? '​' : null}
      </div>
      <AutoText
        {...rest}
        ref={ta}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setCaret(e.target.selectionStart)
          if (dismissed !== null && !e.target.value.slice(0, e.target.selectionStart).match(MENTION_QUERY)) setDismissed(null)
        }}
        onKeyDown={keyDown}
        onKeyUp={sync}
        onClick={sync}
        onSelect={sync}
        onFocus={() => (setFocused(true), sync())}
        onBlur={() => setFocused(false)}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && menuPos && (
        <ul className="mention-menu" role="listbox" style={{ top: menuPos.top, left: menuPos.left }} onPointerDown={(e) => e.preventDefault()}>
          {options.length ? (
            options.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === active}>
                <button type="button" className={`mention-option has-ch ${i === active ? 'on' : ''}`} style={characterVars(c) as CSSProperties} onMouseEnter={() => setActive(i)} onClick={() => pick(c)}>
                  <span className="mention-dot" aria-hidden />
                  <span className="mention-option-name">{mentionName(c.name)}</span>
                  {c.age && <span className="mention-option-age">{c.age}</span>}
                </button>
              </li>
            ))
          ) : (
            <li className="mention-empty">Add characters to the cast to mention them here.</li>
          )}
        </ul>
      )}
    </div>
  )
}
