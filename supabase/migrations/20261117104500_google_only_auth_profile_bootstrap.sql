-- Allow Google-only OAuth onboarding while keeping age protected after initial setup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_username text;
  v_age_text text;
  v_age integer;
  v_constraint_name text;
  v_is_google boolean;
  v_base_username text;
begin
  v_is_google := lower(coalesce(new.raw_app_meta_data->>'provider', '')) = 'google';

  v_username := lower(btrim(coalesce(new.raw_user_meta_data->>'username', '')));
  if v_username !~ '^[a-z0-9_.]{3,30}$' then
    v_base_username := lower(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-z0-9_.]+', '', 'g'));
    v_base_username := left(v_base_username, 30);
    if length(v_base_username) < 3 then v_base_username := 'member'; end if;
    v_username := v_base_username;
  end if;

  v_age_text := coalesce(new.raw_user_meta_data->>'age', '');
  if v_age_text ~ '^[0-9]{1,3}$' then
    v_age := v_age_text::integer;
    if v_age < 18 or v_age > 120 then
      if v_is_google then v_age := null;
      else raise exception 'CLOSER requires members to be 18 or older.' using errcode = '23514';
      end if;
    end if;
  elsif v_is_google then
    v_age := null;
  else
    raise exception 'CLOSER requires members to be 18 or older.' using errcode = '23514';
  end if;

  begin
    insert into public.profiles (id, email, full_name, username, age, avatar_url)
    values (
      new.id, new.email,
      nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), ''),
      v_username, v_age,
      nullif(btrim(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')), '')
    ) on conflict (id) do nothing;
  exception when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name not in ('profiles_username_key', 'public_profiles_username_key') then raise; end if;
    v_username := left(v_username, 13) || '_' || substr(replace(new.id::text, '-', ''), 1, 16);
    insert into public.profiles (id, email, full_name, username, age, avatar_url)
    values (
      new.id, new.email,
      nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), ''),
      v_username, v_age,
      nullif(btrim(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')), '')
    ) on conflict (id) do nothing;
  end;
  return new;
end;
$function$;

create or replace function private.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() = old.id and not coalesce(private.is_admin(), false) then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at
       or new.verified is distinct from old.verified
       or new.status is distinct from old.status
       or new.restriction_reason is distinct from old.restriction_reason then
      raise exception 'Sensitive account fields can only be changed through authorized account or administrative flows.' using errcode = '42501';
    end if;

    if old.age is not null and new.age is distinct from old.age then
      raise exception 'Age can only be set once through the initial account setup.' using errcode = '42501';
    end if;

    if old.age is null and new.age is not null and (new.age < 18 or new.age > 120) then
      raise exception 'CLOSER requires members to be 18 or older.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;