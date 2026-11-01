// Shared by the link-preview endpoints: a project's title and stats (never its contents).
// Files starting with _ in /api are helpers, not endpoints.

export type Card = { id: string; title: string; updated: string; blocks: number; words: number }

export const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export async function loadCard(id: string): Promise<Card | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(id)) return null
  const base = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) return null
  const res = await fetch(`${base}/rest/v1/rpc/project_card`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id }),
  })
  return res.ok ? ((await res.json()) as Card | null) : null
}
