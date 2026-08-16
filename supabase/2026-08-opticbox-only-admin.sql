-- 0PTICBOX Network — make the existing owner login the sole 0PTICBOX account
-- 2026-08-16
-- Safe to rerun after the earlier version failed.
--
-- This keeps the existing Auth email/password. If there is exactly one current
-- site_admins row, that Auth user becomes the canonical 0PTICBOX member profile.

begin;

do $$
declare
  opticbox_user uuid;
  admin_count integer;
begin
  -- First choice: an already-existing 0PTICBOX profile that is also an admin.
  select p.id
    into opticbox_user
  from public.profiles p
  join public.site_admins a on a.user_id = p.id
  where lower(btrim(coalesce(p.profile_handle, ''))) = '0pticbox'
     or lower(btrim(coalesce(p.display_name, ''))) = '0pticbox'
  order by p.created_at asc
  limit 1;

  -- Normal upgrade path: the site already has one owner/admin Auth account.
  -- Reuse that exact login rather than requiring a separate 0PTICBOX profile.
  if opticbox_user is null then
    select count(*)::integer into admin_count from public.site_admins;

    if admin_count = 1 then
      select user_id into opticbox_user from public.site_admins limit 1;
    elsif admin_count > 1 then
      raise exception 'More than one current admin account exists. No account was changed because the owner is ambiguous.';
    end if;
  end if;

  -- Compatibility fallback for installs where the admin row was lost but the
  -- visible 0PTICBOX member profile already exists.
  if opticbox_user is null then
    select p.id
      into opticbox_user
    from public.profiles p
    where lower(btrim(coalesce(p.profile_handle, ''))) = '0pticbox'
       or lower(btrim(coalesce(p.display_name, ''))) = '0pticbox'
    order by p.created_at asc
    limit 1;
  end if;

  if opticbox_user is null then
    raise exception 'No owner could be identified. Expected either one existing site_admins row or an existing 0PTICBOX profile.';
  end if;

  -- Make sure the owner Auth account has a normal member profile. This preserves
  -- the login itself and all credentials; it only creates the public profile row
  -- if that row was missing.
  insert into public.profiles (id, display_name)
  values (opticbox_user, '0PTICBOX')
  on conflict (id) do nothing;

  -- Free the reserved handle from any accidental duplicate profile first.
  update public.profiles
  set profile_handle = '',
      updated_at = now()
  where id <> opticbox_user
    and lower(btrim(coalesce(profile_handle, ''))) = '0pticbox';

  -- The existing owner login is now the visible 0PTICBOX member account.
  update public.profiles
  set display_name = '0PTICBOX',
      profile_handle = '0pticbox',
      updated_at = now()
  where id = opticbox_user;

  -- Keep auth metadata aligned so any fallback UI also calls this account
  -- 0PTICBOX. Email, password, providers, and other credentials are untouched.
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('display_name', '0PTICBOX')
  where id = opticbox_user;

  -- Exactly one admin identity: the same user as the 0PTICBOX profile.
  delete from public.site_admins
  where user_id <> opticbox_user;

  insert into public.site_admins (user_id)
  values (opticbox_user)
  on conflict (user_id) do nothing;
end
$$;

-- Reserve @0pticbox for the sole owner account so another member cannot claim it.
create or replace function public.enforce_opticbox_owner_handle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(btrim(coalesce(new.profile_handle, ''))) = '0pticbox'
     and not exists (
       select 1 from public.site_admins a where a.user_id = new.id
     ) then
    raise exception 'The 0pticbox handle is reserved.' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.site_admins a where a.user_id = new.id
  ) then
    new.profile_handle := '0pticbox';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_opticbox_owner_handle() from public;

drop trigger if exists profiles_reserve_opticbox_handle on public.profiles;
create trigger profiles_reserve_opticbox_handle
before insert or update of profile_handle on public.profiles
for each row execute function public.enforce_opticbox_owner_handle();

notify pgrst, 'reload schema';

commit;
