// Served instead of the plain app shell when a link-preview crawler (iMessage, WhatsApp, Slack…)
// opens a project URL (see the user-agent rewrite in vercel.json). It's the same index.html with
// that project's name, stats and card image in the preview tags. People always get the normal app.
// GET /api/page?id=<project>
import { loadCard, plural } from './_card.js'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Replaces the content="…" of a <meta> tag by its property/name. */
const setMeta = (html: string, key: string, value: string) =>
  html.replace(new RegExp(`(<meta (?:property|name)="${key}" content=")[^"]*(")`), `$1${esc(value)}$2`)

export async function GET(request: Request) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? ''
  const origin = `https://${request.headers.get('x-forwarded-host') ?? url.host}`
  const [shell, card] = await Promise.all([fetch(`${origin}/index.html`).then((r) => r.text()), loadCard(id)])
  let html = shell
  if (card) {
    const title = card.title?.trim() || 'Untitled project'
    const description = `${plural(card.blocks, 'block')} · ${plural(card.words, 'word')} — a Manuscript project`
    // The update time in the image URL makes apps fetch a fresh card after the project changes.
    const image = `${origin}/api/og?id=${encodeURIComponent(card.id)}&v=${encodeURIComponent(card.updated)}`
    for (const [key, value] of [
      ['og:title', title],
      ['og:description', description],
      ['og:image', image],
      ['og:image:alt', title],
      ['twitter:title', title],
      ['twitter:description', description],
      ['twitter:image', image],
    ]) html = setMeta(html, key, value)
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} — Manuscript</title>`)
    html = html.replace('<meta property="og:type"', `<meta property="og:url" content="${esc(`${origin}/${card.id}`)}" />\n    <meta property="og:type"`)
  }
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400' },
  })
}
