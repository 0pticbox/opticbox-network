-- 0PTICBOX Network v19: full member profile layout + wallpaper modes
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

notify pgrst, 'reload schema';
