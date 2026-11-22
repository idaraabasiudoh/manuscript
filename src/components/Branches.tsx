import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronRight, Columns2, GitBranch, MoreHorizontal, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { branchHue, branchTailText, compose, mainTail, paragraphs, piecesOf, type Branch, type Piece } from '../lib/branches'
import { renderMarkdown } from '../lib/markdown'
import { isScript, toText, type Script } from '../lib/script'
import type { Block, TextKind } from '../lib/supabase'
import { RichText } from './RichText'
import { ScriptEditor } from './ScriptEditor'
import { ScriptView } from './ScriptView'
import { TextEditor } from './TextEditor'
import { timeAgo } from '../lib/util'

/** CSS variable for a branch's colour (Main uses the accent colour). */
export const hueStyle = (b?: Pick<Branch, 'color'> | null) => (b ? ({ '--br-h': branchHue(b.color) } as CSSProperties) : undefined)

// ---- The switcher above a block ---------------------------------------------------

export function BranchBar({
  branches, active, onSelect, onNew, onCompare, canEdit,
}: {
  branches: Branch[]
  active: string | null
  onSelect: (id: string | null) => void
  onNew: () => void
  onCompare: () => void
  canEdit: boolean
}) {
  return (
    <div className="branch-bar" role="tablist" aria-label="Versions of this block">
      <span className="branch-bar-label" title="Branches let you try a different version from any point, without changing Main.">
        <GitBranch size={14} /> Versions
      </span>
      <button role="tab" aria-selected={active === null} className={`branch-pill is-main ${active === null ? 'on' : ''}`} onClick={() => onSelect(null)}>
        <Star size={12} /> Main
      </button>
      {branches.map((b) => (
        <button key={b.id} role="tab" aria-selected={active === b.id} className={`branch-pill ${active === b.id ? 'on' : ''}`} style={hueStyle(b)} onClick={() => onSelect(b.id)} title={`Starts at “${b.anchorLabel}”`}>
          <i className="branch-dot" />
          <span className="truncate">{b.name}</span>
        </button>
      ))}
      {canEdit && (
        <button className="branch-pill add" onClick={onNew}>
          <Plus size={13} /> New branch
        </button>
      )}
      {branches.length > 0 && (
        <button className="branch-pill ghost" onClick={onCompare} title="See versions side by side">
          <Columns2 size={13} /> Compare
        </button>
      )}
    </div>
  )
}

// ---- Creating a branch ------------------------------------------------------------

export function NewBranchDialog({
  block, branches, initialIndex, defaultName, onCreate, onClose,
}: {
  block: Block
  branches: Branch[]
  initialIndex?: number
  defaultName: string
  onCreate: (index: number, name: string) => Promise<void>
  onClose: () => void
}) {
  const pieces = useMemo(() => piecesOf(block), [block])
  const [index, setIndex] = useState<number | null>(initialIndex ?? null)
  const [name, setName] = useState(defaultName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const chosen = useRef<HTMLButtonElement>(null)
  useEffect(() => chosen.current?.scrollIntoView({ block: 'center' }), [])
  const startsHere = (i: number) => branches.filter((b) => b.anchorIndex === i || b.anchor === pieces[i]?.key)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (index === null || busy) return
    setBusy(true)
    setError('')
    try {
      await onCreate(index, name.trim() || defaultName)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const unit = block.kind === 'drama' && isScript(block.data.script) ? 'moment' : block.kind === 'poetry' ? 'stanza' : 'paragraph'
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog branch-dialog" role="dialog" aria-label="New branch" onSubmit={submit}>
        <header className="dialog-head">
          <div>
            <p className="mono-label"><GitBranch size={14} /> New branch</p>
            <h2>Try another version</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <p className="muted">
          Pick the {unit} where your new version should start. Everything before it stays shared with Main. From there on you can write it differently, and Main won’t change until you choose to use this version.
        </p>
        {pieces.length === 0 ? (
          <p className="branch-empty">This block is empty, so the branch will start from the beginning.</p>
        ) : (
          <ol className="piece-list" aria-label={`Choose a starting ${unit}`}>
            {pieces.map((p: Piece, i) => {
              const here = startsHere(i)
              const state = index === null ? '' : i < index ? 'shared' : i === index ? 'start' : 'tail'
              return (
                <li key={p.key}>
                  <button type="button" ref={i === index ? chosen : undefined} className={`piece ${state} type-${p.type}`} onClick={() => setIndex(i)} aria-pressed={i === index}>
                    <span className="piece-mark">{i === index ? <GitBranch size={13} /> : i + 1}</span>
                    <span className="piece-label">{p.label}</span>
                    {here.length > 0 && <span className="piece-tag" title={here.map((b) => b.name).join(', ')}>{here.length} branch{here.length > 1 ? 'es' : ''}</span>}
                  </button>
                </li>
              )
            })}
          </ol>
        )}
        <label className="branch-name">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Darker ending" />
        </label>
        {error && <p className="comment-error">{error}</p>}
        <footer className="dialog-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={(pieces.length > 0 && index === null) || busy}>{busy ? 'Creating…' : index === null && pieces.length ? `Choose a ${unit}` : 'Create branch'}</button>
        </footer>
      </form>
    </div>
  )
}

// ---- Viewing and editing a branch --------------------------------------------------

export function BranchBanner({
  branch, canEdit, onRename, onUse, onDelete, onCompare,
}: {
  branch: Branch
  canEdit: boolean
  onRename: (name: string) => void
  onUse: () => void
  onDelete: () => void
  onCompare: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(branch.name)
  const [menu, setMenu] = useState(false)
  useEffect(() => setName(branch.name), [branch.name])
  const done = () => {
    setRenaming(false)
    if (name.trim() && name.trim() !== branch.name) onRename(name.trim())
    else setName(branch.name)
  }
  return (
    <div className="branch-banner" style={hueStyle(branch)}>
      <div className="branch-banner-text">
        {renaming ? (
          <input className="branch-rename" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={done} onKeyDown={(e) => e.key === 'Enter' && done()} aria-label="Branch name" />
        ) : (
          <strong>{branch.name}</strong>
        )}
        <span className="muted">
          A different version from “{branch.anchorLabel}”. Edits here don’t change Main. Started by {branch.authorName} {timeAgo(branch.created)}.
        </span>
      </div>
      <div className="branch-banner-actions">
        <button className="chip ghost" onClick={onCompare}><ArrowLeftRight size={13} /> Compare with Main</button>
        {canEdit && <button className="chip solid branch-use" onClick={onUse}><Star size={13} /> Use this version</button>}
        {canEdit && (
          <span className="branch-menu-wrap">
            <button className="icon-btn sm" onClick={() => setMenu((m) => !m)} aria-label="More branch options" aria-expanded={menu}><MoreHorizontal size={16} /></button>
            {menu && (
              <span className="branch-menu" role="menu" onMouseLeave={() => setMenu(false)}>
                <button role="menuitem" onClick={() => (setMenu(false), setRenaming(true))}><Pencil size={14} /> Rename</button>
                <button role="menuitem" className="danger" onClick={() => (setMenu(false), onDelete())}><Trash2 size={14} /> Delete branch</button>
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

/** The branch: Main's shared part (folded away) then the branch's own continuation, viewable or editable. */
export function BranchBody({
  block, branch, editing, onEdit, onChange,
}: {
  block: Block
  branch: Branch
  editing: boolean
  onEdit?: () => void
  onChange: (tail: Script | string) => void
}) {
  const [showShared, setShowShared] = useState(false)
  const c = compose(block, branch)
  const sharedCount = c.at
  const kind = block.kind as TextKind
  const scenesBefore = c.mode === 'script' ? c.shared.elements.filter((e) => e.type === 'scene').length : 0

  return (
    <div className="branch-body" style={hueStyle(branch)}>
      {sharedCount > 0 && (
        <div className={`branch-shared ${showShared ? 'open' : ''}`}>
          <button className="branch-shared-toggle" onClick={() => setShowShared((s) => !s)} aria-expanded={showShared}>
            {showShared ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <span>
              Shared with Main · {sharedCount} {block.kind === 'drama' && c.mode === 'script' ? (sharedCount === 1 ? 'piece' : 'pieces') : block.kind === 'poetry' ? (sharedCount === 1 ? 'stanza' : 'stanzas') : sharedCount === 1 ? 'paragraph' : 'paragraphs'}
            </span>
            <span className="muted">{showShared ? 'Hide' : 'Show'}</span>
          </button>
          {showShared && (
            <div className="branch-shared-content" aria-label="Shared with Main">
              {c.mode === 'script' ? <ScriptView script={c.shared} /> : <RichText src={c.shared} kind={kind} />}
            </div>
          )}
        </div>
      )}
      <div className="branch-fork" aria-hidden>
        <GitBranch size={14} />
        <span>{branch.name} starts here</span>
      </div>
      {c.mode === 'script' ? (
        editing ? (
          <ScriptEditor bare script={c.tail} onChange={(next) => onChange(next)} />
        ) : (
          <ScriptView bare script={c.tail} firstScene={scenesBefore} onEdit={onEdit} />
        )
      ) : editing ? (
        <TextEditor kind={kind} value={c.tail} onChange={(v) => onChange(v)} autoFocus />
      ) : c.tail.trim() ? (
        <RichText src={c.tail} kind={kind} onDoubleClick={onEdit} />
      ) : (
        <button className="empty-block" onClick={onEdit} disabled={!onEdit}><Pencil size={15} /> Write this version</button>
      )}
    </div>
  )
}

// ---- Comparing versions -----------------------------------------------------------

type Side = string | null // branch id, or null for Main

function fullText(block: Block, branch: Branch | undefined) {
  if (!branch) return block.kind === 'drama' && isScript(block.data.script) ? toText(block.data.script) : block.body
  const c = compose(block, branch)
  return c.mode === 'script' ? toText(c.full) : c.full
}

/** Splits two texts into what they share at the start and end, and the parts that differ. */
function difference(a: string, b: string) {
  const pa = paragraphs(a)
  const pb = paragraphs(b)
  let start = 0
  while (start < pa.length && start < pb.length && pa[start] === pb[start]) start++
  let end = 0
  while (end < pa.length - start && end < pb.length - start && pa[pa.length - 1 - end] === pb[pb.length - 1 - end]) end++
  return { before: pa.slice(0, start), a: pa.slice(start, pa.length - end), b: pb.slice(start, pb.length - end), after: pb.slice(pb.length - end) }
}

export function CompareDialog({
  block, branches, left: initialLeft, right: initialRight, canEdit, onUse, onClose,
}: {
  block: Block
  branches: Branch[]
  left: Side
  right: Side
  canEdit: boolean
  onUse: (branch: Branch) => Promise<void>
  onClose: () => void
}) {
  const [left, setLeft] = useState<Side>(initialLeft)
  const [right, setRight] = useState<Side>(initialRight ?? branches[0]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const find = (id: Side) => branches.find((b) => b.id === id)
  const diff = useMemo(() => difference(fullText(block, find(left)), fullText(block, find(right))), [block, branches, left, right])
  const kind = (block.kind === 'drama' ? 'drama' : block.kind) as TextKind
  const html = (ps: string[]) => renderMarkdown(ps.join('\n\n'), kind)
  const last = diff.before[diff.before.length - 1]

  const use = async (b: Branch | undefined) => {
    if (!b || busy) return
    setBusy(true)
    try {
      await onUse(b)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const column = (side: Side, setSide: (s: Side) => void, parts: string[], other: Side) => {
    const b = find(side)
    return (
      <section className="compare-col" style={hueStyle(b)}>
        <header>
          <select value={side ?? ''} onChange={(e) => setSide(e.target.value || null)} aria-label="Version to compare">
            <option value="" disabled={other === null}>★ Main</option>
            {branches.map((x) => (
              <option key={x.id} value={x.id} disabled={x.id === other}>{x.name}</option>
            ))}
          </select>
        </header>
        <div className="compare-text">
          {parts.length ? <div className="md" dangerouslySetInnerHTML={{ __html: html(parts) }} /> : <p className="muted">Nothing here — this version leaves it out.</p>}
        </div>
        <footer>
          {b ? (
            canEdit && <button className="btn primary sm" disabled={busy} onClick={() => use(b)}><Star size={13} /> Use this version</button>
          ) : (
            <span className="muted compare-main-note"><Star size={13} /> This is Main right now</span>
          )}
        </footer>
      </section>
    )
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide compare-dialog" role="dialog" aria-label="Compare versions">
        <header className="dialog-head">
          <div>
            <p className="mono-label"><Columns2 size={14} /> Compare</p>
            <h2>{block.title || 'Untitled'}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <p className="muted compare-summary">
          {diff.before.length ? <>Both versions are the same up to “{last.replace(/\s+/g, ' ').replace(/(^|[\s(])@(?=\p{L})/gu, '$1').slice(0, 80)}”. Here’s where they differ:</> : 'These versions differ from the start:'}
        </p>
        {diff.a.length === 0 && diff.b.length === 0 ? (
          <p className="branch-empty">These two versions are identical.</p>
        ) : (
          <div className="compare-cols">
            {column(left, setLeft, diff.a, right)}
            {column(right, setRight, diff.b, left)}
          </div>
        )}
        {diff.after.length > 0 && <p className="muted compare-summary">…and they end the same way ({diff.after.length} matching at the end).</p>}
      </div>
    </div>
  )
}

/** Plain text of each side, for Manu or tests. */
export const describeBranch = (block: Block, b: Branch) => ({ main: mainTail(block, b), branch: branchTailText(block, b) })

// ---- Confirmations ------------------------------------------------------------------

export function ConfirmDialog({
  title, body, confirm, danger, onConfirm, onClose,
}: {
  title: string
  body: string
  confirm: string
  danger?: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog confirm-dialog" role="alertdialog" aria-label={title}>
        <header className="dialog-head"><h2>{title}</h2></header>
        <p className="muted">{body}</p>
        {error && <p className="comment-error">{error}</p>}
        <footer className="dialog-foot">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={go} disabled={busy}>{busy ? 'Working…' : confirm}</button>
        </footer>
      </div>
    </div>
  )
}
