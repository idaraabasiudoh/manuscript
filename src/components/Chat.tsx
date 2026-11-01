import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  ArrowUp,
  Check,
  Copy,
  FilePlus2,
  Image,
  Lightbulb,
  ListChecks,
  Maximize2,
  MessageSquareText,
  MessagesSquare,
  Minimize2,
  Plus,
  RotateCcw,
  Route,
  Scissors,
  SearchCheck,
  Square,
  SquarePen,
  X,
  type LucideIcon,
} from 'lucide-react'
import { renderMarkdown } from '../lib/markdown'
import { chat, type BlockKind, type ChatMessage } from '../lib/supabase'
import { load, save } from '../lib/util'
import { KindIcon, ManuSpark } from './Icons'

type BlockRef = { id: string; title: string; kind: BlockKind }

type Props = {
  project: string
  projectTitle: string
  blocks: BlockRef[]
  focus?: BlockRef
  open: boolean
  draft: { text: string; at: number } | null
  onOpenChange: (open: boolean) => void
  onFocus: (id: string | undefined) => void
  /** Absent for viewers: they can ask, but not add to the page. */
  onInsert?: (text: string) => Promise<void>
}

type Suggestion = { icon: LucideIcon; title: string; prompt: string }

const GENERAL: Suggestion[] = [
  { icon: Lightbulb, title: 'Brainstorm loglines', prompt: 'Give me five loglines for this idea' },
  { icon: SearchCheck, title: 'Find the gaps', prompt: 'What’s missing from this story so far?' },
  { icon: ListChecks, title: 'Build a beat sheet', prompt: 'Turn my notes into a short-film beat sheet' },
  { icon: Image, title: 'Opening image', prompt: 'Suggest a striking opening image' },
]

const focused = (title: string): Suggestion[] => [
  { icon: Scissors, title: 'Tighten it', prompt: `Tighten the writing in “${title}” and explain what you changed` },
  { icon: Route, title: 'What happens next?', prompt: `Suggest three directions for what happens after “${title}”` },
  { icon: MessageSquareText, title: 'Honest feedback', prompt: `Give me honest feedback on “${title}”: what works, what doesn’t` },
  { icon: MessagesSquare, title: 'Sharpen dialogue', prompt: `Make the dialogue in “${title}” sharper and more distinct per character` },
]

export function Chat({ project, projectTitle, blocks, focus, open, draft, onOpenChange, onFocus, onInsert }: Props) {
  const key = `chat:${project}`
  const [messages, setMessages] = useState<ChatMessage[]>(() => load(key, []))
  const [input, setInput] = useState('')
  const [pending, setPending] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wide, setWide] = useState(() => load('chat:wide', false))
  const [picker, setPicker] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const partial = useRef('')
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stick = useRef(true)

  useEffect(() => save(key, messages.slice(-40)), [key, messages])
  useEffect(() => save('chat:wide', wide), [wide])

  useEffect(() => {
    if (draft) {
      setInput(draft.text)
      requestAnimationFrame(() => {
        const el = inputRef.current
        el?.focus()
        el?.setSelectionRange(el.value.length, el.value.length)
      })
    }
  }, [draft])

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
    else setPicker(false)
  }, [open])

  // ⌘J / Ctrl+J toggles the panel; Escape closes the block picker, then the panel.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        onOpenChange(!open)
      } else if (e.key === 'Escape' && open && !document.querySelector('.overlay')) {
        if (picker) setPicker(false)
        else onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, picker, onOpenChange])

  // Follow the stream unless the reader has scrolled up.
  useEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages, pending, open, busy])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    el.style.overflowY = el.scrollHeight > 200 ? 'auto' : 'hidden'
  }, [input, open])

  const run = async (history: ChatMessage[]) => {
    setMessages(history)
    setError('')
    setBusy(true)
    setPending('')
    stick.current = true
    const ctrl = new AbortController()
    abort.current = ctrl
    partial.current = ''
    let reply = ''
    try {
      reply = await chat(project, history, focus?.id, (t) => setPending((partial.current = t)), ctrl.signal)
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    }
    const final = reply || (ctrl.signal.aborted ? partial.current : '')
    if (final.trim()) setMessages((m) => [...m, { role: 'assistant', content: final }])
    setPending('')
    setBusy(false)
    abort.current = null
  }

  const send = (text: string) => {
    const content = text.trim()
    if (!content || busy) return
    setInput('')
    setPicker(false)
    run([...messages, { role: 'user', content }])
  }

  const regenerate = () => {
    const lastUser = messages.map((m) => m.role).lastIndexOf('user')
    if (lastUser >= 0 && !busy) run(messages.slice(0, lastUser + 1))
  }

  const newChat = () => {
    abort.current?.abort()
    setMessages([])
    setError('')
    inputRef.current?.focus()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(input)
    }
  }

  if (!open)
    return (
      <button className="chat-fab" onClick={() => onOpenChange(true)} aria-label="Open Manu AI" title="Manu AI (⌘J)">
        <ManuSpark size={20} />
        <span className="chat-fab-label">Ask Manu AI</span>
      </button>
    )

  const suggestions = focus ? focused(focus.title || 'this block') : GENERAL
  const lastAssistant = messages.map((m) => m.role).lastIndexOf('assistant')
  const empty = messages.length === 0 && !busy

  return (
    <section className={`chat ${wide ? 'wide' : ''} ${busy ? 'busy' : ''}`} aria-label="Manu AI">
      <header className="chat-head">
        <div className="chat-id">
          <ManuSpark size={20} />
          <strong>Manu AI</strong>
        </div>
        <div className="chat-tools">
          {messages.length > 0 && (
            <button className="chat-icon" onClick={newChat} data-tip="New chat" aria-label="New chat">
              <SquarePen size={18} strokeWidth={1.75} />
            </button>
          )}
          <button className="chat-icon hide-sm" onClick={() => setWide((w) => !w)} data-tip={wide ? 'Smaller' : 'Bigger'} aria-label={wide ? 'Smaller panel' : 'Bigger panel'}>
            {wide ? <Minimize2 size={17} strokeWidth={1.75} /> : <Maximize2 size={17} strokeWidth={1.75} />}
          </button>
          <button className="chat-icon" onClick={() => onOpenChange(false)} data-tip="Close" aria-label="Close Manu AI">
            <X size={19} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div
        className={`chat-scroll ${empty ? 'empty' : ''}`}
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {empty && (
          <div className="chat-empty">
            <h3 className="chat-hello">
              <span className="ai-text">Hello there</span>
              <span className="chat-hello-sub">
                {focus ? <>What should we do with “{focus.title || 'Untitled'}”?</> : <>How can I help with {projectTitle ? <>“{projectTitle}”</> : 'your project'}?</>}
              </span>
            </h3>
            <div className="chat-suggestions">
              {suggestions.map(({ icon: Icon, title, prompt }) => (
                <button key={title} onClick={() => send(prompt)}>
                  <span className="sugg-title">{title}</span>
                  <span className="sugg-prompt">{prompt}</span>
                  <Icon className="sugg-icon" size={18} strokeWidth={1.75} />
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <Message key={i} message={m} onInsert={onInsert} onRegenerate={i === lastAssistant && !busy ? regenerate : undefined} />
        ))}

        {busy && (
          <div className="msg assistant">
            <span className="msg-avatar thinking">
              <ManuSpark size={18} />
            </span>
            <div className="msg-body">
              {pending ? (
                <Rendered text={pending} streaming />
              ) : (
                <div className="shimmer" aria-label="Manu is thinking">
                  <i /> <i /> <i />
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="chat-error">
            <span>{error}</span>
            <button onClick={regenerate}>Try again</button>
          </div>
        )}
      </div>

      <form className="chat-composer" onSubmit={submit}>
        {picker && (
          <div className="chat-picker" role="menu">
            <p className="chat-picker-head">Ask about…</p>
            <button type="button" role="menuitem" className={!focus ? 'on' : ''} onClick={() => (onFocus(undefined), setPicker(false), inputRef.current?.focus())}>
              <ManuSpark size={15} />
              <span className="truncate">The whole project</span>
              {!focus && <Check size={15} />}
            </button>
            {blocks.map((b) => (
              <button type="button" role="menuitem" key={b.id} className={focus?.id === b.id ? 'on' : ''} onClick={() => (onFocus(b.id), setPicker(false), inputRef.current?.focus())}>
                <KindIcon kind={b.kind} size={15} />
                <span className="truncate">{b.title || 'Untitled'}</span>
                {focus?.id === b.id && <Check size={15} />}
              </button>
            ))}
          </div>
        )}
        <div className="chat-input">
          {focus && (
            <div className="chat-context">
              <KindIcon kind={focus.kind} size={13} />
              <span className="truncate">{focus.title || 'Untitled block'}</span>
              <button type="button" onClick={() => onFocus(undefined)} aria-label="Ask about the whole project instead" title="Ask about the whole project instead">
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask Manu AI"
            rows={1}
            aria-label="Message Manu AI"
          />
          <div className="chat-input-row">
            <button
              type="button"
              className={`chat-icon add ${picker ? 'on' : ''}`}
              onClick={() => setPicker((p) => !p)}
              data-tip="Choose a block"
              aria-label="Choose a block to ask about"
              aria-expanded={picker}
            >
              <Plus size={20} strokeWidth={1.75} />
            </button>
            {busy ? (
              <button type="button" className="send stop" onClick={() => abort.current?.abort()} aria-label="Stop" title="Stop">
                <Square size={12} fill="currentColor" strokeWidth={0} />
              </button>
            ) : (
              <button className={`send ${input.trim() ? 'ready' : ''}`} disabled={!input.trim()} aria-label="Send" title="Send (Enter)">
                <ArrowUp size={18} strokeWidth={2.25} />
              </button>
            )}
          </div>
        </div>
        <p className="chat-hint">Manu AI can make mistakes, so double-check it.</p>
      </form>
    </section>
  )
}

function Rendered({ text, streaming }: { text: string; streaming?: boolean }) {
  const html = useMemo(() => renderMarkdown(text, 'drama'), [text])
  return <div className={`md md-chat ${streaming ? 'streaming' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}

function Message({ message, onInsert, onRegenerate }: { message: ChatMessage; onInsert?: (text: string) => Promise<void>; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false)
  const [added, setAdded] = useState<'idle' | 'adding' | 'added'>('idle')
  const copy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const copyButton = (
    <button className="chat-icon sm" onClick={copy} data-tip={copied ? 'Copied' : 'Copy'} aria-label="Copy">
      {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.75} />}
    </button>
  )

  if (message.role === 'user')
    return (
      <div className="msg user">
        <div className="msg-text">{message.content}</div>
        <div className="msg-actions">{copyButton}</div>
      </div>
    )

  const insert = async () => {
    if (!onInsert) return
    setAdded('adding')
    try {
      await onInsert(message.content)
      setAdded('added')
    } catch {
      setAdded('idle')
    }
  }
  return (
    <div className="msg assistant">
      <span className="msg-avatar">
        <ManuSpark size={18} />
      </span>
      <div className="msg-body">
        <Rendered text={message.content} />
        <div className="msg-actions">
          {copyButton}
          {onInsert && <button
            className="chat-icon sm"
            onClick={insert}
            disabled={added !== 'idle'}
            data-tip={added === 'added' ? 'Added to page' : 'Add to page'}
            aria-label="Add to page as a block"
          >
            {added === 'added' ? <Check size={16} strokeWidth={2} /> : <FilePlus2 size={16} strokeWidth={1.75} />}
          </button>}
          {onRegenerate && (
            <button className="chat-icon sm" onClick={onRegenerate} data-tip="Try again" aria-label="Write a different answer">
              <RotateCcw size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
