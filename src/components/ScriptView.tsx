import { Check, Palette, Pencil, Type } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { characterVars, loadPageFont, PAGE_FONTS, PAGE_THEMES, pageFont, pageTheme, sceneHeading, type PageFont, type Script } from '../lib/script'

/** A structured script laid out like a typed screenplay page. */
export function ScriptView({
  script,
  onEdit,
  onTheme,
  onFont,
}: {
  script: Script
  onEdit?: () => void
  onTheme?: (theme: string) => void
  onFont?: (font: string) => void
}) {
  const { meta, cast, elements } = script
  const byId = (id: string) => cast.find((c) => c.id === id)
  const hasTitle = meta.title || meta.author || meta.format || meta.genre || meta.logline
  const theme = pageTheme(script.theme)
  const font = pageFont(script.font)
  useEffect(() => loadPageFont(font), [font])
  let sceneNo = 0

  if (!hasTitle && !cast.length && !elements.length)
    return onEdit ? (
      <button className="empty-block" onClick={onEdit}>
        <Pencil size={15} /> Empty script — click to start writing
      </button>
    ) : (
      <p className="muted">Nothing here yet.</p>
    )

  return (
    <article
      className={`script-page ${theme.id !== 'parchment' ? `themed${theme.dark ? ' dark-page' : ''}` : ''}`}
      style={
        {
          ...(theme.id !== 'parchment' ? { '--paper': theme.paper, '--ink': theme.ink } : {}),
          ...(font.id !== 'courier' ? { '--script': font.family } : {}),
        } as CSSProperties
      }
      onDoubleClick={onEdit}
    >
      {(onTheme || onFont) && (
        <div className="pg-tools" onDoubleClick={(e) => e.stopPropagation()}>
          {onFont && <FontPicker value={font.id} onChange={onFont} />}
          {onTheme && <ThemePicker value={theme.id} onChange={onTheme} />}
        </div>
      )}
      {hasTitle && (
        <header className="pg-titlepage">
          {meta.title && <h1>{meta.title}</h1>}
          {meta.author && (
            <p className="pg-byline">
              written by
              <br />
              <strong>{meta.author}</strong>
            </p>
          )}
          {(meta.format || meta.genre) && <p className="pg-meta">{[meta.format, meta.genre].filter(Boolean).join('  ·  ')}</p>}
          {meta.logline && <p className="pg-logline">{meta.logline}</p>}
        </header>
      )}

      {cast.length > 0 && (
        <section className="pg-cast">
          <h2>Characters</h2>
          <dl>
            {cast.map((c) => (
              <div key={c.id}>
                <dt className="has-ch" style={characterVars(c) as CSSProperties}>
                  {c.name || 'UNNAMED'}
                  {c.age && <span> ({c.age})</span>}
                </dt>
                {c.description && <dd>{c.description}</dd>}
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="pg-body">
        {elements.map((e) => {
          switch (e.type) {
            case 'scene':
              sceneNo++
              return (
                <h3 className="pg-scene" key={e.id}>
                  <span className="pg-num">{sceneNo}</span>
                  <span className="pg-heading">{sceneHeading(e) || 'SCENE'}</span>
                  <span className="pg-num">{sceneNo}</span>
                </h3>
              )
            case 'action':
              return e.text.trim() ? <p className="pg-action" key={e.id}>{e.text}</p> : null
            case 'dialogue':
              return (
                <div className="pg-speech" key={e.id}>
                  <p className="pg-cue has-ch" style={characterVars(byId(e.character)) as CSSProperties}>{byId(e.character)?.name || 'UNKNOWN'}</p>
                  {e.parenthetical && <p className="pg-paren">({e.parenthetical})</p>}
                  {e.text && <p className="pg-line">{e.text}</p>}
                </div>
              )
            case 'transition':
              return <p className={`pg-trans ${/^FADE IN/.test(e.text) ? 'open' : ''}`} key={e.id}>{e.text}</p>
            case 'note':
              return e.text.trim() ? (
                <aside className="pg-note" key={e.id}>
                  {e.label && <span className="pg-note-label">{e.label}</span>}
                  {e.text}
                </aside>
              ) : null
            case 'break':
              return <p className="pg-break" key={e.id}><span>{e.text || '✦'}</span></p>
          }
        })}
      </div>
    </article>
  )
}

/** A round button in the page corner that opens a small panel; closes on outside click or Escape. */
function PagePopover({ label, icon, children }: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])
  return (
    <div className="pg-pop" ref={box}>
      <button type="button" className="pg-theme-btn" onClick={() => setOpen((o) => !o)} aria-label={label} aria-expanded={open} title={label}>
        {icon}
      </button>
      {open && (
        <div className="pg-theme-panel" role="dialog" aria-label={label}>
          <p className="pg-theme-title">{label}</p>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Pick how the reading page looks. */
function ThemePicker({ value, onChange }: { value: string; onChange: (theme: string) => void }) {
  return (
    <PagePopover label="Page theme" icon={<Palette size={17} strokeWidth={1.75} />}>
      {() => (
        <div className="pg-theme-grid" role="listbox" aria-label="Page theme">
          {PAGE_THEMES.map((t) => (
            <button
              type="button"
              key={t.id}
              role="option"
              aria-selected={t.id === value}
              className={`pg-swatch ${t.id === value ? 'on' : ''}`}
              onClick={() => onChange(t.id)}
              title={t.name}
            >
              <span className="pg-swatch-chip" style={{ background: t.paper, color: t.ink }}>
                Aa{t.id === value && <Check size={12} strokeWidth={3} />}
              </span>
              <span className="pg-swatch-name">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </PagePopover>
  )
}

/** Pick the reading page's typeface; each option previews itself. */
function FontPicker({ value, onChange }: { value: string; onChange: (font: string) => void }) {
  useEffect(() => PAGE_FONTS.forEach(loadPageFont), [])
  const groups = ['Typewriter', 'Serif', 'Sans'] as PageFont['kind'][]
  return (
    <PagePopover label="Page font" icon={<Type size={17} strokeWidth={1.75} />}>
      {() => (
        <div className="pg-font-list" role="listbox" aria-label="Page font">
          {groups.map((g) => (
            <div key={g} className="pg-font-group">
              <span className="pg-font-kind">{g}</span>
              {PAGE_FONTS.filter((f) => f.kind === g).map((f) => (
                <button
                  type="button"
                  key={f.id}
                  role="option"
                  aria-selected={f.id === value}
                  className={`pg-font ${f.id === value ? 'on' : ''}`}
                  onClick={() => onChange(f.id)}
                >
                  <span className="pg-font-sample" style={{ fontFamily: f.family }}>
                    {f.name}
                  </span>
                  <span className="pg-font-line" style={{ fontFamily: f.family }}>
                    INT. KITCHEN - NIGHT
                  </span>
                  {f.id === value && <Check className="pg-font-check" size={15} strokeWidth={2.5} />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </PagePopover>
  )
}
