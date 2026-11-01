# Architecture

```
Browser (Vite + React 19 SPA on Vercel)
  │
  ├── Supabase Postgres  ── RPC only (security definer, search_path='')
  │     ├── projects  (id = URL slug, title)
  │     └── blocks    (project_id → projects ON DELETE CASCADE, kind, title, body, data, position)
  │
  ├── Supabase Storage   ── bucket "project-files" (public read, anon insert-only)
  │     └── <project_id>/<uuid>-<filename>
  │
  ├── Supabase Realtime  ── channel "project:<id>"
  │     ├── broadcast "changed"  → other clients refetch via get_project
  │     └── presence             → "N here" counter
  │
  └── Supabase Edge Functions (verify_jwt = false; service role inside)
        ├── chat    → loads project blocks → model provider (streamed) → plain-text stream
        ├── unfurl  → resolve short links → oEmbed (YouTube/Vimeo/Spotify/Loom/TikTok), Instagram name, or Open Graph scrape → link preview JSON
        └── delete  → removes Storage objects, then deletes project or block rows
```

## Data model

`supabase/migrations/20261031000000_init.sql`

**projects**

| column | type | notes |
|--------|------|-------|
| id | text PK | URL slug, `^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$` |
| title | text | display title (≤200 chars) |
| created / updated | timestamptz | `updated` is bumped on every block change |

**blocks**

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| project_id | text FK | `on delete cascade` |
| position | double precision | fractional ordering. A new position is the midpoint of its neighbours, so a reorder writes one row |
| kind | text | `text \| poetry \| drama \| prose \| file \| link \| resources` |
| title | text | the block's name |
| body | text | formatted text for the text kinds, or the caption for files (≤200 KB) |
| data | jsonb | depends on `kind`, see below |

What `data` holds for each kind:

- `file`: `{ path, name, mime, size }`. `path` is the Storage key.
- `link`: `{ url, title, description, image, site }`, captured once when the block is created.
- `resources`: `{ items: [{ id, title, url, note }] }`
- text kinds: `{ template }`, the template the block was started from (shown as a label).
- `drama` with a structured script: `{ template, script, originalText? }`.
  - `script` is `{ version: 1, meta: { title, format, genre, logline, author }, cast: [{ id, name, age, description, color }], elements: [...], theme?, font? }`. `theme` is a `PAGE_THEMES` id (missing for the default, Parchment). `font` is a `PAGE_FONTS` id (missing for Courier Prime), and non-default fonts load from Google Fonts only when used (`loadPageFont()`).
  - Each element has `{ id, type }` plus fields for its type: `scene` (setting, location, time), `action` (text), `dialogue` (character id, parenthetical, text), `transition` (text), `note` (label, text) or `break` (text).
  - `body` always holds the plain screenplay text produced by `toText()`, so word counts, template previews and Manu AI keep working without knowing the structure.
  - `originalText` is kept when a plain-text block is converted, so the writer can switch back.
  - Logic lives in `src/lib/script.ts`: `parseScript()`, `toText()` and the element helpers.

### Access model

Both tables have RLS enabled and **no policies**, so the anon role can't read or write them directly. Everything goes through these functions, which are granted to `anon`:

| RPC | purpose |
|-----|---------|
| `open_project(p_id)` | create-if-missing, return project and blocks, plus `isNew` |
| `get_project(p_id)` | return project and blocks, or null if deleted |
| `rename_project(p_id, p_title)` | |
| `add_block(p_project, p_kind, p_title, p_body, p_data, p_position)` | |
| `update_block(p_id, p_patch)` | patch any of `title/body/data/position` |
| `delete_block(p_id)` | text blocks only. File blocks must go through the `delete` function so their file is removed too |

The Supabase security advisor flags these as "anon can execute SECURITY DEFINER". That's intentional, because these RPCs *are* the public API of a no-auth app. They validate their inputs, and nothing else is exposed.

Storage: the anon role can **insert** into `project-files`. It can't update, overwrite (`x-upsert: false`) or delete. Reads go through the public URL. The bucket enforces a 50 MB cap and a MIME allowlist.

## Request flows

**Opening `/the-last-train`.** `open_project` creates the row if needed and returns everything in one round trip. The client then subscribes to `project:the-last-train` for broadcast and presence.

**Block links.** `/:id/:blockId?` is a single route, so opening a block full screen and returning keeps the page's state and any unsaved edits. `blockId` is the first 8 characters of the block's UUID (`blockSlug()`), matched by prefix within the project. In full-screen mode the same `BlockView` renders alone, with the sidebar and drag-and-drop off. The toolbar swaps in a Return button, and Share uses the block's URL.

**Editing.** Each keystroke updates local state right away. Patches are merged per block and saved after 600 ms of quiet with `update_block`. After each save the client broadcasts `changed`. Other clients debounce for 250 ms, then refetch with `get_project` and merge. A block the viewer is editing, or one with an unsaved patch, keeps its local version.

**Adding a block.** The sidebar palette, the starter cards and the "Add" row all open `NewBlockDialog`, which takes a name plus a template, file or URL. Dragging from the palette sets the insertion position. Creating the block calls `add_block`.

**Uploading.** Files go up with XHR so the client gets progress events. They're POSTed to `/storage/v1/object/project-files/<project>/<uuid>-<name>`, and then `add_block(kind='file')` records them. Files dropped onto the page skip the dialog.

**Deleting.**
- Block: text-kind blocks use the `delete_block` RPC. File blocks call the `delete` function with `{ block }`, which removes the Storage object and then the row.
- Project: calls the `delete` function with `{ project }`. It lists every object under `<project>/` (paginated), removes them, then deletes the project row. The cascade removes the blocks. Other open clients get a broadcast, their refetch returns null, and they show "This project was deleted".

**Assistant.** The client sends `{ project, messages (last 16), focus }` to `chat`. The function loads the project's title and blocks with the service role and builds a system prompt. That prompt holds the project content (capped at about 60k characters), notes which block the writer is focused on, and lists the formatting the editor understands. The function calls the model set in the `MANU_AI_MODEL` secret, using the `MANU_AI_KEY` secret, with streaming on. It turns the streamed text into a plain-text stream for the browser and skips thought parts. Errors from the provider are logged on the server, and the browser only gets a generic message. The system prompt tells the assistant to present itself only as Manu AI and never name the model or company behind it. Chat history is saved per browser in `localStorage`.

## Frontend layout

```
src/
  main.tsx                 router: "/" → Home, "/:id" → Project
  styles.css               all styles: one design language (soft surfaces, pills, cards, AI gradient), shared with Manu AI
  lib/
    supabase.ts            client, types, RPC wrappers, edge-function calls, XHR upload
    markdown.ts            safe formatter (escape first) incl. screenplay rules for drama
    script.ts              structured script model, text parser (plain → structured) and serializer
    templates.ts           block kinds metadata + templates per text kind
    util.ts                names, recent projects, positions, formatting helpers
  pages/
    Home.tsx               name → open/create
    Project.tsx            workspace: sidebar palette/outline, doc column, DnD, autosave, realtime, dialogs
  components/
    Block.tsx              block shell + bodies (text preview, file, link, resources)
    TextEditor.tsx         toolbar + textarea + live preview + formatting guide
    ScriptEditor.tsx       structured Drama builder: title page, cast, script pieces, add bars
    ScriptView.tsx         structured script as a typed screenplay page
    NewBlockDialog.tsx     name + template / file / URL
    PdfViewer.tsx          pdf.js canvas renderer (lazy chunk)
    Chat.tsx               Manu AI panel (greeting, suggestion cards, block picker, shimmer, retry, wide mode, ⌘J)
    Icons.tsx              Lucide icon wrappers (shared stroke/size), block-kind icons, logo, Manu AI sparkle
supabase/
  migrations/              SQL, run in filename order
  functions/{chat,unfurl,delete}/index.ts
  config.toml              verify_jwt=false for all three functions
```

## Formatting syntax

The editor buttons write this syntax for the user, and `markdown.ts` renders it. All input is HTML-escaped before any formatting is applied.

```
# Title   ## Heading   ### Subheading
**bold**  *italic*  ++underline++  ~~strike~~  [text](https://…)
> quote   - bullet   1. numbered   ---  divider   * * *  scene break   ->centered<-

Drama only:
INT. / EXT. …     scene heading        @NAME   character cue (lines below = dialogue)
(quietly)         parenthetical        CUT TO: / FADE OUT.   transition
```
