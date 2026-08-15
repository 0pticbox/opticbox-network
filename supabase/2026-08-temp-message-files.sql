-- 0PTICBOX Network — temporary direct-message file attachments
-- 2026-08-15
-- Run this file once in the Supabase SQL Editor.
-- Existing private videos remain compatible; new generic files expire after 24 hours.

alter table public.direct_messages
  add column if not exists message_type text not null default 'text';

alter table public.direct_messages
  add column if not exists media_path text not null default '';

alter table public.direct_messages
  add column if not exists media_type text not null default '';

alter table public.direct_messages
  add column if not exists media_name text not null default '';

alter table public.direct_messages
  add column if not exists media_size bigint not null default 0;

alter table public.direct_messages
  add column if not exists media_expires_at timestamptz;

alter table public.direct_messages
  drop constraint if exists direct_messages_message_type_check;

alter table public.direct_messages
  add constraint direct_messages_message_type_check
  check (message_type in ('text', 'video', 'file'));

alter table public.direct_messages
  drop constraint if exists direct_messages_body_check;

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
    and media_size between 0 and 52428800
    and (
      message_type <> 'file'
      or media_expires_at is not null
    )
  );

create index if not exists direct_messages_media_expiry_idx
  on public.direct_messages (media_expires_at)
  where media_expires_at is not null;

-- Keep the existing private bucket, but permit common creator/media file types.
-- Files are still capped at 50 MB and protected by storage RLS.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'message-media',
  'message-media',
  false,
  52428800,
  array[
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
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- A thread member may request a signed URL only while the referenced media
-- is still valid. Legacy videos with no expiry continue to work.
drop policy if exists "Conversation members can view message media" on storage.objects;
create policy "Conversation members can view message media"
on storage.objects for select
to authenticated
using (
  bucket_id = 'message-media'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1
    from public.direct_threads thread
    where thread.id = ((storage.foldername(name))[1])::uuid
      and auth.uid() in (thread.user_a, thread.user_b)
  )
  and exists (
    select 1
    from public.direct_messages message
    where message.media_path = storage.objects.name
      and (
        message.media_expires_at is null
        or message.media_expires_at > now()
      )
  )
);

-- Uploads continue to be isolated by thread + sender folder and are allowed
-- only while the friendship/conversation is valid.
drop policy if exists "Members can upload message media" on storage.objects;
create policy "Members can upload message media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'message-media'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.can_send_direct_message(((storage.foldername(name))[1])::uuid)
);

-- The sender can remove their own expired object. The browser client performs
-- opportunistic cleanup when that sender returns to Messages. Access itself is
-- blocked immediately at media_expires_at even if cleanup has not run yet.
drop policy if exists "Senders can delete message media" on storage.objects;
create policy "Senders can delete message media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'message-media'
  and (storage.foldername(name))[2] = auth.uid()::text
);

grant select, insert on public.direct_messages to authenticated;
notify pgrst, 'reload schema';
