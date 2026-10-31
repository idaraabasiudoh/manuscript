import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'
import {
  AlignLeft,
  ChevronDown,
  ChevronUp,
  Clapperboard,
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
  CAST_COLORS,
  FORMATS,
  GENRES,
  NOTE_LABELS,
  TIMES,
  TRANSITIONS,
  newCharacter,
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

const color = (c?: Character) => (c ? CAST_COLORS[c.color % CAST_COLORS.length] : 'var(--muted)')

export function ScriptEditor({ script, onChange, onRevert }: Props) {
  const [focusId, setFocusId] = useState<string>()
  const [menuAt, setMenuAt] = useState<string | null>(null)
  const { meta, cast, elements } = script

  const set = (patch: Partial<Script>) => onChange({ ...script, ...patch })
  const setMeta = (patch: Partial<Script['meta']>) => set({ meta: { ...meta, ...patch } })
  const setCharacter = (id: string, patch: Partial<Character>) => set({ cast: cast.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const setElement = (id: string, patch: Partial<ScriptElement>) =>
    set({ elements: elements.map((e) => (e.id === id ? ({ ...e, ...patch } as ScriptElement) : e)) })

  const addCharacter = (name = '') => {
    const c = newCharacter(name, cast)
    set({ cast: [...cast, c] })
    setFocusId(c.id)
    return c
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
          <h4>Title page</h4>
          <span className="se-sub">How the script introduces itself</span>
        </header>
        <input className="se-title" value={meta.title} onChange={(e) => setMeta({ title: e.target.value })} placeholder="SCRIPT TITLE" aria-label="Script title" />
        <div className="se-grid">
          <label className="se-field">
            <span>Format</span>
            <input list="se-formats" value={meta.format} onChange={(e) => setMeta({ format: e.target.value })} placeholder="Short Film" />
          </label>
          <label className="se-field">
            <span>Genre</span>
            <input list="se-genres" value={meta.genre} onChange={(e) => setMeta({ genre: e.target.value })} placeholder="Drama" />
          </label>
          <label className="se-field">
            <span>Written by</span>
            <input value={meta.author} onChange={(e) => setMeta({ author: e.target.value })} placeholder="Your name" />
          </label>
        </div>
        <label className="se-field">
          <span>Logline</span>
          <AutoText value={meta.logline} onChange={(e) => setMeta({ logline: e.target.value })} placeholder="One sentence: who wants what, and what stands in the way." rows={1} />
        </label>
        <datalist id="se-formats">{FORMATS.map((f) => <option key={f} value={f} />)}</datalist>
        <datalist id="se-genres">{GENRES.map((g) => <option key={g} value={g} />)}</datalist>
      </section>

      {/* ---- Cast ---- */}
      <section className="se-section">
        <header className="se-head">
          <h4>Cast</h4>
          <span className="se-sub">{cast.length ? `${cast.length} ${cast.length === 1 ? 'character' : 'characters'} — reuse them for every line` : 'Create characters once, then give them lines'}</span>
          <button type="button" className="chip" onClick={() => addCharacter()}>
            <UserPlus size={14} /> Add character
          </button>
        </header>
        {cast.length > 0 && (
          <div className="se-cast">
            {cast.map((c) => (
              <div className="se-char" key={c.id} style={{ '--c': color(c) } as CSSProperties}>
                <span className="se-char-dot" aria-hidden />
                <div className="se-char-fields">
                  <div className="se-char-top">
                    <input
                      className="se-char-name"
                      value={c.name}
                      onChange={(e) => setCharacter(c.id, { name: e.target.value.toUpperCase() })}
                      placeholder="NAME"
                      aria-label="Character name"
                      autoFocus={focusId === c.id}
                    />
                    <input className="se-char-age" value={c.age} onChange={(e) => setCharacter(c.id, { age: e.target.value })} placeholder="Age" aria-label="Age" />
                  </div>
                  <AutoText
                    className="se-char-desc"
                    value={c.description}
                    onChange={(e) => setCharacter(c.id, { description: e.target.value })}
                    placeholder="Who are they? What are they hiding?"
                    rows={1}
                    aria-label="Description"
                  />
                </div>
                <button type="button" className="icon-btn sm" onClick={() => removeCharacter(c)} aria-label={`Remove ${c.name || 'character'}`} title="Remove from cast">
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Script ---- */}
      <section className="se-section">
        <header className="se-head">
          <h4>Script</h4>
          <span className="se-sub">⌘ / Ctrl + Enter adds the next line</span>
        </header>

        {elements.length === 0 && <p className="se-empty">Start with a scene, then add action and lines for your characters.</p>}

        <ol className="se-elements">
          {elements.map((el, i) => {
            const meta = TYPE_META[el.type]
            const speaker = el.type === 'dialogue' ? cast.find((c) => c.id === el.character) : undefined
            if (el.type === 'scene') sceneNo++
            return (
              <li key={el.id} className={`se-el se-${el.type}`} style={{ '--c': color(speaker) } as CSSProperties}>
                <div className="se-el-type" title={meta.hint}>
                  <meta.icon size={14} />
                  <span>{el.type === 'scene' ? `Scene ${sceneNo}` : meta.label}</span>
                </div>

                <div className="se-el-body">
                  {el.type === 'scene' && (
                    <div className="se-scene-row">
                      <select value={el.setting} onChange={(e) => setElement(el.id, { setting: e.target.value as Setting })} aria-label="Inside or outside">
                        <option value="INT.">INT.</option>
                        <option value="EXT.">EXT.</option>
                        <option value="INT./EXT.">INT./EXT.</option>
                        <option value="">—</option>
                      </select>
                      <input
                        className="se-loc"
                        value={el.location}
                        onChange={(e) => setElement(el.id, { location: e.target.value.toUpperCase() })}
                        onKeyDown={(e) => onKeyDown(e, el)}
                        placeholder="LOCATION"
                        aria-label="Location"
                        autoFocus={focusId === el.id}
                      />
                      <input
                        className="se-time"
                        list="se-times"
                        value={el.time}
                        onChange={(e) => setElement(el.id, { time: e.target.value.toUpperCase() })}
                        placeholder="TIME"
                        aria-label="Time of day"
                      />
                    </div>
                  )}

                  {el.type === 'action' && (
                    <AutoText
                      className="se-text"
                      value={el.text}
                      onChange={(e) => setElement(el.id, { text: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, el)}
                      placeholder="What do we see? Present tense."
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
                          {!speaker && <option value="">Choose character…</option>}
                          {cast.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name || 'UNNAMED'}
                            </option>
                          ))}
                          <option value="__new">+ New character…</option>
                        </select>
                        <input
                          className="se-paren"
                          value={el.parenthetical}
                          onChange={(e) => setElement(el.id, { parenthetical: e.target.value.replace(/^\(|\)$/g, '') })}
                          placeholder="(how it's said — optional)"
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
                    <input
                      className="se-trans"
                      list="se-transitions"
                      value={el.text}
                      onChange={(e) => setElement(el.id, { text: e.target.value.toUpperCase() })}
                      onKeyDown={(e) => onKeyDown(e, el)}
                      placeholder="CUT TO:"
                      aria-label="Transition"
                      autoFocus={focusId === el.id}
                    />
                  )}

                  {el.type === 'note' && (
                    <div className="se-note">
                      <input className="se-note-label" list="se-note-labels" value={el.label} onChange={(e) => setElement(el.id, { label: e.target.value })} placeholder="Note" aria-label="Note type" />
                      <AutoText
                        className="se-text"
                        value={el.text}
                        onChange={(e) => setElement(el.id, { text: e.target.value })}
                        onKeyDown={(e) => onKeyDown(e, el)}
                        placeholder="Camera moves, sound, or what happens between scenes…"
                        autoFocus={focusId === el.id}
                      />
                    </div>
                  )}

                  {el.type === 'break' && (
                    <input
                      className="se-break"
                      list="se-breaks"
                      value={el.text}
                      onChange={(e) => setElement(el.id, { text: e.target.value.toUpperCase() })}
                      onKeyDown={(e) => onKeyDown(e, el)}
                      placeholder="END OF ACT ONE"
                      aria-label="Break label"
                      autoFocus={focusId === el.id}
                    />
                  )}
                </div>

                <div className="se-el-tools">
                  <button type="button" className="icon-btn sm" onClick={() => move(el.id, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                    <ChevronUp size={15} />
                  </button>
                  <button type="button" className="icon-btn sm" onClick={() => move(el.id, 1)} disabled={i === elements.length - 1} aria-label="Move down" title="Move down">
                    <ChevronDown size={15} />
                  </button>
                  <button type="button" className={`icon-btn sm ${menuAt === el.id ? 'on' : ''}`} onClick={() => setMenuAt(menuAt === el.id ? null : el.id)} aria-label="Insert below" title="Insert below">
                    <Plus size={15} />
                  </button>
                  <button type="button" className="icon-btn sm" onClick={() => remove(el.id)} aria-label="Delete" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>

                {menuAt === el.id && <AddBar cast={cast} onAdd={(t, c) => insert(t, el.id, c)} onClose={() => setMenuAt(null)} compact />}
              </li>
            )
          })}
        </ol>

        <AddBar cast={cast} onAdd={(t, c) => insert(t, undefined, c)} />

        <datalist id="se-times">{TIMES.map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="se-transitions">{TRANSITIONS.map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="se-note-labels">{NOTE_LABELS.map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="se-breaks">{BREAKS.map((t) => <option key={t} value={t} />)}</datalist>
      </section>

      {onRevert && (
        <button type="button" className="se-revert" onClick={() => window.confirm('Switch back to the plain text this script was converted from? Changes made in the script builder will be lost.') && onRevert()}>
          <Undo2 size={14} /> Switch back to plain text
        </button>
      )}
    </div>
  )
}

/** Buttons to add script pieces; every cast member gets a one-tap "line" button. */
function AddBar({ cast, onAdd, onClose, compact }: { cast: Character[]; onAdd: (type: ElementType, character?: string) => void; onClose?: () => void; compact?: boolean }) {
  return (
    <div className={`se-add ${compact ? 'compact' : ''}`}>
      <div className="se-add-row">
        <span className="se-add-label">{compact ? 'Insert' : 'Add'}</span>
        {TYPES.filter((t) => t.type !== 'dialogue').map(({ type, label, hint, icon: Icon }) => (
          <button type="button" key={type} className="chip" onClick={() => onAdd(type)} title={hint}>
            <Icon size={14} /> {label}
          </button>
        ))}
        {onClose && (
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        )}
      </div>
      <div className="se-add-row">
        <span className="se-add-label">Line for</span>
        {cast.length === 0 && <span className="se-add-hint">Add characters to the cast to give them lines</span>}
        {cast.map((c) => (
          <button type="button" key={c.id} className="chip se-cue-chip" style={{ '--c': color(c) } as CSSProperties} onClick={() => onAdd('dialogue', c.id)}>
            <span className="se-char-dot" aria-hidden /> {c.name || 'UNNAMED'}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A textarea that grows with its content. */
function AutoText(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
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
