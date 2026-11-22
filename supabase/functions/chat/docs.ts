// The `docs` tool's pages: how Manuscript stores blocks and what the editor expects.
// Keep these in step with src/lib/script.ts, src/lib/templates.ts and ARCHITECTURE.md.

export const DOC_TOPICS = ['overview', 'text', 'drama', 'resources', 'write'] as const
export type DocTopic = (typeof DOC_TOPICS)[number]

export const DOCS: Record<DocTopic, string> = {
  overview: `# Manuscript data model
A project is an ordered list of blocks. Each block has:
- id (uuid), kind, title (≤200 chars), body (plain text), data (JSON that depends on kind), position (a number; lower comes first).
Kinds:
- text ("Notes"), poetry, prose: the body is formatted text (see topic "text"). data = { template? }.
- drama: a structured script in data.script (see topic "drama"). The body is generated from the script by the app — never write it yourself.
- resources: a list of links with notes in data.items (see topic "resources").
- file, link: made by uploading a file or pasting a URL. You can't create these.
Use the read tool to see the outline (ids, kinds, titles) or a single block in full.`,

  text: `# Formatted text (text, poetry, prose blocks)
The body is plain text using this formatting:
- "# " title, "## " heading, "### " subheading
- **bold**, *italic*, ++underline++, ~~strikethrough~~
- "> " quote, "- " bullets, "1. " numbered list, "- [ ] " / "- [x] " checklist
- "---" divider, "* * *" scene break, "->centered text<-"
Poetry: one line of the poem per line, a blank line between stanzas.
Prose: paragraphs separated by blank lines.`,

  drama: `# Drama blocks (structured scripts)
data.script has this shape:
{
  "meta": { "title": "", "format": "Short Film", "genre": "", "logline": "", "author": "" },
  "cast": [ { "name": "MAYA", "age": "30s", "description": "A night-shift nurse who never sleeps." } ],
  "elements": [ ...script elements in reading order... ]
}
meta.format is one of: Short Film, Feature Film, Stage Play, Web Series, TV Pilot, Music Video, Commercial, Spoken Word.
meta.genre is usually one of: Drama, Psychological Drama, Thriller, Comedy, Romance, Horror, Sci-Fi, Fantasy, Mystery, Documentary, Coming-of-Age, Musical.

Element types:
- { "type": "scene", "setting": "INT." | "EXT." | "INT./EXT." | "", "location": "KITCHEN", "time": "NIGHT" }
  time is usually one of DAY, NIGHT, MORNING, EVENING, DUSK, DAWN, CONTINUOUS, LATER, MOMENTS LATER.
- { "type": "action", "text": "@Maya slams the fridge shut." }
- { "type": "dialogue", "character": "MAYA", "parenthetical": "quietly", "text": "Not tonight." }
  character must be the exact name of a cast member. parenthetical has no brackets, or is "".
- { "type": "transition", "text": "CUT TO:" } — one of CUT TO:, FADE IN:, FADE OUT., FADE TO BLACK., DISSOLVE TO:, SMASH CUT TO:, MATCH CUT TO:, JUMP CUT TO:
- { "type": "note", "label": "Director's note", "text": "..." } — label is usually Composition note, Director's note, Camera, Sound, Music, Flashback or Montage. Use notes for annotations.
- { "type": "break", "text": "END OF ACT ONE" } — END OF ACT ONE, INTERMISSION, END OF ACT TWO or THE END.

Rules:
- Every speaking character needs a cast entry (UPPERCASE name, an age and a one-line description).
- Mention characters inside action and note text as "@Name" (e.g. "@Maya"), so the app colours them.
- Start with a scene element (or FADE IN: then a scene). Keep action lines short and visual.
- The app assigns ids and character colours. Don't include ids, colours, a body, theme or font.
- To change an existing script, read it first, then send the whole updated script.`,

  resources: `# Resources blocks
data.items is a list: [ { "title": "Reference film", "url": "https://…", "note": "Why it matters" } ].
url may be "" for an item without a link. The app assigns ids.`,

  write: `# Using the write tool
- Every write is shown to the writer as a preview card and only happens if they accept it. Say in one sentence what you're proposing; don't paste the whole content into your message too.
- One write call per turn. Put several changes in one call as a list of operations.
- create: kind, title, and content: body (text, poetry, prose), script (drama) or items (resources). Optional after: the id of the block to place it after; otherwise it goes at the end.
- update: block_id plus whatever changes: title, body, script or items. script and items replace the old ones completely, so read the block first.
- You can't delete blocks, or create file or link blocks.`,
}
