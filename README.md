# Manuscript

A shared, link-based notebook for video and short-film ideas. Go to `/<name>` (e.g. `/the-last-train`). The project is created on your first visit, and anyone with the link can read and edit it. There are no accounts.

A project is a single page made of **named blocks**. You drag blocks in from the sidebar and drag them up or down to reorder.

| Block | What it's for | Preview |
|-------|---------------|---------|
| **Poetry** | Verse, lyrics, voice-over | Serif, keeps line breaks and indentation, stanza and section breaks |
| **Drama** | Screenplays and stage plays | Industry-style scene headings, character cues, dialogue, parentheticals and transitions |
| **Prose** | Stories, treatments, synopses | Book-style paragraphs, chapters and scene breaks |
| **Notes** | Loglines, pitches, shot lists | Clean sans-serif text |
| **File** | PDF, MP4, MP3 or image (up to 50 MB) | PDF pages render inline, plus video/audio players and images |
| **Link** | A web page, video or reference | YouTube, Vimeo, Spotify and Loom play inline; other links get an Open Graph card |
| **Resources** | A reading or watch list | Numbered list of titles, links and notes |

## Features

- **Writer-friendly formatting.** Labelled buttons (Title / Heading / Subheading / Body, **B** *I* <u>U</u> ~~S~~, quote, lists, center, divider, link) plus buttons specific to each kind: *Scene, Character, (beat), CUT TO:* for drama, *Indent / Stanza* for poetry, *Chapter / Scene break* for prose. Every button has a plain-English tooltip, and a **?** guide explains the rest. Writers never need to know markdown.
- **Live preview.** The editor shows the formatted result side by side with the text on wide screens, and as Write/Preview tabs on narrow ones.
- **Templates.** Pick one when adding a block: screenplay scene, stage play, short-film beat sheet, sonnet, haiku sequence, song lyrics, short story, synopsis, film treatment, pitch, shot list and character sheet.
- **Drag and drop.** Drag a block type from the sidebar to a spot on the page, drag the ⋮⋮ grip to reorder, or drop files from your desktop anywhere on the page.
- **Live collaboration.** Edits autosave and appear for everyone viewing the project. A presence counter shows how many people are on the page.
- **Reader mode.** Hides all the editing controls so you can present or share the page cleanly.
- **Muse AI assistant.** A chat box in the bottom-right corner reads the whole project, knows which block you're working on, streams its replies, and can turn any reply into a new block.
- **Clean deletes.** Deleting a project removes all of its blocks and uploaded files. Deleting a file block removes its file.

## Stack

- **Frontend:** Vite, React 19, TypeScript, react-router. pdf.js is lazy-loaded to render PDFs.
- **Backend:** Supabase. Postgres is accessed only through RPCs, files live in Storage, live sync uses Realtime broadcast and presence, and three Edge Functions handle the AI chat (Gemini 3.5 Flash), link previews and deletes.
- **Hosting:** Vercel, serving the static SPA.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data model and request flows, and [AGENT.md](AGENT.md) for conventions when working on the code.

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + publishable key
npm run dev
```

## Supabase setup (new project)

```bash
supabase link --project-ref <ref>
supabase db push                                   # applies supabase/migrations
supabase functions deploy chat unfurl delete       # verify_jwt=false is set in supabase/config.toml
supabase secrets set GEMINI_API_KEY=AIza...         # Google AI Studio key; enables the Muse assistant
# optional: supabase secrets set GEMINI_MODEL=gemini-3.5-flash   (the default)
```

Until `GEMINI_API_KEY` is set, the assistant shows "not configured yet". The rest of the app works without it.

## Deploying

The app is a static build (`npm run build` → `dist/`). `vercel.json` rewrites every path to `index.html` so project URLs work. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project's environment variables.

## Limits and caveats

- **No auth by design.** Anyone with a project link can edit or delete it. Treat project names like unlisted links.
- **Uploads.** Files are capped at 50 MB (the Supabase free-plan limit). Allowed types are PDF, MP4, MP3, PNG, JPEG, GIF and WebP.
- **Edit conflicts.** Saves are last-write-wins per block. While you're editing a block, incoming changes to that block are held back so your text doesn't jump.
- **AI cost.** The assistant runs on your Gemini key, and anyone with a project link can use it.
