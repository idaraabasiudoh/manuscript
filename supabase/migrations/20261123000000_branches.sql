-- Branches: alternative versions of a poetry, prose or drama block from a chosen point onward.
-- A branch stores only its own continuation (the "tail"); everything before the anchor is shared
-- with the block (Main) and always shows Main's current text.
--   anchor        drama: the id of the first script element the branch replaces;
--                 poetry/prose: the text of the first paragraph or stanza it replaces
--   anchor_index  where that piece was when the branch was made (fallback if the anchor is gone)
--   body          poetry/prose tail; script: drama tail as { cast, elements }

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects (id) on delete cascade,
  block_id uuid not null references public.blocks (id) on delete cascade,
  name text not null default 'New branch' check (length(name) between 1 and 80),
  color integer not null default 0,
  anchor text not null default '',
  anchor_index integer not null default 0,
  anchor_label text not null default '' check (length(anchor_label) <= 300),
  body text not null default '' check (length(body) <= 200000),
  script jsonb check (script is null or pg_column_size(script) <= 1000000),
  author uuid references auth.users (id) on delete set null,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index branches_block on public.branches (block_id, created);
alter table public.branches enable row level security;
revoke all on public.branches from anon, authenticated;

-- Comments can belong to a branch (null = Main).
alter table public.comments add column branch_id uuid references public.branches (id) on delete cascade;

create or replace function public.comment_json(c public.comments) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'blockId', c.block_id, 'branchId', c.branch_id, 'quote', c.quote, 'line', c.line, 'body', c.body,
    'resolved', c.resolved, 'created', c.created, 'mine', c.author = auth.uid(),
    'authorName', coalesce((select p.username from public.profiles p where p.id = c.author), 'Someone')
  )
$$;

create function public.add_branch_comment(p_block uuid, p_branch uuid, p_body text, p_quote text, p_line integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_comment jsonb;
begin
  if p_branch is not null and not exists (select 1 from public.branches where id = p_branch and block_id = p_block) then
    raise exception 'Branch not found';
  end if;
  v_comment := public.add_comment(p_block, p_body, p_quote, p_line);
  update public.comments set branch_id = p_branch where id = (v_comment ->> 'id')::uuid;
  return v_comment || jsonb_build_object('branchId', p_branch);
end
$$;

create function public.branch_json(b public.branches) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'blockId', b.block_id, 'name', b.name, 'color', b.color, 'anchor', b.anchor,
    'anchorIndex', b.anchor_index, 'anchorLabel', b.anchor_label, 'body', b.body, 'script', b.script,
    'created', b.created, 'updated', b.updated,
    'authorName', coalesce((select p.username from public.profiles p where p.id = b.author), 'Someone')
  )
$$;

create function public.list_branches(p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role(p_id, 'viewer');
  return coalesce((select jsonb_agg(public.branch_json(b) order by b.created) from public.branches b where b.project_id = p_id), '[]'::jsonb);
end
$$;

create function public.create_branch(
  p_block uuid, p_name text, p_anchor text, p_anchor_index integer, p_anchor_label text, p_body text, p_script jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project text;
  v_branch public.branches;
begin
  select project_id into v_project from public.blocks where id = p_block and kind in ('poetry', 'prose', 'drama');
  if v_project is null then raise exception 'Only poetry, prose and drama blocks can have branches'; end if;
  perform public.require_role(v_project, 'editor');
  insert into public.branches (project_id, block_id, name, color, anchor, anchor_index, anchor_label, body, script, author)
  values (
    v_project, p_block, left(coalesce(nullif(trim(p_name), ''), 'New branch'), 80),
    (select count(*) from public.branches where block_id = p_block),
    coalesce(p_anchor, ''), coalesce(p_anchor_index, 0), left(coalesce(p_anchor_label, ''), 300),
    coalesce(p_body, ''), p_script, auth.uid()
  )
  returning * into v_branch;
  perform public.touch_project(v_project);
  return public.branch_json(v_branch);
end
$$;

-- Patch any of name / body / script / anchor / anchor_index / anchor_label.
create function public.update_branch(p_id uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_branch public.branches;
begin
  select * into v_branch from public.branches where id = p_id;
  if not found then raise exception 'Branch not found'; end if;
  perform public.require_role(v_branch.project_id, 'editor');
  update public.branches set
    name = case when p_patch ? 'name' then left(coalesce(nullif(trim(p_patch ->> 'name'), ''), name), 80) else name end,
    body = case when p_patch ? 'body' then coalesce(p_patch ->> 'body', '') else body end,
    script = case when p_patch ? 'script' then p_patch -> 'script' else script end,
    anchor = case when p_patch ? 'anchor' then coalesce(p_patch ->> 'anchor', '') else anchor end,
    anchor_index = case when p_patch ? 'anchorIndex' then (p_patch ->> 'anchorIndex')::integer else anchor_index end,
    anchor_label = case when p_patch ? 'anchorLabel' then left(coalesce(p_patch ->> 'anchorLabel', ''), 300) else anchor_label end,
    updated = now()
  where id = p_id
  returning * into v_branch;
  perform public.touch_project(v_branch.project_id);
  return public.branch_json(v_branch);
end
$$;

create function public.delete_branch(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_project text;
begin
  select project_id into v_project from public.branches where id = p_id;
  if v_project is null then return; end if;
  perform public.require_role(v_project, 'editor');
  delete from public.branches where id = p_id;
  perform public.touch_project(v_project);
end
$$;

revoke execute on function public.branch_json(public.branches), public.list_branches(text),
  public.create_branch(uuid, text, text, integer, text, text, jsonb), public.update_branch(uuid, jsonb),
  public.delete_branch(uuid), public.add_branch_comment(uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.list_branches(text), public.create_branch(uuid, text, text, integer, text, text, jsonb),
  public.update_branch(uuid, jsonb), public.delete_branch(uuid), public.add_branch_comment(uuid, uuid, text, text, integer)
  to anon, authenticated;
