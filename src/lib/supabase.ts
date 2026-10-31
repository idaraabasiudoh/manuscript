import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

export const BUCKET = 'project-files'
export const MAX_UPLOAD = 50 * 1024 * 1024

export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_KEY || 'missing', {
  auth: { persistSession: false },
})

// ---- Types --------------------------------------------------------------------

export type LiteratureKind = 'poetry' | 'drama' | 'prose'
export type TextKind = 'text' | LiteratureKind
export type BlockKind = TextKind | 'file' | 'link' | 'resources'

export type FileData = { path: string; name: string; mime: string; size: number }
export type LinkData = { url: string; title?: string; description?: string; image?: string; site?: string }
export type ResourceItem = { id: string; title: string; url: string; note: string }
export type ResourcesData = { items: ResourceItem[] }
export type TextData = { template?: string }

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

export type Project = {
  id: string
  title: string
  created: string
  updated: string
  blocks: Block[]
}

export type BlockPatch = Partial<Pick<Block, 'title' | 'body' | 'data' | 'position'>>

export const isTextKind = (k: BlockKind): k is TextKind => k === 'text' || k === 'poetry' || k === 'drama' || k === 'prose'

// ---- RPCs ---------------------------------------------------------------------

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const openProject = (id: string) => rpc<Project & { isNew: boolean }>('open_project', { p_id: id })
export const getProject = (id: string) => rpc<Project | null>('get_project', { p_id: id })
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

// ---- Edge functions -----------------------------------------------------------

async function invoke<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `${name} failed (${res.status})`)
  return data as T
}

/** File blocks own a Storage object, so they're removed server-side; others go through the RPC. */
export async function deleteBlock(block: Block) {
  if (block.kind === 'file') await invoke('delete', { block: block.id })
  else await rpc<void>('delete_block', { p_id: block.id })
}

export const deleteProject = (id: string) => invoke<{ files: number }>('delete', { project: id })

export const unfurl = (url: string) => invoke<LinkData>('unfurl', { url })

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

/** Streams the assistant's reply; `onText` receives the accumulated text so far. */
export async function chat(
  project: string,
  messages: ChatMessage[],
  focus: string | undefined,
  onText: (text: string) => void,
  signal?: AbortSignal,
) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, messages, focus }),
    signal,
  })
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Assistant unavailable (${res.status})`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    onText(text)
  }
  return text
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
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}
export const ACCEPT_ATTR = '.pdf,.mp4,.m4v,.mp3,.png,.jpg,.jpeg,.gif,.webp,application/pdf,video/mp4,audio/mpeg,image/*'

export function mimeFor(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const fromExt = ACCEPTED[ext]
  if (fromExt) return fromExt
  if (file.type === 'audio/mp3') return 'audio/mpeg'
  return Object.values(ACCEPTED).includes(file.type) ? file.type : null
}

/** Uploads with XHR so we get progress events (supabase-js doesn't expose them). */
export function uploadFile(project: string, file: File, onProgress: (fraction: number) => void): Promise<FileData> {
  const mime = mimeFor(file)
  if (!mime) return Promise.reject(new Error('Only PDF, MP4, MP3 and images are supported'))
  if (file.size > MAX_UPLOAD) return Promise.reject(new Error('Files must be 50 MB or smaller'))

  const safe = file.name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80) || 'file'
  const path = `${project}/${crypto.randomUUID()}-${safe}`

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`)
    xhr.setRequestHeader('apikey', SUPABASE_KEY)
    xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`)
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
