# AGENT.md

Guidance for AI coding agents (and humans) working on Manuscript. Read [ARCHITECTURE.md](ARCHITECTURE.md) first.

## Project in one paragraph

Manuscript is a shared notebook for film ideas with email/password accounts, usernames and per-project sharing (owner, editors, viewers, plus optional view/edit for anyone with the link). A project (`/:id`) is an ordered list of named blocks: poetry, drama, prose, notes, file, link and resources. The frontend is a Vite + React 19 SPA on Vercel. The backend is Supabase: Postgres through RPCs only, Storage for uploads, Realtime for live sync, Auth for accounts, and Edge Functions for sign-up, AI chat, link unfurling and deletes. The whole UI uses one design language, taken from the Manu AI panel: soft tinted surfaces, rounded pill controls, cards, and a blue → violet → rose gradient as the only accent colour.

## Commands

- `npm run dev`: dev server
- `npx tsc --noEmit`: type-check (run this before committing)
- `npm run build`: production build to `dist/`
- `supabase db push`: apply migrations (project ref `wbcrptqnvwqppqkzkvqg`)
- `supabase functions deploy chat unfurl delete --project-ref wbcrptqnvwqppqkzkvqg`
- `supabase secrets set MANU_AI_KEY=... MANU_AI_MODEL=...`

## Rules

1. **Database access is RPC-only.** Never add RLS policies or table grants for `anon`. To add a capability, write a new `security definer` function with `set search_path = ''`. Fully qualify every name (`public.blocks`), validate the inputs, and `grant execute` to `anon, authenticated` explicitly. Add a matching wrapper in `src/lib/supabase.ts`. Every function that reads or changes a project must call `public.require_role(p_id, 'viewer' | 'editor' | 'owner')` first; sharing is owner-only.
2. **Migrations are append-only.** Add a new timestamped file in `supabase/migrations/`. Never edit one that has already been applied.
3. **Anything that deletes Storage objects goes through the `delete` edge function.** The anon role can only insert into the bucket. If you add a new kind of block that owns files, keep its Storage key in `data.path` under `<project_id>/`, and make sure the `delete` function removes it.
4. **User text must stay safe.** `renderMarkdown` escapes HTML before applying any formatting, and its output is the only content passed to `dangerouslySetInnerHTML`. Keep it that way. Links only allow `http:`, `https:` and `mailto:`.
5. **Writers aren't technical.** Never expose markdown syntax as the main way to format. New formatting needs a labelled toolbar button with a plain-English `help` string in `TextEditor.tsx`, an entry in the `Guide`, and support in `markdown.ts`. Update the formatting list in the `chat` function's system prompt too.
6. **Saves are optimistic and debounced.** Change blocks through `patchBlock` / `queue` in `Project.tsx`. Don't call `updateBlock` directly from components. After any mutation, call `notify()` so other viewers refetch.
7. **Ordering uses fractional `position`.** Use `between()` from `util.ts`. Don't renumber rows.
8. **Permissions are enforced on the server.** Hiding a button for viewers (`viewMode`, `canEdit`, `isOwner` in `Project.tsx`) is only UX. Edge functions that touch a project check `project_role` with the caller's token, and the Storage insert policy does the same. Members must already have an account; don't add email invites without verifying ownership of the address.
9. **Manu AI never names its provider.** Don't put model, company or provider names anywhere a user can see them: UI text, error messages or the docs. The model is set only by the `MANU_AI_MODEL` secret, and provider errors stay in the server logs.

## Style

- Use the single `src/styles.css` with flat class names and CSS custom properties. No CSS modules, no Tailwind.
- Theme tokens live on `:root`, with a dark override in `prefers-color-scheme`: `--bg`, `--surface`, `--surface-2/3`, `--text`, `--text-2`, `--muted`, `--line`, and `--ai-gradient` as the only accent. The `--ai-*` names alias the same tokens for the chat CSS.
- Theme switching uses `<html data-theme="light|dark">`, set by `src/lib/theme.ts` and by an inline script in `index.html` that runs before first paint. Every dark override needs two selectors: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }` for the device setting and `:root[data-theme="dark"] …` for a chosen theme. Don't add plain `prefers-color-scheme` rules.
- Blocks respond to their own width, not just the window. `.block-meta` (`blockmeta`) and `.block-body` (`blockbody`) are size containers, and narrow layouts live in the `@container` rules near the end of `styles.css`, after the rules they override. Don't make the whole `.block` a container: that would make it the anchor for the fixed-position style sheets that open from the title row.
- Use surfaces rather than borders to separate things. Controls are pills (`border-radius: 999px`) and cards use 18–30px radii. Primary buttons are inverse (text colour on the background), and the focused or editing state gets the gradient edge or glow (`--glow`). The tray and toast are inverse.
- Icons come from [Lucide](https://lucide.dev). Import them through `src/components/Icons.tsx`, which gives every icon the same stroke and size. The editor toolbar and chat import a few Lucide icons directly. Don't hand-draw SVG icons, except the logo and `ManuSpark`.
- Fonts: Geist for the UI, Geist Mono for labels, Newsreader for poetry and prose, Courier Prime for drama.
- Write components as function components with hooks. Keep comments short and only where the reason isn't obvious. Two-space indent, no semicolons, single quotes.

## Adding a block kind (checklist)

1. Add it to the `kind` check constraint in a new migration.
2. Add it to `BlockKind` in `lib/supabase.ts`, and to `KINDS` / `PALETTE` in `lib/templates.ts`.
3. Add an icon case in `KindIcon`.
4. Add a body renderer in `components/Block.tsx` and a creation branch in `NewBlockDialog.tsx`.
5. Describe it in the `chat` function's `describe()` so the assistant can see it.

## Structured scripts (Drama)

- When `data.script` changes, always write `body: toText(script)` in the same patch. `ScriptBody` in `Block.tsx` does this; keep it that way.
- To add a new script element type:
  1. Add it to `ScriptElement` and `newElement()` in `script.ts`.
  2. Handle it in `toText()` and `parseScript()`.
  3. Add a row editor in `ScriptEditor.tsx`.
  4. Add its rendering in `ScriptView.tsx`.
  5. Style it with the `.se-*` (editor) and `.pg-*` (page) classes.
- The page look (`.script-page`) uses its own paper and ink colours on purpose, in both themes.
- Character colours come from `characterVars()` in `script.ts`, which turns `Character.color` (an increasing number that's never reused) into a golden-angle hue plus saturation and lightness offsets. Apply them by adding the `has-ch` class and `style={characterVars(c)}` to the element. The stylesheet sets the lightness per theme and on the paper page (`--ch-*-l`). Never colour the dialogue text itself.

## Gotchas

- Edge functions run with `verify_jwt = false` (set in `supabase/config.toml`). Signed-out clients send the `sb_publishable_…` key, which isn't a JWT; signed-in clients send their access token (`bearer()` in `supabase.ts`). Pass `--use-api` or keep the config file when you deploy.
- `/settings`, `/login` and a few other names are reserved in `open_project` so they can't become projects. Add a name there before adding a new top-level route.
- Test with throwaway accounts on `@manuscript.test` addresses and delete them afterwards (`delete from auth.users where email like 'qa-%@manuscript.test'`).
- The free plan caps uploads at 50 MB. The bucket enforces the same limit, so raise both together.
- Under StrictMode, effects and state updaters run twice in dev. Never put side effects inside a `setState` updater.
- pdf.js is dynamically imported, so the worker ends up in its own chunk. Keep it out of the main bundle.
- Recording needs a secure context (https or localhost). Chrome's recorded WebM reports `duration = Infinity`, so always store `duration` with a recording; `AudioPlayer` only falls back to a seek trick when none is stored.
- New audio formats need three changes together: `ACCEPTED`/`mimeFor` in `supabase.ts`, the bucket's `allowed_mime_types` (a new migration), and `fileType()` in `Block.tsx`.
- Render block text with `RichText`, not `renderMarkdown` + `dangerouslySetInnerHTML`, wherever voice notes should play.
