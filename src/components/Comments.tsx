import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Check, MessageSquare, RotateCcw, Trash2, X } from 'lucide-react'
import type { Comment } from '../lib/supabase'
import { timeAgo } from '../lib/util'

export type CommentDraft = { quote: string; line: number | null }

type ThreadProps = {
  comments: Comment[]
  draft: CommentDraft | null
  canComment: boolean
  canResolve: boolean
  isOwner: boolean
  onAdd: (body: string, draft: CommentDraft) => Promise<void>
  onResolve: (c: Comment, resolved: boolean) => Promise<void>
  onDelete: (c: Comment) => Promise<void>
  onClose: () => void
  onClearDraft: () => void
  /** Scrolls to where the comment points and pulses it. */
  onJump: (c: Comment) => void
}

/** A block's comments, shown beside the block on wide screens and under it on narrow ones. */
export function CommentThread({ comments, draft, canComment, canResolve, isOwner, onAdd, onResolve, onDelete, onClose, onClearDraft, onJump }: ThreadProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (draft) input.current?.focus()
  }, [draft])

  const open = comments.filter((c) => !c.resolved)
  const resolved = comments.filter((c) => c.resolved)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await onAdd(text.trim(), draft ?? { quote: '', line: null })
      setText('')
      onClearDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const item = (c: Comment) => (
    <li
      key={c.id}
      className={`comment jumpable ${c.resolved ? 'resolved' : ''}`}
      role="button"
      tabIndex={0}
      title={c.quote ? 'Show this passage' : 'Show the block'}
      onClick={(e) => !(e.target as HTMLElement).closest('button') && onJump(c)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onJump(c))}
    >
      <div className="comment-head">
        <strong>{c.authorName}</strong>
        <span className="muted">{timeAgo(c.created)}</span>
        <span className="comment-tools">
          {canResolve && (
            <button className="icon-btn xs" onClick={() => onResolve(c, !c.resolved)} title={c.resolved ? 'Reopen' : 'Resolve'} aria-label={c.resolved ? 'Reopen comment' : 'Resolve comment'}>
              {c.resolved ? <RotateCcw size={13} /> : <Check size={14} />}
            </button>
          )}
          {(c.mine || isOwner) && (
            <button className="icon-btn xs" onClick={() => onDelete(c)} title="Delete" aria-label="Delete comment">
              <Trash2 size={13} />
            </button>
          )}
        </span>
      </div>
      {c.quote && <blockquote className="comment-quote">{c.quote}</blockquote>}
      <p className="comment-body">{c.body}</p>
    </li>
  )

  return (
    <aside className="comment-thread" aria-label="Comments">
      <header className="comment-thread-head">
        <MessageSquare size={14} />
        <strong>Comments</strong>
        <button className="icon-btn xs" onClick={onClose} aria-label="Close comments" title="Close">
          <X size={14} />
        </button>
      </header>
      {open.length === 0 && !draft && <p className="comment-empty muted">No comments yet. Select some text in the block to comment on a line.</p>}
      <ul className="comment-list">{open.map(item)}</ul>
      {resolved.length > 0 && (
        <>
          <button className="comment-toggle" onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
          </button>
          {showResolved && <ul className="comment-list">{resolved.map(item)}</ul>}
        </>
      )}
      {canComment ? (
        <form className="comment-form" onSubmit={submit}>
          {draft?.quote && (
            <div className="comment-quote draft">
              <span>{draft.quote}</span>
              <button type="button" className="icon-btn xs" onClick={onClearDraft} aria-label="Comment on the whole block instead">
                <X size={12} />
              </button>
            </div>
          )}
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
            }}
            placeholder={draft?.quote ? 'Comment on this passage' : 'Add a comment'}
            rows={2}
          />
          {error && <p className="comment-error">{error}</p>}
          <button className="btn primary sm" disabled={!text.trim() || busy}>{busy ? 'Posting…' : 'Comment'}</button>
        </form>
      ) : (
        <p className="comment-empty muted">Sign in to comment.</p>
      )}
    </aside>
  )
}

/**
 * Watches text selection inside a block body and offers a "Comment" button next to it.
 * The quote is the selected text; the line is where it first appears in the block's text.
 */
export function useSelectionComment(body: RefObject<HTMLElement | null>, source: string, enabled: boolean) {
  const [pick, setPick] = useState<{ quote: string; line: number | null; x: number; y: number } | null>(null)
  useEffect(() => {
    if (!enabled) return setPick(null)
    const onUp = () =>
      requestAnimationFrame(() => {
        const sel = window.getSelection()
        const el = body.current
        if (!sel || sel.isCollapsed || !el || !sel.rangeCount || !el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return setPick(null)
        const quote = sel.toString().trim().replace(/\s+\n/g, '\n').slice(0, 2000)
        if (!quote) return setPick(null)
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        const host = el.getBoundingClientRect()
        setPick({ quote, line: lineOf(source, quote), x: rect.right - host.left, y: rect.top - host.top })
      })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('keyup', onUp)
    return () => {
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('keyup', onUp)
    }
  }, [body, source, enabled])
  return [pick, () => setPick(null)] as const
}

function lineOf(source: string, quote: string): number | null {
  const first = quote.split('\n')[0].trim()
  if (!first) return null
  const lines = source.split('\n')
  const i = lines.findIndex((l) => l.includes(first) || l.replace(/[*_~+#>@-]/g, '').includes(first))
  return i < 0 ? null : i
}

const blockRanges = new Map<string, Range[]>()
function paintHighlights() {
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  const HighlightCtor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
  if (!registry || !HighlightCtor) return
  registry.set('comment', new HighlightCtor(...[...blockRanges.values()].flat()))
}

/** Marks every open comment's passage in the block with the CSS Custom Highlight API (where supported). */
export function useCommentHighlights(body: RefObject<HTMLElement | null>, blockId: string, quotes: string[], deps: unknown) {
  useEffect(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const HighlightCtor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
    const el = body.current
    if (!registry || !HighlightCtor || !el) return
    const ranges: Range[] = []
    for (const q of quotes) {
      const needle = q.split('\n')[0].trim()
      if (needle.length < 2) continue
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.textContent?.indexOf(needle) ?? -1
        if (at >= 0) {
          const r = document.createRange()
          r.setStart(n, at)
          r.setEnd(n, at + needle.length)
          ranges.push(r)
          break
        }
      }
    }
    blockRanges.set(blockId, ranges)
    paintHighlights()
    return () => {
      blockRanges.delete(blockId)
      paintHighlights()
    }
  }, [body, blockId, quotes.join('\u0000'), deps])
}

// ---- Jumping to a comment -----------------------------------------------------------

/** The text range of a quote inside a container (first line of the quote, first match). */
export function findQuote(container: HTMLElement, quote: string): Range | null {
  const needle = quote.split('\n')[0].trim()
  if (needle.length < 2) return null
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const at = n.textContent?.indexOf(needle) ?? -1
    if (at >= 0) {
      const r = document.createRange()
      r.setStart(n, at)
      r.setEnd(n, at + needle.length)
      return r
    }
  }
  return null
}

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Waits until scrolling settles (or a short timeout), so overlays land where the text ends up. */
function afterScroll(done: () => void) {
  let timer = setTimeout(finish, 700)
  let fired = false
  function finish() {
    if (fired) return
    fired = true
    clearTimeout(timer)
    window.removeEventListener('scrollend', onEnd, true)
    done()
  }
  function onEnd() {
    clearTimeout(timer)
    timer = setTimeout(finish, 60)
  }
  window.addEventListener('scrollend', onEnd, true)
}

/**
 * Scrolls a commented passage into view and draws a pulsing marker over it, or pulses the whole
 * block for a block comment (or when the passage has since been edited away).
 */
export function jumpToComment(block: HTMLElement, body: HTMLElement | null, quote: string) {
  const range = body && quote ? findQuote(body, quote) : null
  const target = range?.startContainer.parentElement ?? block
  target.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: range ? 'center' : 'start' })
  afterScroll(() => {
    if (!range) {
      block.classList.remove('comment-flash')
      void block.offsetWidth // restart the animation
      block.classList.add('comment-flash')
      setTimeout(() => block.classList.remove('comment-flash'), 1800)
      return
    }
    const marks = [...range.getClientRects()]
      .filter((r) => r.width > 1 && r.height > 1)
      .map((r) => {
        const m = document.createElement('span')
        m.className = 'comment-ping'
        Object.assign(m.style, { left: `${r.left - 3}px`, top: `${r.top - 2}px`, width: `${r.width + 6}px`, height: `${r.height + 4}px` })
        document.body.appendChild(m)
        return m
      })
    setTimeout(() => marks.forEach((m) => m.remove()), 1900)
  })
}
