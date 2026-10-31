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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { url } = await req.json()
    const target = new URL(String(url))
    if (!/^https?:$/.test(target.protocol) || PRIVATE_HOST.test(target.hostname)) {
      return json({ error: 'Unsupported URL' }, 400)
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
