import { Pencil } from 'lucide-react'
import type { CSSProperties } from 'react'
import { characterVars, sceneHeading, type Script } from '../lib/script'

/** A structured script laid out like a typed screenplay page. */
export function ScriptView({ script, onEdit }: { script: Script; onEdit?: () => void }) {
  const { meta, cast, elements } = script
  const byId = (id: string) => cast.find((c) => c.id === id)
  const hasTitle = meta.title || meta.author || meta.format || meta.genre || meta.logline
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
    <article className="script-page" onDoubleClick={onEdit}>
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
