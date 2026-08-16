-- 0PTICBOX Network — make the existing 0PTICBOX member account the sole admin
-- 2026-08-16
-- Run in Supabase SQL Editor after the network cleanup migrations.

begin;

do $$
declare
  opticbox_user uuid;
begin
  -- Prefer the real @0pticbox profile handle. Fall back to the oldest profile
  -- whose display name is 0PTICBOX only for older databases that predate handles.
  select p.id
    into opticbox_user
  from public.profiles p
  where lower(btrim(coalesce(p.profile_handle, ''))) = '0pticbox'
  order by p.created_at asc
  limit 1;

  if opticbox_user is null then
    select p.id
      into opticbox_user
    from public.profiles p
    where lower(btrim(coalesce(p.display_name, ''))) = '0pticbox'
    order by p.created_at asc
    limit 1;
  end if;

  if opticbox_user is null then
    raise exception 'No existing 0PTICBOX profile was found. Sign into the 0PTICBOX account and make sure its profile exists before running this migration.';
  end if;

  -- The canonical owner keeps the reserved handle. Any accidental duplicate is
  -- cleared before the reservation trigger is installed.
  update public.profiles
  set profile_handle = ''
  where id <> opticbox_user
    and lower(btrim(coalesce(profile_handle, ''))) = '0pticbox';

  update public.profiles
  set profile_handle = '0pticbox',
      updated_at = now()
  where id = opticbox_user;

  -- One member identity, one admin identity.
  delete from public.site_admins
  where user_id <> opticbox_user;

  insert into public.site_admins (user_id)
  values (opticbox_user)
  on conflict (user_id) do nothing;
end
$$;

-- Reserve @0pticbox for the sole admin account so another member cannot claim it.
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
