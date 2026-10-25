create extension if not exists pgcrypto with schema extensions;

create table if not exists public.teacher_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(user_id) on delete cascade,
  student_id text not null,
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  activation_code_hash text,
  activation_expires_at timestamptz,
  activated_at timestamptz,
  student_data jsonb not null default '{"at":[],"tasks":[],"cards":[],"activeTests":{},"ex":"","mins":60}'::jsonb,
  created_at timestamptz not null default now(),
  constraint student_profiles_id_format check (student_id = lower(student_id) and student_id ~ '^[a-z0-9_]{3,20}$'),
  constraint student_profiles_activation_hash check (activation_code_hash is null or activation_code_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists student_profiles_student_id_ci
  on public.student_profiles (lower(student_id));

create index if not exists student_profiles_teacher_id
  on public.student_profiles (teacher_id);

create table if not exists public.teacher_workspaces (
  teacher_id uuid primary key references public.teacher_profiles(user_id) on delete cascade,
  workspace_data jsonb not null default '{"q":[],"m":[],"a":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
  requested_name text;
begin
  requested_role := new.raw_user_meta_data ->> 'role';
  if requested_role = 'teacher' then
    requested_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
    if requested_name is null then
      raise exception 'Teacher display name is required';
    end if;
    insert into public.teacher_profiles (user_id, display_name)
      values (new.id, requested_name);
    insert into public.teacher_workspaces (teacher_id)
      values (new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_studysaathi on auth.users;
create trigger on_auth_user_created_studysaathi
  after insert on auth.users
  for each row execute function public.handle_new_teacher();

create or replace function public.create_student_invite(
  p_student_id text,
  p_display_name text,
  p_activation_code_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_teacher uuid := auth.uid();
  existing public.student_profiles%rowtype;
  result_id uuid;
begin
  if current_teacher is null or not exists (
    select 1 from public.teacher_profiles t where t.user_id = current_teacher
  ) then
    raise exception 'Teacher authentication required' using errcode = '42501';
  end if;
  if p_student_id is null or p_student_id !~ '^[a-zA-Z0-9_]{3,20}$'
    or p_display_name is null or length(trim(p_display_name)) not between 1 and 100
    or p_activation_code_hash is null or p_activation_code_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception 'Invalid student invitation';
  end if;

  select * into existing
    from public.student_profiles
    where lower(student_id) = lower(trim(p_student_id))
    for update;

  if found then
    if existing.teacher_id <> current_teacher or existing.auth_user_id is not null then
      raise exception 'Student ID is already assigned or activated' using errcode = '23505';
    end if;
    update public.student_profiles
      set display_name = trim(p_display_name),
          activation_code_hash = p_activation_code_hash,
          activation_expires_at = p_expires_at
      where id = existing.id
      returning id into result_id;
  else
    insert into public.student_profiles (
      teacher_id, student_id, display_name, activation_code_hash, activation_expires_at
    ) values (
      current_teacher, lower(trim(p_student_id)), trim(p_display_name),
      p_activation_code_hash, p_expires_at
    )
    returning id into result_id;
  end if;
  return result_id;
end;
$$;

create or replace function public.claim_student_activation(
  p_student_profile_id uuid,
  p_activation_code_hash text,
  p_auth_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_activation_code_hash is null or p_activation_code_hash !~ '^[0-9a-f]{64}$'
    or p_auth_user_id is null then
    return false;
  end if;
  update public.student_profiles
    set auth_user_id = p_auth_user_id,
        activation_code_hash = null,
        activation_expires_at = null,
        activated_at = now()
    where id = p_student_profile_id
      and auth_user_id is null
      and activation_code_hash = p_activation_code_hash
      and activation_expires_at > now()
      and exists (
        select 1 from auth.users u
        where u.id = p_auth_user_id
          and u.raw_app_meta_data ->> 'role' = 'student'
          and u.raw_app_meta_data ->> 'student_profile_id' = p_student_profile_id::text
      );
  return found;
end;
$$;

create or replace function public.get_student_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  student public.student_profiles%rowtype;
  workspace jsonb;
begin
  select * into student
    from public.student_profiles
    where auth_user_id = auth.uid();
  if not found then
    raise exception 'Student profile not found' using errcode = '42501';
  end if;
  select workspace_data into workspace
    from public.teacher_workspaces
    where teacher_id = student.teacher_id;
  workspace := coalesce(workspace, '{"q":[],"m":[],"a":[]}'::jsonb);
  return jsonb_build_object(
    'teacherName', (
      select display_name from public.teacher_profiles
      where user_id = student.teacher_id
    ),
    'q', coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(workspace -> 'q', '[]'::jsonb)) item
      where item -> 'students' @> jsonb_build_array(student.student_id)
    ), '[]'::jsonb),
    'm', coalesce(workspace -> 'm', '[]'::jsonb),
    'a', coalesce(workspace -> 'a', '[]'::jsonb)
  );
end;
$$;

create or replace function public.teacher_update_student_data(
  p_student_id text,
  p_student_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or jsonb_typeof(p_student_data) <> 'object'
    or pg_column_size(p_student_data) > 1048576 then
    raise exception 'Invalid student data' using errcode = '22023';
  end if;
  update public.student_profiles
    set student_data = p_student_data
    where teacher_id = auth.uid()
      and student_profiles.student_id = lower(trim(p_student_id));
  return found;
end;
$$;

alter table public.teacher_profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.teacher_workspaces enable row level security;

drop policy if exists teacher_profile_read_self on public.teacher_profiles;
create policy teacher_profile_read_self on public.teacher_profiles
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists student_profile_read_authorized on public.student_profiles;
create policy student_profile_read_authorized on public.student_profiles
  for select to authenticated using (
    auth_user_id = (select auth.uid())
    or teacher_id = (select auth.uid())
  );

drop policy if exists student_data_update_self on public.student_profiles;
create policy student_data_update_self on public.student_profiles
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

drop policy if exists teacher_workspace_read_self on public.teacher_workspaces;
create policy teacher_workspace_read_self on public.teacher_workspaces
  for select to authenticated using (teacher_id = (select auth.uid()));

drop policy if exists teacher_workspace_insert_self on public.teacher_workspaces;
create policy teacher_workspace_insert_self on public.teacher_workspaces
  for insert to authenticated with check (teacher_id = (select auth.uid()));

drop policy if exists teacher_workspace_update_self on public.teacher_workspaces;
create policy teacher_workspace_update_self on public.teacher_workspaces
  for update to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));

revoke all on public.teacher_profiles from anon, authenticated;
revoke all on public.student_profiles from anon, authenticated;
revoke all on public.teacher_workspaces from anon, authenticated;
grant select (user_id, display_name) on public.teacher_profiles to authenticated;
grant select (student_id, display_name, teacher_id, auth_user_id, student_data)
  on public.student_profiles to authenticated;
grant update (student_data) on public.student_profiles to authenticated;
grant select, insert, update on public.teacher_workspaces to authenticated;

revoke all on function public.create_student_invite(text, text, text, timestamptz) from public, anon;
grant execute on function public.create_student_invite(text, text, text, timestamptz) to authenticated;
revoke all on function public.claim_student_activation(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_student_activation(uuid, text, uuid) to service_role;
revoke all on function public.get_student_workspace() from public, anon;
grant execute on function public.get_student_workspace() to authenticated;
revoke all on function public.teacher_update_student_data(text, jsonb) from public, anon;
grant execute on function public.teacher_update_student_data(text, jsonb) to authenticated;
