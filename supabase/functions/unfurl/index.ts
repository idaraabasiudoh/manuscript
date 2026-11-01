// Fetches a URL and returns its Open Graph preview: title, description, image, site name.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd])/i

function decode(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim()
}

function meta(html: string, keys: string[]) {
  for (const key of keys) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
      'i',
    )
    const m = html.match(re)
    if (m) return decode(m[1] ?? m[2] ?? '')
  }
  return ''
}

// Sites that block scrapers but publish oEmbed.
const OEMBED: [RegExp, string][] = [
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'https://www.youtube.com/oembed?format=json&url='],
  [/(^|\.)vimeo\.com$/, 'https://vimeo.com/api/oembed.json?url='],
  [/^open\.spotify\.com$/, 'https://open.spotify.com/oembed?url='],
  [/(^|\.)loom\.com$/, 'https://www.loom.com/v1/oembed?url='],
]

async function oembed(target: URL) {
  const endpoint = OEMBED.find(([re]) => re.test(target.hostname))?.[1]
  if (!endpoint) return null
  const res = await fetch(endpoint + encodeURIComponent(target.href), { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return null
  const o = await res.json()
  return {
    url: target.href,
    title: o.title ?? target.hostname,
    description: o.author_name ? `by ${o.author_name}` : '',
    image: o.thumbnail_url ?? '',
    site: o.provider_name ?? target.hostname.replace(/^www\./, ''),
  }
}

// Share links that redirect to the real page (players need the real URL).
const SHORT_LINKS = /^(spotify\.link|spoti\.fi|instagr\.am|youtu\.be\.?)$/

async function resolveShortLink(target: URL) {
  if (!SHORT_LINKS.test(target.hostname) || target.hostname.startsWith('youtu')) return target
  const res = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManuscriptBot/1.0)' } })
  res.body?.cancel().catch(() => {})
  let final = new URL(res.url || target.href)
  // spotify.link lands on a page whose canonical track URL is in the query or a meta refresh; keep what we can.
  if (/spotify\.link|spoti\.fi/.test(target.hostname) && final.hostname !== 'open.spotify.com') {
    const html = await (await fetch(target, { signal: AbortSignal.timeout(6000) })).text().catch(() => '')
    const m = html.match(/https:\/\/open\.spotify\.com\/[\w/-]+/)
    if (m) final = new URL(m[0])
  }
  return final
}

/** Instagram mostly hides previews from bots; name the link by what it is. */
function instagramInfo(target: URL) {
  const m = target.pathname.match(/^(?:\/[\w.]+)?\/(p|reel|reels|tv)\/([\w-]+)/)
  if (!m) return null
  return { url: `https://www.instagram.com/${m[1] === 'p' ? 'p' : 'reel'}/${m[2]}/`, title: m[1] === 'p' ? 'Instagram post' : 'Instagram reel', description: '', image: '', site: 'Instagram' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { url } = await req.json()
    let target = new URL(String(url))
    if (!/^https?:$/.test(target.protocol) || PRIVATE_HOST.test(target.hostname)) {
      return json({ error: 'Unsupported URL' }, 400)
    }
    target = await resolveShortLink(target).catch(() => target)
    if (/(^|\.)instagram\.com$/.test(target.hostname)) {
      const info = instagramInfo(target)
      if (info) return json(info)
    }

    const embedded = await oembed(target).catch(() => null)
    if (embedded) return json(embedded)

    const res = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManuscriptBot/1.0; +link-preview)', Accept: 'text/html' },
    })
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('html')) {
      return json({ url: target.href, title: target.pathname.split('/').pop() || target.hostname, site: target.hostname, contentType: type })
    }

    // Only the head matters; cap what we read.
    const reader = res.body!.getReader()
    let html = ''
    const decoder = new TextDecoder()
    while (html.length < 400_000) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      if (html.includes('</head>')) break
    }
    reader.cancel().catch(() => {})

    const finalUrl = new URL(res.url || target.href)
    let image = meta(html, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'])
    if (image) image = new URL(image, finalUrl).href
    const title = meta(html, ['og:title', 'twitter:title']) || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '')

    return json({
      url: target.href,
      title: title || finalUrl.hostname,
      description: meta(html, ['og:description', 'twitter:description', 'description']).slice(0, 400),
      image,
      site: meta(html, ['og:site_name']) || finalUrl.hostname.replace(/^www\./, ''),
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
