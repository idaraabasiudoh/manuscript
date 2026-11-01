-- Link-preview card for any project URL (private or public): only the title and stats,
-- never block contents. Word count matches wordCount() in src/lib/util.ts.
create or replace function public.project_card(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'updated', p.updated,
    'blocks', (select count(*) from public.blocks b where b.project_id = p.id),
    'words', coalesce((
      select sum(cardinality(array_remove(regexp_split_to_array(
        trim(regexp_replace(b.body, '[#>*_~`@\-\[\]()+]', ' ', 'g')), '\s+'), '')))
      from public.blocks b
      where b.project_id = p.id and b.kind in ('text', 'poetry', 'drama', 'prose')
    ), 0)
  )
  from public.projects p
  where p.id = p_id
$$;

revoke all on function public.project_card(text) from public;
grant execute on function public.project_card(text) to anon, authenticated;
