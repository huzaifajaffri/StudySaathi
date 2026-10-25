alter table public.teacher_profiles
  add column if not exists username text;

alter table public.teacher_profiles
  drop constraint if exists teacher_profiles_username_format;

alter table public.teacher_profiles
  add constraint teacher_profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

create unique index if not exists teacher_profiles_username_ci
  on public.teacher_profiles (lower(username))
  where username is not null;

create or replace function public.handle_new_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
  requested_name text;
  requested_username text;
begin
  requested_role := new.raw_app_meta_data ->> 'role';
  if requested_role = 'teacher' then
    requested_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
    requested_username := lower(nullif(trim(new.raw_user_meta_data ->> 'username'), ''));
    if requested_name is null then
      raise exception 'Teacher display name is required';
    end if;
    if requested_username is null or requested_username !~ '^[a-z0-9_]{3,20}$' then
      raise exception 'A valid teacher username is required';
    end if;
    insert into public.teacher_profiles (user_id, display_name, username)
      values (new.id, requested_name, requested_username);
    insert into public.teacher_workspaces (teacher_id)
      values (new.id);
  end if;
  return new;
end;
$$;
