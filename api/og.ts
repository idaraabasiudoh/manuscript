// Link-preview image for a project URL: the project's name and stats, drawn like the top of
// its page (white, Geist, big title, grey "6 blocks · 171 words · updated …" line).
// GET /api/og?id=<project>
import { readFileSync } from 'node:fs'
import { ImageResponse } from '@vercel/og'
import { loadCard, plural, timeAgo } from './_card.js'

const font = (w: number) => readFileSync(new URL(`./fonts/Geist-${w}.ttf`, import.meta.url))
const regular = font(400)
const medium = font(500)

// Tiny element helper, so this file needs no JSX setup.
const el = (type: string, style: Record<string, unknown>, children?: unknown) => ({ type, props: { style, children } })

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  const card = await loadCard(id)
  const title = card?.title?.trim() || (card ? 'Untitled project' : id || 'Manuscript')
  const meta = card ? `${plural(card.blocks, 'block')} · ${plural(card.words, 'word')} · updated ${timeAgo(card.updated)}` : 'Shared notebooks for film ideas'
  // Long names step down in size so they fit on two or three lines.
  const size = title.length > 60 ? 76 : title.length > 32 ? 96 : 128

  return new ImageResponse(
    el(
      'div',
      { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 120px', background: '#ffffff', fontFamily: 'Geist' },
      [
        el('div', { fontSize: size, fontWeight: 500, lineHeight: 1.08, letterSpacing: '-0.045em', color: card?.title?.trim() ? '#1f1f1f' : '#cdd5e0', display: 'flex', flexWrap: 'wrap' }, title),
        el('div', { marginTop: 34, fontSize: 38, fontWeight: 400, color: '#5f6672', letterSpacing: '-0.01em', display: 'flex' }, meta),
      ],
    ) as never,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Geist', data: regular, weight: 400, style: 'normal' },
        { name: 'Geist', data: medium, weight: 500, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400' },
    },
  )
}
