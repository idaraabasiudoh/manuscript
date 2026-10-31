import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { chat, type ChatMessage } from '../lib/supabase'
import { load, save } from '../lib/util'
import { Check, Close, Plus, Send, Spark, Stop, Trash } from './Icons'

type Props = {
  project: string
  focus?: { id: string; title: string }
  open: boolean
  draft: { text: string; at: number } | null
  onOpenChange: (open: boolean) => void
  onInsert: (text: string) => Promise<void>
}

const SUGGESTIONS = [
  'Give me five loglines for this idea',
  'What’s missing from this story so far?',
  'Turn my notes into a short-film beat sheet',
  'Suggest a striking opening image',
]

export function Chat({ project, focus, open, draft, onOpenChange, onInsert }: Props) {
  const key = `chat:${project}`
  const [messages, setMessages] = useState<ChatMessage[]>(() => load(key, []))
  const [input, setInput] = useState('')
  const [pending, setPending] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const partial = useRef('')
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => save(key, messages.slice(-40)), [key, messages])

  useEffect(() => {
    if (draft) {
      setInput(draft.text)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [draft])

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending, open])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setInput('')
    setError('')
    setBusy(true)
    setPending('')
    const ctrl = new AbortController()
    abort.current = ctrl
    let reply = ''
    try {
      partial.current = ''
      reply = await chat(project, next, focus?.id, (t) => setPending((partial.current = t)), ctrl.signal)
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      reply = ''
    }
    const final = reply || (ctrl.signal.aborted ? partial.current : '')
    if (final.trim()) setMessages((m) => [...m, { role: 'assistant', content: final }])
    setPending('')
    setBusy(false)
    abort.current = null
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
      <button className="chat-fab" onClick={() => onOpenChange(true)} aria-label="Open writing assistant">
        <Spark width={18} height={18} />
        <span>Ask Muse</span>
      </button>
    )

  return (
    <section className="chat" aria-label="Writing assistant">
      <header className="chat-head">
        <div>
          <strong>
            <Spark width={14} height={14} /> Muse
          </strong>
          <span className="chat-sub">{focus ? `Looking at “${focus.title || 'Untitled'}”` : 'Reads your whole project'}</span>
        </div>
        <div className="row">
          {messages.length > 0 && (
            <button className="icon-btn sm" onClick={() => (abort.current?.abort(), setMessages([]), setError(''))} title="Clear conversation" aria-label="Clear conversation">
              <Trash width={15} height={15} />
            </button>
          )}
          <button className="icon-btn sm" onClick={() => onOpenChange(false)} aria-label="Close assistant">
            <Close width={16} height={16} />
          </button>
        </div>
      </header>

      <div className="chat-scroll" ref={scroller}>
        {messages.length === 0 && !busy && (
          <div className="chat-empty">
            <p>Stuck on a scene? Need a title, a rhyme, a twist? I can read everything in this project.</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={i} message={m} onInsert={onInsert} />
        ))}
        {busy && (
          <div className="msg assistant">
            {pending ? <Rendered text={pending} /> : <span className="typing"><i /><i /><i /></span>}
          </div>
        )}
        {error && <p className="chat-error">{error}</p>}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask for ideas, feedback or a rewrite…"
          rows={2}
          aria-label="Message"
        />
        {busy ? (
          <button type="button" className="send" onClick={() => abort.current?.abort()} aria-label="Stop">
            <Stop width={14} height={14} />
          </button>
        ) : (
          <button className="send" disabled={!input.trim()} aria-label="Send">
            <Send width={16} height={16} />
          </button>
        )}
      </form>
    </section>
  )
}

function Rendered({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text, 'drama'), [text])
  return <div className="md md-chat" dangerouslySetInnerHTML={{ __html: html }} />
}

function Message({ message, onInsert }: { message: ChatMessage; onInsert: (text: string) => Promise<void> }) {
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
      <Rendered text={message.content} />
      <div className="msg-actions">
        <button onClick={copy}>{state === 'copied' ? <><Check width={12} height={12} /> Copied</> : 'Copy'}</button>
        <button onClick={insert} disabled={state === 'adding' || state === 'added'}>
          {state === 'added' ? <><Check width={12} height={12} /> Added to page</> : <><Plus width={12} height={12} /> Add as block</>}
        </button>
      </div>
    </div>
  )
}
