import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut } from 'lucide-react'
import { AuthCard } from '../components/AuthCard'
import { ArrowRight, Logo, ThemeToggle } from '../components/Icons'
import { ProjectList } from '../components/ProjectList'
import { useAuth } from '../lib/auth'
import { setUsername, signOut } from '../lib/supabase'

export function SettingsPage() {
  const navigate = useNavigate()
  const { ready, session, profile, refreshProfile } = useAuth()
  const [name, setName] = useState(profile?.username ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    document.title = 'Settings — Manuscript'
  }, [])
  useEffect(() => setName(profile?.username ?? ''), [profile?.username])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await setUsername(name)
      await refreshProfile()
      setMessage({ ok: true, text: 'Username updated' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings">
      <header className="settings-top">
        <Link to="/" className="btn return-btn" title="Back home">
          <ArrowLeft size={17} strokeWidth={2} /> <span className="hide-sm">Home</span>
        </Link>
        <Logo />
        <ThemeToggle />
      </header>

      <main className="settings-main">
        <h1 className="settings-title">Settings</h1>

        {!ready ? null : !session ? (
          <AuthCard subtitle="Sign in to see your projects and settings." />
        ) : (
          <>
            <section className="settings-card">
              <h2>Account</h2>
              <form className="settings-row" onSubmit={save}>
                <label className="field">
                  <span className="field-label">Username</span>
                  <div className="username-input">
                    <span>@</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={24}
                      aria-label="Username"
                    />
                  </div>
                </label>
                <button className="btn primary" disabled={busy || !name || name === profile?.username}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </form>
              <p className={`hint ${message && !message.ok ? 'error' : ''}`}>{message?.text ?? 'People use this (or your email) to share projects with you.'}</p>
              <dl className="settings-facts">
                <dt>Email</dt>
                <dd>{profile?.email ?? session.user.email}</dd>
              </dl>
              <button className="btn settings-signout" onClick={async () => (await signOut(), navigate('/'))}>
                <LogOut size={16} /> Sign out
              </button>
            </section>

            <section className="settings-card">
              <div className="recent-head">
                <h2>Recent projects</h2>
                <Link to="/projects" className="chip recent-all">
                  All projects <ArrowRight width={14} height={14} />
                </Link>
              </div>
              <ProjectList limit={6} empty="You don’t have any projects yet." />
            </section>
          </>
        )}
      </main>
    </div>
  )
}
