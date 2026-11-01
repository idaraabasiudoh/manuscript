# Architecture

```
Browser (Vite + React 19 SPA on Vercel)
  │
  ├── Supabase Auth      ── email + password (session kept in localStorage "manuscript-auth")
  │
  ├── Supabase Postgres  ── RPC only (security definer, search_path='')
  │     ├── profiles         (id → auth.users, username, email)
  │     ├── projects         (id = URL slug, title, owner → auth.users, access)
  │     ├── project_members  (project_id, user_id, role viewer|editor)
  │     ├── project_visits   (user_id, project_id, opened)
  │     └── blocks           (project_id → projects ON DELETE CASCADE, kind, title, body, data, position)
  │
  ├── Supabase Storage   ── bucket "project-files" (public read, insert only for owners/editors)
  │     └── <project_id>/<uuid>-<filename>
  │
  ├── Supabase Realtime  ── channel "project:<id>"
  │     ├── broadcast "changed"  → other clients refetch via get_project
  │     └── presence             → "N here" counter
  │
  └── Supabase Edge Functions (verify_jwt = false; service role inside)
        ├── chat    → loads project blocks → model provider (streamed) → plain-text stream
        ├── unfurl  → resolve short links → oEmbed (YouTube/Vimeo/Spotify/Loom/TikTok), Instagram name, or Open Graph scrape → link preview JSON
        ├── delete  → checks the caller's role, removes Storage objects, then deletes project or block rows
        └── signup  → creates a confirmed email/password user (no confirmation email)
```

## Data model

`supabase/migrations/20261031000000_init.sql`, plus `20261101000000_auth_and_sharing.sql` for accounts and sharing.

**projects**

| column | type | notes |
|--------|------|-------|
| id | text PK | URL slug, `^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$` |
| title | text | display title (≤200 chars) |
| created / updated | timestamptz | `updated` is bumped on every block change |
| owner | uuid | → `auth.users`. Null only for legacy projects made before accounts |
| access | text | general link access: `restricted` (default) \| `view` \| `edit` |

**profiles** (one per user, created by the `on_auth_user_created` trigger): `id`, `username` (unique, `^[a-z0-9_][a-z0-9_.-]{2,23}$`, null until chosen), `email`.

**project_members**: `(project_id, user_id)` primary key, `role` `viewer | editor`. Cascades from both projects and users.

**project_visits**: when each user last opened each project, used to sort the project list.

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

- `file`: `{ path, name, mime, size, duration?, peaks?, voice? }`. `path` is the Storage key. Audio gets `duration` (seconds) and `peaks` (64 numbers, 0–1) for the waveform; `voice: true` marks a browser recording.
- `link`: `{ url, title, description, image, site }`, captured once when the block is created.
- `resources`: `{ items: [{ id, title, url, note }] }`
- text kinds: `{ template, voices? }`. `template` is the one the block was started from (shown as a label). `voices` maps each inline voice note's Storage path to `{ duration, peaks }`. The note itself is a line in `body`: `[label](audio:<project>/<file>)`.
- `drama` with a structured script: `{ template, script, originalText? }`.
  - `script` is `{ version: 1, meta: { title, format, genre, logline, author }, cast: [{ id, name, age, description, color }], elements: [...], theme?, font? }`. `theme` is a `PAGE_THEMES` id (missing for the default, Parchment). `font` is a `PAGE_FONTS` id (missing for Courier Prime), and non-default fonts load from Google Fonts only when used (`loadPageFont()`).
  - Each element has `{ id, type }` plus fields for its type: `scene` (setting, location, time), `action` (text), `dialogue` (character id, parenthetical, text), `transition` (text), `note` (label, text) or `break` (text).
  - `body` always holds the plain screenplay text produced by `toText()`, so word counts, template previews and Manu AI keep working without knowing the structure.
  - `originalText` is kept when a plain-text block is converted, so the writer can switch back.
  - Action and note `text` can hold @mentions, stored as plain `@Name` and matched case-insensitively against the cast (longest name first). `splitMentions()` colours them, `stripMentions()` drops the `@` in `toText()`, and `renameMentions()` rewrites them when a character is renamed. In the editor, `MentionText` lays a transparent textarea over a tinted copy of the same text and opens a cast list at the caret after `@`.
  - Logic lives in `src/lib/script.ts`: `parseScript()`, `toText()` and the element helpers.

### Access model

Every table has RLS enabled and **no policies**, so clients can't read or write them directly. Everything goes through `security definer` functions granted to `anon` and `authenticated`, which check the caller with `auth.uid()`.

**Roles.** `project_role(p_id)` returns `owner`, `editor`, `viewer` or null, taking the strongest of: owner → member role → general access (`edit` gives editor, `view` gives viewer). `require_role(p_id, need)` raises if the caller falls short.

| RPC | needs | purpose |
|-----|-------|---------|
| `open_project(p_id)` | any | returns `{status}`: `ok` (project, blocks, `role`, `isNew`), `denied` (+ `signedIn`), `sign-in-to-create`, or `reserved` (app routes like `settings`). Creates the project for a signed-in caller, owned by them and `restricted`, and records a visit |
| `get_project(p_id)` | viewer | project and blocks with `role`, `{status:'denied'}`, or null if deleted |
| `rename_project`, `add_block`, `update_block`, `delete_block` | editor | as before. `delete_block` is text blocks only; file blocks go through the `delete` function |
| `get_sharing`, `set_project_access`, `share_project(p_id, p_identifier, p_role)`, `set_member_role`, `remove_member` | owner | sharing. `share_project` resolves a username (with or without `@`) or an email to an existing account |
| `get_my_profile`, `set_username`, `list_my_projects` | signed in | profile and the owned + shared project list |

The Supabase security advisor flags these as "anon can execute SECURITY DEFINER". That's intentional: these RPCs are the API, and each one checks the caller's role itself.

Storage: owners and editors can **insert** into `project-files` (policy `editors can upload project files` calls `project_role` on the first path segment). Nobody can update, overwrite (`x-upsert: false`) or delete from the client. Reads go through the public URL, so file URLs are unguessable but not access-checked. The bucket enforces a 50 MB cap and a MIME allowlist.

Edge functions run with `verify_jwt = false`, but `chat` and `delete` build a client from the anon key plus the caller's `Authorization` header and call `project_role`: chat needs editor (viewers never see Manu AI), deleting a block needs editor, deleting a project needs owner.

## Request flows

**Signing up.** `AuthCard` calls the `signup` function (admin `createUser` with `email_confirm: true`), then `signInWithPassword`. `AuthProvider` (`src/lib/auth.tsx`) tracks the session and profile. While the profile has no username, `UsernameGate` in `main.tsx` shows `UsernameSetup` instead of the app.

**Opening `/the-last-train`.** After auth is ready, `open_project` returns everything in one round trip, or a status the page turns into `AccessScreen` (no access, sign in to create, reserved name). The page reloads when the signed-in user changes. The client then subscribes to `project:the-last-train` for broadcast and presence. When the owner changes sharing, a broadcast makes other clients refetch; anyone who just lost access gets the no-access screen.

**Viewers.** `viewMode = reading || role is viewer`. It hides the palette, editing, drag-and-drop, Delete and Manu AI (the panel, its button and ⌘J), and swaps the Read/Edit toggle for a View only badge. The server enforces the same rules.

**Block links.** `/:id/:blockId?` is a single route, so opening a block full screen and returning keeps the page's state and any unsaved edits. `blockId` is the first 8 characters of the block's UUID (`blockSlug()`), matched by prefix within the project. In full-screen mode the same `BlockView` renders alone, with the sidebar and drag-and-drop off. The toolbar swaps in a Return button, and Share uses the block's URL.

**Editing.** Each keystroke updates local state right away. Patches are merged per block and saved after 600 ms of quiet with `update_block`. After each save the client broadcasts `changed`. Other clients debounce for 250 ms, then refetch with `get_project` and merge. A block the viewer is editing, or one with an unsaved patch, keeps its local version.

**Adding a block.** The sidebar palette, the starter cards and the "Add" row all open `NewBlockDialog`, which takes a name plus a template, file or URL. Dragging from the palette sets the insertion position. Creating the block calls `add_block`.

**Uploading.** Files go up with XHR so the client gets progress events. They're POSTed to `/storage/v1/object/project-files/<project>/<uuid>-<name>`, and then `add_block(kind='file')` records them. Files dropped onto the page skip the dialog.

**Voice notes.** `VoiceRecorder` uses `getUserMedia` + `MediaRecorder` (`recordingFormat()` picks WebM/Opus or MP4/AAC) and an `AnalyserNode` for the live waveform; the levels it samples become the stored `peaks`, so no decoding is needed afterwards. Uploaded audio gets peaks from `audioMeta()` (`decodeAudioData`) before upload. A File-block take is uploaded as `kind='file'` with `voice: true`. In a text block, the editor uploads the take, stores its meta in `data.voices`, and inserts the `audio:` line at the cursor. `renderSegments()` splits text around those lines and `RichText` mounts an `AudioPlayer` for each, so players keep playing while the text around them changes; elsewhere (`renderMarkdown`) the line shows as a plain label. `claimPlayback()` pauses the previous player when another starts.

**Deleting.**
- Block: text-kind blocks use the `delete_block` RPC. File blocks, and text blocks with inline voice notes, call the `delete` function with `{ block }`, which removes `data.path` and every `data.voices` key inside the project's folder, then the row.
- Project: calls the `delete` function with `{ project }`. It lists every object under `<project>/` (paginated), removes them, then deletes the project row. The cascade removes the blocks. Other open clients get a broadcast, their refetch returns null, and they show "This project was deleted".

**Assistant.** The client sends `{ project, messages (last 16), focus }` to `chat`. The function loads the project's title and blocks with the service role and builds a system prompt. That prompt holds the project content (capped at about 60k characters), notes which block the writer is focused on, and lists the formatting the editor understands. The function calls the model set in the `MANU_AI_MODEL` secret, using the `MANU_AI_KEY` secret, with streaming on. It turns the streamed text into a plain-text stream for the browser and skips thought parts. Errors from the provider are logged on the server, and the browser only gets a generic message. The system prompt tells the assistant to present itself only as Manu AI and never name the model or company behind it. Chat history is saved per browser in `localStorage`.

## Frontend layout

```
src/
  main.tsx                 AuthProvider + username gate; router: "/" → Home, "/settings" → Settings, "/:id/:blockId?" → Project
  styles.css               all styles: one design language (soft surfaces, pills, cards, AI gradient), shared with Manu AI
  lib/
    supabase.ts            client, types, RPC wrappers (incl. sharing/profile), auth calls, edge-function calls, XHR upload
    auth.tsx               AuthProvider / useAuth: session + profile
    markdown.ts            safe formatter (escape first) incl. screenplay rules for drama; renderSegments for voice notes
    audio.ts               recording format, waveform peaks, time formatting, playback bus
    script.ts              structured script model, text parser (plain → structured) and serializer
    templates.ts           block kinds metadata + templates per text kind
    util.ts                names, recent projects, positions, formatting helpers
  pages/
    Home.tsx               sign in, or create a project + list of your projects
    Settings.tsx           username, email, sign out, your projects
    Project.tsx            workspace: sidebar palette/outline, doc column, DnD, autosave, realtime, dialogs
  components/
    Block.tsx              block shell + bodies (text preview, file, link, resources)
    AuthCard.tsx           sign in / sign up card, and the first-run username form
    ProjectList.tsx        owned + shared projects with access badges
    ShareDialog.tsx        owner's sharing: add people, roles, general access, copy link
    TextEditor.tsx         toolbar + textarea + live preview + formatting guide
    ScriptEditor.tsx       structured Drama builder: title page, cast, script pieces, add bars
    ScriptView.tsx         structured script as a typed screenplay page
    NewBlockDialog.tsx     name + template / file / URL
    PdfViewer.tsx          pdf.js canvas renderer (lazy chunk)
    AudioPlayer.tsx        waveform player (card + inline), seek by drag/keys, speed, one-at-a-time
    VoiceRecorder.tsx      in-browser recording: live waveform, timer, pause, review
    RichText.tsx           formatted text with voice-note players mounted in place
    Chat.tsx               Manu AI panel (greeting, suggestion cards, block picker, shimmer, retry, wide mode, ⌘J)
    Icons.tsx              Lucide icon wrappers (shared stroke/size), block-kind icons, logo, Manu AI sparkle
supabase/
  migrations/              SQL, run in filename order
  functions/{chat,unfurl,delete,signup}/index.ts
  config.toml              verify_jwt=false for all four functions
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
