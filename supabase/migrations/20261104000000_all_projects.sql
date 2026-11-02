-- All projects: list_my_projects also returns projects the user opened through a share link
-- (and can still open), with where each one came from. "projects" becomes a reserved name for the page.

create or replace function public.open_project(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if p_id !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then raise exception 'Invalid project name'; end if;
  if p_id in ('settings', 'login', 'signup', 'auth', 'account', 'admin', 'api', 'new', 'home', 'projects') then
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

-- Everything the user owns, was added to, or opened with a link, most recently opened first.
-- source: 'owned' | 'shared' (added by name or email) | 'opened' (visited through a link).
create or replace function public.list_my_projects() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb - 'sort' order by t.sort desc), '[]'::jsonb)
  from (
    select p.id, p.title, p.updated, p.access,
      public.project_role(p.id) as role,
      case when p.owner = auth.uid() then 'owned' when m.user_id is not null then 'shared' else 'opened' end as source,
      (select pr.username from public.profiles pr where pr.id = p.owner) as "ownerName",
      v.opened,
      (select count(*) from public.blocks b where b.project_id = p.id) as blocks,
      greatest(coalesce(v.opened, '-infinity'), case when p.owner = auth.uid() then p.updated else '-infinity' end) as sort
    from public.projects p
    left join public.project_members m on m.project_id = p.id and m.user_id = auth.uid()
    left join public.project_visits v on v.project_id = p.id and v.user_id = auth.uid()
    where auth.uid() is not null
      and (p.owner = auth.uid() or m.user_id is not null or v.user_id is not null)
      and public.project_role(p.id) is not null
  ) t
$$;
