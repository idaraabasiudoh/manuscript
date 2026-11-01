import { Maximize2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { renderMarkdown } from '../lib/markdown'
import { downloadUrl, isTextKind, publicUrl, unfurl, type Block, type BlockPatch, type LinkData, type ResourceItem } from '../lib/supabase'
import { KINDS, TEMPLATES } from '../lib/templates'
import { formatBytes, pad, wordCount } from '../lib/util'
import { ArrowUp, Check, Close, Download, External, Grip, KindIcon, Pencil, Plus, Spark, Trash } from './Icons'
import { isScript, parseScript, toText, type Script } from '../lib/script'
import { PdfViewer } from './PdfViewer'
import { ScriptEditor } from './ScriptEditor'
import { PageStyleTools, ScriptView } from './ScriptView'
import { TextEditor } from './TextEditor'

type Props = {
  block: Block
  index: number
  editing: boolean
  reading: boolean
  onEdit: (editing: boolean) => void
  onPatch: (patch: BlockPatch) => void
  onDelete: () => Promise<void>
  onFocus: () => void
  onAsk: () => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onMove: (dir: -1 | 1) => void
  canMoveUp: boolean
  canMoveDown: boolean
  /** Link that opens this block full screen; absent when it already is. */
  href?: string
}

export function BlockView({ block, index, editing, reading, onEdit, onPatch, onDelete, onFocus, onAsk, onDragStart, onDragEnd, onMove, canMoveUp, canMoveDown, href }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const meta = KINDS[block.kind]
  const template = isTextKind(block.kind) ? TEMPLATES[block.kind].find((t) => t.id === block.data.template && t.id !== 'blank') : undefined
  const editable = block.kind !== 'file'
  const isEditing = editing && !reading

  const remove = async () => {
    setDeleting(true)
    try {
      await onDelete()
    } catch {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <article
      id={`block-${block.id}`}
      className={`block kind-${block.kind} ${isEditing ? 'editing' : ''} ${deleting ? 'deleting' : ''}`}
      onFocusCapture={onFocus}
      onPointerDown={onFocus}
    >
      {!reading && (
        <button
          className="block-grip"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Drag to move this block"
          aria-label="Drag to reorder"
        >
          <Grip width={16} height={16} />
        </button>
      )}

      <header className="block-head">
        <div className="block-meta">
          <span className="block-no">{pad(index + 1)}</span>
          <span className="block-kind">
            <KindIcon kind={block.kind} width={13} height={13} />
            {meta.label}
            {template && <span className="block-template">· {template.name}</span>}
          </span>
          {isTextKind(block.kind) && block.body && <span className="block-count">{wordCount(block.body)} words</span>}
          {href && (
            <Link to={href} className="icon-btn sm block-open" title="Open full screen" aria-label={`Open ${block.title || 'block'} full screen`}>
              <Maximize2 size={15} strokeWidth={1.75} />
            </Link>
          )}
          {!reading && (
            <div className="block-actions">
              {confirming ? (
                <span className="confirm">
                  <span className="confirm-text">Delete this block?</span>
                  <button className="chip danger" onClick={remove} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                  <button className="chip" onClick={() => setConfirming(false)} disabled={deleting}>
                    Keep
                  </button>
                </span>
              ) : (
                <>
                  <button className="icon-btn sm touch-only" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label="Move block up">
                    <ArrowUp width={15} height={15} />
                  </button>
                  <button className="icon-btn sm touch-only" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label="Move block down">
                    <ArrowUp width={15} height={15} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  {isTextKind(block.kind) && (
                    <button className="chip ghost" onClick={onAsk} title="Ask Manu AI about this block" aria-label="Ask Manu AI about this block">
                      <Spark width={13} height={13} /> <span className="chip-label">Ask</span>
                    </button>
                  )}
                  {editable && (
                    <button className={`chip ${isEditing ? 'solid' : ''}`} onClick={() => onEdit(!isEditing)} title={isEditing ? 'Done' : 'Edit'} aria-label={isEditing ? 'Done' : 'Edit'}>
                      {isEditing ? <Check width={13} height={13} /> : <Pencil width={13} height={13} />}
                      <span className="chip-label">{isEditing ? 'Done' : 'Edit'}</span>
                    </button>
                  )}
                  <button className="icon-btn sm" onClick={() => setConfirming(true)} title="Delete block" aria-label="Delete block">
                    <Trash width={15} height={15} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {reading ? (
          <h2 className="block-title static">{block.title || 'Untitled'}</h2>
        ) : (
          <div className="block-title-row">
            <input
              className="block-title"
              value={block.title}
              placeholder="Name this block"
              onChange={(e) => onPatch({ title: e.target.value })}
              aria-label="Block name"
              maxLength={200}
            />
            {block.kind === 'drama' && isScript(block.data.script) && (
              <PageStyleTools
                script={block.data.script}
                onChange={(next) => onPatch({ data: { ...block.data, script: next }, body: toText(next) })}
              />
            )}
          </div>
        )}
      </header>

      <div className="block-body">
        {block.kind === 'drama' && isScript(block.data.script) ? (
          <ScriptBody block={block} script={block.data.script} editing={isEditing} onPatch={onPatch} onEdit={reading ? undefined : () => onEdit(true)} />
        ) : (
          isTextKind(block.kind) &&
          (isEditing ? (
            <>
              {block.kind === 'drama' && <ConvertBanner block={block} onPatch={onPatch} />}
              <TextEditor kind={block.kind} value={block.body} onChange={(body) => onPatch({ body })} autoFocus />
            </>
          ) : (
            <TextPreview block={block} onEdit={reading ? undefined : () => onEdit(true)} />
          ))
        )}
        {block.kind === 'file' && <FileBody block={block} reading={reading} onPatch={onPatch} />}
        {block.kind === 'link' && <LinkBody block={block} editing={isEditing} onPatch={onPatch} onDone={() => onEdit(false)} />}
        {block.kind === 'resources' && <ResourcesBody block={block} editing={isEditing} onPatch={onPatch} />}
      </div>
    </article>
  )
}

// ---- Text ---------------------------------------------------------------------

function TextPreview({ block, onEdit }: { block: Block; onEdit?: () => void }) {
  const html = useMemo(() => renderMarkdown(block.body, isTextKind(block.kind) ? block.kind : 'text'), [block.body, block.kind])
  if (!block.body.trim())
    return onEdit ? (
      <button className="empty-block" onClick={onEdit}>
        <Pencil width={15} height={15} /> Empty page — click to start writing
      </button>
    ) : (
      <p className="muted">Nothing here yet.</p>
    )
  const md = <div className={`md md-${block.kind}`} onDoubleClick={onEdit} dangerouslySetInnerHTML={{ __html: html }} />
  return block.kind === 'drama' ? <div className="script-page">{md}</div> : md
}

// ---- Structured scripts (Drama) ---------------------------------------------------

function ScriptBody({ block, script, editing, onPatch, onEdit }: { block: Block; script: Script; editing: boolean; onPatch: (p: BlockPatch) => void; onEdit?: () => void }) {
  const save = (next: Script) => onPatch({ data: { ...block.data, script: next }, body: toText(next) })
  if (!editing) return <ScriptView script={script} onEdit={onEdit} />
  const original = typeof block.data.originalText === 'string' ? block.data.originalText : undefined
  const revert =
    original === undefined
      ? undefined
      : () => {
          const data = { ...block.data }
          delete data.script
          delete data.originalText
          onPatch({ data, body: original })
        }
  return <ScriptEditor script={script} onChange={save} onRevert={revert} />
}

/** Offered on plain-text drama blocks: turn the text into a structured, reusable script. */
function ConvertBanner({ block, onPatch }: { block: Block; onPatch: (p: BlockPatch) => void }) {
  const convert = () => {
    const script = parseScript(block.body, block.title)
    onPatch({ data: { ...block.data, script, originalText: block.body }, body: toText(script) })
  }
  return (
    <div className="convert-banner">
      <div>
        <strong>Turn this into a structured script</strong>
        <span>Title page, a reusable cast, and scenes, lines and notes as pieces you can move around. Your text is kept so you can switch back.</span>
      </div>
      <button type="button" className="btn primary" onClick={convert}>
        Convert
      </button>
    </div>
  )
}

// ---- Files --------------------------------------------------------------------

function FileBody({ block, reading, onPatch }: { block: Block; reading: boolean; onPatch: (p: BlockPatch) => void }) {
  const { path, name = 'file', mime = '', size } = block.data
  if (!path) return <p className="muted">File missing.</p>
  const url = publicUrl(path)

  return (
    <figure className="file">
      <div className={`file-stage ${mime.split('/')[0]} ${mime === 'application/pdf' ? 'pdf' : ''}`}>
        {mime === 'application/pdf' && <PdfViewer url={url} name={name} />}
        {mime.startsWith('video/') && <video src={url} controls preload="metadata" playsInline />}
        {mime.startsWith('audio/') && <AudioCard url={url} name={name} />}
        {mime.startsWith('image/') && <img src={url} alt={block.body || name} loading="lazy" />}
      </div>
      <figcaption className="file-bar">
        <span className="file-type">{mime === 'application/pdf' ? 'PDF' : mime.split('/')[1]?.toUpperCase().replace('MPEG', 'MP3')}</span>
        <span className="file-name truncate" title={name}>{name}</span>
        <span className="file-size">{formatBytes(size)}</span>
        <a className="icon-btn sm" href={url} target="_blank" rel="noreferrer" title="Open in new tab" aria-label="Open in new tab">
          <External width={15} height={15} />
        </a>
        <a className="icon-btn sm" href={downloadUrl(path, name)} title="Download" aria-label="Download">
          <Download width={15} height={15} />
        </a>
      </figcaption>
      {reading ? (
        block.body && <p className="file-caption">{block.body}</p>
      ) : (
        <input
          className="file-caption-input"
          value={block.body}
          onChange={(e) => onPatch({ body: e.target.value })}
          placeholder="Add a caption or note…"
          aria-label="Caption"
        />
      )}
    </figure>
  )
}

function AudioCard({ url, name }: { url: string; name: string }) {
  return (
    <div className="audio">
      <div className="audio-wave" aria-hidden>
        {Array.from({ length: 48 }, (_, i) => (
          <i key={i} style={{ height: `${18 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) * 70}%`, backgroundPosition: `${(i / 47) * 100}% 0` }} />
        ))}
      </div>
      <p className="audio-name truncate">{name.replace(/\.[^.]+$/, '')}</p>
      <audio src={url} controls preload="metadata" />
    </div>
  )
}

// ---- Links --------------------------------------------------------------------

export type Embed = { src: string; kind: 'video' | 'audio' | 'instagram' | 'tiktok'; height?: number; label: string }

/** Players we can show inline for a link: YouTube, Vimeo, Loom, Spotify, Instagram and TikTok. */
export function embedFor(url: string): Embed | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return { src: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`, kind: 'video', label: 'YouTube' }
    if (host === 'youtube.com') {
      const id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1]
      if (id) return { src: `https://www.youtube-nocookie.com/embed/${id}`, kind: 'video', label: 'YouTube' }
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.match(/^\/(\d+)/)?.[1]
      if (id) return { src: `https://player.vimeo.com/video/${id}`, kind: 'video', label: 'Vimeo' }
    }
    if (host === 'loom.com' && u.pathname.startsWith('/share/')) return { src: `https://www.loom.com/embed/${u.pathname.slice(7)}`, kind: 'video', label: 'Loom' }
    // Spotify: /track/…, /album/…, /playlist/…, /episode/…, /show/…, /artist/…, also with a regional /intl-xx/ prefix.
    if (host === 'open.spotify.com') {
      const m = u.pathname.match(/^(?:\/intl-[\w-]+)?\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/)
      if (m) {
        const compact = m[1] === 'track' || m[1] === 'episode'
        return { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, kind: 'audio', height: compact ? 152 : 352, label: 'Spotify' }
      }
    }
    // TikTok: /@user/video/123, /@user/photo/123, or an embed/player URL.
    if (host === 'tiktok.com') {
      const id = u.pathname.match(/^\/@[\w.-]+\/(?:video|photo)\/(\d+)/)?.[1] ?? u.pathname.match(/^\/(?:embed(?:\/v2)?|player\/v1)\/(\d+)/)?.[1]
      if (id) return { src: `https://www.tiktok.com/player/v1/${id}?music_info=1&description=1&rel=0`, kind: 'tiktok', label: 'TikTok' }
    }
    // Instagram: /p/…, /reel/…, /reels/…, /tv/…, optionally under a /username/ prefix.
    if (host === 'instagram.com') {
      const m = u.pathname.match(/^(?:\/[\w.]+)?\/(p|reel|reels|tv)\/([\w-]+)/)
      if (m) {
        const type = m[1] === 'p' ? 'p' : m[1] === 'tv' ? 'tv' : 'reel'
        return { src: `https://www.instagram.com/${type}/${m[2]}/embed/captioned/`, kind: 'instagram', height: type === 'p' ? 640 : 760, label: type === 'p' ? 'Instagram post' : 'Instagram reel' }
      }
    }
  } catch {
    /* not a URL */
  }
  return null
}

/** Instagram's embed reports its real height via postMessage; grow the frame to fit so nothing is cropped. */
function InstagramFrame({ embed, title }: { embed: Embed; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(embed.height ?? 700)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/(www\.)?instagram\.com$/.test(e.origin) || e.source !== ref.current?.contentWindow) return
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        const h = Number(data?.details?.height)
        if (data?.type === 'MEASURE' && h > 100) setHeight(Math.ceil(h))
      } catch {
        /* not ours */
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  return (
    <div className="link-embed instagram">
      <iframe ref={ref} src={embed.src} title={title} style={{ height }} allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" allowFullScreen loading="lazy" scrolling="no" />
    </div>
  )
}
export function LinkCard({ link }: { link: LinkData }) {
  const embed = embedFor(link.url)
  const host = (() => {
    try {
      return new URL(link.url).hostname.replace(/^www\./, '')
    } catch {
      return link.url
    }
  })()
  const title = link.title || link.url
  // Spotify and Instagram players already show what they are; a slim "open" row is enough under them.
  const compact = embed && embed.kind !== 'video'
  return (
    <div className={`link ${embed ? `has-${embed.kind}` : ''}`}>
      {embed?.kind === 'instagram' && <InstagramFrame embed={embed} title={title} />}
      {embed?.kind === 'tiktok' && (
        <div className="link-embed tiktok">
          <iframe src={embed.src} title={title} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share" allowFullScreen loading="lazy" />
        </div>
      )}
      {embed && embed.kind !== 'instagram' && embed.kind !== 'tiktok' && (
        <div className={`link-embed ${embed.kind}`} style={embed.height ? { height: embed.height } : undefined}>
          <iframe src={embed.src} title={title} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen loading="lazy" />
        </div>
      )}
      {compact ? (
        <a className="link-open" href={link.url} target="_blank" rel="noopener noreferrer">
          <External width={13} height={13} />
          <span className="link-open-label">Open in {embed.label.replace(/ (post|reel)$/, '')}</span>
          {link.title && link.title !== link.url && link.title !== embed.label && <span className="link-open-title truncate">· {link.title}</span>}
        </a>
      ) : (
        <a className={`link-card ${link.image && !embed ? 'has-image' : ''}`} href={link.url} target="_blank" rel="noopener noreferrer">
          <div className="link-text">
            <span className="link-site mono-label">{link.site || host}</span>
            <strong className="link-title">{title}</strong>
            {link.description && <span className="link-desc">{link.description}</span>}
            <span className="link-url truncate">
              <External width={12} height={12} /> {host}
            </span>
          </div>
          {link.image && !embed && (
            <div className="link-image">
              <img src={link.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.parentElement!.style.display = 'none')} />
            </div>
          )}
        </a>
      )}
    </div>
  )
}

function LinkBody({ block, editing, onPatch, onDone }: { block: Block; editing: boolean; onPatch: (p: BlockPatch) => void; onDone: () => void }) {
  const [url, setUrl] = useState(block.data.url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    const target = normalizeUrl(url)
    if (!target) return setError('That doesn’t look like a web address.')
    setBusy(true)
    setError('')
    try {
      const data = await unfurl(target)
      onPatch({ data: { ...data, url: data.url || target } })
      onDone()
    } catch {
      onPatch({ data: { url: target, title: target } })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {editing && (
        <form className="inline-form" onSubmit={(e) => (e.preventDefault(), refresh())}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Link address" autoFocus />
          <button className="btn primary" disabled={busy}>{busy ? 'Fetching…' : 'Update preview'}</button>
          {error && <span className="hint error">{error}</span>}
        </form>
      )}
      {block.data.url && <LinkCard link={block.data as LinkData} />}
    </>
  )
}

export function normalizeUrl(raw: string) {
  const v = raw.trim()
  if (!v) return null
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    return u.hostname.includes('.') ? u.href : null
  } catch {
    return null
  }
}

// ---- Resources ----------------------------------------------------------------

function ResourcesBody({ block, editing, onPatch }: { block: Block; editing: boolean; onPatch: (p: BlockPatch) => void }) {
  const items = block.data.items ?? []
  const set = (next: ResourceItem[]) => onPatch({ data: { ...block.data, items: next } })
  const update = (id: string, patch: Partial<ResourceItem>) => set(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  if (editing)
    return (
      <div className="res-edit">
        {items.map((item, i) => (
          <div className="res-row" key={item.id}>
            <span className="res-no">{pad(i + 1)}</span>
            <div className="res-fields">
              <input value={item.title} onChange={(e) => update(item.id, { title: e.target.value })} placeholder="Title (e.g. Book, film, article)" aria-label="Title" />
              <input value={item.url} onChange={(e) => update(item.id, { url: e.target.value })} placeholder="Web address (optional)" aria-label="Link" />
              <input value={item.note} onChange={(e) => update(item.id, { note: e.target.value })} placeholder="Why it matters (optional)" aria-label="Note" />
            </div>
            <button className="icon-btn sm" onClick={() => set(items.filter((x) => x.id !== item.id))} aria-label="Remove">
              <Close width={15} height={15} />
            </button>
          </div>
        ))}
        <button className="btn" onClick={() => set([...items, { id: crypto.randomUUID(), title: '', url: '', note: '' }])}>
          <Plus width={15} height={15} /> Add a resource
        </button>
      </div>
    )

  if (!items.length) return <p className="muted">No resources yet — click Edit to add some.</p>

  return (
    <ol className="res-list">
      {items.map((item, i) => {
        const href = item.url ? normalizeUrl(item.url) : null
        const title = item.title || item.url || 'Untitled'
        return (
          <li key={item.id}>
            <span className="res-no">{pad(i + 1)}</span>
            <div>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="res-title">
                  {title} <External width={12} height={12} />
                </a>
              ) : (
                <span className="res-title">{title}</span>
              )}
              {item.note && <p className="res-note">{item.note}</p>}
              {href && <span className="res-host">{new URL(href).hostname.replace(/^www\./, '')}</span>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
