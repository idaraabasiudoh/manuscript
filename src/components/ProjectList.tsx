import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Globe, Lock, PenLine, Users } from 'lucide-react'
import { listMyProjects, type ProjectSummary } from '../lib/supabase'
import { timeAgo } from '../lib/util'
import { ArrowRight } from './Icons'

/** Every project the signed-in user owns, was added to or opened with a link, most recently opened first. */
export function useMyProjects() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    listMyProjects()
      .then(setProjects)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  return { projects, error }
}

/** The signed-in user's projects, optionally just the most recent few. */
export function ProjectList({ empty, limit }: { empty?: string; limit?: number }) {
  const { projects, error } = useMyProjects()
  if (error) return <p className="hint error">Couldn’t load your projects: {error}</p>
  return <ProjectRows projects={projects && (limit ? projects.slice(0, limit) : projects)} empty={empty} />
}

export function ProjectRows({ projects, empty }: { projects: ProjectSummary[] | null; empty?: string }) {
  if (!projects)
    return (
      <div className="project-list">
        {[0, 1, 2].map((i) => (
          <span key={i} className="skeleton tall" />
        ))}
      </div>
    )
  if (!projects.length) return <p className="project-empty">{empty ?? 'No projects yet. Name one above to create it.'}</p>

  return (
    <ol className="project-list">
      {projects.map((p) => (
        <li key={p.id}>
          <Link to={`/${p.id}`} className="project-row">
            <span className="project-main">
              <span className="project-title truncate">{p.title || p.id}</span>
              <span className="project-meta truncate">
                /{p.id} · {p.opened ? `opened ${timeAgo(p.opened)}` : `updated ${timeAgo(p.updated)}`}
                {p.source !== 'owned' && p.ownerName ? ` · by @${p.ownerName}` : ''}
              </span>
            </span>
            <span className={`project-badge ${p.role}`} title={roleHint(p)}>
              {p.role === 'owner' ? accessIcon(p) : p.role === 'editor' ? <PenLine size={13} /> : <Eye size={13} />}
              <span>{p.role === 'owner' ? accessLabel(p) : p.role === 'editor' ? 'Can edit' : 'Can view'}</span>
            </span>
            <ArrowRight width={15} height={15} />
          </Link>
        </li>
      ))}
    </ol>
  )
}

const accessLabel = (p: ProjectSummary) => (p.access === 'restricted' ? 'Private' : p.access === 'view' ? 'Link: view' : 'Link: edit')
const accessIcon = (p: ProjectSummary) => (p.access === 'restricted' ? <Lock size={13} /> : p.access === 'view' ? <Users size={13} /> : <Globe size={13} />)
const roleHint = (p: ProjectSummary) =>
  p.role === 'owner'
    ? p.access === 'restricted'
      ? 'Only you and people you add'
      : p.access === 'view'
        ? 'Anyone with the link can view'
        : 'Anyone with the link can edit'
    : p.source === 'shared'
      ? `Shared with you by @${p.ownerName ?? 'someone'}`
      : `Opened with a link to @${p.ownerName ?? 'someone'}’s project`
