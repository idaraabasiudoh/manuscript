import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { emptyScript, parseScript, toText } from '../lib/script'
import { ACCEPT_ATTR, isTextKind, mimeFor, unfurl, uploadFile, type Block, type BlockKind, type LinkData } from '../lib/supabase'
import { KINDS, TEMPLATES } from '../lib/templates'
import { formatBytes } from '../lib/util'
import { Close, KindIcon, Upload } from './Icons'
import { normalizeUrl } from './Block'

export type NewBlock = Pick<Block, 'kind' | 'title' | 'body' | 'data'>

type Props = {
  project: string
  kind: BlockKind
  onCreate: (block: NewBlock) => Promise<void>
  onClose: () => void
}

export function NewBlockDialog({ project, kind, onCreate, onClose }: Props) {
  const templates = isTextKind(kind) ? TEMPLATES[kind] : []
  const [templateId, setTemplateId] = useState(templates[1]?.id ?? 'blank')
  const template = templates.find((t) => t.id === templateId)
  const [title, setTitle] = useState(template?.title ?? defaultTitle(kind))
  const [titleTouched, setTitleTouched] = useState(false)
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const meta = KINDS[kind]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const pickTemplate = (id: string) => {
    setTemplateId(id)
    const t = templates.find((x) => x.id === id)
    if (t && !titleTouched) setTitle(t.title)
  }

  const pickFile = (f: File | undefined) => {
    if (!f) return
    if (!mimeFor(f)) return setError('Only PDF, MP4, MP3 and image files can be added.')
    setError('')
    setFile(f)
    if (!titleTouched) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (isTextKind(kind)) {
        if (kind === 'drama' && templateId !== 'treatment') {
          // Scripts start structured: a title page, a reusable cast and script pieces.
          const script = template?.body ? parseScript(template.body, title) : emptyScript({ title })
          if (!script.meta.title) script.meta.title = title
          await onCreate({ kind, title, body: toText(script), data: { template: templateId, script } })
        } else {
          await onCreate({ kind, title, body: template?.body ?? '', data: { template: templateId } })
        }
      } else if (kind === 'file') {
        if (!file) throw new Error('Choose a file first.')
        setProgress(0)
        const data = await uploadFile(project, file, setProgress)
        await onCreate({ kind, title, body: '', data })
      } else if (kind === 'link') {
        const target = normalizeUrl(url)
        if (!target) throw new Error('That doesn’t look like a web address.')
        let data: LinkData = { url: target }
        try {
          data = { ...(await unfurl(target)), url: target }
        } catch {
          /* keep the bare link */
        }
        await onCreate({ kind, title: titleTouched ? title : data.title?.slice(0, 120) || title, body: '', data })
      } else {
        await onCreate({ kind, title, body: '', data: { items: [{ id: crypto.randomUUID(), title: '', url: '', note: '' }] } })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setProgress(null)
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className={`dialog new-block ${isTextKind(kind) ? 'wide' : ''}`} onSubmit={submit}>
        <header className="dialog-head">
          <div>
            <p className="mono-label">
              <KindIcon kind={kind} width={13} height={13} /> New {meta.label} block
            </p>
            <h2>{HEADINGS[kind]}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <Close />
          </button>
        </header>

        <label className="field">
          <span className="field-label">Block name</span>
          <input
            value={title}
            onChange={(e) => (setTitle(e.target.value), setTitleTouched(true))}
            placeholder="Give this block a name"
            autoFocus={kind !== 'link'}
            maxLength={200}
          />
        </label>

        {isTextKind(kind) && (
          <div className="field">
            <span className="field-label">Start from a template</span>
            <div className="templates">
              {templates.map((t) => (
                <TemplateCard key={t.id} kind={kind} name={t.name} description={t.description} body={t.body} selected={t.id === templateId} onSelect={() => pickTemplate(t.id)} />
              ))}
            </div>
          </div>
        )}

        {kind === 'file' && (
          <div
            className={`dropzone ${dragging ? 'over' : ''} ${file ? 'has-file' : ''}`}
            onClick={() => !busy && fileInput.current?.click()}
            onDragOver={(e) => (e.preventDefault(), e.stopPropagation(), setDragging(true))}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => (e.preventDefault(), e.stopPropagation(), setDragging(false), pickFile(e.dataTransfer.files[0]))}
          >
            <input ref={fileInput} type="file" accept={ACCEPT_ATTR} hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            <Upload width={22} height={22} />
            {file ? (
              <>
                <strong className="truncate">{file.name}</strong>
                <span className="muted">{formatBytes(file.size)} · click to choose another</span>
              </>
            ) : (
              <>
                <strong>Drop a file here, or click to choose</strong>
                <span className="muted">PDF scripts, MP4 videos, MP3 audio or images · up to 50 MB</span>
              </>
            )}
            {progress !== null && (
              <div className="bar">
                <span style={{ transform: `scaleX(${progress})` }} />
              </div>
            )}
          </div>
        )}

        {kind === 'link' && (
          <label className="field">
            <span className="field-label">Web address</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" autoFocus inputMode="url" />
            <span className="hint">YouTube, Vimeo, Spotify and Loom links play right in the page. Other links show a preview card.</span>
          </label>
        )}

        {kind === 'resources' && <p className="muted">You’ll get an empty list to fill in with books, films, articles and links — each with a short note.</p>}

        {error && <p className="hint error">✕ {error}</p>}

        <footer className="dialog-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || (kind === 'file' && !file) || (kind === 'link' && !url.trim())}>
            {busy ? (progress !== null ? `Uploading ${Math.round(progress * 100)}%` : 'Adding…') : 'Add block'}
          </button>
        </footer>
      </form>
    </div>
  )
}

const HEADINGS: Record<BlockKind, string> = {
  text: 'Jot it down',
  poetry: 'Write a poem',
  drama: 'Write a scene',
  prose: 'Tell the story',
  file: 'Add a file',
  link: 'Add a link',
  resources: 'Collect references',
}

function defaultTitle(kind: BlockKind) {
  return { file: 'File', link: 'Link', resources: 'Resources' }[kind as string] ?? KINDS[kind].label
}

function TemplateCard({ kind, name, description, body, selected, onSelect }: { kind: string; name: string; description: string; body: string; selected: boolean; onSelect: () => void }) {
  const html = useMemo(() => renderMarkdown(body.split('\n').slice(0, 14).join('\n'), kind as 'text'), [body, kind])
  return (
    <button type="button" className={`template ${selected ? 'selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
      <div className="template-page" aria-hidden>
        {body ? <div className={`md md-${kind}`} dangerouslySetInnerHTML={{ __html: html }} /> : <span className="template-blank" />}
      </div>
      <strong>{name}</strong>
      <span className="muted">{description}</span>
    </button>
  )
}
