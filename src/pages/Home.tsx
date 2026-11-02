import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthCard } from '../components/AuthCard'
import { ArrowRight, KindIcon, Logo, ThemeToggle } from '../components/Icons'
import { ProjectList } from '../components/ProjectList'
import { useAuth } from '../lib/auth'
import { NAME_RE, toName } from '../lib/util'

export function HomePage() {
  const navigate = useNavigate()
  const { ready, session, profile } = useAuth()
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const valid = NAME_RE.test(name)

  useEffect(() => {
    document.title = 'Manuscript'
  }, [])

  function open(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (valid) navigate(`/${name}`)
  }

  return (
    <div className="home">
      <div className="mobile-footer" aria-hidden />
      <header className="home-top">
        <Logo />
        <div className="home-top-end">
          {session && profile?.username ? (
            <Link to="/settings" className="account-chip" title="Settings">
              <span className="account-avatar">{profile.username[0]}</span>
              <span className="account-name">@{profile.username}</span>
            </Link>
          ) : (
            <span className="mono-label">Shared notebooks for film ideas</span>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="home-main">
        <h1 className="display">
          Every idea,
          <br />
          <span className="ai-text">in one script.</span>
        </h1>
        <p className="lede">
          Write scenes, poems and stories, drop in references and rough cuts. Share projects with people to collab across
          the web.
        </p>

        {!ready ? null : session ? (
          <>
            <form onSubmit={open} className="home-form">
              <label className={`address ${touched && !valid ? 'invalid' : ''}`}>
                <span className="address-host">{location.host}/</span>
                <input
                  value={name}
                  onChange={(e) => setName(toName(e.target.value))}
                  onBlur={() => name && setTouched(true)}
                  placeholder="new-project-name"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Project name"
                />
                <button className="btn primary lg" disabled={!name}>
                  Create <ArrowRight width={16} height={16} />
                </button>
              </label>
              <p className={`hint ${touched && !valid ? 'error' : ''}`}>
                {touched && !valid ? '✕ ' : ''}Name a project to create it (or open one you have access to): 3–48 characters, a–z, 0–9 and dashes
              </p>
            </form>

            <section className="recent">
              <div className="recent-head">
                <h2 className="mono-label">Projects</h2>
                <Link to="/projects" className="chip ghost recent-all">
                  All projects <ArrowRight width={14} height={14} />
                </Link>
              </div>
              <ProjectList limit={6} />
            </section>
          </>
        ) : (
          <AuthCard />
        )}
      </main>

      <footer className="home-foot mono-label">
        <span><KindIcon kind="poetry" width={12} height={12} /> Poetry</span>
        <span><KindIcon kind="drama" width={12} height={12} /> Drama</span>
        <span><KindIcon kind="prose" width={12} height={12} /> Prose</span>
        <span>PDF · MP4 · MP3 · links</span>
      </footer>
    </div>
  )
}
