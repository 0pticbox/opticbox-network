-- 0PTICBOX Network v24: equal member profiles + social embeds
-- Safe to run more than once in the Supabase SQL Editor.
-- Adds the fields used by the shared 0PTICBOX/member profile template.

begin;

alter table public.profiles add column if not exists meet_people text not null default '';
alter table public.profiles add column if not exists instagram_embeds text not null default '';
alter table public.profiles add column if not exists youtube_embeds text not null default '';
alter table public.profiles add column if not exists featured_title text not null default '';
alter table public.profiles add column if not exists featured_kicker text not null default '';
alter table public.profiles add column if not exists featured_description text not null default '';
alter table public.profiles add column if not exists featured_url text not null default '';

alter table public.profiles drop constraint if exists profiles_meet_people_check;
alter table public.profiles add constraint profiles_meet_people_check check (char_length(meet_people) <= 1200);
alter table public.profiles drop constraint if exists profiles_instagram_embeds_check;
alter table public.profiles add constraint profiles_instagram_embeds_check check (char_length(instagram_embeds) <= 6500);
alter table public.profiles drop constraint if exists profiles_youtube_embeds_check;
alter table public.profiles add constraint profiles_youtube_embeds_check check (char_length(youtube_embeds) <= 6500);
alter table public.profiles drop constraint if exists profiles_featured_title_check;
alter table public.profiles add constraint profiles_featured_title_check check (char_length(featured_title) <= 80);
alter table public.profiles drop constraint if exists profiles_featured_kicker_check;
alter table public.profiles add constraint profiles_featured_kicker_check check (char_length(featured_kicker) <= 120);
alter table public.profiles drop constraint if exists profiles_featured_description_check;
alter table public.profiles add constraint profiles_featured_description_check check (char_length(featured_description) <= 400);
alter table public.profiles drop constraint if exists profiles_featured_url_check;
alter table public.profiles add constraint profiles_featured_url_check check (char_length(featured_url) <= 2048);

-- Preserve the current 0PTICBOX profile content while moving it onto the exact
-- same member template. Existing custom values are never overwritten.
update public.profiles
set
  instagram_url = case when btrim(coalesce(instagram_url,'')) = '' then 'https://www.instagram.com/0pticbox/' else instagram_url end,
  instagram_embeds = case when btrim(coalesce(instagram_embeds,'')) = '' then 'https://www.instagram.com/p/CIQsKb5loyL/' else instagram_embeds end,
  youtube_url = case when btrim(coalesce(youtube_url,'')) = '' then 'https://www.youtube.com/playlist?list=PLey2Gllwi6MQN1PMlx25zVkTHuVnQKVxR' else youtube_url end,
  youtube_embeds = case when btrim(coalesce(youtube_embeds,'')) = '' then E'https://www.youtube.com/playlist?list=PLey2Gllwi6MQN1PMlx25zVkTHuVnQKVxR\nhttps://www.youtube.com/playlist?list=PLey2Gllwi6MQF7k3X_ptILi6WKp6DJCdH\nhttps://www.youtube.com/watch?v=x3szoFCz8SM&t=972s' else youtube_embeds end,
  meet_people = case when btrim(coalesce(meet_people,'')) = '' then E'Zedd | Anton Zaslavski\nLSDREAM | Sami Diament\nCloZee | Chloé Herry\nChampagne Drip | Samuel “Sam” Pool\nGRiZ | Grant Richard Kwiecinski\nLiquid Stranger | Martin Johan Stääf' else meet_people end,
  featured_title = case when btrim(coalesce(featured_title,'')) = '' then '0PTICSCOPE' else featured_title end,
  featured_kicker = case when btrim(coalesce(featured_kicker,'')) = '' then 'Oscilloscope art lab' else featured_kicker end,
  featured_description = case when btrim(coalesce(featured_description,'')) = '' then 'Turn audio, images, and generated signals into live motion. The full visualizer opens when you launch it.' else featured_description end,
  featured_url = case when btrim(coalesce(featured_url,'')) = '' then 'apps/opticscope/index.html' else featured_url end,
  updated_at = now()
where lower(btrim(coalesce(profile_handle,''))) = '0pticbox'
   or lower(btrim(coalesce(display_name,''))) = '0pticbox';

notify pgrst, 'reload schema';

commit;
