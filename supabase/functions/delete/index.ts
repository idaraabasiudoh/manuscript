// Deletes a whole project or a single block, removing any Storage files they own.
// Runs with the service role because anon has no delete rights on the bucket.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const BUCKET = 'project-files'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Every object under `<project>/`, paginated. */
async function listProjectFiles(project: string) {
  const paths: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(BUCKET).list(project, { limit: 1000, offset })
    if (error) throw error
    paths.push(...data.filter((o) => o.id).map((o) => `${project}/${o.name}`))
    if (data.length < 1000) return paths
  }
}

async function removeFiles(paths: string[]) {
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 1000))
    if (error) throw error
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { project, block } = await req.json()

    if (typeof project === 'string' && /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(project)) {
      const paths = await listProjectFiles(project)
      await removeFiles(paths)
      const { error } = await admin.from('projects').delete().eq('id', project)
      if (error) throw error
      return json({ deleted: 'project', files: paths.length })
    }

    if (typeof block === 'string') {
      const { data: row, error } = await admin.from('blocks').select('id, project_id, data').eq('id', block).maybeSingle()
      if (error) throw error
      if (!row) return json({ deleted: 'block', files: 0 })
      const path = row.data?.path
      const paths = typeof path === 'string' && path.startsWith(`${row.project_id}/`) ? [path] : []
      await removeFiles(paths)
      const { error: delError } = await admin.from('blocks').delete().eq('id', block)
      if (delError) throw delError
      await admin.from('projects').update({ updated: new Date().toISOString() }).eq('id', row.project_id)
      return json({ deleted: 'block', files: paths.length })
    }

    return json({ error: 'Pass { project } or { block }' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
