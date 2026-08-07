-- 0PTICBOX Network v28
-- Fix Total Followers showing a dash for the existing 0PTICBOX profile.
-- Safe to run more than once.

alter table public.profiles add column if not exists instagram_followers bigint;
alter table public.profiles add column if not exists youtube_subscribers bigint;

alter table public.profiles drop constraint if exists profiles_instagram_followers_check;
alter table public.profiles add constraint profiles_instagram_followers_check
  check (instagram_followers is null or (instagram_followers >= 0 and instagram_followers <= 1000000000000));

alter table public.profiles drop constraint if exists profiles_youtube_subscribers_check;
alter table public.profiles add constraint profiles_youtube_subscribers_check
  check (youtube_subscribers is null or (youtube_subscribers >= 0 and youtube_subscribers <= 1000000000000));

-- The original 0PTICBOX profile already contained this public Instagram snapshot:
-- 957 followers, captured Aug 5, 2026. Backfill it only when no newer number exists.
update public.profiles
set instagram_followers = 957,
    updated_at = coalesce(updated_at, now())
where lower(coalesce(profile_handle, '')) = '0pticbox'
  and instagram_followers is null;

notify pgrst, 'reload schema';
