-- 0PTICBOX Network v24: complete member profile migration
-- Safe to run more than once in the Supabase SQL Editor.
-- Includes the v23 wallpaper/profile compatibility fix plus the v24 shared
-- profile layout, featured item, Instagram embeds, and YouTube embeds.

begin;

-- profile-images bucket compatible with avatars and animated wallpapers.


alter table public.profiles add column if not exists background_url text not null default '';
alter table public.profiles add column if not exists background_dim smallint not null default 62;
alter table public.profiles add column if not exists accent_color text not null default '#ff6b36';
alter table public.profiles add column if not exists profile_tagline text not null default '';
alter table public.profiles add column if not exists instagram_url text not null default '';
alter table public.profiles add column if not exists youtube_url text not null default '';
alter table public.profiles add column if not exists profile_handle text not null default '';
alter table public.profiles add column if not exists genre text not null default '';
alter table public.profiles add column if not exists occupation text not null default '';
alter table public.profiles add column if not exists here_for text not null default '';
alter table public.profiles add column if not exists interests text not null default '';
alter table public.profiles add column if not exists website_url text not null default '';
alter table public.profiles add column if not exists soundcloud_url text not null default '';
alter table public.profiles add column if not exists github_url text not null default '';
alter table public.profiles add column if not exists contact_email text not null default '';
alter table public.profiles add column if not exists background_mode text not null default 'cover';

alter table public.profiles drop constraint if exists profiles_background_dim_check;
alter table public.profiles add constraint profiles_background_dim_check check (background_dim between 20 and 90);
alter table public.profiles drop constraint if exists profiles_accent_color_check;
alter table public.profiles add constraint profiles_accent_color_check check (accent_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.profiles drop constraint if exists profiles_profile_tagline_check;
alter table public.profiles add constraint profiles_profile_tagline_check check (char_length(profile_tagline) <= 120);
alter table public.profiles drop constraint if exists profiles_instagram_url_check;
alter table public.profiles add constraint profiles_instagram_url_check check (char_length(instagram_url) <= 2048);
alter table public.profiles drop constraint if exists profiles_youtube_url_check;
alter table public.profiles add constraint profiles_youtube_url_check check (char_length(youtube_url) <= 2048);
alter table public.profiles drop constraint if exists profiles_profile_handle_check;
alter table public.profiles add constraint profiles_profile_handle_check check (char_length(profile_handle) <= 32);
alter table public.profiles drop constraint if exists profiles_genre_check;
alter table public.profiles add constraint profiles_genre_check check (char_length(genre) <= 100);
alter table public.profiles drop constraint if exists profiles_occupation_check;
alter table public.profiles add constraint profiles_occupation_check check (char_length(occupation) <= 120);
alter table public.profiles drop constraint if exists profiles_here_for_check;
alter table public.profiles add constraint profiles_here_for_check check (char_length(here_for) <= 180);
alter table public.profiles drop constraint if exists profiles_interests_check;
alter table public.profiles add constraint profiles_interests_check check (char_length(interests) <= 600);
alter table public.profiles drop constraint if exists profiles_website_url_check;
alter table public.profiles add constraint profiles_website_url_check check (char_length(website_url) <= 2048);
alter table public.profiles drop constraint if exists profiles_soundcloud_url_check;
alter table public.profiles add constraint profiles_soundcloud_url_check check (char_length(soundcloud_url) <= 2048);
alter table public.profiles drop constraint if exists profiles_github_url_check;
alter table public.profiles add constraint profiles_github_url_check check (char_length(github_url) <= 2048);
alter table public.profiles drop constraint if exists profiles_contact_email_check;
alter table public.profiles add constraint profiles_contact_email_check check (char_length(contact_email) <= 254);
alter table public.profiles drop constraint if exists profiles_background_mode_check;
alter table public.profiles add constraint profiles_background_mode_check check (background_mode in ('cover','contain','tile'));

alter table public.profiles enable row level security;

drop policy if exists "Public can read member display names" on public.profiles;
create policy "Public can read member display names"
on public.profiles for select to anon, authenticated using (true);

drop policy if exists "Members can create their own profile" on public.profiles;
create policy "Members can create their own profile"
on public.profiles for insert to authenticated
with check (id = (select auth.uid()));

drop policy if exists "Members can update their own profile" on public.profiles;
create policy "Members can update their own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 8388608, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
set public = true,
    file_size_limit = 8388608,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view profile pictures" on storage.objects;
create policy "Public can view profile pictures"
on storage.objects for select to public
using (bucket_id = 'profile-images');

drop policy if exists "Members can upload their profile picture" on storage.objects;
create policy "Members can upload their profile picture"
on storage.objects for insert to authenticated
with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Members can update their profile picture" on storage.objects;
create policy "Members can update their profile picture"
on storage.objects for update to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Members can delete their profile picture" on storage.objects;
create policy "Members can delete their profile picture"
on storage.objects for delete to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

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
