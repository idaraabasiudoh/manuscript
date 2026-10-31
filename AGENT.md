# AGENT.md

Guidance for AI coding agents (and humans) working on Manuscript. Read [ARCHITECTURE.md](ARCHITECTURE.md) first.

## Project in one paragraph

Manuscript is a link-shared, no-auth notebook for film ideas. A project (`/:id`) is an ordered list of named blocks: poetry, drama, prose, notes, file, link and resources. The frontend is a Vite + React 19 SPA on Vercel. The backend is Supabase: Postgres through RPCs only, Storage for uploads, Realtime for live sync, and Edge Functions for AI chat, link unfurling and deletes. The whole UI uses one design language, taken from the Manu AI panel: soft tinted surfaces, rounded pill controls, cards, and a blue → violet → rose gradient as the only accent colour.

## Commands

- `npm run dev`: dev server
- `npx tsc --noEmit`: type-check (run this before committing)
- `npm run build`: production build to `dist/`
- `supabase db push`: apply migrations (project ref `wbcrptqnvwqppqkzkvqg`)
- `supabase functions deploy chat unfurl delete --project-ref wbcrptqnvwqppqkzkvqg`
- `supabase secrets set MANU_AI_KEY=... MANU_AI_MODEL=...`

## Rules

1. **Database access is RPC-only.** Never add RLS policies or table grants for `anon`. To add a capability, write a new `security definer` function with `set search_path = ''`. Fully qualify every name (`public.blocks`), validate the inputs, and `grant execute` to `anon, authenticated` explicitly. Add a matching wrapper in `src/lib/supabase.ts`.
2. **Migrations are append-only.** Add a new timestamped file in `supabase/migrations/`. Never edit one that has already been applied.
3. **Anything that deletes Storage objects goes through the `delete` edge function.** The anon role can only insert into the bucket. If you add a new kind of block that owns files, keep its Storage key in `data.path` under `<project_id>/`, and make sure the `delete` function removes it.
4. **User text must stay safe.** `renderMarkdown` escapes HTML before applying any formatting, and its output is the only content passed to `dangerouslySetInnerHTML`. Keep it that way. Links only allow `http:`, `https:` and `mailto:`.
5. **Writers aren't technical.** Never expose markdown syntax as the main way to format. New formatting needs a labelled toolbar button with a plain-English `help` string in `TextEditor.tsx`, an entry in the `Guide`, and support in `markdown.ts`. Update the formatting list in the `chat` function's system prompt too.
6. **Saves are optimistic and debounced.** Change blocks through `patchBlock` / `queue` in `Project.tsx`. Don't call `updateBlock` directly from components. After any mutation, call `notify()` so other viewers refetch.
7. **Ordering uses fractional `position`.** Use `between()` from `util.ts`. Don't renumber rows.

8. **Manu AI never names its provider.** Don't put model, company or provider names anywhere a user can see them: UI text, error messages or the docs. The model is set only by the `MANU_AI_MODEL` secret, and provider errors stay in the server logs.

## Style

- Use the single `src/styles.css` with flat class names and CSS custom properties. No CSS modules, no Tailwind.
- Theme tokens live on `:root`, with a dark override in `prefers-color-scheme`: `--bg`, `--surface`, `--surface-2/3`, `--text`, `--text-2`, `--muted`, `--line`, and `--ai-gradient` as the only accent. The `--ai-*` names alias the same tokens for the chat CSS.
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

## Gotchas

- Edge functions run with `verify_jwt = false` (set in `supabase/config.toml`). The client sends the `sb_publishable_…` key, which isn't a JWT. Pass `--use-api` or keep the config file when you deploy.
- The free plan caps uploads at 50 MB. The bucket enforces the same limit, so raise both together.
- Under StrictMode, effects and state updaters run twice in dev. Never put side effects inside a `setState` updater.
- pdf.js is dynamically imported, so the worker ends up in its own chunk. Keep it out of the main bundle.
