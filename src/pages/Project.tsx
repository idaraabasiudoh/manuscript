import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import { ArrowLeft, Lock, Mic, Settings } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BlockView } from '../components/Block'
import { Chat } from '../components/Chat'
import { Close, Eye, KindIcon, Logo, Menu, Pencil, Plus, Share, Trash, ThemeToggle } from '../components/Icons'
import { NewBlockDialog, type NewBlock } from '../components/NewBlockDialog'
import { AuthCard } from '../components/AuthCard'
import { ShareDialog } from '../components/ShareDialog'
import { useAuth } from '../lib/auth'
import { DEFAULT_VIEW, MIN_WIDTH, ZoomControl, type FullView } from '../components/ZoomControl'
import {
  addBlock,
  deleteBlock,
  deleteProject,
  isTextKind,
  openProject,
  renameProject,
  getProject,
  supabase,
  updateBlock,
  mimeFor,
  uploadFile,
  type Block,
  type BlockKind,
  type BlockPatch,
  type Project,
} from '../lib/supabase'
import { audioMeta } from '../lib/audio'
import { isScript } from '../lib/script'
import { KINDS, PALETTE } from '../lib/templates'
import { between, blockSlug, forgetProject, load, NAME_RE, pad, plural, rememberProject, save, timeAgo, wordCount } from '../lib/util'

const KIND_MIME = 'application/x-manuscript-kind'
const BLOCK_MIME = 'application/x-manuscript-block'
const SAVE_DELAY = 600
const TITLE_KEY = '__title'

type DropKind = 'palette' | 'block' | 'files'
/** Palette drag payload for the Voice note item (a File block that opens on the recorder). */
const VOICE = 'voice'
type Upload = { id: string; name: string; progress: number; error?: string }

export function ProjectPage() {
  const { id = '', blockId } = useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'deleted' | 'error' | 'denied' | 'sign-in' | 'reserved'>('loading')
  const { ready: authReady, session, profile } = useAuth()
  const uid = session?.user.id ?? null
  const [shareOpen, setShareOpen] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Set<string>>(new Set())
  const [reading, setReading] = useState(false)
  const [focusId, setFocusId] = useState<string>()
  const [adding, setAdding] = useState<{ kind: BlockKind; position: number; record?: boolean } | null>(null)
  const [drop, setDrop] = useState<{ index: number; kind: DropKind } | null>(null)
  const [dragId, setDragId] = useState<string>()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState<{ text: string; at: number } | null>(null)
  const [saving, setSaving] = useState(0)
  const [dirtyCount, setDirtyCount] = useState(0)
  const [toast, setToast] = useState('')
  const [uploads, setUploads] = useState<Upload[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const projectRef = useRef(project)
  projectRef.current = project
  const editingRef = useRef(editing)
  editingRef.current = editing
  const dirty = useRef(new Map<string, BlockPatch & { title?: string }>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const blocks = useMemo(() => project?.blocks ?? [], [project])
  /** The block opened full screen at /:project/:block (matched by its 8-character prefix). */
  const fullBlock = blockId ? blocks.find((b) => b.id.startsWith(blockId.toLowerCase())) : undefined
  const lastFull = useRef<string>(undefined)
  // Full-screen width and text size, remembered per browser.
  const [fullView, setFullView] = useState<FullView>(() => {
    const v = { ...DEFAULT_VIEW, ...load<Partial<FullView>>('fullview-pct', {}) }
    return { ...v, width: Math.min(100, Math.max(MIN_WIDTH, v.width)) }
  })
  const changeFullView = (v: FullView) => {
    setFullView(v)
    save('fullview-pct', v)
  }

  const flash = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  const notify = useCallback(() => {
    channel.current?.send({ type: 'broadcast', event: 'changed', payload: {} })
  }, [])

  // ---- Load + live sync -------------------------------------------------------

  useEffect(() => {
    if (!NAME_RE.test(id)) {
      setStatus('invalid')
      return
    }
    if (!authReady) return
    let cancelled = false
    setStatus('loading')
    setProject(null)
    setEditing(new Set())
    openProject(id)
      .then((r) => {
        if (cancelled) return
        if (r.status === 'denied') return setStatus('denied')
        if (r.status === 'sign-in-to-create') return setStatus('sign-in')
        if (r.status === 'reserved') return setStatus('reserved')
        const { status: _s, isNew, ...p } = r
        setProject(p)
        setStatus('ready')
        rememberProject(id)
        if (isNew) flash('Project created. It’s private until you share it.')
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message)
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [id, flash, authReady, uid])

  const refresh = useCallback(async () => {
    const remote = await getProject(id).catch(() => undefined)
    if (remote === undefined) return
    if (remote === null) {
      setStatus('deleted')
      return
    }
    if (remote.status === 'denied') {
      setStatus('denied')
      return
    }
    setProject((cur) => {
      if (!cur) return remote
      const keep = (b: Block) => dirty.current.has(b.id) || editingRef.current.has(b.id)
      const merged = remote.blocks.map((rb) => {
        const local = cur.blocks.find((b) => b.id === rb.id)
        return local && keep(local) ? local : rb
      })
      const { status: _s, ...fresh } = remote
      return {
        ...fresh,
        title: dirty.current.has(TITLE_KEY) ? cur.title : fresh.title,
        blocks: merged.sort((a, b) => a.position - b.position),
      }
    })
  }, [id])

  useEffect(() => {
    if (status !== 'ready') return
    const ch = supabase.channel(`project:${id}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'changed' }, () => {
      clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(refresh, 250)
    })
      .subscribe()
    channel.current = ch
    return () => {
      channel.current = null
      supabase.removeChannel(ch)
    }
  }, [id, status, refresh])

  useEffect(() => {
    const name = project ? project.title || id : ''
    document.title = !project ? 'Manuscript' : fullBlock ? `${fullBlock.title || 'Untitled'} — ${name}` : `${name} — Manuscript`
  }, [project, id, fullBlock])

  // Coming back from a full-screen block lands on that block in the project.
  useEffect(() => {
    if (fullBlock) {
      lastFull.current = fullBlock.id
      setFocusId(fullBlock.id)
      setSidebarOpen(false)
      document.querySelector('.doc-scroll')?.scrollTo(0, 0)
    } else if (!blockId && lastFull.current) {
      const back = lastFull.current
      lastFull.current = undefined
      requestAnimationFrame(() => document.getElementById(`block-${back}`)?.scrollIntoView({ block: 'center' }))
    }
  }, [fullBlock?.id, blockId]) // eslint-disable-line react-hooks/exhaustive-deps

  const returnToProject = useCallback(() => navigate(`/${id}`), [navigate, id])

  // Escape leaves full screen (unless typing, or a dialog or Manu AI is open).
  useEffect(() => {
    if (!fullBlock) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || chatOpen || adding || document.querySelector('.overlay')) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
      returnToProject()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullBlock, chatOpen, adding, returnToProject])

  // ---- Saving -----------------------------------------------------------------

  const flush = useCallback(
    async (key: string) => {
      clearTimeout(timers.current.get(key))
      timers.current.delete(key)
      const patch = dirty.current.get(key)
      if (!patch) return
      dirty.current.delete(key)
      setDirtyCount(dirty.current.size)
      setSaving((n) => n + 1)
      try {
        if (key === TITLE_KEY) await renameProject(id, patch.title ?? '')
        else await updateBlock(key, patch)
        notify()
      } catch (e) {
        flash(`Couldn’t save: ${e instanceof Error ? e.message : e}`)
      } finally {
        setSaving((n) => n - 1)
      }
    },
    [id, notify, flash],
  )

  const queue = useCallback(
    (key: string, patch: BlockPatch & { title?: string }, immediate = false) => {
      dirty.current.set(key, { ...dirty.current.get(key), ...patch })
      setDirtyCount(dirty.current.size)
      clearTimeout(timers.current.get(key))
      if (immediate) flush(key)
      else timers.current.set(key, setTimeout(() => flush(key), SAVE_DELAY))
    },
    [flush],
  )

  const patchBlock = useCallback(
    (blockId: string, patch: BlockPatch, immediate = false) => {
      setProject((p) =>
        p && {
          ...p,
          blocks: p.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)).sort((a, b) => a.position - b.position),
        },
      )
      queue(blockId, patch, immediate)
    },
    [queue],
  )

  const setTitle = (title: string) => {
    setProject((p) => p && { ...p, title })
    queue(TITLE_KEY, { title })
  }

  // Save everything on the way out, and warn if a save is still pending.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size === 0) return
      for (const key of [...dirty.current.keys()]) flush(key)
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      for (const key of [...dirty.current.keys()]) flush(key)
    }
  }, [flush])

  // ---- Block operations -------------------------------------------------------

  const positionAt = (index: number, list = blocks) => between(list[index - 1]?.position, list[index]?.position)
  const endPosition = () => positionAt(blocks.length)

  const scrollTo = (blockId: string) =>
    requestAnimationFrame(() => document.getElementById(`block-${blockId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

  const createBlock = async (nb: NewBlock, position: number) => {
    const block = await addBlock(id, { ...nb, position })
    setProject((p) => p && { ...p, blocks: [...p.blocks, block].sort((a, b) => a.position - b.position) })
    const blankScript = isScript(block.data.script) && block.data.script.elements.length === 0
    if (isTextKind(block.kind) && (!block.body || blankScript)) setEditing((s) => new Set(s).add(block.id))
    setFocusId(block.id)
    notify()
    scrollTo(block.id)
  }

  const removeBlock = async (block: Block) => {
    clearTimeout(timers.current.get(block.id))
    dirty.current.delete(block.id)
    try {
      await deleteBlock(block)
    } catch (e) {
      flash(`Couldn’t delete: ${e instanceof Error ? e.message : e}`)
      throw e
    }
    setProject((p) => p && { ...p, blocks: p.blocks.filter((b) => b.id !== block.id) })
    setEditing((s) => {
      const next = new Set(s)
      next.delete(block.id)
      return next
    })
    notify()
  }

  const setBlockEditing = (blockId: string, on: boolean) => {
    setEditing((s) => {
      const next = new Set(s)
      if (on) next.add(blockId)
      else next.delete(blockId)
      return next
    })
    if (!on) flush(blockId)
  }

  const uploadFiles = async (files: File[], index: number) => {
    let before = blocks[index - 1]?.position
    const after = blocks[index]?.position
    for (const file of files) {
      const position = between(before, after)
      before = position
      const uid = crypto.randomUUID()
      setUploads((u) => [...u, { id: uid, name: file.name, progress: 0 }])
      try {
        const meta = mimeFor(file)?.startsWith('audio/') ? await audioMeta(file) : {}
        const data = await uploadFile(id, file, (progress) => setUploads((u) => u.map((x) => (x.id === uid ? { ...x, progress } : x))))
        await createBlock({ kind: 'file', title: file.name.replace(/\.[^.]+$/, ''), body: '', data: { ...data, ...meta } }, position)
        setUploads((u) => u.filter((x) => x.id !== uid))
      } catch (e) {
        setUploads((u) => u.map((x) => (x.id === uid ? { ...x, error: e instanceof Error ? e.message : String(e) } : x)))
        setTimeout(() => setUploads((u) => u.filter((x) => x.id !== uid)), 6000)
      }
    }
  }

  // ---- Drag & drop ------------------------------------------------------------

  const dragKind = (e: DragEvent): DropKind | null => {
    const types = Array.from(e.dataTransfer.types)
    if (types.includes(KIND_MIME)) return 'palette'
    if (types.includes(BLOCK_MIME)) return 'block'
    if (types.includes('Files')) return 'files'
    return null
  }

  const dropIndex = (e: DragEvent) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.doc-blocks > .block'))
    const i = els.findIndex((el) => {
      const r = el.getBoundingClientRect()
      return e.clientY < r.top + r.height / 2
    })
    return i === -1 ? els.length : i
  }

  const onDragOver = (e: DragEvent) => {
    if (reading || fullBlock || projectRef.current?.role === 'viewer') return
    const kind = dragKind(e)
    if (!kind) return
    e.preventDefault()
    e.dataTransfer.dropEffect = kind === 'block' ? 'move' : 'copy'
    const index = dropIndex(e)
    if (drop?.index !== index || drop.kind !== kind) setDrop({ index, kind })
  }

  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null)
  }

  const onDrop = (e: DragEvent) => {
    const kind = dragKind(e)
    setDrop(null)
    if (!kind || reading || fullBlock || projectRef.current?.role === 'viewer') return
    e.preventDefault()
    const index = dropIndex(e)
    if (kind === 'palette') {
      const k = e.dataTransfer.getData(KIND_MIME)
      if (k === VOICE) setAdding({ kind: 'file', position: positionAt(index), record: true })
      else if (KINDS[k as BlockKind]) setAdding({ kind: k as BlockKind, position: positionAt(index) })
    } else if (kind === 'block') {
      const blockId = e.dataTransfer.getData(BLOCK_MIME)
      const from = blocks.findIndex((b) => b.id === blockId)
      if (from === -1 || index === from || index === from + 1) return
      const rest = blocks.filter((b) => b.id !== blockId)
      const to = index > from ? index - 1 : index
      patchBlock(blockId, { position: positionAt(to, rest) }, true)
    } else {
      const files = Array.from(e.dataTransfer.files)
      if (files.length) uploadFiles(files, index)
    }
  }

  /** Tap-to-move for touch screens, where drag and drop isn't available. */
  const moveBlock = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= blocks.length) return
    const position = dir < 0 ? between(blocks[target - 1]?.position, blocks[target].position) : between(blocks[target].position, blocks[target + 1]?.position)
    const id = blocks[index].id
    patchBlock(id, { position }, true)
    scrollTo(id)
  }

  const startPaletteDrag = (e: DragEvent, kind: BlockKind | typeof VOICE) => {
    e.dataTransfer.setData(KIND_MIME, kind)
    e.dataTransfer.effectAllowed = 'copy'
    setSidebarOpen(false)
  }

  const startBlockDrag = (e: DragEvent, block: Block) => {
    e.dataTransfer.setData(BLOCK_MIME, block.id)
    e.dataTransfer.effectAllowed = 'move'
    const el = document.getElementById(`block-${block.id}`)
    if (el) e.dataTransfer.setDragImage(el, 24, 24)
    setDragId(block.id)
  }

  // ---- Misc actions -----------------------------------------------------------

  /** Phones and tablets open the OS share sheet (which has its own Copy); everywhere else copies the link.
   *  In full screen it shares that block's own link. */
  const shareUrl = () => `${location.origin}/${id}${fullBlock ? `/${blockSlug(fullBlock.id)}` : ''}`
  const onShareClick = () => (project?.role === 'owner' ? setShareOpen(true) : share())

  const share = () => {
    const url = `${location.origin}/${id}${fullBlock ? `/${blockSlug(fullBlock.id)}` : ''}`
    const touch = window.matchMedia('(pointer: coarse)').matches
    if (touch && typeof navigator.share === 'function') {
      navigator.share({ title: (fullBlock ? fullBlock.title : project?.title) || 'Manuscript', url }).catch(() => {
        /* dismissed */
      })
      return
    }
    // The fallback copy runs synchronously inside the click so browsers still treat it as user-initiated.
    const legacy = copyWithSelection(url)
    const copied = navigator.clipboard?.writeText(url).then(() => true, () => legacy) ?? Promise.resolve(legacy)
    copied.then((ok) => flash(ok ? 'Link copied' : url))
  }

  const askAbout = (block: Block) => {
    setFocusId(block.id)
    setChatOpen(true)
    setChatDraft({ text: `Help me with “${block.title || 'this block'}”: `, at: Date.now() })
  }

  const insertFromChat = async (text: string) => {
    const heading = text.match(/^#{1,3}\s+(.+)$/m)?.[1]
    await createBlock({ kind: 'text', title: heading?.replace(/[*_~+]/g, '').slice(0, 80) || 'From Manu AI', body: text, data: {} }, endPosition())
  }

  // ---- Render -----------------------------------------------------------------

  if (status === 'invalid')
    return (
      <Message title="That’s not a project link" body="Project names use 3–48 lowercase letters, numbers and dashes.">
        <Link className="btn primary" to="/">Start a project</Link>
      </Message>
    )
  if (status === 'error')
    return (
      <Message title="Couldn’t open this project" body={error}>
        <button className="btn primary" onClick={() => location.reload()}>Try again</button>
      </Message>
    )
  if (status === 'deleted')
    return (
      <Message title="This project was deleted" body="Someone removed it along with all its blocks and files.">
        <Link className="btn primary" to="/">Back home</Link>
      </Message>
    )

  if (status === 'denied' || status === 'sign-in' || status === 'reserved') {
    return <AccessScreen status={status} id={id} signedIn={!!session} username={profile?.username ?? null} />
  }

  const canEdit = project?.role === 'owner' || project?.role === 'editor'
  const isOwner = project?.role === 'owner'
  /** Viewers are always in read mode. */
  const viewMode = reading || (!!project && !canEdit)

  const totalWords = blocks.reduce((n, b) => n + (isTextKind(b.kind) ? wordCount(b.body) : 0), 0)
  const focused = blocks.find((b) => b.id === focusId)
  const saveLabel = saving > 0 ? 'Saving…' : dirtyCount > 0 ? 'Editing' : 'Saved'

  const dropLine = (i: number) =>
    drop?.index === i && (
      <div className={`drop-line drop-${drop.kind}`} key={`drop-${i}`}>
        <span>{drop.kind === 'block' ? 'Move here' : drop.kind === 'files' ? 'Drop files here' : 'Add block here'}</span>
      </div>
    )

  return (
    <div className={`workspace ${sidebarOpen ? 'sidebar-open' : ''} ${viewMode ? 'reading' : ''} ${fullBlock ? 'fullscreen' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-inner">
          <div className="sidebar-top">
            <Link to="/" className="sidebar-logo">
              <Logo />
            </Link>
            <div className="sidebar-top-end">
              <ThemeToggle />
              <button className="icon-btn only-mobile" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
                <Close />
              </button>
            </div>
          </div>

          {!viewMode && (
            <section className="palette">
              <h3 className="mono-label">Blocks</h3>
              <p className="palette-hint">Drag onto the page, or click to add at the end.</p>
              <ul>
                {PALETTE.map((kind) => (
                  <li key={kind}>
                    <button
                      className={`palette-item kind-${kind}`}
                      draggable
                      onDragStart={(e) => startPaletteDrag(e, kind)}
                      onClick={() => (setAdding({ kind, position: endPosition() }), setSidebarOpen(false))}
                    >
                      <span className="palette-icon">
                        <KindIcon kind={kind} width={16} height={16} />
                      </span>
                      <span className="palette-text">
                        <strong>{KINDS[kind].label}</strong>
                        <span>{KINDS[kind].tagline}</span>
                      </span>
                      <Plus className="palette-plus" width={14} height={14} />
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    className="palette-item kind-voice"
                    draggable
                    onDragStart={(e) => startPaletteDrag(e, VOICE)}
                    onClick={() => (setAdding({ kind: 'file', position: endPosition(), record: true }), setSidebarOpen(false))}
                  >
                    <span className="palette-icon">
                      <Mic size={16} strokeWidth={1.75} />
                    </span>
                    <span className="palette-text">
                      <strong>Voice note</strong>
                      <span>Record audio right here</span>
                    </span>
                    <Plus className="palette-plus" width={14} height={14} />
                  </button>
                </li>
              </ul>
            </section>
          )}

          <section className="outline">
            <h3 className="mono-label">Outline</h3>
            {blocks.length === 0 ? (
              <p className="palette-hint">Blocks you add appear here.</p>
            ) : (
              <ol>
                {blocks.map((b, i) => (
                  <li key={b.id}>
                    <button
                      className={`outline-row ${b.id === focusId ? 'active' : ''}`}
                      onClick={() => (setFocusId(b.id), scrollTo(b.id), setSidebarOpen(false))}
                    >
                      <span className="outline-no">{pad(i + 1)}</span>
                      <KindIcon kind={b.kind} width={13} height={13} />
                      <span className="truncate">{b.title || 'Untitled'}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {project && (
            <footer className="sidebar-foot">
              <dl className="spec">
                <dt>Created</dt>
                <dd>{new Date(project.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</dd>
                <dt>Updated</dt>
                <dd>{timeAgo(project.updated)}</dd>
              </dl>
              {!project.claimed && (
                <p className="sidebar-note">
                  <Lock size={13} /> Made before accounts existed, so anyone with the link can edit it until it’s assigned to an owner.
                </p>
              )}
              {isOwner && (
                <button className="btn eject" onClick={() => setConfirmDelete(true)}>
                  <Trash width={14} height={14} /> Delete project
                </button>
              )}
              <Link to="/settings" className="sidebar-account" onClick={() => setSidebarOpen(false)}>
                {session && profile?.username ? (
                  <>
                    <span className="account-avatar">{profile.username[0]}</span>
                    <span className="sidebar-account-name truncate">@{profile.username}</span>
                  </>
                ) : (
                  <span className="sidebar-account-name">Sign in</span>
                )}
                <Settings size={16} className="sidebar-account-icon" />
              </Link>
            </footer>
          )}
        </div>
      </aside>
      <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />

      <div className="main">
        {/* Phones: the header floats over the page and this fade covers the bottom edge, so content gets the full height */}
        <div className="mobile-footer" aria-hidden />
        <header className="toolbar">
          {fullBlock || (blockId && project) ? (
            <>
              <button className="btn return-btn" onClick={returnToProject} title="Return to project (Esc)">
                <ArrowLeft size={17} strokeWidth={2} /> <span className="hide-sm">Return to project</span>
              </button>
              <nav className="crumbs">
                <Link to={`/${id}`} className="crumb-root hide-sm truncate">{project?.title || id}</Link>
                <span className="path-sep hide-sm">/</span>
                <span className="crumb-current truncate">{fullBlock ? fullBlock.title || 'Untitled' : 'Block'}</span>
              </nav>
            </>
          ) : (
            <>
              <button className="icon-btn only-mobile" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
                <Menu />
              </button>
              <nav className="crumbs">
                <Link to="/" className="crumb-root hide-sm">manuscript</Link>
                <span className="path-sep hide-sm">/</span>
                <span className="crumb-current truncate">{project?.title || id}</span>
              </nav>
            </>
          )}
          <span className={`save-state ${saving ? 'busy' : ''}`}>{project && saveLabel}</span>
          {fullBlock && (
            <>
              <ZoomControl view={fullView} onChange={changeFullView} />
              <ThemeToggle />
            </>
          )}
          {project && !canEdit ? (
            <span className="view-only" title="You can view this project but not change it">
              <Eye width={14} height={14} /> <span className="hide-sm">View only</span>
            </span>
          ) : (
            <div className="segmented" role="group" aria-label="Mode">
              <button className={reading ? 'on' : ''} onClick={() => setReading(true)} title="Reader mode — hide editing tools">
                <Eye width={14} height={14} /> <span className="hide-sm">Read</span>
              </button>
              <button className={!reading ? 'on' : ''} onClick={() => setReading(false)} title="Edit mode">
                <Pencil width={14} height={14} /> <span className="hide-sm">Edit</span>
              </button>
            </div>
          )}
          <button className="btn primary" onClick={onShareClick}>
            <Share width={15} height={15} /> <span className="hide-sm">Share</span>
          </button>
        </header>

        <div className="doc-scroll" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
          {status === 'loading' || !project ? (
            <div className="doc">
              <div className="doc-head">
                <span className="skeleton" style={{ width: 180 }} />
                <span className="skeleton tall" style={{ width: '60%' }} />
              </div>
              {[0, 1].map((i) => (
                <div className="block skeleton-block" key={i}>
                  <span className="skeleton" style={{ width: 120 }} />
                  <span className="skeleton" style={{ width: '90%' }} />
                  <span className="skeleton" style={{ width: '75%' }} />
                </div>
              ))}
            </div>
          ) : blockId ? (
            fullBlock ? (
              <div
                className="doc doc-full"
                style={{ '--full-w': fullView.width / 100, '--full-text': fullView.text } as CSSProperties}
              >
                <BlockView
                  key={fullBlock.id}
                  block={fullBlock}
                  index={blocks.indexOf(fullBlock)}
                  editing={editing.has(fullBlock.id)}
                  reading={viewMode}
                  onEdit={(on) => setBlockEditing(fullBlock.id, on)}
                  onPatch={(patch) => patchBlock(fullBlock.id, patch)}
                  onDelete={async () => {
                    await removeBlock(fullBlock)
                    returnToProject()
                  }}
                  onFocus={() => focusId !== fullBlock.id && setFocusId(fullBlock.id)}
                  onAsk={() => askAbout(fullBlock)}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  onMove={() => {}}
                  canMoveUp={false}
                  canMoveDown={false}
                />
              </div>
            ) : (
              <div className="doc">
                <div className="doc-empty">
                  <strong>This block isn’t here</strong>
                  <p className="muted">It may have been deleted, or the link is incomplete.</p>
                  <button className="btn primary" onClick={returnToProject}>
                    <ArrowLeft size={16} /> Return to project
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="doc">
              <header className="doc-head">
                {viewMode ? (
                  <h1 className="doc-title static">{project.title || 'Untitled project'}</h1>
                ) : (
                  <input
                    className="doc-title"
                    value={project.title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Untitled project"
                    aria-label="Project title"
                    maxLength={200}
                  />
                )}
                <p className="doc-sub">
                  {plural(blocks.length, 'block')} · {totalWords.toLocaleString()} words · updated {timeAgo(project.updated)}
                </p>
              </header>

              <div className="doc-blocks">
                {blocks.map((block, i) => [
                  dropLine(i),
                  <BlockView
                    key={block.id}
                    block={block}
                    index={i}
                    editing={editing.has(block.id)}
                    reading={viewMode}
                    onEdit={(on) => setBlockEditing(block.id, on)}
                    onPatch={(patch) => patchBlock(block.id, patch)}
                    onDelete={() => removeBlock(block)}
                    onFocus={() => focusId !== block.id && setFocusId(block.id)}
                    onAsk={() => askAbout(block)}
                    onDragStart={(e) => startBlockDrag(e, block)}
                    onDragEnd={() => (setDragId(undefined), setDrop(null))}
                    onMove={(dir) => moveBlock(i, dir)}
                    canMoveUp={i > 0}
                    canMoveDown={i < blocks.length - 1}
                    href={`/${id}/${blockSlug(block.id)}`}
                  />,
                ])}
                {dropLine(blocks.length)}
                {dragId && <style>{`#block-${dragId}{opacity:.35}`}</style>}
              </div>

              {blocks.length === 0 && !viewMode && (
                <div className="doc-empty">
                  <p className="mono-label">Empty page</p>
                  <strong>What are you making?</strong>
                  <p className="muted">Drag a block in from the left, drop files anywhere, or start with one of these.</p>
                  <div className="starter">
                    {(['drama', 'poetry', 'prose'] as const).map((k) => (
                      <button key={k} className="starter-card" onClick={() => setAdding({ kind: k, position: endPosition() })}>
                        <KindIcon kind={k} width={22} height={22} />
                        <strong>{KINDS[k].label}</strong>
                        <span>{KINDS[k].tagline}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {blocks.length > 0 && !viewMode && (
                <div className="add-row">
                  <span className="mono-label">Add</span>
                  {PALETTE.map((k) => (
                    <button key={k} className="chip" onClick={() => setAdding({ kind: k, position: endPosition() })} title={KINDS[k].tagline}>
                      <KindIcon kind={k} width={13} height={13} /> {KINDS[k].label}
                    </button>
                  ))}
                  <button className="chip" onClick={() => setAdding({ kind: 'file', position: endPosition(), record: true })} title="Record a voice note">
                    <Mic size={13} strokeWidth={1.75} /> Voice note
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {project && canEdit && (
        <Chat
          project={id}
          projectTitle={project.title}
          blocks={blocks.map((b) => ({ id: b.id, title: b.title, kind: b.kind }))}
          focus={focused ? { id: focused.id, title: focused.title, kind: focused.kind } : undefined}
          open={chatOpen}
          draft={chatDraft}
          onOpenChange={setChatOpen}
          onFocus={setFocusId}
          onInsert={insertFromChat}
        />
      )}

      {adding && <NewBlockDialog project={id} kind={adding.kind} record={adding.record} onCreate={(nb) => createBlock(nb, adding.position)} onClose={() => setAdding(null)} />}

      {shareOpen && project && (
        <ShareDialog
          project={id}
          title={project.title || id}
          url={shareUrl()}
          onClose={() => setShareOpen(false)}
          onChanged={(access) => (setProject((p) => p && { ...p, access }), notify())}
          onCopy={share}
        />
      )}

      {confirmDelete && <DeleteDialog id={id} onClose={() => setConfirmDelete(false)} onDeleted={() => (forgetProject(id), notify(), navigate('/'))} />}

      {uploads.length > 0 && (
        <div className="tray">
          <div className="tray-head">
            <div>
              <span>Uploading {plural(uploads.length, 'file')}</span>
            </div>
          </div>
          <ul className="tray-list">
            {uploads.map((u) => (
              <li key={u.id} className={`tray-item ${u.error ? 'error' : ''}`}>
                <span className="truncate">{u.name}</span>
                <span className="tray-status">{u.error ?? `${Math.round(u.progress * 100)}%`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function DeleteDialog({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await deleteProject(id)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="dialog" onSubmit={(e) => (e.preventDefault(), typed === id && remove())}>
        <header className="dialog-head">
          <div>
            <p className="mono-label">Danger zone</p>
            <h2>Delete this project?</h2>
          </div>
        </header>
        <p className="muted">
          Every block and every uploaded file in <b>{id}</b> will be permanently removed for everyone with the link. This can’t be undone.
        </p>
        <label className="field">
          <span className="field-label">Type <code>{id}</code> to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </label>
        {error && <p className="hint error">✕ {error}</p>}
        <footer className="dialog-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn danger" disabled={typed !== id || busy}>
            {busy ? 'Deleting…' : 'Delete forever'}
          </button>
        </footer>
      </form>
    </div>
  )
}

function Message({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className="full-message">
      <Logo />
      <h2>{title}</h2>
      <p>{body}</p>
      {children}
    </div>
  )
}

/** Copy fallback for browsers that block the async clipboard API (must run inside the user's tap). */
function copyWithSelection(text: string) {
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
  document.body.appendChild(el)
  el.select()
  el.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  el.remove()
  return ok
}

/** Same URL, no project: not allowed in, needs to sign in to create, or a reserved name. */
function AccessScreen({ status, id, signedIn, username }: { status: 'denied' | 'sign-in' | 'reserved'; id: string; signedIn: boolean; username: string | null }) {
  useEffect(() => {
    document.title = 'Manuscript'
  }, [])
  if (status === 'reserved')
    return (
      <Message title="That name is reserved" body={`“${id}” is used by Manuscript itself. Pick a different project name.`}>
        <Link className="btn primary" to="/">Back home</Link>
      </Message>
    )
  if (status === 'sign-in')
    return (
      <div className="full-message access-screen">
        <Logo />
        <AuthCard title={`Create “${id}”`} subtitle="Sign in or create an account to start this project. It stays private until you share it." initialMode="signup" />
        <Link className="btn" to="/">Back home</Link>
      </div>
    )
  return (
    <div className="full-message access-screen">
      <Logo />
      <div className="access-lock" aria-hidden>
        <Lock size={26} />
      </div>
      <h2>You don’t have access</h2>
      <p>
        {signedIn
          ? `You’re signed in as @${username ?? 'you'}, but the owner of “${id}” hasn’t shared it with you. Ask them to add your username or email.`
          : `“${id}” is private. If it was shared with you, sign in to open it.`}
      </p>
      {signedIn ? (
        <p className="muted access-note">If you were trying to create a new project, this name is already taken.</p>
      ) : (
        <AuthCard />
      )}
      <Link className="btn" to="/">Back home</Link>
    </div>
  )
}
