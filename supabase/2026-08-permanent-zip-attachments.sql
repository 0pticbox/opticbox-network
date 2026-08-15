-- 0PTICBOX Network — permanent ZIP attachments for private messages
-- 2026-08-15
-- Run this once in Supabase SQL Editor after the temporary-file migration.
-- Keeps legacy video behavior, removes the expiry requirement for generic files,
-- and raises private message-media storage to 100 MB.

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
    and media_size between 0 and 104857600
  );

-- Keep message_type='file' enabled. ZIP files use this existing generic type.
alter table public.direct_messages
  drop constraint if exists direct_messages_message_type_check;

alter table public.direct_messages
  add constraint direct_messages_message_type_check
  check (message_type in ('text', 'video', 'file'));

-- Raise the existing private message-media bucket to 100 MB.
-- Keep the broader MIME list from the earlier migration so existing video/media
-- uploads remain compatible, while the Messages UI currently exposes ZIP only.
update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = array[
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
      'audio/vnd.wave',
      'audio/aiff',
      'audio/x-aiff',
      'audio/mpeg',
      'audio/mp4',
      'audio/aac',
      'audio/flac',
      'audio/ogg',
      'audio/x-caf',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'text/plain'
    ]::text[]
where id = 'message-media';

-- Preserve the private signed-URL policy. A permanent ZIP has media_expires_at
-- NULL, so the existing policy already allows it while keeping the bucket private.
notify pgrst, 'reload schema';
