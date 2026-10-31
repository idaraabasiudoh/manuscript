-- Manuscript: projects made of ordered blocks.
-- Access is RPC-only: tables have RLS on with no policies, so anon can't touch them directly.

create table public.projects (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  title text not null default '' check (length(title) <= 200),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects (id) on delete cascade,
  position double precision not null,
  kind text not null check (kind in ('text', 'poetry', 'drama', 'prose', 'file', 'link', 'resources')),
  title text not null default '' check (length(title) <= 200),
  body text not null default '' check (length(body) <= 200000),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 50000),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

create index blocks_project_position on public.blocks (project_id, position);

alter table public.projects enable row level security;
alter table public.blocks enable row level security;
revoke all on public.projects, public.blocks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers

create function public.block_json(b public.blocks) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'kind', b.kind, 'title', b.title, 'body', b.body, 'data', b.data,
    'position', b.position, 'created', b.created, 'updated', b.updated
  )
$$;

create function public.project_json(p_id text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'created', p.created, 'updated', p.updated,
    'blocks', coalesce(
      (select jsonb_agg(public.block_json(b) order by b.position) from public.blocks b where b.project_id = p.id),
      '[]'::jsonb
    )
  )
  from public.projects p where p.id = p_id
$$;

create function public.touch_project(p_id text) returns void
language sql set search_path = '' as $$
  update public.projects set updated = now() where id = p_id
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs

-- Opens a project, creating it (empty) on first visit.
create function public.open_project(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_new boolean := false;
begin
  if p_id !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then
    raise exception 'Invalid project name';
  end if;
  insert into public.projects (id) values (p_id) on conflict (id) do nothing;
  v_new := found;
  return public.project_json(p_id) || jsonb_build_object('isNew', v_new);
end
$$;

create function public.get_project(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.project_json(p_id)
$$;

create function public.rename_project(p_id text, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.projects set title = left(coalesce(p_title, ''), 200), updated = now() where id = p_id;
  if not found then raise exception 'Project not found'; end if;
end
$$;

create function public.add_block(
  p_project text, p_kind text, p_title text, p_body text, p_data jsonb, p_position double precision
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_block public.blocks;
begin
  if not exists (select 1 from public.projects where id = p_project) then
    raise exception 'Project not found';
  end if;
  insert into public.blocks (project_id, kind, title, body, data, position)
  values (
    p_project, p_kind, left(coalesce(p_title, ''), 200), coalesce(p_body, ''), coalesce(p_data, '{}'::jsonb),
    coalesce(p_position, (select coalesce(max(position), 0) + 1 from public.blocks where project_id = p_project))
  )
  returning * into v_block;
  perform public.touch_project(p_project);
  return public.block_json(v_block);
end
$$;

-- Patch any of title / body / data / position. Absent keys are left alone.
create function public.update_block(p_id uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_block public.blocks;
begin
  update public.blocks set
    title = case when p_patch ? 'title' then left(p_patch ->> 'title', 200) else title end,
    body = case when p_patch ? 'body' then p_patch ->> 'body' else body end,
    data = case when p_patch ? 'data' then p_patch -> 'data' else data end,
    position = case when p_patch ? 'position' then (p_patch ->> 'position')::double precision else position end,
    updated = now()
  where id = p_id
  returning * into v_block;
  if not found then raise exception 'Block not found'; end if;
  perform public.touch_project(v_block.project_id);
  return public.block_json(v_block);
end
$$;

-- Deletes a text-only block. Blocks that own files go through the `delete` edge function.
create function public.delete_block(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_block public.blocks;
begin
  select * into v_block from public.blocks where id = p_id;
  if not found then return; end if;
  if v_block.kind = 'file' then raise exception 'File blocks are deleted via the delete function'; end if;
  delete from public.blocks where id = p_id;
  perform public.touch_project(v_block.project_id);
end
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.open_project(text),
  public.get_project(text),
  public.rename_project(text, text),
  public.add_block(text, text, text, text, jsonb, double precision),
  public.update_block(uuid, jsonb),
  public.delete_block(uuid)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: one public bucket; files live at <project_id>/<uuid>-<name>.
-- Anyone may upload (no auth by design); only the service role (edge function) deletes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files', 'project-files', true, 52428800,
  array['application/pdf', 'video/mp4', 'audio/mpeg', 'audio/mp3', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']
);

create policy "anon can upload project files" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'project-files');
