import { useEffect, useState, type FormEvent } from 'react'
import { Check, Globe, Link2, Lock, Users, X } from 'lucide-react'
import { getSharing, removeMember, setMemberRole, setProjectAccess, shareProject, type Access, type Member, type Sharing } from '../lib/supabase'

const ACCESS: { value: Access; label: string; hint: string; icon: typeof Lock }[] = [
  { value: 'restricted', label: 'Only people added', hint: 'Only you and the people above can open the link', icon: Lock },
  { value: 'view', label: 'Anyone with the link can view', hint: 'Anyone with the link can read it; only people above can edit', icon: Users },
  { value: 'edit', label: 'Anyone with the link can edit', hint: 'Anyone with the link can read and change it', icon: Globe },
]

/**
 * Owner's sharing settings: general access for the link, plus people (existing accounts, by username or
 * email) with their own role. "Copy link" does what the Share button used to do.
 */
export function ShareDialog({
  project,
  title,
  url,
  onClose,
  onChanged,
  onCopy,
}: {
  project: string
  title: string
  url: string
  onClose: () => void
  /** Called after any change so other open tabs refresh their access. */
  onChanged: (access: Access) => void
  onCopy: () => void
}) {
  const [sharing, setSharing] = useState<Sharing | null>(null)
  const [who, setWho] = useState('')
  const [role, setRole] = useState<Member['role']>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getSharing(project)
      .then(setSharing)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [project])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const changeAccess = (access: Access) =>
    run(async () => {
      await setProjectAccess(project, access)
      setSharing((s) => s && { ...s, access })
      onChanged(access)
    })

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!who.trim()) return
    run(async () => {
      const m = await shareProject(project, who, role)
      setSharing((s) => s && { ...s, members: [...s.members.filter((x) => x.userId !== m.userId), m] })
      setWho('')
      onChanged(sharing?.access ?? 'restricted')
    })
  }

  const changeRole = (m: Member, next: Member['role'] | 'remove') =>
    run(async () => {
      if (next === 'remove') {
        await removeMember(project, m.userId)
        setSharing((s) => s && { ...s, members: s.members.filter((x) => x.userId !== m.userId) })
      } else {
        await setMemberRole(project, m.userId, next)
        setSharing((s) => s && { ...s, members: s.members.map((x) => (x.userId === m.userId ? { ...x, role: next } : x)) })
      }
      onChanged(sharing?.access ?? 'restricted')
    })

  const copy = () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const current = ACCESS.find((a) => a.value === sharing?.access) ?? ACCESS[0]

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog share-dialog" role="dialog" aria-label={`Share ${title}`}>
        <header className="dialog-head">
          <div>
            <p className="mono-label">Share</p>
            <h2 className="truncate">{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <form className="share-add" onSubmit={add}>
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Add people by username or email" aria-label="Username or email" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <select value={role} onChange={(e) => setRole(e.target.value as Member['role'])} aria-label="Role">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn primary" disabled={busy || !who.trim()}>
            Add
          </button>
        </form>
        {error && <p className="hint error">{error}</p>}

        <section className="share-section">
          <h3>People with access</h3>
          {!sharing ? (
            <span className="skeleton tall" />
          ) : (
            <ul className="share-people">
              <li>
                <span className="share-avatar">{(sharing.owner.username ?? sharing.owner.email)[0]}</span>
                <span className="share-who">
                  <strong>{sharing.owner.username ? `@${sharing.owner.username}` : sharing.owner.email}</strong>
                  <span>{sharing.owner.email}</span>
                </span>
                <span className="share-role-static">Owner</span>
              </li>
              {sharing.members.map((m) => (
                <li key={m.userId}>
                  <span className="share-avatar">{(m.username ?? m.email)[0]}</span>
                  <span className="share-who">
                    <strong>{m.username ? `@${m.username}` : m.email}</strong>
                    <span>{m.email}</span>
                  </span>
                  <select value={m.role} onChange={(e) => changeRole(m, e.target.value as Member['role'] | 'remove')} disabled={busy} aria-label={`Role for ${m.username ?? m.email}`}>
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                    <option value="remove">Remove</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="share-section">
          <h3>General access</h3>
          <div className="share-general">
            <span className="share-general-icon">
              <current.icon size={18} />
            </span>
            <div className="share-general-main">
              <select value={sharing?.access ?? 'restricted'} onChange={(e) => changeAccess(e.target.value as Access)} disabled={!sharing || busy} aria-label="General access">
                {ACCESS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <span className="hint">{current.hint}</span>
            </div>
          </div>
        </section>

        <footer className="dialog-foot share-foot">
          <button type="button" className="btn" onClick={copy}>
            {copied ? <Check size={16} /> : <Link2 size={16} />} {copied ? 'Link copied' : 'Copy link'}
          </button>
          <span className="share-url truncate" title={url}>
            {url.replace(/^https?:\/\//, '')}
          </span>
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
