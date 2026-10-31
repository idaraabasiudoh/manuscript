import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, KindIcon, Logo } from '../components/Icons'
import { getRecent, NAME_RE, pad, toName } from '../lib/util'

export function HomePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const recent = getRecent()
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
      <header className="home-top">
        <Logo />
        <span className="mono-label">Shared notebooks for film ideas</span>
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

        <form onSubmit={open} className="home-form">
          <label className={`address ${touched && !valid ? 'invalid' : ''}`}>
            <span className="address-host">{location.host}/</span>
            <input
              value={name}
              onChange={(e) => setName(toName(e.target.value))}
              onBlur={() => name && setTouched(true)}
              placeholder="my-short-film"
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Project name"
            />
            <button className="btn primary lg" disabled={!name}>
              Open <ArrowRight width={16} height={16} />
            </button>
          </label>
          <p className={`hint ${touched && !valid ? 'error' : ''}`}>
            {touched && !valid ? '✕ ' : ''}3–48 characters: a–z, 0–9 and dashes
          </p>
        </form>

        {recent.length > 0 && (
          <section className="recent">
            <h2 className="mono-label">Recently opened</h2>
            <ol>
              {recent.map((p, i) => (
                <li key={p}>
                  <Link to={`/${p}`} className="recent-row">
                    <span className="recent-no">{pad(i + 1)}</span>
                    <span className="recent-name">{p}</span>
                    <span className="recent-leader" />
                    <ArrowRight width={14} height={14} />
                  </Link>
                </li>
              ))}
            </ol>
          </section>
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
