-- 0PTICBOX Network — account deletion + basic community language safety
-- 2026-08-16
-- Run once in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- 1) Self-service account deletion
-- ---------------------------------------------------------------------------
-- Normal members may delete only their own Auth account. Deleting auth.users
-- cascades through public.profiles and the profile-owned network tables.
-- Site admins are deliberately protected from accidental deletion here.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid := auth.uid();
begin
  if target_user is null then
    raise exception 'You must be signed in to delete an account.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.site_admins
    where user_id = target_user
  ) then
    raise exception 'Owner/admin accounts cannot be deleted from this screen.' using errcode = '42501';
  end if;

  -- Older CMS posts use author_id -> auth.users ON DELETE SET NULL, so remove
  -- the member's own rows explicitly instead of leaving anonymous remnants.
  delete from public.community_posts
  where author_id = target_user;

  delete from auth.users
  where id = target_user;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Basic hate/slur language filter
-- ---------------------------------------------------------------------------
-- This is intentionally a small, high-confidence starter list. It is not meant
-- to police ordinary profanity. Add/remove terms in this table as moderation
-- needs evolve without changing the website code.

create table if not exists public.moderation_blocked_terms (
  term text primary key,
  category text not null default 'hate',
  created_at timestamptz not null default now(),
  check (char_length(term) between 2 and 80)
);

alter table public.moderation_blocked_terms enable row level security;

insert into public.moderation_blocked_terms (term, category)
values
  ('nigger', 'racial'),
  ('nigga', 'racial'),
  ('faggot', 'homophobic'),
  ('fag', 'homophobic'),
  ('kike', 'racial'),
  ('chink', 'racial'),
  ('spic', 'racial'),
  ('wetback', 'racial'),
  ('tranny', 'transphobic'),
  ('retard', 'ableist')
on conflict (term) do nothing;

create or replace function public.has_blocked_language(input_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select
      trim(regexp_replace(
        translate(lower(coalesce(input_text, '')), '013457@$', 'oieastas'),
        '[^a-z0-9]+',
        ' ',
        'g'
      )) as spaced
  )
  select exists (
    select 1
    from public.moderation_blocked_terms b
    cross join normalized n
    where
      n.spaced ~ ('(^| )' || b.term || '( |$)')
      or (
        char_length(b.term) >= 5
        and replace(n.spaced, ' ', '') like '%' || replace(b.term, ' ', '') || '%'
      )
  );
$$;

revoke all on function public.has_blocked_language(text) from public;
grant execute on function public.has_blocked_language(text) to authenticated;

create or replace function public.enforce_activity_post_language()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.has_blocked_language(concat_ws(' ', new.title, new.subtitle, new.caption, new.city)) then
    raise exception 'Community safety filter blocked this post.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_activity_comment_language()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.has_blocked_language(new.body) then
    raise exception 'Community safety filter blocked this comment.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_activity_post_language() from public;
revoke all on function public.enforce_activity_comment_language() from public;

-- Install triggers only when the corresponding network tables already exist.
do $$
begin
  if to_regclass('public.activity_posts') is not null then
    execute 'drop trigger if exists activity_posts_language_filter on public.activity_posts';
    execute 'create trigger activity_posts_language_filter before insert or update of title, subtitle, caption, city on public.activity_posts for each row execute function public.enforce_activity_post_language()';
  end if;

  if to_regclass('public.activity_post_comments') is not null then
    execute 'drop trigger if exists activity_comments_language_filter on public.activity_post_comments';
    execute 'create trigger activity_comments_language_filter before insert or update of body on public.activity_post_comments for each row execute function public.enforce_activity_comment_language()';
  end if;
end
$$;

notify pgrst, 'reload schema';
