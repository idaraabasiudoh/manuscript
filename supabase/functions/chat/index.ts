// AI writing assistant for a project. Loads the project's blocks as context, calls the
// Gemini API with streaming, and re-streams plain text deltas to the browser.
//
// Secrets: GEMINI_API_KEY (required), GEMINI_MODEL (optional, default gemini-3.5-flash).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

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

type Msg = { role: 'user' | 'assistant'; content: string }
type Block = { id: string; kind: string; title: string; body: string; data: Record<string, unknown> }

const KIND_LABEL: Record<string, string> = {
  text: 'Notes', poetry: 'Poetry', drama: 'Drama (play / screenplay)', prose: 'Prose',
  file: 'File', link: 'Link', resources: 'Resources',
}
const CONTEXT_LIMIT = 60_000

function describe(block: Block, focused: boolean) {
  const head = `### [${KIND_LABEL[block.kind] ?? block.kind}] ${block.title || 'Untitled'}${focused ? '  ← the writer is working on this block' : ''}`
  const d = block.data ?? {}
  if (block.kind === 'file') return `${head}\nAttached file: ${d.name} (${d.mime})`
  if (block.kind === 'link') return `${head}\nLink: ${d.url}${d.title ? ` — ${d.title}` : ''}${d.description ? `\n${d.description}` : ''}`
  if (block.kind === 'resources') {
    const items = Array.isArray(d.items) ? d.items : []
    return `${head}\n${items.map((i: Record<string, string>) => `- ${i.title || i.url}${i.url ? ` <${i.url}>` : ''}${i.note ? `: ${i.note}` : ''}`).join('\n')}`
  }
  return `${head}\n${block.body}`
}

function systemPrompt(title: string, blocks: Block[], focus?: string) {
  let context = blocks.map((b) => describe(b, b.id === focus)).join('\n\n')
  if (context.length > CONTEXT_LIMIT) context = context.slice(0, CONTEXT_LIMIT) + '\n\n[…project truncated…]'
  return `You are Manu AI, a warm, sharp writing partner inside "Manuscript", a shared notebook where people develop ideas for videos and short films as poetry, drama (stage plays and screenplays) and prose.

Help with brainstorming, loglines, structure, characters, dialogue, imagery, formatting and feedback. Be concrete and brief by default; offer to go deeper. When you write content the user might paste into a block, use the formatting the editor understands:
- "# " title, "## " heading, "### " subheading; **bold**, *italic*, ++underline++, ~~strikethrough~~
- "> " quote, "- " bullets, "1. " numbered list, "---" divider, "* * *" scene break, "->centered text<-"
- Screenplay: scene headings start with INT. or EXT.; a character cue is a line starting with "@" (e.g. "@MAYA"), followed by their dialogue on the next lines; "(beat)" on its own line is a parenthetical; transitions are uppercase lines ending in "TO:" (e.g. "CUT TO:").

The writers are not technical, so never mention markdown by name — just call it formatting.

Project: ${title || 'Untitled project'}
${context ? `\n--- PROJECT CONTENT ---\n${context}\n--- END ---` : '\n(The project is empty so far.)'}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return json({ error: 'The AI assistant is not configured yet (missing GEMINI_API_KEY).' }, 503)

  try {
    const { project, messages, focus } = (await req.json()) as { project: string; messages: Msg[]; focus?: string }
    if (typeof project !== 'string' || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'Pass { project, messages }' }, 400)
    }
    const history = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
    while (history.length && history[0].role !== 'user') history.shift()
    if (!history.length) return json({ error: 'No user message' }, 400)

    const [{ data: proj }, { data: blocks }] = await Promise.all([
      admin.from('projects').select('title').eq('id', project).maybeSingle(),
      admin.from('blocks').select('id, kind, title, body, data').eq('project_id', project).order('position'),
    ])
    if (!proj) return json({ error: 'Project not found' }, 404)

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash'
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt(proj.title, (blocks ?? []) as Block[], focus) }] },
          contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: 4096 },
        }),
      },
    )
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text()
      console.error('Gemini error', upstream.status, detail)
      let message = ''
      try {
        message = JSON.parse(detail).error?.message ?? ''
      } catch {
        /* not JSON */
      }
      return json({ error: `AI request failed (${upstream.status})${message ? `: ${message}` : ''}` }, 502)
    }

    // Gemini SSE → plain text chunks (thought parts are skipped).
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    let buffer = ''
    const stream = upstream.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          buffer += decoder.decode(chunk, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            try {
              const event = JSON.parse(line.slice(5))
              if (event.error) {
                controller.enqueue(encoder.encode(`\n\n[Error: ${event.error.message ?? 'stream failed'}]`))
                continue
              }
              const parts = event.candidates?.[0]?.content?.parts ?? []
              for (const part of parts) {
                if (typeof part.text === 'string' && !part.thought) controller.enqueue(encoder.encode(part.text))
              }
            } catch {
              /* partial or non-JSON line */
            }
          }
        },
      }),
    )
    return new Response(stream, { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
