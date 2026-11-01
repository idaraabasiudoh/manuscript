-- Accounts and per-project access.
--
-- Every signed-up user gets a profile (username + email). Projects get an owner and a general access
-- level; owners can add people (existing accounts, by username or email) as viewers or editors.
-- Projects created before accounts existed have no owner and stay open to everyone with the link
-- (access 'edit') until they're assigned to an account, so nothing is lost or locked.

-- ---------------------------------------------------------------------------
-- Profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_][a-z0-9_.-]{2,23}$'),
  email text,
  created timestamptz not null default now()
);
create unique index profiles_username_lower on public.profiles (lower(username));
create index profiles_email_lower on public.profiles (lower(email));

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Ownership, general access, members, visits

alter table public.projects
  add column owner uuid references auth.users (id) on delete set null,
  add column access text not null default 'restricted' check (access in ('restricted', 'view', 'edit'));

-- Pre-account projects stay open (anyone with the link can edit) until claimed.
update public.projects set access = 'edit' where owner is null;

create table public.project_members (
  project_id text not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  created timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user on public.project_members (user_id);

create table public.project_visits (
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  opened timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table public.profiles enable row level security;
alter table public.project_members enable row level security;
alter table public.project_visits enable row level security;
revoke all on public.profiles, public.project_members, public.project_visits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access helpers

-- The caller's role on a project: 'owner' | 'editor' | 'viewer' | null (no access, or no such project).
create function public.project_role(p_id text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p.owner is not null and p.owner = auth.uid() then 'owner'
    when exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = auth.uid() and m.role = 'editor') then 'editor'
    when p.access = 'edit' then 'editor'
    when exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = auth.uid()) then 'viewer'
    when p.access = 'view' then 'viewer'
    else null
  end
  from public.projects p where p.id = p_id
$$;

create function public.require_role(p_id text, p_need text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text := public.project_role(p_id);
begin
  if v_role is null then raise exception 'You don''t have access to this project'; end if;
  if p_need = 'editor' and v_role not in ('owner', 'editor') then raise exception 'You can only view this project'; end if;
  if p_need = 'owner' and v_role <> 'owner' then raise exception 'Only the owner can do that'; end if;
end
$$;

-- project_json now also carries ownership and access details for the UI.
create or replace function public.project_json(p_id text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'created', p.created, 'updated', p.updated, 'access', p.access,
    'ownerName', (select pr.username from public.profiles pr where pr.id = p.owner),
    'claimed', p.owner is not null,
    'blocks', coalesce(
      (select jsonb_agg(public.block_json(b) order by b.position) from public.blocks b where b.project_id = p.id),
      '[]'::jsonb
    )
  )
  from public.projects p where p.id = p_id
$$;

-- ---------------------------------------------------------------------------
-- Project RPCs (replacing the open versions)

create or replace function public.open_project(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if p_id !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then raise exception 'Invalid project name'; end if;
  if p_id in ('settings', 'login', 'signup', 'auth', 'account', 'admin', 'api', 'new', 'home') then
    return jsonb_build_object('status', 'reserved');
  end if;

  if not exists (select 1 from public.projects where id = p_id) then
    if v_uid is null then return jsonb_build_object('status', 'sign-in-to-create'); end if;
    insert into public.projects (id, owner, access) values (p_id, v_uid, 'restricted') on conflict (id) do nothing;
    if found then
      insert into public.project_visits (user_id, project_id) values (v_uid, p_id);
      return public.project_json(p_id) || jsonb_build_object('status', 'ok', 'role', 'owner', 'isNew', true);
    end if;
  end if;

  v_role := public.project_role(p_id);
  if v_role is null then
    return jsonb_build_object('status', 'denied', 'signedIn', v_uid is not null);
  end if;
  if v_uid is not null then
    insert into public.project_visits (user_id, project_id) values (v_uid, p_id)
    on conflict (user_id, project_id) do update set opened = now();
  end if;
  return public.project_json(p_id) || jsonb_build_object('status', 'ok', 'role', v_role, 'isNew', false);
end
$$;

create or replace function public.get_project(p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text;
begin
  if not exists (select 1 from public.projects where id = p_id) then return null; end if;
  v_role := public.project_role(p_id);
  if v_role is null then return jsonb_build_object('status', 'denied', 'signedIn', auth.uid() is not null); end if;
  return public.project_json(p_id) || jsonb_build_object('status', 'ok', 'role', v_role);
end
$$;

create or replace function public.rename_project(p_id text, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_role(p_id, 'editor');
  update public.projects set title = left(coalesce(p_title, ''), 200), updated = now() where id = p_id;
end
$$;

create or replace function public.add_block(
  p_project text, p_kind text, p_title text, p_body text, p_data jsonb, p_position double precision
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_block public.blocks;
begin
  perform public.require_role(p_project, 'editor');
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

create or replace function public.update_block(p_id uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_block public.blocks;
  v_project text;
begin
  select project_id into v_project from public.blocks where id = p_id;
  if v_project is null then raise exception 'Block not found'; end if;
  perform public.require_role(v_project, 'editor');
  update public.blocks set
    title = case when p_patch ? 'title' then left(p_patch ->> 'title', 200) else title end,
    body = case when p_patch ? 'body' then p_patch ->> 'body' else body end,
    data = case when p_patch ? 'data' then p_patch -> 'data' else data end,
    position = case when p_patch ? 'position' then (p_patch ->> 'position')::double precision else position end,
    updated = now()
  where id = p_id
  returning * into v_block;
  perform public.touch_project(v_block.project_id);
  return public.block_json(v_block);
end
$$;

create or replace function public.delete_block(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_block public.blocks;
begin
  select * into v_block from public.blocks where id = p_id;
  if not found then return; end if;
  perform public.require_role(v_block.project_id, 'editor');
  if v_block.kind = 'file' then raise exception 'File blocks are deleted via the delete function'; end if;
  delete from public.blocks where id = p_id;
  perform public.touch_project(v_block.project_id);
end
$$;

-- ---------------------------------------------------------------------------
-- Sharing (owner only)

create function public.get_sharing(p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role(p_id, 'owner');
  return (
    select jsonb_build_object(
      'access', p.access,
      'owner', jsonb_build_object('username', o.username, 'email', o.email),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('userId', m.user_id, 'username', pr.username, 'email', pr.email, 'role', m.role) order by m.created)
        from public.project_members m join public.profiles pr on pr.id = m.user_id
        where m.project_id = p.id
      ), '[]'::jsonb)
    )
    from public.projects p left join public.profiles o on o.id = p.owner
    where p.id = p_id
  );
end
$$;

create function public.set_project_access(p_id text, p_access text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_role(p_id, 'owner');
  if p_access not in ('restricted', 'view', 'edit') then raise exception 'Unknown access level'; end if;
  update public.projects set access = p_access, updated = now() where id = p_id;
end
$$;

-- Add (or update) a person by username or email. They need an account already.
create function public.share_project(p_id text, p_identifier text, p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_who public.profiles;
  v_ident text := lower(trim(both from coalesce(p_identifier, '')));
begin
  perform public.require_role(p_id, 'owner');
  if p_role not in ('viewer', 'editor') then raise exception 'Unknown role'; end if;
  if v_ident = '' then raise exception 'Enter a username or email'; end if;
  select * into v_who from public.profiles
  where lower(username) = ltrim(v_ident, '@') or lower(email) = v_ident
  limit 1;
  if not found then raise exception 'No Manuscript account found for "%". They need to sign up first.', p_identifier; end if;
  if v_who.id = (select owner from public.projects where id = p_id) then raise exception 'That''s the owner of this project'; end if;
  insert into public.project_members (project_id, user_id, role) values (p_id, v_who.id, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
  update public.projects set updated = now() where id = p_id;
  return jsonb_build_object('userId', v_who.id, 'username', v_who.username, 'email', v_who.email, 'role', p_role);
end
$$;

create function public.set_member_role(p_id text, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_role(p_id, 'owner');
  if p_role not in ('viewer', 'editor') then raise exception 'Unknown role'; end if;
  update public.project_members set role = p_role where project_id = p_id and user_id = p_user;
end
$$;

create function public.remove_member(p_id text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_role(p_id, 'owner');
  delete from public.project_members where project_id = p_id and user_id = p_user;
end
$$;

-- ---------------------------------------------------------------------------
-- The signed-in user's profile and projects

create function public.get_my_profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then return null; end if;
  insert into public.profiles (id, email) values (v_uid, auth.jwt() ->> 'email') on conflict (id) do nothing;
  select * into v_profile from public.profiles where id = v_uid;
  return jsonb_build_object('id', v_profile.id, 'username', v_profile.username, 'email', v_profile.email);
end
$$;

create function public.set_username(p_username text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := lower(trim(both from coalesce(p_username, '')));
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if v_name !~ '^[a-z0-9_][a-z0-9_.-]{2,23}$' then
    raise exception 'Usernames are 3–24 characters: letters, numbers, dots, dashes and underscores';
  end if;
  if exists (select 1 from public.profiles where lower(username) = v_name and id <> v_uid) then
    raise exception 'That username is taken';
  end if;
  update public.profiles set username = v_name where id = v_uid;
  return public.get_my_profile();
end
$$;

-- Everything the user owns or was added to, most recently opened first.
create function public.list_my_projects() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.sort desc), '[]'::jsonb)
  from (
    select p.id, p.title, p.updated, p.access,
      case when p.owner = auth.uid() then 'owner' else m.role end as role,
      (select pr.username from public.profiles pr where pr.id = p.owner) as "ownerName",
      v.opened,
      (select count(*) from public.blocks b where b.project_id = p.id) as blocks,
      greatest(coalesce(v.opened, '-infinity'), p.updated) as sort
    from public.projects p
    left join public.project_members m on m.project_id = p.id and m.user_id = auth.uid()
    left join public.project_visits v on v.project_id = p.id and v.user_id = auth.uid()
    where auth.uid() is not null and (p.owner = auth.uid() or m.user_id is not null)
  ) t
$$;

-- ---------------------------------------------------------------------------
-- Grants

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.project_role(text),
  public.open_project(text),
  public.get_project(text),
  public.rename_project(text, text),
  public.add_block(text, text, text, text, jsonb, double precision),
  public.update_block(uuid, jsonb),
  public.delete_block(uuid),
  public.get_sharing(text),
  public.set_project_access(text, text),
  public.share_project(text, text, text),
  public.set_member_role(text, uuid, text),
  public.remove_member(text, uuid),
  public.get_my_profile(),
  public.set_username(text),
  public.list_my_projects()
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: only people who can edit a project may upload into its folder

drop policy "anon can upload project files" on storage.objects;
create policy "editors can upload project files" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'project-files' and public.project_role(split_part(name, '/', 1)) in ('owner', 'editor'));
