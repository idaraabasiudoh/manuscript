-- Comments on blocks, optionally anchored to a passage (the quoted text and the line it starts on).
-- Anyone who can view a project and is signed in can comment; authors and the owner can delete;
-- editors and the owner can resolve.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects (id) on delete cascade,
  block_id uuid not null references public.blocks (id) on delete cascade,
  author uuid references auth.users (id) on delete set null,
  quote text not null default '' check (length(quote) <= 2000),
  line integer,
  body text not null check (length(body) between 1 and 5000),
  resolved boolean not null default false,
  created timestamptz not null default now()
);
create index comments_project on public.comments (project_id, created);

alter table public.comments enable row level security;
revoke all on public.comments from anon, authenticated;

create function public.comment_json(c public.comments) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'blockId', c.block_id, 'quote', c.quote, 'line', c.line, 'body', c.body,
    'resolved', c.resolved, 'created', c.created, 'mine', c.author = auth.uid(),
    'authorName', coalesce((select p.username from public.profiles p where p.id = c.author), 'Someone')
  )
$$;

create function public.list_comments(p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role(p_id, 'viewer');
  return coalesce((select jsonb_agg(public.comment_json(c) order by c.created) from public.comments c where c.project_id = p_id), '[]'::jsonb);
end
$$;

create function public.add_comment(p_block uuid, p_body text, p_quote text, p_line integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project text;
  v_comment public.comments;
begin
  if auth.uid() is null then raise exception 'Sign in to comment'; end if;
  select project_id into v_project from public.blocks where id = p_block;
  if v_project is null then raise exception 'Block not found'; end if;
  perform public.require_role(v_project, 'viewer');
  if coalesce(trim(p_body), '') = '' then raise exception 'Write a comment first'; end if;
  insert into public.comments (project_id, block_id, author, quote, line, body)
  values (v_project, p_block, auth.uid(), left(coalesce(p_quote, ''), 2000), p_line, left(trim(p_body), 5000))
  returning * into v_comment;
  return public.comment_json(v_comment);
end
$$;

create function public.resolve_comment(p_id uuid, p_resolved boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_project text;
begin
  select project_id into v_project from public.comments where id = p_id;
  if v_project is null then raise exception 'Comment not found'; end if;
  perform public.require_role(v_project, 'editor');
  update public.comments set resolved = coalesce(p_resolved, true) where id = p_id;
end
$$;

create function public.delete_comment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_comment public.comments;
begin
  select * into v_comment from public.comments where id = p_id;
  if not found then return; end if;
  if v_comment.author is distinct from auth.uid() then perform public.require_role(v_comment.project_id, 'owner'); end if;
  delete from public.comments where id = p_id;
end
$$;

revoke execute on function public.comment_json(public.comments), public.list_comments(text),
  public.add_comment(uuid, text, text, integer), public.resolve_comment(uuid, boolean), public.delete_comment(uuid)
  from public, anon, authenticated;
grant execute on function public.list_comments(text), public.add_comment(uuid, text, text, integer),
  public.resolve_comment(uuid, boolean), public.delete_comment(uuid)
  to anon, authenticated;
