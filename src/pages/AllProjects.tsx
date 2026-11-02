import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { AuthCard } from '../components/AuthCard'
import { Logo, ThemeToggle } from '../components/Icons'
import { ProjectRows, useMyProjects } from '../components/ProjectList'
import { useAuth } from '../lib/auth'
import type { ProjectSummary } from '../lib/supabase'

const FILTERS: { id: 'all' | ProjectSummary['source']; label: string; empty: string }[] = [
  { id: 'all', label: 'All', empty: 'No projects yet. Name one on the home page to create it.' },
  { id: 'owned', label: 'Yours', empty: 'You haven’t created any projects yet.' },
  { id: 'shared', label: 'Shared with you', empty: 'Nobody has added you to a project yet.' },
  { id: 'opened', label: 'Opened', empty: 'Projects you open with someone’s link show up here.' },
]

/** Every project the user can open: their own, ones shared with them, and ones they opened with a link. */
export function AllProjectsPage() {
  const { ready, session } = useAuth()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    document.title = 'All projects — Manuscript'
  }, [])

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
        <h1 className="settings-title">All projects</h1>
        {!ready ? null : !session ? (
          <AuthCard subtitle="Sign in to see your projects." />
        ) : (
          <Projects filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} />
        )}
      </main>
    </div>
  )
}

function Projects({ filter, setFilter, query, setQuery }: { filter: (typeof FILTERS)[number]['id']; setFilter: (f: (typeof FILTERS)[number]['id']) => void; query: string; setQuery: (q: string) => void }) {
  const { projects, error } = useMyProjects()
  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      projects?.filter(
        (p) => (filter === 'all' || p.source === filter) && (!q || p.id.includes(q) || p.title.toLowerCase().includes(q) || p.ownerName?.toLowerCase().includes(q)),
      ) ?? null,
    [projects, filter, q],
  )
  const count = (id: (typeof FILTERS)[number]['id']) => projects?.filter((p) => id === 'all' || p.source === id).length
  const current = FILTERS.find((f) => f.id === filter)!

  if (error) return <p className="hint error">Couldn’t load your projects: {error}</p>
  return (
    <>
      <div className="all-projects-bar">
        <div className="segmented all-projects-filter" role="tablist" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
              {projects && <span className="all-projects-count">{count(f.id)}</span>}
            </button>
          ))}
        </div>
        <label className="all-projects-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or owner" aria-label="Search projects" spellCheck={false} />
        </label>
      </div>
      <ProjectRows projects={shown} empty={q ? 'No projects match that search.' : current.empty} />
    </>
  )
}
