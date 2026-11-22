// Branches: alternative versions of a poetry, prose or drama block from a chosen point onward.
//
// A block is read as a list of pieces: script elements for a structured Drama block, otherwise
// paragraphs / stanzas (separated by blank lines). A branch starts at one piece (its anchor) and
// stores its own continuation, the tail. What comes before the anchor is shared with Main and always
// shows Main's current text. "Use this version" puts the branch's tail into Main and keeps Main's
// old tail as a new branch, so nothing is ever lost.

import { isScript, sceneHeading, toText, uid, type Character, type Script, type ScriptElement } from './script'
import type { Block, BlockPatch } from './supabase'

export type BranchScript = { cast: Character[]; elements: ScriptElement[] }

export type Branch = {
  id: string
  blockId: string
  name: string
  color: number
  anchor: string
  anchorIndex: number
  anchorLabel: string
  body: string
  script: BranchScript | null
  created: string
  updated: string
  authorName: string
}

export type Piece = { key: string; label: string; type: string }

export const BRANCHABLE = ['poetry', 'prose', 'drama'] as const
export const canBranch = (block: Block) => (BRANCHABLE as readonly string[]).includes(block.kind)

const scriptOf = (block: Block): Script | null => (block.kind === 'drama' && isScript(block.data.script) ? block.data.script : null)

/** Paragraphs or stanzas: runs of text separated by blank lines. */
export const paragraphs = (body: string) => body.split(/\n[ \t]*\n+/).map((p) => p.replace(/^\n+|\n+$/g, '')).filter((p) => p.trim())
const joinParagraphs = (ps: string[]) => ps.join('\n\n')

const clip = (s: string, n = 90) => {
  const flat = s.replace(/\s+/g, ' ').replace(/(^|[\s(])@(?=\p{L})/gu, '$1').trim()
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat
}

export function describeElement(e: ScriptElement, cast: Character[]): string {
  switch (e.type) {
    case 'scene':
      return sceneHeading(e) || 'New scene'
    case 'dialogue':
      return `${cast.find((c) => c.id === e.character)?.name ?? 'Someone'}: ${clip(e.text, 70) || '…'}`
    case 'note':
      return `${e.label || 'Note'}: ${clip(e.text, 70)}`
    default:
      return clip(e.text) || e.type
  }
}

/** The pieces of a block, in order, for choosing where a branch starts. */
export function piecesOf(block: Block): Piece[] {
  const script = scriptOf(block)
  if (script) return script.elements.map((e) => ({ key: e.id, label: describeElement(e, script.cast), type: e.type }))
  return paragraphs(block.body).map((p, i) => ({ key: `p${i}`, label: clip(p), type: block.kind === 'poetry' ? 'stanza' : 'paragraph' }))
}

/** Where a branch starts in Main right now: its anchor if it's still there, otherwise where it was. */
export function forkIndex(block: Block, branch: Pick<Branch, 'anchor' | 'anchorIndex'>): number {
  const script = scriptOf(block)
  if (script) {
    const at = script.elements.findIndex((e) => e.id === branch.anchor)
    return at >= 0 ? at : Math.min(branch.anchorIndex, script.elements.length)
  }
  const ps = paragraphs(block.body)
  let at = ps.findIndex((p) => p === branch.anchor)
  if (at < 0 && branch.anchor) {
    const start = branch.anchor.slice(0, 40)
    at = ps.findIndex((p) => p.startsWith(start))
  }
  return at >= 0 ? at : Math.min(branch.anchorIndex, ps.length)
}

/** A new branch's starting point and tail: a copy of Main from piece `index` onward. */
export function startBranch(block: Block, index: number) {
  const script = scriptOf(block)
  if (script) {
    const tail = script.elements.slice(index).map((e) => ({ ...e, id: uid() }))
    const first = script.elements[index]
    return {
      anchor: first?.id ?? '',
      anchorIndex: index,
      anchorLabel: first ? describeElement(first, script.cast) : 'the end',
      body: '',
      script: { cast: script.cast, elements: tail } as BranchScript,
    }
  }
  const ps = paragraphs(block.body)
  return { anchor: ps[index] ?? '', anchorIndex: index, anchorLabel: ps[index] ? clip(ps[index]) : 'the end', body: joinParagraphs(ps.slice(index)), script: null }
}

/** Main's cast plus any characters the branch added. */
function mergedCast(main: Character[], extra: Character[]) {
  return [...main, ...extra.filter((c) => !main.some((m) => m.id === c.id || m.name === c.name))]
}

export type Composed =
  | { mode: 'script'; shared: Script; tail: Script; full: Script; at: number }
  | { mode: 'text'; shared: string; tail: string; full: string; at: number }

/** Main's shared part plus the branch's continuation. */
export function compose(block: Block, branch: Branch): Composed {
  const at = forkIndex(block, branch)
  const script = scriptOf(block)
  if (script) {
    const cast = mergedCast(script.cast, branch.script?.cast ?? [])
    const shared = { ...script, cast, elements: script.elements.slice(0, at) }
    const tail = { ...script, cast, elements: branch.script?.elements ?? [] }
    return { mode: 'script', shared, tail, full: { ...script, cast, elements: [...shared.elements, ...tail.elements] }, at }
  }
  const ps = paragraphs(block.body)
  const shared = joinParagraphs(ps.slice(0, at))
  return { mode: 'text', shared, tail: branch.body, full: [shared, branch.body].filter(Boolean).join('\n\n'), at }
}

/** Main's own continuation from the same point, so Main can be compared with a branch. */
export function mainTail(block: Block, branch: Branch): string {
  const at = forkIndex(block, branch)
  const script = scriptOf(block)
  if (script) return toText({ ...script, meta: { title: '', format: '', genre: '', logline: '', author: '' }, cast: [], elements: script.elements.slice(at) })
  return joinParagraphs(paragraphs(block.body).slice(at))
}

export function branchTailText(block: Block, branch: Branch): string {
  const c = compose(block, branch)
  if (c.mode === 'text') return c.tail
  return toText({ ...c.tail, meta: { title: '', format: '', genre: '', logline: '', author: '' }, cast: [] })
}

/** Saves a branch's tail after editing (for drama, the cast is kept with the branch). */
export function tailPatch(tail: Script | string) {
  return typeof tail === 'string' ? { body: tail } : { script: { cast: tail.cast, elements: tail.elements } as BranchScript }
}

/**
 * "Use this version": Main becomes shared part + this branch. Returns the patch for Main and the
 * branch that keeps Main's previous ending (same starting point), so it can be restored later.
 */
export function swapIn(block: Block, branch: Branch) {
  const c = compose(block, branch)
  const script = scriptOf(block)
  if (c.mode === 'script' && script) {
    const old = script.elements.slice(c.at)
    const next: Script = c.full
    const first = c.tail.elements[0]
    const patch: BlockPatch = { data: { ...block.data, script: next }, body: toText(next) }
    const previous = {
      anchor: first?.id ?? '',
      anchorIndex: c.at,
      anchorLabel: first ? describeElement(first, next.cast) : branch.anchorLabel,
      body: '',
      script: { cast: script.cast, elements: old } as BranchScript,
    }
    return { patch, previous }
  }
  const ps = paragraphs(block.body)
  const oldTail = joinParagraphs(ps.slice(c.at))
  const firstNew = paragraphs(branch.body)[0] ?? ''
  const patch: BlockPatch = { body: c.mode === 'text' ? c.full : block.body }
  const previous = { anchor: firstNew, anchorIndex: c.at, anchorLabel: clip(firstNew) || branch.anchorLabel, body: oldTail, script: null }
  return { patch, previous }
}

/** Branch colours: fixed, distinct hues; Main is the accent colour. */
export const BRANCH_HUES = [268, 160, 24, 330, 200, 48, 120, 0]
export const branchHue = (color: number) => BRANCH_HUES[((color % BRANCH_HUES.length) + BRANCH_HUES.length) % BRANCH_HUES.length]

export function nextBranchName(existing: Branch[]) {
  for (let n = 2; ; n++) if (!existing.some((b) => b.name === `Idea ${n}`)) return `Idea ${n}`
}
