import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

const $ = (id) => document.getElementById(id);
const warning = $('messages-config-warning');
const friendList = $('friend-list');
const friendCount = $('friend-count');
const requestList = $('request-list');
const requestSection = $('request-section');
const searchInput = $('friend-search-input');
const searchResults = $('friend-search-results');
const searchStatus = $('friend-search-status');
const threadList = $('thread-list');
const threadCount = $('thread-count');
const conversationAvatar = $('conversation-avatar');
const conversationName = $('conversation-name');
const conversationStatus = $('conversation-status');
const blockButton = $('block-button');
const messageLog = $('message-log');
const messageForm = $('message-form');
const messageBody = $('message-body');
const messageCount = $('message-count');
const messageStatus = $('message-status');
const sendButton = $('send-message');
const videoInput = $('message-video');
const videoPreview = $('video-preview');
const videoPreviewPlayer = $('video-preview-player');
const videoPreviewName = $('video-preview-name');
const videoPreviewSize = $('video-preview-size');
const removeVideoButton = $('remove-video');
const zipInput = $('message-zip');
const zipPreview = $('zip-preview');
const zipPreviewName = $('zip-preview-name');
const zipPreviewSize = $('zip-preview-size');
const removeZipButton = $('remove-zip');
const uploadProgress = $('message-upload-progress');
const uploadProgressBar = $('message-upload-progress-bar');
const uploadProgressText = $('message-upload-progress-text');
const cancelUploadButton = $('cancel-upload');

const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const VIDEO_TYPE_BY_EXTENSION = new Map([
  ['mp4', 'video/mp4'],
  ['m4v', 'video/mp4'],
  ['webm', 'video/webm'],
  ['mov', 'video/quicktime'],
]);
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_ZIP_SIZE = 100 * 1024 * 1024;
const ZIP_MIME_TYPE = 'application/zip';
const SIGNED_URL_TTL_SECONDS = 300;
let supabase = null;
let user = null;
let friends = [];
let requests = [];
let threads = [];
let currentThread = null;
let currentFriend = null;
let currentChannel = null;
let selectedVideo = null;
let selectedVideoContentType = '';
let selectedZip = null;
let blockedIds = new Set();
let selectedVideoPreviewUrl = '';
let searchTimer = 0;
let threadRefreshTimer = 0;
let socialRefreshTimer = 0;
let messageLoadGeneration = 0;
let isSending = false;
let currentUploadRequest = null;
const signedUrlCache = new Map();
const renderedMessageIds = new Set();

function setStatus(text, isError = false) {
  messageStatus.textContent = text;
  messageStatus.classList.toggle('is-error', isError);
}

function text(element, value) {
  element.textContent = value ?? '';
}

function initials(name) {
  return (name || 'Member').trim().slice(0, 1).toUpperCase() || 'M';
}

function formatBytes(bytes) {
  const amount = Number(bytes) || 0;
  if (amount < 1024) return `${amount} B`;
  if (amount < 1024 * 1024) return `${(amount / 1024).toFixed(1)} KB`;
  return `${(amount / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function safeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment';
}

function isZipFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  return name.endsWith('.zip') || type === 'application/zip' || type === 'application/x-zip-compressed';
}

function videoTypeForFile(file) {
  const browserType = String(file?.type || '').toLowerCase();
  if (VIDEO_TYPES.has(browserType)) return browserType;
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase() || '';
  return VIDEO_TYPE_BY_EXTENSION.get(extension) || '';
}

function setUploadProgress(percent, label) {
  if (!uploadProgress || !uploadProgressBar || !uploadProgressText) return;
  const next = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  uploadProgress.hidden = false;
  uploadProgressBar.value = next;
  uploadProgressText.textContent = label || `${next}% uploaded`;
}

function hideUploadProgress() {
  if (!uploadProgress || !uploadProgressBar || !uploadProgressText) return;
  uploadProgress.hidden = true;
  uploadProgressBar.value = 0;
  uploadProgressText.textContent = '';
}

async function uploadMediaWithProgress(path, file, contentType, label = 'attachment') {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Your sign-in session expired. Please sign in again.');

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const uploadUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/message-media/${encodedPath}`;

  await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    currentUploadRequest = request;
    request.open('POST', uploadUrl, true);
    request.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    request.setRequestHeader('apikey', SUPABASE_PUBLISHABLE_KEY);
    request.setRequestHeader('x-upsert', 'false');

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) {
        setUploadProgress(0, `Uploading ${label}…`);
        return;
      }
      const percent = (event.loaded / event.total) * 100;
      setUploadProgress(percent, `${Math.round(percent)}% uploaded`);
    });

    request.addEventListener('load', () => {
      currentUploadRequest = null;
      if (request.status >= 200 && request.status < 300) {
        if (cancelUploadButton) cancelUploadButton.disabled = true;
        setUploadProgress(100, 'Upload complete');
        resolve();
        return;
      }
      let detail = '';
      try {
        const parsed = JSON.parse(request.responseText || '{}');
        detail = parsed.message || parsed.error || '';
      } catch (_) {
        detail = request.responseText || '';
      }
      reject(new Error(detail || `${label} upload failed (${request.status}).`));
    });

    request.addEventListener('error', () => {
      currentUploadRequest = null;
      reject(new Error(`The ${label} upload lost its network connection.`));
    });

    request.addEventListener('abort', () => {
      currentUploadRequest = null;
      const abortError = new Error(`${label} upload canceled.`);
      abortError.name = 'AbortError';
      reject(abortError);
    });

    const formData = new FormData();
    formData.append('cacheControl', '3600');
    const normalizedFile = file.type === contentType ? file : file.slice(0, file.size, contentType);
    formData.append('', normalizedFile, file.name);
    request.send(formData);
  });
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setAvatar(element, profile) {
  const avatarUrl = profile?.avatar_url || '';
  element.textContent = avatarUrl ? '' : initials(profile?.display_name);
  element.style.backgroundImage = avatarUrl ? `url("${avatarUrl.replaceAll('"', '%22')}")` : '';
}

function profileById(id) {
  return friends.find((friend) => friend.id === id) || null;
}

function empty(container, message) {
  container.replaceChildren();
  const paragraph = document.createElement('p');
  paragraph.className = 'empty-state';
  paragraph.textContent = message;
  container.append(paragraph);
}

function actionButton(label, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `retro-button ${className}`.trim();
  button.textContent = label;
  return button;
}

function profileRow(profile, className) {
  const row = document.createElement('div');
  row.className = className;
  const avatar = document.createElement('span');
  avatar.className = 'friend-avatar';
  setAvatar(avatar, profile);
  const copy = document.createElement('span');
  copy.className = 'friend-copy';
  const name = document.createElement('strong');
  name.textContent = profile.display_name || 'Member';
  const note = document.createElement('small');
  note.textContent = profile.profile_tagline || profile.status || '0PTICBOX member';
  copy.append(name, note);
  const actions = document.createElement('span');
  actions.className = 'friend-actions';
  row.append(avatar, copy, actions);
  return { row, actions, copy, avatar };
}


async function loadBlocks() {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocker_id,blocked_id');
  if (error) throw error;
  blockedIds = new Set(
    (data || []).map((row) => row.blocker_id === user.id ? row.blocked_id : row.blocker_id)
  );
}

async function loadFriends() {
  const { data, error } = await supabase.rpc('list_friends');
  if (error) throw error;
  friends = (data || []).map((item) => ({
    id: item.friend_id,
    display_name: item.display_name || 'Member',
    avatar_url: item.avatar_url || '',
    status: item.profile_status || '',
    profile_tagline: item.profile_tagline || '',
    friends_since: item.friends_since,
  }));
  renderFriends();
}

function renderFriends() {
  friendCount.textContent = String(friends.length);
  friendList.replaceChildren();
  if (!friends.length) {
    empty(friendList, 'No friends yet. Use “Add a friend” below to send a request.');
    return;
  }

  friends.forEach((friend) => {
    const { row, actions } = profileRow(friend, 'friend-row');
    const open = actionButton('Message', 'primary');
    open.addEventListener('click', () => void startConversation(friend));
    actions.append(open);
    row.addEventListener('dblclick', () => void startConversation(friend));
    friendList.append(row);
  });
}

async function loadRequests() {
  const { data, error } = await supabase.rpc('list_friend_requests');
  if (error) throw error;
  requests = data || [];
  renderRequests();
}

function renderRequests() {
  requestList.replaceChildren();
  requestSection.hidden = requests.length === 0;
  if (!requests.length) {
    empty(requestList, 'No pending requests.');
    return;
  }

  requests.forEach((request) => {
    const profile = {
      id: request.other_user_id,
      display_name: request.display_name,
      avatar_url: request.avatar_url,
      status: request.profile_status,
      profile_tagline: request.profile_tagline,
    };
    const { row, actions } = profileRow(profile, 'request-row');

    if (request.direction === 'incoming') {
      const accept = actionButton('Accept', 'primary');
      const decline = actionButton('Decline', 'danger');
      accept.addEventListener('click', async () => {
        accept.disabled = true;
        const { error } = await supabase.rpc('respond_friend_request', {
          p_requester: request.other_user_id,
          p_accept: true,
        });
        if (error) setStatus(error.message, true);
        await refreshSocialLists();
      });
      decline.addEventListener('click', async () => {
        decline.disabled = true;
        const { error } = await supabase.rpc('respond_friend_request', {
          p_requester: request.other_user_id,
          p_accept: false,
        });
        if (error) setStatus(error.message, true);
        await loadRequests();
      });
      actions.append(accept, decline);
    } else {
      const pending = document.createElement('small');
      pending.textContent = 'Pending';
      const cancel = actionButton('Cancel');
      cancel.addEventListener('click', async () => {
        cancel.disabled = true;
        const { error } = await supabase.rpc('remove_friend', { p_other_user: request.other_user_id });
        if (error) setStatus(error.message, true);
        await loadRequests();
      });
      actions.append(pending, cancel);
    }
    requestList.append(row);
  });
}

async function refreshSocialLists() {
  await Promise.all([loadFriends(), loadRequests(), loadBlocks()]);
  await loadThreads();
}

function pendingIds() {
  return new Set(requests.map((request) => request.other_user_id));
}

async function searchMembers(query) {
  const cleaned = query.trim();
  searchResults.replaceChildren();
  if (cleaned.length < 2) {
    searchStatus.textContent = 'Type at least two characters.';
    return;
  }
  searchStatus.textContent = 'Searching…';
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,avatar_url,status,profile_tagline')
    .neq('id', user.id)
    .ilike('display_name', `%${cleaned}%`)
    .order('display_name')
    .limit(12);

  if (error) {
    searchStatus.textContent = error.message;
    return;
  }

  const friendIds = new Set(friends.map((friend) => friend.id));
  const waitingIds = pendingIds();
  const results = (data || []).filter((profile) => !blockedIds.has(profile.id));
  searchStatus.textContent = results.length ? '' : 'No available members found.';

  results.forEach((profile) => {
    const { row, actions } = profileRow(profile, 'friend-search-row');
    if (friendIds.has(profile.id)) {
      const badge = document.createElement('small');
      badge.textContent = 'Friend';
      actions.append(badge);
    } else if (waitingIds.has(profile.id)) {
      const badge = document.createElement('small');
      badge.textContent = 'Pending';
      actions.append(badge);
    } else {
      const add = actionButton('Add friend', 'primary');
      add.addEventListener('click', async () => {
        add.disabled = true;
        add.textContent = 'Sending…';
        const { error: requestError } = await supabase.rpc('send_friend_request', {
          p_other_user: profile.id,
        });
        if (requestError) {
          searchStatus.textContent = requestError.message;
          add.disabled = false;
          add.textContent = 'Add friend';
          return;
        }
        searchStatus.textContent = `Friend request sent to ${profile.display_name}.`;
        await loadRequests();
        await searchMembers(cleaned);
      });
      actions.append(add);
    }
    searchResults.append(row);
  });
}

searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void searchMembers(searchInput.value), 280);
});

async function loadThreads() {
  const { data, error } = await supabase
    .from('direct_threads')
    .select('id,user_a,user_b,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  threads = (data || []).filter((thread) => {
    const friendId = otherUserId(thread);
    return !blockedIds.has(friendId) && Boolean(profileById(friendId));
  });

  const ids = threads.map((thread) => thread.id);
  const latest = new Map();
  if (ids.length) {
    const { data: messages, error: messageError } = await supabase
      .from('direct_messages')
      .select('id,thread_id,body,message_type,media_name,created_at')
      .in('thread_id', ids)
      .order('created_at', { ascending: false })
      .limit(250);
    if (messageError) throw messageError;

    (messages || []).forEach((item) => {
      if (!latest.has(item.thread_id)) latest.set(item.thread_id, item);
    });
  }

  threads = threads.map((thread) => ({ ...thread, latest: latest.get(thread.id) || null }));
  threads.sort((a, b) => {
    const aTime = new Date(a.latest?.created_at || a.created_at).getTime();
    const bTime = new Date(b.latest?.created_at || b.created_at).getTime();
    return bTime - aTime;
  });
  renderThreads();
}

function otherUserId(thread) {
  return thread.user_a === user.id ? thread.user_b : thread.user_a;
}

function renderThreads() {
  threadCount.textContent = String(threads.length);
  threadList.replaceChildren();
  if (!threads.length) {
    empty(threadList, 'No conversations yet. Choose a friend above.');
    return;
  }

  threads.forEach((thread) => {
    const friend = profileById(otherUserId(thread));
    if (!friend) return;
    const { row, actions, copy } = profileRow(friend, 'thread-row');
    const note = copy.querySelector('small');
    if (thread.latest) {
      note.textContent = thread.latest.message_type === 'video'
        ? `Video: ${thread.latest.media_name || 'attachment'}`
        : thread.latest.message_type === 'file'
          ? `ZIP: ${thread.latest.media_name || 'attachment.zip'}`
          : (thread.latest.body || 'Message');
    } else {
      note.textContent = 'Conversation started';
    }
    const time = document.createElement('small');
    time.textContent = formatTime(thread.latest?.created_at || thread.created_at);
    actions.append(time);
    row.addEventListener('click', () => void openConversation(thread, friend));
    threadList.append(row);
  });
}

function clearSelectedVideo() {
  selectedVideo = null;
  selectedVideoContentType = '';
  videoInput.value = '';
  if (selectedVideoPreviewUrl) URL.revokeObjectURL(selectedVideoPreviewUrl);
  selectedVideoPreviewUrl = '';
  videoPreviewPlayer.removeAttribute('src');
  videoPreviewPlayer.load();
  videoPreview.hidden = true;
}

function clearSelectedZip() {
  selectedZip = null;
  if (zipInput) zipInput.value = '';
  if (zipPreview) zipPreview.hidden = true;
  if (zipPreviewName) zipPreviewName.textContent = 'ZIP file';
  if (zipPreviewSize) zipPreviewSize.textContent = '';
  messageForm.classList.remove('is-zip-dragover');
}

function selectZip(file) {
  clearSelectedZip();
  if (!file) return;
  if (!isZipFile(file)) {
    setStatus('Only .zip files are supported here.', true);
    return;
  }
  if (!file.size) {
    setStatus('That ZIP file is empty.', true);
    return;
  }
  if (file.size > MAX_ZIP_SIZE) {
    setStatus('ZIP attachments must be 100 MB or smaller.', true);
    return;
  }

  clearSelectedVideo();
  selectedZip = file;
  if (zipPreviewName) zipPreviewName.textContent = file.name;
  if (zipPreviewSize) zipPreviewSize.textContent = `${formatBytes(file.size)} · permanent private attachment`;
  if (zipPreview) zipPreview.hidden = false;
  setStatus('ZIP ready to send. You can add a caption above.');
}

function setComposerEnabled(enabled) {
  const active = Boolean(enabled) && !isSending;
  messageBody.disabled = !active;
  videoInput.disabled = !active;
  if (zipInput) zipInput.disabled = !active;
  sendButton.disabled = !active;
  removeVideoButton.disabled = !active;
  if (removeZipButton) removeZipButton.disabled = !active;
  if (!blockButton.hidden) blockButton.disabled = !active;
}

function resetConversation() {
  if (currentChannel && supabase) supabase.removeChannel(currentChannel);
  currentChannel = null;
  messageLoadGeneration += 1;
  renderedMessageIds.clear();
  currentThread = null;
  currentFriend = null;
  setAvatar(conversationAvatar, { display_name: '?' });
  conversationName.textContent = 'Choose a friend';
  conversationStatus.textContent = 'Your messages will appear here.';
  blockButton.hidden = true;
  setComposerEnabled(false);
  clearSelectedVideo();
  clearSelectedZip();
  empty(messageLog, 'Select a friend or an existing conversation.');
  history.replaceState(null, '', 'messages.html');
}

async function startConversation(friend) {
  if (isSending) {
    setStatus('Finish or cancel the current upload before changing conversations.', true);
    return;
  }
  if (!friend || blockedIds.has(friend.id) || !profileById(friend.id)) {
    setStatus('That member is not available in your friends list.', true);
    return;
  }

  setStatus('Opening conversation…');
  const { data, error } = await supabase.rpc('start_direct_thread', { p_other_user: friend.id });
  if (error) {
    setStatus(error.message, true);
    return;
  }
  await loadThreads();
  let thread = threads.find((item) => item.id === data);
  if (!thread) {
    const ids = [user.id, friend.id].sort();
    thread = { id: data, user_a: ids[0], user_b: ids[1], created_at: new Date().toISOString(), latest: null };
    threads.unshift(thread);
    renderThreads();
  }
  await openConversation(thread, friend);
}

function cacheSignedMediaUrl(path, url) {
  if (!path || !url) return;
  signedUrlCache.set(path, {
    url,
    expires: Date.now() + Math.max(60, SIGNED_URL_TTL_SECONDS - 60) * 1000,
  });
}

async function primeSignedMediaUrls(items) {
  const paths = [...new Set(
    (items || [])
      .filter((item) => ['video', 'file'].includes(item.message_type) && item.media_path)
      .map((item) => item.media_path)
      .filter((path) => {
        const cached = signedUrlCache.get(path);
        return !(cached && cached.expires > Date.now());
      })
  )];
  if (!paths.length) return;

  const { data, error } = await supabase.storage
    .from('message-media')
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;

  (data || []).forEach((item, index) => {
    const path = item.path || paths[index];
    const url = item.signedUrl || item.signedURL || '';
    cacheSignedMediaUrl(path, url);
  });
}

async function getSignedMediaUrl(path) {
  const cached = signedUrlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage
    .from('message-media')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  const url = data.signedUrl || data.signedURL || '';
  if (!url) throw new Error('Private attachment URL was not returned.');
  cacheSignedMediaUrl(path, url);
  return url;
}

async function createMessageBubble(item) {
  const bubble = document.createElement('article');
  bubble.className = `message-bubble${item.sender_id === user.id ? ' is-mine' : ''}`;
  bubble.dataset.messageId = String(item.id);

  if (item.message_type === 'video' && item.media_path) {
    try {
      const video = document.createElement('video');
      video.className = 'message-video';
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.src = await getSignedMediaUrl(item.media_path);
      bubble.append(video);
      const attachment = document.createElement('span');
      attachment.className = 'message-attachment-name';
      attachment.textContent = `${item.media_name || 'Video'}${item.media_size ? ` · ${formatBytes(item.media_size)}` : ''}`;
      bubble.append(attachment);
    } catch (_) {
      const unavailable = document.createElement('p');
      unavailable.textContent = 'This private video could not be loaded.';
      bubble.append(unavailable);
    }
  }

  if (item.message_type === 'file' && item.media_path) {
    try {
      const url = await getSignedMediaUrl(item.media_path);
      const attachment = document.createElement('div');
      attachment.className = 'message-zip-card';
      const name = document.createElement('strong');
      name.textContent = item.media_name || 'attachment.zip';
      const size = document.createElement('small');
      size.textContent = item.media_size ? formatBytes(item.media_size) : 'ZIP attachment';
      const link = document.createElement('a');
      link.className = 'retro-button';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.download = item.media_name || 'attachment.zip';
      link.textContent = 'Download ZIP';
      attachment.append(name, size, link);
      bubble.append(attachment);
    } catch (_) {
      const unavailable = document.createElement('p');
      unavailable.textContent = 'This private ZIP could not be loaded.';
      bubble.append(unavailable);
    }
  }

  if (item.body) {
    const body = document.createElement('p');
    body.textContent = item.body;
    bubble.append(body);
  }

  const meta = document.createElement('small');
  meta.className = 'message-meta';
  meta.textContent = `${item.sender_id === user.id ? 'You' : currentFriend?.display_name || 'Friend'} · ${formatTime(item.created_at)}`;
  bubble.append(meta);
  return bubble;
}

async function appendNewMessage(item) {
  if (!item || !currentThread || item.thread_id !== currentThread.id) return;
  const id = String(item.id);
  if (renderedMessageIds.has(id)) return;
  renderedMessageIds.add(id);

  try {
    const bubble = await createMessageBubble(item);
    if (!currentThread || item.thread_id !== currentThread.id) {
      renderedMessageIds.delete(id);
      return;
    }
    messageLog.querySelector('.empty-state')?.remove();
    messageLog.append(bubble);
    messageLog.scrollTop = messageLog.scrollHeight;
  } catch (error) {
    renderedMessageIds.delete(id);
    setStatus(error.message || 'A new message could not be displayed.', true);
  }
}

async function loadMessages() {
  if (!currentThread) return;
  const threadId = currentThread.id;
  const generation = ++messageLoadGeneration;
  const { data, error } = await supabase
    .from('direct_messages')
    .select('id,thread_id,sender_id,body,message_type,media_path,media_type,media_name,media_size,created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    setStatus(error.message, true);
    return;
  }
  if (currentThread?.id !== threadId || generation !== messageLoadGeneration) return;
  const messages = data || [];
  if (!messages.length) {
    renderedMessageIds.clear();
    empty(messageLog, 'No messages yet. Say hello, attach a video, or send a ZIP.');
    return;
  }

  try {
    await primeSignedMediaUrls(messages);
  } catch (_) {
    // Individual bubbles retry their own signed URL so one bad attachment
    // does not prevent the rest of the conversation from loading.
  }

  const bubbles = await Promise.all(messages.map((item) => createMessageBubble(item)));
  if (currentThread?.id !== threadId || generation !== messageLoadGeneration) return;

  renderedMessageIds.clear();
  messages.forEach((item) => renderedMessageIds.add(String(item.id)));
  messageLog.replaceChildren(...bubbles);
  messageLog.scrollTop = messageLog.scrollHeight;
}

function scheduleThreadRefresh() {
  window.clearTimeout(threadRefreshTimer);
  threadRefreshTimer = window.setTimeout(() => {
    void loadThreads().catch((error) => setStatus(error.message || 'Conversation list could not refresh.', true));
  }, 180);
}

function scheduleSocialRefresh() {
  if (!user || isSending) return;
  window.clearTimeout(socialRefreshTimer);
  socialRefreshTimer = window.setTimeout(async () => {
    try {
      const openFriendId = currentFriend?.id || '';
      await refreshSocialLists();
      if (openFriendId && (blockedIds.has(openFriendId) || !profileById(openFriendId))) {
        signedUrlCache.clear();
        resetConversation();
        setStatus('That conversation is no longer available.', true);
      }
    } catch (error) {
      setStatus(error.message || 'Friends and conversations could not refresh.', true);
    }
  }, 220);
}

function subscribeToThread() {
  if (currentChannel) supabase.removeChannel(currentChannel);
  if (!currentThread) return;
  const threadId = currentThread.id;
  currentChannel = supabase
    .channel(`direct-thread-${threadId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `thread_id=eq.${threadId}` },
      (payload) => {
        if (payload.new?.thread_id === currentThread?.id) void appendNewMessage(payload.new);
        scheduleThreadRefresh();
      }
    )
    .subscribe();
}

async function openConversation(thread, friend) {
  if (isSending && currentThread?.id !== thread.id) {
    setStatus('Finish or cancel the current upload before changing conversations.', true);
    return;
  }
  if (blockedIds.has(friend.id) || !profileById(friend.id)) {
    setStatus('That conversation is no longer available.', true);
    await refreshSocialLists();
    return;
  }

  if (currentChannel) supabase.removeChannel(currentChannel);
  currentChannel = null;
  messageLoadGeneration += 1;
  renderedMessageIds.clear();
  currentThread = thread;
  currentFriend = friend;
  clearSelectedVideo();
  clearSelectedZip();
  hideUploadProgress();
  setAvatar(conversationAvatar, friend);
  conversationName.textContent = friend.display_name || 'Friend';
  conversationStatus.textContent = friend.profile_tagline || friend.status || 'Private friend conversation';
  blockButton.hidden = false;
  setComposerEnabled(true);
  setStatus('');
  history.replaceState(null, '', `messages.html?with=${encodeURIComponent(friend.id)}`);
  empty(messageLog, 'Loading conversation…');
  await loadMessages();
  if (currentThread?.id !== thread.id) return;
  subscribeToThread();
  messageBody.focus({ preventScroll: true });
}

videoInput.addEventListener('change', () => {
  const file = videoInput.files?.[0] || null;
  clearSelectedVideo();
  if (!file) return;

  const contentType = videoTypeForFile(file);
  if (!contentType) {
    setStatus('Use an MP4, WebM, MOV, or M4V video.', true);
    return;
  }
  if (!file.size) {
    setStatus('That video file is empty.', true);
    return;
  }
  if (file.size > MAX_VIDEO_SIZE) {
    setStatus('Video attachments must be 50 MB or smaller.', true);
    return;
  }

  clearSelectedZip();
  selectedVideo = file;
  selectedVideoContentType = contentType;
  selectedVideoPreviewUrl = URL.createObjectURL(file);
  videoPreviewPlayer.src = selectedVideoPreviewUrl;
  videoPreviewName.textContent = file.name;
  videoPreviewSize.textContent = formatBytes(file.size);
  videoPreview.hidden = false;
  setStatus('Video ready to send. You can add a caption above.');
});

zipInput?.addEventListener('change', () => {
  selectZip(zipInput.files?.[0] || null);
});

removeZipButton?.addEventListener('click', clearSelectedZip);

function dragHasFiles(event) {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes('Files');
}

messageForm.addEventListener('dragenter', (event) => {
  if (!currentThread || isSending || !dragHasFiles(event)) return;
  event.preventDefault();
  event.stopPropagation();
  messageForm.classList.add('is-zip-dragover');
});

messageForm.addEventListener('dragover', (event) => {
  if (!currentThread || isSending || !dragHasFiles(event)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  messageForm.classList.add('is-zip-dragover');
});

messageForm.addEventListener('dragleave', (event) => {
  if (event.relatedTarget && messageForm.contains(event.relatedTarget)) return;
  messageForm.classList.remove('is-zip-dragover');
});

messageForm.addEventListener('drop', (event) => {
  if (!dragHasFiles(event)) return;
  event.preventDefault();
  event.stopPropagation();
  messageForm.classList.remove('is-zip-dragover');
  if (!currentThread || isSending) return;
  selectZip(event.dataTransfer?.files?.[0] || null);
});

// Prevent Safari and other desktop browsers from navigating away when a file
// is dropped outside the composer.
window.addEventListener('dragover', (event) => {
  if (dragHasFiles(event)) event.preventDefault();
});
window.addEventListener('drop', (event) => {
  if (dragHasFiles(event)) event.preventDefault();
});

removeVideoButton.addEventListener('click', clearSelectedVideo);
cancelUploadButton?.addEventListener('click', () => {
  if (!currentUploadRequest) return;
  cancelUploadButton.disabled = true;
  currentUploadRequest.abort();
});

messageBody.addEventListener('input', () => {
  messageCount.textContent = String(messageBody.value.length);
});

messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSending || !currentThread || !currentFriend) return;

  const threadId = currentThread.id;
  const friendId = currentFriend.id;
  const body = messageBody.value.trim();
  const video = selectedVideo;
  const videoContentType = selectedVideoContentType;
  const zip = selectedZip;
  if (!body && !video && !zip) {
    setStatus('Write a message, attach a video, or attach a ZIP.', true);
    return;
  }
  if (blockedIds.has(friendId) || !profileById(friendId)) {
    setStatus('This conversation is no longer available.', true);
    await refreshSocialLists();
    return;
  }

  isSending = true;
  setComposerEnabled(false);
  sendButton.textContent = (video || zip) ? 'Uploading…' : 'Sending…';
  if (cancelUploadButton) cancelUploadButton.disabled = false;
  let uploadedPath = '';
  let uploadCompleted = false;
  let sent = false;

  try {
    const payload = {
      thread_id: threadId,
      sender_id: user.id,
      body,
      message_type: zip ? 'file' : (video ? 'video' : 'text'),
      media_path: '',
      media_type: zip ? ZIP_MIME_TYPE : (videoContentType || ''),
      media_name: '',
      media_size: 0,
    };

    if (video) {
      setStatus(`Uploading ${video.name}…`);
      setUploadProgress(0, 'Starting upload…');
      uploadedPath = `${threadId}/${user.id}/${makeId()}-${safeFileName(video.name)}`;
      await uploadMediaWithProgress(uploadedPath, video, videoContentType, 'video');
      uploadCompleted = true;
      payload.media_path = uploadedPath;
      payload.media_name = video.name.slice(0, 180);
      payload.media_size = video.size;
    } else if (zip) {
      setStatus(`Uploading ${zip.name}…`);
      setUploadProgress(0, 'Starting ZIP upload…');
      uploadedPath = `${threadId}/${user.id}/${makeId()}-${safeFileName(zip.name)}`;
      await uploadMediaWithProgress(uploadedPath, zip, ZIP_MIME_TYPE, 'ZIP');
      uploadCompleted = true;
      payload.media_path = uploadedPath;
      payload.media_name = zip.name.slice(0, 180);
      payload.media_size = zip.size;
    }

    sendButton.textContent = 'Sending…';
    setStatus('Sending…');
    const { data: inserted, error } = await supabase
      .from('direct_messages')
      .insert(payload)
      .select('id,thread_id,sender_id,body,message_type,media_path,media_type,media_name,media_size,created_at')
      .single();
    if (error) throw error;

    messageBody.value = '';
    messageCount.textContent = '0';
    clearSelectedVideo();
    clearSelectedZip();
    setStatus('Sent.');
    sent = true;
    if (currentThread?.id === threadId) await appendNewMessage(inserted);
    scheduleThreadRefresh();
  } catch (error) {
    if (uploadCompleted && uploadedPath) {
      await supabase.storage.from('message-media').remove([uploadedPath]);
    }
    setStatus(
      error.name === 'AbortError' ? 'Attachment upload canceled.' : (error.message || 'Message could not be sent.'),
      true
    );
  } finally {
    isSending = false;
    currentUploadRequest = null;
    sendButton.textContent = 'Send';
    if (cancelUploadButton) cancelUploadButton.disabled = false;
    if (currentThread) setComposerEnabled(true);
    if (sent && (video || zip)) window.setTimeout(hideUploadProgress, 650);
    else hideUploadProgress();
  }
});

blockButton.addEventListener('click', async () => {
  if (!currentFriend) return;
  if (isSending) {
    setStatus('Finish or cancel the current upload before blocking this member.', true);
    return;
  }

  const friend = currentFriend;
  const confirmed = window.confirm(`Block ${friend.display_name}? They will disappear from friends and messages.`);
  if (!confirmed) return;
  blockButton.disabled = true;
  const { error } = await supabase.rpc('block_member', { p_other_user: friend.id });
  blockButton.disabled = false;
  if (error) {
    setStatus(error.message, true);
    return;
  }

  blockedIds.add(friend.id);
  signedUrlCache.clear();
  resetConversation();
  await refreshSocialLists();
  setStatus('Member blocked. Their conversation is hidden.');
});

window.addEventListener('focus', scheduleSocialRefresh);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleSocialRefresh();
});

async function bootstrap() {
  if (!isSupabaseConfigured() || !window.supabase?.createClient) {
    warning.hidden = false;
    setComposerEnabled(false);
    return;
  }

  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) {
    const next = encodeURIComponent(`messages.html${window.location.search}`);
    window.location.replace(`signin.html?next=${next}`);
    return;
  }
  user = data.session.user;

  await Promise.all([loadFriends(), loadRequests(), loadBlocks()]);
  await loadThreads();

  const requestedFriendId = new URLSearchParams(window.location.search).get('with');
  if (requestedFriendId) {
    const friend = profileById(requestedFriendId);
    if (friend) await startConversation(friend);
    else setStatus('That member is not in your accepted friends list.', true);
  }
}

bootstrap().catch((error) => {
  warning.hidden = false;
  warning.textContent = error.message || 'Messages could not load. Run the latest Supabase migration.';
});