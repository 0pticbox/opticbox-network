-- 0PTICBOX messaging upgrade: friends, video attachments, block cleanup, and RPC repair.
-- Run this entire file once in Supabase SQL Editor, then refresh the website.

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_different_users check (user_a <> user_b),
  constraint friendships_canonical_order check (user_a::text < user_b::text),
  constraint friendships_requester_is_member check (requested_by in (user_a, user_b)),
  constraint friendships_unique_pair unique (user_a, user_b)
);
create index if not exists friendships_user_a_idx on public.friendships (user_a, status, updated_at desc);
create index if not exists friendships_user_b_idx on public.friendships (user_b, status, updated_at desc);
alter table public.friendships enable row level security;
drop policy if exists "Members can read their friendships" on public.friendships;
create policy "Members can read their friendships" on public.friendships for select to authenticated using ((select auth.uid()) in (user_a, user_b));
grant select on public.friendships to authenticated;

create or replace function public.send_friend_request(p_other_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_a uuid; v_b uuid; v_id uuid; v_existing public.friendships%rowtype;
begin
  if v_me is null then raise exception 'Sign in required'; end if;
  if p_other_user is null or p_other_user = v_me then raise exception 'Choose another member'; end if;
  if not exists (select 1 from public.profiles where id = p_other_user) then raise exception 'Member not found'; end if;
  if exists (select 1 from public.blocked_users where (blocker_id=v_me and blocked_id=p_other_user) or (blocker_id=p_other_user and blocked_id=v_me)) then raise exception 'Friend request unavailable'; end if;
  if v_me::text < p_other_user::text then v_a:=v_me; v_b:=p_other_user; else v_a:=p_other_user; v_b:=v_me; end if;
  select * into v_existing from public.friendships where user_a=v_a and user_b=v_b;
  if found then
    if v_existing.status='accepted' then return v_existing.id; end if;
    if v_existing.status='pending' and v_existing.requested_by<>v_me then update public.friendships set status='accepted', updated_at=now() where id=v_existing.id returning id into v_id; return v_id; end if;
    update public.friendships set requested_by=v_me, status='pending', updated_at=now() where id=v_existing.id returning id into v_id; return v_id;
  end if;
  insert into public.friendships(user_a,user_b,requested_by) values(v_a,v_b,v_me) returning id into v_id; return v_id;
end $$;

create or replace function public.respond_friend_request(p_friendship uuid, p_accept boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_row public.friendships%rowtype;
begin
  if v_me is null then raise exception 'Sign in required'; end if;
  select * into v_row from public.friendships where id=p_friendship and v_me in (user_a,user_b) and status='pending';
  if not found then raise exception 'Friend request not found'; end if;
  if v_row.requested_by=v_me then raise exception 'Only the recipient can answer this request'; end if;
  update public.friendships set status=case when p_accept then 'accepted' else 'declined' end, updated_at=now() where id=p_friendship;
  return true;
end $$;

create or replace function public.remove_friend(p_other_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Sign in required'; end if;
  delete from public.friendships where (user_a=v_me and user_b=p_other_user) or (user_a=p_other_user and user_b=v_me);
  return true;
end $$;

revoke all on function public.send_friend_request(uuid) from public;
revoke all on function public.respond_friend_request(uuid,boolean) from public;
revoke all on function public.remove_friend(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid,boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;

alter table public.direct_messages add column if not exists media_path text not null default '';
alter table public.direct_messages add column if not exists media_type text not null default '';
alter table public.direct_messages add column if not exists media_name text not null default '';
alter table public.direct_messages add column if not exists media_size bigint not null default 0;
alter table public.direct_messages alter column body set default '';
alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages add constraint direct_messages_body_or_media_check check (
  char_length(body) <= 1000
  and (char_length(trim(body)) >= 1 or char_length(trim(media_path)) >= 1)
  and media_size between 0 and 52428800
);

create or replace function public.are_friends(p_one uuid, p_two uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.friendships where status='accepted' and ((user_a=p_one and user_b=p_two) or (user_a=p_two and user_b=p_one)));
$$;
revoke all on function public.are_friends(uuid,uuid) from public;
grant execute on function public.are_friends(uuid,uuid) to authenticated;

create or replace function public.start_direct_thread(p_other_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_a uuid; v_b uuid; v_thread uuid;
begin
  if v_me is null then raise exception 'Sign in required'; end if;
  if p_other_user is null or p_other_user=v_me then raise exception 'Choose another member'; end if;
  if not public.are_friends(v_me,p_other_user) then raise exception 'Only accepted friends can be messaged'; end if;
  if exists(select 1 from public.blocked_users where (blocker_id=v_me and blocked_id=p_other_user) or (blocker_id=p_other_user and blocked_id=v_me)) then raise exception 'Conversation unavailable'; end if;
  if v_me::text<p_other_user::text then v_a:=v_me; v_b:=p_other_user; else v_a:=p_other_user; v_b:=v_me; end if;
  select id into v_thread from public.direct_threads where user_a=v_a and user_b=v_b;
  if v_thread is null then insert into public.direct_threads(user_a,user_b) values(v_a,v_b) returning id into v_thread; end if;
  return v_thread;
end $$;

create or replace function public.can_send_direct_message(p_thread uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.direct_threads t
    where t.id=p_thread and auth.uid() in (t.user_a,t.user_b)
      and public.are_friends(t.user_a,t.user_b)
      and not exists(select 1 from public.blocked_users b where (b.blocker_id=t.user_a and b.blocked_id=t.user_b) or (b.blocker_id=t.user_b and b.blocked_id=t.user_a))
  );
$$;
revoke all on function public.start_direct_thread(uuid) from public;
revoke all on function public.can_send_direct_message(uuid) from public;
grant execute on function public.start_direct_thread(uuid) to authenticated;
grant execute on function public.can_send_direct_message(uuid) to authenticated;

-- Hide blocked or unfriended conversations at the database level.
drop policy if exists "Members can read their direct threads" on public.direct_threads;
create policy "Members can read their direct threads" on public.direct_threads for select to authenticated using (
  (select auth.uid()) in (user_a,user_b)
  and public.are_friends(user_a,user_b)
  and not exists(select 1 from public.blocked_users b where (b.blocker_id=user_a and b.blocked_id=user_b) or (b.blocker_id=user_b and b.blocked_id=user_a))
);
drop policy if exists "Members can read their direct messages" on public.direct_messages;
create policy "Members can read their direct messages" on public.direct_messages for select to authenticated using (
  exists(select 1 from public.direct_threads t where t.id=direct_messages.thread_id and (select auth.uid()) in (t.user_a,t.user_b)
    and public.are_friends(t.user_a,t.user_b)
    and not exists(select 1 from public.blocked_users b where (b.blocker_id=t.user_a and b.blocked_id=t.user_b) or (b.blocker_id=t.user_b and b.blocked_id=t.user_a)))
);

create or replace function public.cleanup_friendship_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships where (user_a=new.blocker_id and user_b=new.blocked_id) or (user_a=new.blocked_id and user_b=new.blocker_id);
  return new;
end $$;
drop trigger if exists on_member_block_cleanup on public.blocked_users;
create trigger on_member_block_cleanup after insert on public.blocked_users for each row execute procedure public.cleanup_friendship_on_block();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('message-media','message-media',false,52428800,array['video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Conversation members can view message media" on storage.objects;
create policy "Conversation members can view message media" on storage.objects for select to authenticated using (
  bucket_id='message-media'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and exists(select 1 from public.direct_threads t where t.id=((storage.foldername(name))[1])::uuid and auth.uid() in (t.user_a,t.user_b))
);
drop policy if exists "Members can upload message media" on storage.objects;
create policy "Members can upload message media" on storage.objects for insert to authenticated with check (
  bucket_id='message-media'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2]=auth.uid()::text
  and public.can_send_direct_message(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "Senders can delete message media" on storage.objects;
create policy "Senders can delete message media" on storage.objects for delete to authenticated using (
  bucket_id='message-media' and (storage.foldername(name))[2]=auth.uid()::text
);

grant select,insert on public.direct_messages to authenticated;
notify pgrst, 'reload schema';
