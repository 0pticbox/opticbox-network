import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isSupabaseConfigured } from './supabase-config.js';

const $ = (id) => document.getElementById(id);
const warning = $('messages-config-warning');
const signedOut = $('messages-signed-out');
const app = $('messages-app');
const search = $('messages-member-search');
const searchResults = $('messages-member-results');
const friendList = $('messages-friend-list');
const incomingRequests = $('messages-incoming-requests');
const outgoingRequests = $('messages-outgoing-requests');
const threadList = $('messages-thread-list');
const threadCount = $('messages-thread-count');
const empty = $('messages-empty-state');
const active = $('messages-conversation-active');
const profileLink = $('messages-conversation-profile');
const avatar = $('messages-conversation-avatar');
const nameEl = $('messages-conversation-name');
const statusEl = $('messages-conversation-status');
const blockButton = $('messages-block-button');
const log = $('messages-log');
const form = $('messages-compose-form');
const body = $('messages-body');
const charCount = $('messages-character-count');
const feedback = $('messages-message');
const videoInput = $('messages-video');
const videoRemove = $('messages-video-remove');
const videoPreview = $('messages-video-preview');
const videoName = $('messages-video-name');
const videoElement = videoPreview?.querySelector('video');

let supabase = null;
let user = null;
let selfProfile = null;
let profiles = [];
let profileMap = new Map();
let friendships = [];
let blockedIds = new Set();
let threads = [];
let latest = new Map();
let currentThread = null;
let otherProfile = null;
let channel = null;
let previewUrl = '';

function say(text, error = false) {
  feedback.textContent = text;
  feedback.classList.toggle('is-error', error);
}
function fallbackName(value) {
  const named = value?.user_metadata?.display_name;
  return (typeof named === 'string' && named.trim().length >= 2 ? named.trim() : value?.email?.split('@')[0] || 'Member').slice(0, 32);
}
function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const same = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat('en-US', same ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' }).format(date);
}
function otherId(thread) { return thread.user_a === user.id ? thread.user_b : thread.user_a; }
function pairOther(friendship) { return friendship.user_a === user.id ? friendship.user_b : friendship.user_a; }
function acceptedFriendIds() { return new Set(friendships.filter((row) => row.status === 'accepted').map(pairOther).filter((id) => !blockedIds.has(id))); }
function avatarNode(profile, className = 'messages-avatar') {
  const node = document.createElement('span');
  node.className = className;
  if (profile?.avatar_url) {
    const img = document.createElement('img'); img.src = profile.avatar_url; img.alt = ''; img.loading = 'lazy'; node.append(img);
  } else node.textContent = (profile?.display_name || 'M').slice(0, 1).toUpperCase();
  return node;
}
function memberRow(profile, action, label) {
  const row = document.createElement('div'); row.className = 'messages-member-row';
  row.append(avatarNode(profile));
  const copy = document.createElement('span'); const strong = document.createElement('strong'); const small = document.createElement('small');
  strong.textContent = profile?.display_name || 'Member'; small.textContent = profile?.profile_tagline || profile?.status || '0PTICBOX member'; copy.append(strong, small); row.append(copy);
  if (action) { const button = document.createElement('button'); button.type = 'button'; button.className = 'retro-button compact'; button.dataset[action.name] = action.value; button.textContent = label; row.append(button); }
  return row;
}
async function ensureProfile() {
  const fields = 'id,display_name,avatar_url,status,profile_tagline';
  const found = await supabase.from('profiles').select(fields).eq('id', user.id).maybeSingle();
  if (found.error) throw found.error;
  if (found.data) return found.data;
  const created = await supabase.from('profiles').insert({ id: user.id, display_name: fallbackName(user), avatar_url: '', status: '', profile_tagline: '' }).select(fields).single();
  if (created.error) throw created.error;
  return created.data;
}
async function loadBlocks() {
  const result = await supabase.from('blocked_users').select('blocker_id,blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
  if (result.error) throw result.error;
  blockedIds = new Set((result.data || []).map((row) => row.blocker_id === user.id ? row.blocked_id : row.blocker_id));
}
async function loadFriendships() {
  const result = await supabase.from('friendships').select('id,user_a,user_b,requested_by,status,created_at,updated_at').or(`user_a.eq.${user.id},user_b.eq.${user.id}`).order('updated_at', { ascending: false });
  if (result.error) throw result.error;
  friendships = result.data || [];
  const ids = [...new Set(friendships.map(pairOther))].filter((id) => !profileMap.has(id));
  if (ids.length) {
    const found = await supabase.from('profiles').select('id,display_name,avatar_url,status,profile_tagline').in('id', ids);
    if (found.error) throw found.error;
    for (const profile of found.data || []) profileMap.set(profile.id, profile);
  }
  renderFriends();
  renderRequests();
}
async function loadProfiles() {
  const result = await supabase.from('profiles').select('id,display_name,avatar_url,status,profile_tagline,created_at').neq('id', user.id).order('display_name').limit(250);
  if (result.error) throw result.error;
  profiles = (result.data || []).filter((profile) => !blockedIds.has(profile.id));
  profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  profileMap.set(selfProfile.id, selfProfile);
  renderSearch();
}
function renderFriends() {
  friendList.replaceChildren();
  const ids = [...acceptedFriendIds()];
  if (!ids.length) {
    const p = document.createElement('p'); p.className = 'review-empty'; p.textContent = 'No accepted friends yet. Use Find friends below.'; friendList.append(p); return;
  }
  for (const id of ids) {
    const profile = profileMap.get(id);
    const row = memberRow(profile, { name: 'openFriend', value: id }, 'Message');
    row.dataset.openFriend = id;
    friendList.append(row);
  }
}
function renderRequests() {
  incomingRequests.replaceChildren(); outgoingRequests.replaceChildren();
  const incoming = friendships.filter((row) => row.status === 'pending' && row.requested_by !== user.id && !blockedIds.has(pairOther(row)));
  const outgoing = friendships.filter((row) => row.status === 'pending' && row.requested_by === user.id && !blockedIds.has(pairOther(row)));
  const incomingTitle = document.createElement('strong'); incomingTitle.textContent = 'Incoming'; incomingRequests.append(incomingTitle);
  if (!incoming.length) { const p = document.createElement('p'); p.className = 'review-empty'; p.textContent = 'No incoming requests.'; incomingRequests.append(p); }
  for (const row of incoming) {
    const profile = profileMap.get(pairOther(row));
    const wrapper = memberRow(profile, null, '');
    const actions = document.createElement('span'); actions.className = 'messages-request-actions';
    for (const [label, value] of [['Accept', 'accept'], ['Decline', 'decline']]) { const button = document.createElement('button'); button.type = 'button'; button.className = `retro-button compact${value === 'decline' ? ' danger' : ''}`; button.dataset.friendResponse = value; button.dataset.friendshipId = row.id; button.textContent = label; actions.append(button); }
    wrapper.append(actions); incomingRequests.append(wrapper);
  }
  const outgoingTitle = document.createElement('strong'); outgoingTitle.textContent = 'Sent'; outgoingRequests.append(outgoingTitle);
  if (!outgoing.length) { const p = document.createElement('p'); p.className = 'review-empty'; p.textContent = 'No pending sent requests.'; outgoingRequests.append(p); }
  for (const row of outgoing) outgoingRequests.append(memberRow(profileMap.get(pairOther(row)), null, ''));
}
function renderSearch() {
  searchResults.replaceChildren();
  const query = search.value.trim().toLowerCase();
  if (query.length < 2) { const p = document.createElement('p'); p.className = 'review-empty'; p.textContent = 'Type at least 2 characters.'; searchResults.append(p); return; }
  const related = new Set(friendships.filter((row) => row.status !== 'declined').map(pairOther));
  const visible = profiles.filter((profile) => !related.has(profile.id) && [profile.display_name, profile.profile_tagline, profile.status].some((value) => String(value || '').toLowerCase().includes(query))).slice(0, 12);
  if (!visible.length) { const p = document.createElement('p'); p.className = 'review-empty'; p.textContent = 'No available members found.'; searchResults.append(p); return; }
  for (const profile of visible) searchResults.append(memberRow(profile, { name: 'addFriend', value: profile.id }, 'Add friend'));
}
async function loadThreads() {
  const result = await supabase.from('direct_threads').select('id,user_a,user_b,created_at').order('created_at', { ascending: false }).limit(100);
  if (result.error) throw result.error;
  const friendIds = acceptedFriendIds();
  threads = (result.data || []).filter((thread) => friendIds.has(otherId(thread)) && !blockedIds.has(otherId(thread)));
  const missing = [...new Set(threads.map(otherId))].filter((id) => !profileMap.has(id));
  if (missing.length) {
    const found = await supabase.from('profiles').select('id,display_name,avatar_url,status,profile_tagline').in('id', missing);
    if (found.error) throw found.error;
    for (const profile of found.data || []) profileMap.set(profile.id, profile);
  }
  latest = new Map();
  const ids = threads.map((thread) => thread.id);
  if (ids.length) {
    const rows = await supabase.from('direct_messages').select('id,thread_id,sender_id,body,media_type,created_at').in('thread_id', ids).order('created_at', { ascending: false }).limit(500);
    if (rows.error) throw rows.error;
    for (const row of rows.data || []) if (!latest.has(row.thread_id)) latest.set(row.thread_id, row);
  }
  threads.sort((a, b) => new Date(latest.get(b.id)?.created_at || b.created_at) - new Date(latest.get(a.id)?.created_at || a.created_at));
  renderThreads();
}
function renderThreads() {
  threadList.replaceChildren(); threadCount.textContent = `${threads.length} ${threads.length === 1 ? 'chat' : 'chats'}`;
  if (!threads.length) { const p = document.createElement('p'); p.className = 'review-empty'; p.textContent = 'No conversations yet. Choose a friend above.'; threadList.append(p); return; }
  for (const thread of threads) {
    const other = profileMap.get(otherId(thread)); const last = latest.get(thread.id); const button = document.createElement('button');
    button.type = 'button'; button.className = 'messages-thread-row'; button.dataset.threadId = thread.id; button.classList.toggle('is-active', currentThread?.id === thread.id); button.append(avatarNode(other));
    const copy = document.createElement('span'); const top = document.createElement('span'); const strong = document.createElement('strong'); const time = document.createElement('small'); const preview = document.createElement('p');
    strong.textContent = other?.display_name || 'Member'; time.textContent = formatDate(last?.created_at || thread.created_at); preview.textContent = last ? `${last.sender_id === user.id ? 'You: ' : ''}${last.body || (last.media_type ? 'Video' : 'Message')}` : 'New conversation'; top.append(strong, time); copy.append(top, preview); button.append(copy); threadList.append(button);
  }
}
function header(profile) {
  profileLink.href = `profile.html?id=${encodeURIComponent(profile.id)}`; nameEl.textContent = profile.display_name || 'Member'; statusEl.textContent = profile.profile_tagline || profile.status || 'Private conversation'; avatar.replaceChildren();
  if (profile.avatar_url) { const img = document.createElement('img'); img.src = profile.avatar_url; img.alt = ''; avatar.append(img); } else avatar.textContent = (profile.display_name || 'M').slice(0, 1).toUpperCase();
}
async function signedMediaUrl(path) {
  if (!path) return '';
  const result = await supabase.storage.from('message-media').createSignedUrl(path, 3600);
  return result.error ? '' : result.data.signedUrl;
}
async function appendMessage(row) {
  const article = document.createElement('article'); article.className = `messages-bubble${row.sender_id === user.id ? ' is-mine' : ''}`;
  if (row.body) { const p = document.createElement('p'); p.textContent = row.body; article.append(p); }
  if (row.media_path) {
    const url = await signedMediaUrl(row.media_path);
    if (url) { const video = document.createElement('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.src = url; article.append(video); }
    const label = document.createElement('span'); label.className = 'messages-media-name'; label.textContent = row.media_name || 'Video attachment'; article.append(label);
  }
  const small = document.createElement('small'); small.textContent = formatDate(row.created_at); article.append(small); log.append(article);
}
async function loadMessages() {
  const result = await supabase.from('direct_messages').select('id,thread_id,sender_id,body,media_path,media_type,media_name,media_size,created_at').eq('thread_id', currentThread.id).order('created_at').limit(300);
  if (result.error) throw result.error;
  log.replaceChildren();
  for (const row of result.data || []) await appendMessage(row);
  log.scrollTop = log.scrollHeight;
}
async function subscribe() {
  if (channel) { await supabase.removeChannel(channel); channel = null; }
  channel = supabase.channel(`direct-${currentThread.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `thread_id=eq.${currentThread.id}` }, async () => { await loadMessages(); await loadThreads(); }).subscribe();
}
async function openThread(id) {
  const thread = threads.find((row) => row.id === id); if (!thread) return;
  currentThread = thread; otherProfile = profileMap.get(otherId(thread)) || { id: otherId(thread), display_name: 'Member', avatar_url: '' };
  if (blockedIds.has(otherProfile.id)) return;
  empty.hidden = true; active.hidden = false; header(otherProfile); renderThreads(); history.replaceState({}, '', `messages.html?thread=${encodeURIComponent(thread.id)}`); await Promise.all([loadMessages(), subscribe()]);
}
async function start(other) {
  if (!acceptedFriendIds().has(other) || blockedIds.has(other)) return say('Only accepted friends can be messaged.', true);
  say('Opening conversation…');
  const result = await supabase.rpc('start_direct_thread', { p_other_user: other });
  if (result.error) return say(result.error.message || 'The conversation could not be opened. Run the newest messaging SQL.', true);
  await loadThreads(); await openThread(result.data); say('');
}
async function refreshAll() {
  await loadBlocks(); await loadProfiles(); await loadFriendships(); await loadThreads(); renderSearch();
}
async function fromUrl() {
  const params = new URLSearchParams(location.search); const withUser = params.get('with'); const id = params.get('thread');
  if (withUser && withUser !== user.id) return start(withUser);
  if (id && threads.some((thread) => thread.id === id)) await openThread(id);
}
function clearVideo() {
  if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; videoInput.value = ''; videoPreview.hidden = true; videoRemove.hidden = true; videoElement.removeAttribute('src'); videoName.textContent = '';
}

if (!isSupabaseConfigured()) { warning.hidden = false; signedOut.hidden = false; }
else {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  user = (await supabase.auth.getSession()).data.session?.user || null;
  if (!user) { signedOut.hidden = false; const next = encodeURIComponent(`messages.html${location.search}`); location.replace(`signin.html?next=${next}`); }
  else {
    try { selfProfile = await ensureProfile(); signedOut.hidden = true; app.hidden = false; await refreshAll(); await fromUrl(); }
    catch (error) { app.hidden = false; say(error.message || 'Messages could not load. Run the newest Supabase upgrade.', true); }
  }
}

search?.addEventListener('input', renderSearch);
friendList?.addEventListener('click', (event) => { const button = event.target.closest('[data-open-friend]'); if (button) start(button.dataset.openFriend); });
searchResults?.addEventListener('click', async (event) => { const button = event.target.closest('[data-add-friend]'); if (!button) return; say('Sending friend request…'); const result = await supabase.rpc('send_friend_request', { p_other_user: button.dataset.addFriend }); if (result.error) return say(result.error.message, true); search.value = ''; await loadFriendships(); renderSearch(); say('Friend request sent.'); });
incomingRequests?.addEventListener('click', async (event) => { const button = event.target.closest('[data-friend-response]'); if (!button) return; const accept = button.dataset.friendResponse === 'accept'; const result = await supabase.rpc('respond_friend_request', { p_friendship: button.dataset.friendshipId, p_accept: accept }); if (result.error) return say(result.error.message, true); await loadFriendships(); await loadThreads(); say(accept ? 'Friend request accepted.' : 'Friend request declined.'); });
threadList?.addEventListener('click', (event) => { const button = event.target.closest('[data-thread-id]'); if (button) openThread(button.dataset.threadId); });
body?.addEventListener('input', () => { charCount.textContent = String(body.value.length); });
videoInput?.addEventListener('change', () => { const file = videoInput.files?.[0]; if (!file) return clearVideo(); if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) { clearVideo(); return say('Use an MP4, WEBM, or MOV video.', true); } if (file.size > 50 * 1024 * 1024) { clearVideo(); return say('Videos must be 50 MB or smaller.', true); } if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(file); videoElement.src = previewUrl; videoName.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`; videoPreview.hidden = false; videoRemove.hidden = false; say(''); });
videoRemove?.addEventListener('click', clearVideo);
form?.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!currentThread || !user || blockedIds.has(otherProfile?.id)) return;
  const text = body.value.trim(); const file = videoInput.files?.[0] || null; if (!text && !file) return say('Write a message or attach a video first.', true);
  say(file ? 'Uploading video…' : 'Sending…'); let mediaPath = '';
  if (file) {
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, '-').slice(-120) || 'video';
    mediaPath = `${currentThread.id}/${user.id}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from('message-media').upload(mediaPath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (upload.error) return say(upload.error.message || 'The video could not be uploaded.', true);
  }
  const result = await supabase.from('direct_messages').insert({ thread_id: currentThread.id, sender_id: user.id, body: text, media_path: mediaPath, media_type: file?.type || '', media_name: file?.name || '', media_size: file?.size || 0 });
  if (result.error) { if (mediaPath) await supabase.storage.from('message-media').remove([mediaPath]); return say(result.error.message || 'The message could not be sent.', true); }
  body.value = ''; charCount.textContent = '0'; clearVideo(); say(''); await loadMessages(); await loadThreads();
});
blockButton?.addEventListener('click', async () => {
  if (!otherProfile || !user) return;
  if (!confirm(`Block ${otherProfile.display_name}? The friendship and conversation will be hidden.`)) return;
  const result = await supabase.from('blocked_users').insert({ blocker_id: user.id, blocked_id: otherProfile.id });
  if (result.error) return say(result.error.message, true);
  currentThread = null; otherProfile = null; active.hidden = true; empty.hidden = false; await refreshAll(); history.replaceState({}, '', 'messages.html'); say('Member blocked. You can unblock them in Settings.');
});
