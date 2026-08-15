-- 0PTICBOX Network — remove the database-side upper size cap for message media
-- 2026-08-15
-- Run once in Supabase SQL Editor.
-- The Messages frontend already has no video-size cap.
-- ZIP files remain capped at 100 MB by the browser UI.
-- Supabase Storage's global/bucket limits still apply.

alter table public.direct_messages
  drop constraint if exists direct_messages_body_or_media_check;

alter table public.direct_messages
  add constraint direct_messages_body_or_media_check
  check (
    char_length(body) <= 1000
    and (
      char_length(trim(body)) >= 1
      or char_length(trim(media_path)) >= 1
    )
    and media_size >= 0
  );

notify pgrst, 'reload schema';
