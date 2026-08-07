-- 0PTICBOX Network v27 — artist social audience total
-- Safe to run more than once in Supabase SQL Editor.

begin;

alter table public.profiles add column if not exists instagram_followers bigint;
alter table public.profiles add column if not exists youtube_subscribers bigint;

alter table public.profiles drop constraint if exists profiles_instagram_followers_check;
alter table public.profiles add constraint profiles_instagram_followers_check
  check (instagram_followers is null or (instagram_followers >= 0 and instagram_followers <= 1000000000000));

alter table public.profiles drop constraint if exists profiles_youtube_subscribers_check;
alter table public.profiles add constraint profiles_youtube_subscribers_check
  check (youtube_subscribers is null or (youtube_subscribers >= 0 and youtube_subscribers <= 1000000000000));

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

notify pgrst, 'reload schema';

commit;
