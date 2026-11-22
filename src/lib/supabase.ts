import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

export const BUCKET = 'project-files'
export const MAX_UPLOAD = 50 * 1024 * 1024

export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_KEY || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'manuscript-auth', detectSessionInUrl: false },
})

/** Bearer token for our own fetches: the signed-in user's access token, or the public key for visitors. */
async function bearer() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? SUPABASE_KEY
}

// ---- Types --------------------------------------------------------------------

export type LiteratureKind = 'poetry' | 'drama' | 'prose'
export type TextKind = 'text' | LiteratureKind
export type BlockKind = TextKind | 'file' | 'link' | 'resources'

export type FileData = { path: string; name: string; mime: string; size: number; duration?: number; peaks?: number[]; voice?: boolean }
/** Length and waveform of a voice note placed inline in text, keyed by its Storage path. */
export type VoiceMeta = { duration?: number; peaks?: number[] }
export type LinkData = { url: string; title?: string; description?: string; image?: string; site?: string }
export type ResourceItem = { id: string; title: string; url: string; note: string }
export type ResourcesData = { items: ResourceItem[] }
export type TextData = { template?: string; voices?: Record<string, VoiceMeta> }

export type Block = {
  id: string
  kind: BlockKind
  title: string
  body: string
  data: Partial<FileData & LinkData & ResourcesData & TextData> & { script?: unknown; originalText?: string }
  position: number
  created: string
  updated: string
}

export type Role = 'owner' | 'editor' | 'viewer'
export type Access = 'restricted' | 'view' | 'edit'

export type Project = {
  id: string
  title: string
  created: string
  updated: string
  access: Access
  ownerName: string | null
  /** False for projects made before accounts existed (open to everyone until claimed). */
  claimed: boolean
  role: Role
  blocks: Block[]
}

/** What opening a project URL can lead to. */
export type OpenResult =
  | ({ status: 'ok'; isNew: boolean } & Project)
  | { status: 'denied'; signedIn: boolean }
  | { status: 'sign-in-to-create' }
  | { status: 'reserved' }

export type Profile = { id: string; username: string | null; email: string }

export type ProjectSummary = {
  id: string
  title: string
  updated: string
  access: Access
  role: Role
  /** owned, shared with you by name or email, or opened through a link */
  source: 'owned' | 'shared' | 'opened'
  ownerName: string | null
  opened: string | null
  blocks: number
}

export type Member = { userId: string; username: string | null; email: string; role: Exclude<Role, 'owner'> }
export type Sharing = { access: Access; owner: { username: string | null; email: string }; members: Member[] }

export type BlockPatch = Partial<Pick<Block, 'title' | 'body' | 'data' | 'position'>>

export const isTextKind = (k: BlockKind): k is TextKind => k === 'text' || k === 'poetry' || k === 'drama' || k === 'prose'

// ---- RPCs ---------------------------------------------------------------------

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const openProject = (id: string) => rpc<OpenResult>('open_project', { p_id: id })
export const getProject = (id: string) =>
  rpc<({ status: 'ok' } & Project) | { status: 'denied'; signedIn: boolean } | null>('get_project', { p_id: id })
export const renameProject = (id: string, title: string) => rpc<void>('rename_project', { p_id: id, p_title: title })

export const addBlock = (project: string, b: Pick<Block, 'kind' | 'title' | 'body' | 'data' | 'position'>) =>
  rpc<Block>('add_block', {
    p_project: project,
    p_kind: b.kind,
    p_title: b.title,
    p_body: b.body,
    p_data: b.data,
    p_position: b.position,
  })

export const updateBlock = (id: string, patch: BlockPatch) => rpc<Block>('update_block', { p_id: id, p_patch: patch })

// ---- Accounts & sharing --------------------------------------------------------

export const getMyProfile = () => rpc<Profile | null>('get_my_profile', {})
export const setUsername = (username: string) => rpc<Profile>('set_username', { p_username: username })
export const listMyProjects = () => rpc<ProjectSummary[]>('list_my_projects', {})

export const getSharing = (id: string) => rpc<Sharing>('get_sharing', { p_id: id })
export const setProjectAccess = (id: string, access: Access) => rpc<void>('set_project_access', { p_id: id, p_access: access })
export const shareProject = (id: string, identifier: string, role: Member['role']) =>
  rpc<Member>('share_project', { p_id: id, p_identifier: identifier, p_role: role })
export const setMemberRole = (id: string, userId: string, role: Member['role']) =>
  rpc<void>('set_member_role', { p_id: id, p_user: userId, p_role: role })
export const removeMember = (id: string, userId: string) => rpc<void>('remove_member', { p_id: id, p_user: userId })

/** Email + password sign-up: the account is created ready to use, then we sign in. */
export async function signUp(email: string, password: string) {
  await invoke('signup', { email, password })
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(/invalid/i.test(error.message) ? 'Wrong email or password' : error.message)
}

export const signOut = () => supabase.auth.signOut()

// ---- Edge functions -----------------------------------------------------------

async function invoke<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${await bearer()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `${name} failed (${res.status})`)
  return data as T
}

/** File blocks and text with inline voice notes own Storage objects, so they're removed server-side; others go through the RPC. */
export async function deleteBlock(block: Block) {
  if (block.kind === 'file' || Object.keys(block.data.voices ?? {}).length) await invoke('delete', { block: block.id })
  else await rpc<void>('delete_block', { p_id: block.id })
}

export const deleteProject = (id: string) => invoke<{ files: number }>('delete', { project: id })

export const unfurl = (url: string) => invoke<LinkData>('unfurl', { url })

/** One change Manu AI proposes. Applied by the browser only after the writer accepts it. */
export type ChatOp = {
  action: 'create' | 'update'
  kind: BlockKind
  block_id?: string
  after?: string
  title?: string
  body?: string
  script?: unknown
  items?: { title?: string; url?: string; note?: string }[]
}
export type Proposal = { ops: ChatOp[]; status: 'pending' | 'applied' | 'declined'; error?: string }

export type ChatQuestion = { question: string; options: string[]; allowOther: boolean; answer?: string }

export type ChatMessage = { role: 'user' | 'assistant'; content: string; proposal?: Proposal; question?: ChatQuestion; steps?: string[]; skill?: string }

export type ChatProgress = { text: string; steps: string[] }

/** What the model is told about a past message: its text plus what became of any proposed change. */
function forModel(m: ChatMessage) {
  if (m.question) return `${m.content}\n\n[Asked the writer: ${m.question.question} Options: ${m.question.options.join(' / ')}]`.trim()
  if (!m.proposal) return m.content
  const what = m.proposal.ops.map((o) => `${o.action} ${o.kind} “${o.title ?? ''}”`).join('; ')
  const outcome = { applied: 'The writer accepted and it was applied', declined: 'The writer declined it', pending: 'The writer hasn’t answered yet' }[m.proposal.status]
  return `${m.content}\n\n[Proposed change: ${what}. ${outcome}.]`.trim()
}

/** Runs one agent turn. `onProgress` receives the reply so far and the tool steps taken. */
export async function chat(
  project: string,
  messages: ChatMessage[],
  focus: string | undefined,
  onProgress: (p: ChatProgress) => void,
  signal?: AbortSignal,
  skill?: string,
): Promise<{ text: string; steps: string[]; ops?: ChatOp[]; question?: ChatQuestion; error?: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${await bearer()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, messages: messages.map((m) => ({ role: m.role, content: forModel(m) })), focus, skill }),
    signal,
  })
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Assistant unavailable (${res.status})`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let buffer = ''
  let ops: ChatOp[] | undefined
  let error: string | undefined
  let question: ChatQuestion | undefined
  const steps: string[] = []
  const handle = (line: string) => {
    if (!line.trim()) return
    let e
    try {
      e = JSON.parse(line)
    } catch {
      return
    }
    if (e.type === 'text') text += e.text
    else if (e.type === 'step') steps.push(e.label)
    else if (e.type === 'proposal') ops = e.ops
    else if (e.type === 'question') question = { question: e.question, options: e.options, allowOther: e.allowOther !== false }
    else if (e.type === 'error') error = e.message
    onProgress({ text, steps: [...steps] })
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(handle)
  }
  handle(buffer)
  return { text, steps, ops, question, error }
}

// ---- Storage ------------------------------------------------------------------

export function publicUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`
}

export function downloadUrl(path: string, name: string) {
  return `${publicUrl(path)}?download=${encodeURIComponent(name)}`
}

const ACCEPTED: Record<string, string> = {
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  webm: 'audio/webm',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}
export const ACCEPT_ATTR = '.pdf,.mp4,.m4v,.mp3,.m4a,.wav,.ogg,.oga,.webm,.png,.jpg,.jpeg,.gif,.webp,application/pdf,video/mp4,audio/*,image/*'

export function mimeFor(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  // WebM can hold video too; only audio WebM (voice notes) is accepted.
  if (ext === 'webm' && file.type.startsWith('video/')) return null
  const fromExt = ACCEPTED[ext]
  if (fromExt) return fromExt
  const type = file.type.split(';')[0]
  if (type === 'audio/mp3') return 'audio/mpeg'
  if (type === 'audio/x-m4a') return 'audio/mp4'
  if (type === 'audio/x-wav' || type === 'audio/wave') return 'audio/wav'
  return Object.values(ACCEPTED).includes(type) ? type : null
}

/** Uploads with XHR so we get progress events (supabase-js doesn't expose them). */
export async function uploadFile(project: string, file: File, onProgress: (fraction: number) => void): Promise<FileData> {
  const token = await bearer()
  return uploadWithToken(project, file, token, onProgress)
}

function uploadWithToken(project: string, file: File, token: string, onProgress: (fraction: number) => void): Promise<FileData> {
  const mime = mimeFor(file)
  if (!mime) return Promise.reject(new Error('Only PDF, MP4 video, audio (MP3, M4A, WAV, OGG, WebM) and images are supported'))
  if (file.size > MAX_UPLOAD) return Promise.reject(new Error('Files must be 50 MB or smaller'))

  const safe = file.name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80) || 'file'
  const path = `${project}/${crypto.randomUUID()}-${safe}`

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`)
    xhr.setRequestHeader('apikey', SUPABASE_KEY)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', mime)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ path, name: file.name, mime, size: file.size })
      else {
        let msg = `Upload failed (${xhr.status})`
        try {
          msg = JSON.parse(xhr.responseText).message ?? msg
        } catch {
          /* not JSON */
        }
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(file)
  })
}

// ---- Comments -----------------------------------------------------------------

export type Comment = {
  id: string
  blockId: string
  /** The passage the comment is about; empty for a comment on the whole block. */
  quote: string
  line: number | null
  body: string
  resolved: boolean
  created: string
  mine: boolean
  authorName: string
}

export const listComments = (project: string) => rpc<Comment[]>('list_comments', { p_id: project })
export const addComment = (block: string, body: string, quote = '', line: number | null = null) =>
  rpc<Comment>('add_comment', { p_block: block, p_body: body, p_quote: quote, p_line: line })
export const resolveComment = (id: string, resolved: boolean) => rpc<void>('resolve_comment', { p_id: id, p_resolved: resolved })
export const removeComment = (id: string) => rpc<void>('delete_comment', { p_id: id })
