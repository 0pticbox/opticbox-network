-- 0PTICBOX Network v23: member profile + wallpaper compatibility fix
-- Safe to run more than once in the Supabase SQL Editor.
-- This makes every field used by profile-settings.js available and keeps the
-- profile-images bucket compatible with avatars and animated wallpapers.

begin;

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

notify pgrst, 'reload schema';

commit;
