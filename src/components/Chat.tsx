import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  ArrowUp,
  Check,
  ClipboardPaste,
  Copy,
  FilePen,
  GitBranch,
  FilePlus,
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
import { chat, type BlockKind, type ChatMessage, type ChatOp, type ChatQuestion, type Proposal, type TextKind } from '../lib/supabase'
import { normalizeScript, toText } from '../lib/script'
import { KINDS } from '../lib/templates'
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
  /** Applies an accepted Manu AI change to the page. */
  onApply: (ops: ChatOp[]) => Promise<void>
}

type Suggestion = { icon: LucideIcon; title: string; prompt: string }

type Skill = { id: string; name: string; description: string; icon: LucideIcon; placeholder: string }

/** Skills the writer can pick from the chat bar or with "/name". The instructions live in the chat function. */
const SKILLS: Skill[] = [
  {
    id: 'smart-copy',
    name: 'Smart copy',
    description: 'Paste text from anywhere and Manu turns it into a block',
    icon: ClipboardPaste,
    placeholder: 'Paste your text here',
  },
]
const skillById = (id?: string) => SKILLS.find((s) => s.id === id)

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

export function Chat({ project, projectTitle, blocks, focus, open, draft, onOpenChange, onFocus, onApply }: Props) {
  const key = `chat:${project}`
  const [messages, setMessages] = useState<ChatMessage[]>(() => load(key, []))
  const [input, setInput] = useState('')
  const [pending, setPending] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wide, setWide] = useState(() => load('chat:wide', false))
  const [picker, setPicker] = useState(false)
  const [skill, setSkill] = useState<Skill | undefined>()
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

  const run = async (history: ChatMessage[], skillId?: string) => {
    setMessages(history)
    setError('')
    setBusy(true)
    setPending('')
    setSteps([])
    stick.current = true
    const ctrl = new AbortController()
    abort.current = ctrl
    partial.current = ''
    let result: Awaited<ReturnType<typeof chat>> | undefined
    let progress: string[] = []
    try {
      result = await chat(project, history, focus?.id, (p) => (setPending((partial.current = p.text)), setSteps((progress = p.steps))), ctrl.signal, skillId)
      if (result.error) setError(result.error)
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    }
    const text = result?.text || (ctrl.signal.aborted ? partial.current : '')
    const ops = ctrl.signal.aborted ? undefined : result?.ops
    const question = ctrl.signal.aborted ? undefined : result?.question
    if (text.trim() || ops?.length || question) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: text,
          steps: progress.length ? progress : undefined,
          proposal: ops?.length ? { ops, status: 'pending' } : undefined,
          question,
          skill: skillId,
        },
      ])
    }
    setPending('')
    setSteps([])
    setBusy(false)
    abort.current = null
  }

  const decide = async (index: number, accept: boolean) => {
    const message = messages[index]
    if (!message?.proposal || message.proposal.status !== 'pending') return
    const set = (proposal: Proposal) => setMessages((all) => all.map((m, i) => (i === index ? { ...m, proposal } : m)))
    if (!accept) return set({ ...message.proposal, status: 'declined' })
    await onApply(message.proposal.ops)
    set({ ...message.proposal, status: 'applied', error: undefined })
  }

  const send = (text: string, carrySkill?: string) => {
    let content = text.trim()
    let skillId = carrySkill ?? skill?.id
    // "/smart-copy <text>" typed in full works like picking the skill first.
    const slash = content.match(/^\/([a-z-]+)\s+([\s\S]+)$/)
    if (slash && skillById(slash[1])) {
      skillId = slash[1]
      content = slash[2].trim()
    }
    if (!content || busy) return
    setSkill(undefined)
    // Writing a new message instead of answering a proposal counts as declining it.
    const answered = messages.map((m) => (m.proposal?.status === 'pending' ? { ...m, proposal: { ...m.proposal, status: 'declined' as const } } : m))
    setInput('')
    setPicker(false)
    run([...answered, { role: 'user', content, skill: skillId }], skillId)
  }

  const regenerate = () => {
    const lastUser = messages.map((m) => m.role).lastIndexOf('user')
    if (lastUser >= 0 && !busy) run(messages.slice(0, lastUser + 1), messages[lastUser].skill)
  }

  /** Answering a question keeps the skill that turn was using, and marks the question answered. */
  const answer = (index: number, text: string) => {
    const m = messages[index]
    if (!m?.question || m.question.answer || busy) return
    setMessages((all) => all.map((x, i) => (i === index ? { ...x, question: { ...x.question!, answer: text } } : x)))
    const marked = messages.map((x, i) => (i === index ? { ...x, question: { ...x.question!, answer: text } } : x))
    const content = text.trim()
    if (!content) return
    setInput('')
    run([...marked, { role: 'user', content, skill: m.skill }], m.skill)
  }

  // Typing "/" at the start opens the skills menu, filtered by what follows.
  const slashQuery = /^\/[a-z-]*$/.test(input) ? input.slice(1) : null
  const slashMatches = slashQuery === null ? [] : SKILLS.filter((s) => s.id.startsWith(slashQuery) || s.name.toLowerCase().startsWith(slashQuery))
  const pickSkill = (s: Skill) => {
    setSkill(s)
    setInput('')
    setPicker(false)
    requestAnimationFrame(() => inputRef.current?.focus())
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
      if (slashMatches.length) return pickSkill(slashMatches[0])
      send(input)
    } else if (e.key === 'Backspace' && !input && skill) setSkill(undefined)
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
          <Message key={i} message={m} onDecide={(accept) => decide(i, accept)} onAnswer={(t) => answer(i, t)} onRegenerate={i === lastAssistant && !busy ? regenerate : undefined} />
        ))}

        {busy && (
          <div className="msg assistant">
            <span className="msg-avatar thinking">
              <ManuSpark size={18} />
            </span>
            <div className="msg-body">
              {steps.length > 0 && <Steps steps={steps} live />}
              {pending ? (
                <Rendered text={pending} streaming />
              ) : steps.length > 0 ? null : (
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
        {slashMatches.length > 0 && (
          <div className="chat-picker" role="menu">
            <p className="chat-picker-head">Skills</p>
            {slashMatches.map((s) => (
              <SkillItem key={s.id} skill={s} onPick={() => pickSkill(s)} />
            ))}
          </div>
        )}
        {picker && (
          <div className="chat-picker" role="menu">
            <p className="chat-picker-head">Skills</p>
            {SKILLS.map((s) => (
              <SkillItem key={s.id} skill={s} active={skill?.id === s.id} onPick={() => pickSkill(s)} />
            ))}
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
          {skill && (
            <div className="chat-context skill">
              <skill.icon size={13} strokeWidth={1.9} />
              <span className="truncate">{skill.name}</span>
              <button type="button" onClick={() => setSkill(undefined)} aria-label={`Stop using ${skill.name}`} title="Remove skill">
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          )}
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
            placeholder={skill?.placeholder ?? "Ask Manu AI, or type / for skills"}
            rows={1}
            aria-label="Message Manu AI"
          />
          <div className="chat-input-row">
            <button
              type="button"
              className={`chat-icon add ${picker ? 'on' : ''}`}
              onClick={() => setPicker((p) => !p)}
              data-tip="Skills and blocks"
              aria-label="Choose a skill or a block to ask about"
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

function Steps({ steps, live }: { steps: string[]; live?: boolean }) {
  return (
    <ul className={`chat-steps ${live ? 'live' : ''}`}>
      {steps.map((label, i) => (
        <li key={i} className={live && i === steps.length - 1 ? 'now' : ''}>
          {label}
        </li>
      ))}
    </ul>
  )
}

/** Preview of a change Manu AI wants to make. Nothing is written until the writer accepts. */
function ProposalCard({ proposal, onDecide }: { proposal: Proposal; onDecide: (accept: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const decide = async (accept: boolean) => {
    setBusy(true)
    setError('')
    try {
      await onDecide(accept)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const n = proposal.ops.length
  return (
    <div className={`proposal ${proposal.status}`}>
      <div className="proposal-head">
        <strong>{n === 1 ? 'Proposed change' : `${n} proposed changes`}</strong>
        {proposal.status === 'applied' && <span className="proposal-badge ok"><Check size={13} strokeWidth={2.25} /> Added to page</span>}
        {proposal.status === 'declined' && <span className="proposal-badge">Declined</span>}
      </div>
      {proposal.ops.map((op, i) => (
        <OpPreview key={i} op={op} open={n === 1} />
      ))}
      {error && <p className="proposal-error">Couldn’t apply it: {error}</p>}
      {proposal.status === 'pending' && (
        <div className="proposal-actions">
          <button className="btn" onClick={() => decide(false)} disabled={busy}>Decline</button>
          <button className="btn primary" onClick={() => decide(true)} disabled={busy}>{busy ? 'Applying…' : 'Accept'}</button>
        </div>
      )}
    </div>
  )
}

function OpPreview({ op, open }: { op: ChatOp; open: boolean }) {
  const text = useMemo(() => {
    if (op.kind === 'drama' && op.script !== undefined) {
      const script = normalizeScript(op.script)
      // A branch continues an existing script, so its preview leaves out the title page and cast.
      return toText(op.action === 'branch' ? { ...script, meta: { title: '', format: '', genre: '', logline: '', author: '' }, cast: [] } : script)
    }
    if (op.kind === 'resources' && op.items) return op.items.map((i) => `- **${i.title ?? ''}**${i.url ? ` ${i.url}` : ''}${i.note ? ` — ${i.note}` : ''}`).join('\n')
    return op.body ?? ''
  }, [op])
  const html = useMemo(() => (text ? renderMarkdown(text, op.kind === 'drama' ? 'drama' : op.kind === 'resources' ? 'text' : (op.kind as TextKind)) : ''), [text, op.kind])
  const Icon = op.action === 'create' ? FilePlus : op.action === 'branch' ? GitBranch : FilePen
  const label = KINDS[op.kind]?.label ?? op.kind
  return (
    <details className="proposal-op" open={open}>
      <summary>
        <Icon size={15} strokeWidth={1.75} />
        <span className="truncate">
          {op.action === 'branch' ? (
            <>New branch of <b>{op.title || 'Untitled'}</b>: <b>{op.name}</b></>
          ) : (
            <>{op.action === 'create' ? 'New' : 'Update'} {label} block: <b>{op.title || 'Untitled'}</b></>
          )}
        </span>
      </summary>
      {op.action === 'update' && !text && op.title !== undefined && <p className="proposal-note">Renames the block.</p>}
      {op.action === 'update' && text && <p className="proposal-note">Replaces the block’s current content.</p>}
      {op.action === 'branch' && <p className="proposal-note">A separate version from that point on. The block itself doesn’t change.</p>}
      {html && <div className="md md-chat proposal-body" dangerouslySetInnerHTML={{ __html: html }} />}
    </details>
  )
}

function SkillItem({ skill, active, onPick }: { skill: Skill; active?: boolean; onPick: () => void }) {
  const Icon = skill.icon
  return (
    <button type="button" role="menuitem" className={`skill-item ${active ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={onPick}>
      <Icon size={15} strokeWidth={1.75} />
      <span className="skill-text">
        <span className="truncate">{skill.name} <span className="skill-slash">/{skill.id}</span></span>
        <span className="skill-desc">{skill.description}</span>
      </span>
      {active && <Check size={15} />}
    </button>
  )
}

/** A question from Manu: pick an option or write your own. */
function QuestionCard({ question, onAnswer }: { question: ChatQuestion; onAnswer: (text: string) => void }) {
  const [other, setOther] = useState('')
  const [typing, setTyping] = useState(false)
  const done = question.answer !== undefined
  return (
    <div className={`question ${done ? 'done' : ''}`}>
      <p className="question-text">{question.question}</p>
      <div className="question-options">
        {question.options.map((o) => (
          <button key={o} className={`question-option ${question.answer === o ? 'on' : ''}`} disabled={done} onClick={() => onAnswer(o)}>
            {o}
          </button>
        ))}
        {question.allowOther && !typing && !done && (
          <button className="question-option other" onClick={() => setTyping(true)}>Other…</button>
        )}
      </div>
      {done && !question.options.includes(question.answer!) && <p className="question-answer">You answered: {question.answer}</p>}
      {typing && !done && (
        <form className="question-other" onSubmit={(e) => (e.preventDefault(), other.trim() && onAnswer(other.trim()))}>
          <input autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="Type your answer" aria-label="Your answer" />
          <button className="btn primary" disabled={!other.trim()}>Send</button>
        </form>
      )}
    </div>
  )
}

function Message({ message, onDecide, onAnswer, onRegenerate }: { message: ChatMessage; onDecide: (accept: boolean) => Promise<void>; onAnswer: (text: string) => void; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false)
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
        {skillById(message.skill) && <span className="msg-skill">{skillById(message.skill)!.name}</span>}
        <div className="msg-text">{message.content}</div>
        <div className="msg-actions">{copyButton}</div>
      </div>
    )

  return (
    <div className="msg assistant">
      <span className="msg-avatar">
        <ManuSpark size={18} />
      </span>
      <div className="msg-body">
        {message.steps && <Steps steps={message.steps} />}
        {message.content && <Rendered text={message.content} />}
        {message.question && <QuestionCard question={message.question} onAnswer={onAnswer} />}
        {message.proposal && <ProposalCard proposal={message.proposal} onDecide={onDecide} />}
        <div className="msg-actions">
          {message.content && copyButton}
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
