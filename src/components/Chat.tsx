import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { chat, type ChatMessage } from '../lib/supabase'
import { load, save } from '../lib/util'
import { Check, Close, Expand, Plus, Refresh, Send, Shrink, Spark, Stop, Trash } from './Icons'

type Props = {
  project: string
  focus?: { id: string; title: string }
  open: boolean
  draft: { text: string; at: number } | null
  onOpenChange: (open: boolean) => void
  onClearFocus: () => void
  onInsert: (text: string) => Promise<void>
}

const GENERAL = [
  { title: 'Loglines', prompt: 'Give me five loglines for this idea' },
  { title: 'Find the gaps', prompt: 'What’s missing from this story so far?' },
  { title: 'Beat sheet', prompt: 'Turn my notes into a short-film beat sheet' },
  { title: 'Opening image', prompt: 'Suggest a striking opening image' },
]

const focused = (title: string) => [
  { title: 'Tighten it', prompt: `Tighten the writing in “${title}” and explain what you changed` },
  { title: 'What next?', prompt: `Suggest three directions for what happens after “${title}”` },
  { title: 'Feedback', prompt: `Give me honest feedback on “${title}”: what works, what doesn’t` },
  { title: 'Sharpen dialogue', prompt: `Make the dialogue in “${title}” sharper and more distinct per character` },
]

export function Chat({ project, focus, open, draft, onOpenChange, onClearFocus, onInsert }: Props) {
  const key = `chat:${project}`
  const [messages, setMessages] = useState<ChatMessage[]>(() => load(key, []))
  const [input, setInput] = useState('')
  const [pending, setPending] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wide, setWide] = useState(() => load('chat:wide', false))
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
  }, [open])

  // ⌘J / Ctrl+J toggles the panel; Escape closes it.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        onOpenChange(!open)
      } else if (e.key === 'Escape' && open && !document.querySelector('.overlay')) onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  // Follow the stream unless the reader has scrolled up.
  useEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages, pending, open, busy])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
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
    run([...messages, { role: 'user', content }])
  }

  const regenerate = () => {
    const lastUser = messages.map((m) => m.role).lastIndexOf('user')
    if (lastUser >= 0 && !busy) run(messages.slice(0, lastUser + 1))
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
        <span className="manu-mark sm" aria-hidden>
          <Spark width={13} height={13} />
        </span>
        <span className="chat-fab-label">Manu AI</span>
      </button>
    )

  const suggestions = focus ? focused(focus.title || 'this block') : GENERAL
  const lastAssistant = messages.map((m) => m.role).lastIndexOf('assistant')

  return (
    <section className={`chat ${wide ? 'wide' : ''}`} aria-label="Manu AI">
      <header className="chat-head">
        <span className="manu-mark" aria-hidden>
          <Spark width={16} height={16} />
        </span>
        <div className="chat-id">
          <strong>Manu AI</strong>
          <span className="chat-sub">
            <i className={busy ? 'thinking' : ''} /> {busy ? 'Writing…' : 'Your writing partner · reads this project'}
          </span>
        </div>
        <div className="chat-tools">
          {messages.length > 0 && (
            <button
              className="icon-btn sm"
              onClick={() => (abort.current?.abort(), setMessages([]), setError(''))}
              title="New conversation"
              aria-label="New conversation"
            >
              <Trash width={15} height={15} />
            </button>
          )}
          <button className="icon-btn sm hide-sm" onClick={() => setWide((w) => !w)} title={wide ? 'Smaller panel' : 'Bigger panel'} aria-label={wide ? 'Smaller panel' : 'Bigger panel'}>
            {wide ? <Shrink width={15} height={15} /> : <Expand width={15} height={15} />}
          </button>
          <button className="icon-btn sm" onClick={() => onOpenChange(false)} title="Close (Esc)" aria-label="Close Manu AI">
            <Close width={16} height={16} />
          </button>
        </div>
      </header>

      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {messages.length === 0 && !busy && (
          <div className="chat-empty">
            <span className="manu-mark lg" aria-hidden>
              <Spark width={24} height={24} />
            </span>
            <h3>Hi, I’m Manu.</h3>
            <p>
              {focus
                ? `I’m looking at “${focus.title || 'Untitled'}”. Ask me anything about it — or about the whole project.`
                : 'Stuck on a scene? Need a title, a rhyme, a twist? I’ve read everything in this project.'}
            </p>
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <button key={s.title} onClick={() => send(s.prompt)}>
                  <strong>{s.title}</strong>
                  <span>{s.prompt}</span>
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
            <span className="manu-mark xs" aria-hidden>
              <Spark width={11} height={11} />
            </span>
            <div className="msg-body">
              {pending ? <Rendered text={pending} streaming /> : <span className="typing"><i /><i /><i /></span>}
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
        {focus && (
          <div className="chat-context">
            <span className="mono-label">About</span>
            <span className="chat-context-title truncate">{focus.title || 'Untitled block'}</span>
            <button type="button" onClick={onClearFocus} aria-label="Ask about the whole project instead" title="Ask about the whole project instead">
              <Close width={12} height={12} />
            </button>
          </div>
        )}
        <div className="chat-input">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={focus ? `Ask about “${focus.title || 'this block'}”…` : 'Ask for ideas, feedback or a rewrite…'}
            rows={1}
            aria-label="Message Manu AI"
          />
          {busy ? (
            <button type="button" className="send stop" onClick={() => abort.current?.abort()} aria-label="Stop" title="Stop">
              <Stop width={13} height={13} />
            </button>
          ) : (
            <button className="send" disabled={!input.trim()} aria-label="Send" title="Send (Enter)">
              <Send width={16} height={16} />
            </button>
          )}
        </div>
        <p className="chat-hint hide-sm">Enter to send · Shift + Enter for a new line · ⌘J to toggle</p>
      </form>
    </section>
  )
}

function Rendered({ text, streaming }: { text: string; streaming?: boolean }) {
  const html = useMemo(() => renderMarkdown(text, 'drama'), [text])
  return <div className={`md md-chat ${streaming ? 'streaming' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}

function Message({ message, onInsert, onRegenerate }: { message: ChatMessage; onInsert: (text: string) => Promise<void>; onRegenerate?: () => void }) {
  const [state, setState] = useState<'idle' | 'copied' | 'adding' | 'added'>('idle')
  if (message.role === 'user') return <div className="msg user">{message.content}</div>
  const copy = async () => {
    await navigator.clipboard.writeText(message.content)
    setState('copied')
    setTimeout(() => setState('idle'), 1500)
  }
  const insert = async () => {
    setState('adding')
    try {
      await onInsert(message.content)
      setState('added')
    } catch {
      setState('idle')
    }
  }
  return (
    <div className="msg assistant">
      <span className="manu-mark xs" aria-hidden>
        <Spark width={11} height={11} />
      </span>
      <div className="msg-body">
        <Rendered text={message.content} />
        <div className="msg-actions">
          <button onClick={copy}>{state === 'copied' ? <><Check width={12} height={12} /> Copied</> : 'Copy'}</button>
          <button onClick={insert} disabled={state === 'adding' || state === 'added'}>
            {state === 'added' ? <><Check width={12} height={12} /> Added to page</> : <><Plus width={12} height={12} /> Add as block</>}
          </button>
          {onRegenerate && (
            <button onClick={onRegenerate} title="Write a different answer">
              <Refresh width={12} height={12} /> Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
