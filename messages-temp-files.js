import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

const form = document.getElementById('message-form');
const body = document.getElementById('message-body');
const sendButton = document.getElementById('send-message');
const status = document.getElementById('message-status');
const videoInput = document.getElementById('message-video');
const videoPreview = document.getElementById('video-preview');
const removeVideoButton = document.getElementById('remove-video');
const messageLog = document.getElementById('message-log');
const fileInput = document.getElementById('message-file');
const filePreview = document.getElementById('file-preview');
const filePreviewName = document.getElementById('file-preview-name');
const filePreviewMeta = document.getElementById('file-preview-meta');
const removeFileButton = document.getElementById('remove-file');
const fileHint = document.getElementById('message-file-hint');

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const FILE_TTL_MS = 24 * 60 * 60 * 1000;
const SIGNED_URL_SECONDS = 300;
const ALLOWED_EXTENSIONS = new Set([
  'wav','wave','aif','aiff','mp3','m4a','aac','flac','ogg','opus','caf',
  'mp4','m4v','mov','webm','png','jpg','jpeg','gif','webp','pdf','txt','md','zip'
]);
const MIME_BY_EXTENSION = new Map([
  ['wav','audio/wav'],['wave','audio/wav'],['aif','audio/aiff'],['aiff','audio/aiff'],
  ['mp3','audio/mpeg'],['m4a','audio/mp4'],['aac','audio/aac'],['flac','audio/flac'],
  ['ogg','audio/ogg'],['opus','audio/ogg'],['caf','audio/x-caf'],
  ['mp4','video/mp4'],['m4v','video/mp4'],['mov','video/quicktime'],['webm','video/webm'],
  ['png','image/png'],['jpg','image/jpeg'],['jpeg','image/jpeg'],['gif','image/gif'],['webp','image/webp'],
  ['pdf','application/pdf'],['txt','text/plain'],['md','text/plain'],['zip','application/zip']
]);

let supabase = null;
let user = null;
let selectedFile = null;
let busy = false;
let refreshTimer = 0;
let schemaReady = true;

function say(text, error = false) {
  if (!status) return;
  status.textContent = text || '';
  status.classList.toggle('is-error', Boolean(error));
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function extensionOf(file) {
  return String(file?.name || '').split('.').pop()?.toLowerCase() || '';
}

function contentTypeFor(file) {
  const ext = extensionOf(file);
  return MIME_BY_EXTENSION.get(ext) || String(file?.type || '').toLowerCase() || 'application/octet-stream';
}

function safeFileName(name) {
  return String(name || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file';
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clearFile() {
  selectedFile = null;
  if (fileInput) fileInput.value = '';
  if (filePreview) filePreview.hidden = true;
  if (filePreviewName) filePreviewName.textContent = 'File';
  if (filePreviewMeta) filePreviewMeta.textContent = '';
  form?.classList.remove('is-file-dragover');
}

function chooseFile(file) {
  clearFile();
  if (!file) return;
  const ext = extensionOf(file);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    say('That file type is not enabled for temporary sharing.', true);
    return;
  }
  if (!file.size) {
    say('That file is empty.', true);
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    say('Temporary attachments must be 50 MB or smaller.', true);
    return;
  }
  selectedFile = file;
  if (videoPreview && !videoPreview.hidden) removeVideoButton?.click();
  if (filePreviewName) filePreviewName.textContent = file.name;
  if (filePreviewMeta) filePreviewMeta.textContent = `${formatBytes(file.size)} · available for 24 hours`;
  if (filePreview) filePreview.hidden = false;
  say('File ready. It will expire 24 hours after you send it.');
}

function syncEnabledState() {
  if (!fileInput || !videoInput) return;
  fileInput.disabled = videoInput.disabled || busy || !schemaReady;
}

async function currentThread() {
  if (!supabase || !user) return null;
  const friendId = new URLSearchParams(location.search).get('with');
  if (!friendId) return null;
  const { data, error } = await supabase
    .from('direct_threads')
    .select('id,user_a,user_b')
    .limit(200);
  if (error) throw error;
  return (data || []).find((thread) =>
    (thread.user_a === user.id && thread.user_b === friendId)
    || (thread.user_b === user.id && thread.user_a === friendId)
  ) || null;
}

async function checkSchema() {
  const { error } = await supabase
    .from('direct_messages')
    .select('media_expires_at')
    .limit(1);
  schemaReady = !error;
  if (!schemaReady && fileHint) {
    fileHint.textContent = 'Temporary files need the newest Supabase migration before they can be used.';
  }
  syncEnabledState();
}

async function cleanupMyExpiredFiles() {
  if (!schemaReady) return;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('direct_messages')
    .select('id,media_path')
    .eq('sender_id', user.id)
    .eq('message_type', 'file')
    .lt('media_expires_at', now)
    .neq('media_path', '')
    .limit(100);
  if (error || !data?.length) return;
  const paths = [...new Set(data.map((row) => row.media_path).filter(Boolean))];
  if (paths.length) await supabase.storage.from('message-media').remove(paths);
}

async function sendTemporaryFile(event) {
  if (!selectedFile) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (busy || !schemaReady) return;

  const thread = await currentThread().catch(() => null);
  if (!thread) {
    say('Open a friend conversation before attaching a file.', true);
    return;
  }

  const file = selectedFile;
  const caption = String(body?.value || '').trim();
  busy = true;
  syncEnabledState();
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = 'Uploading…';
  }

  const path = `${thread.id}/${user.id}/${makeId()}-${safeFileName(file.name)}`;
  const expiresAt = new Date(Date.now() + FILE_TTL_MS).toISOString();
  let uploaded = false;

  try {
    say(`Uploading ${file.name}…`);
    const { error: uploadError } = await supabase.storage
      .from('message-media')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: contentTypeFor(file),
      });
    if (uploadError) throw uploadError;
    uploaded = true;

    const payload = {
      thread_id: thread.id,
      sender_id: user.id,
      body: caption,
      message_type: 'file',
      media_path: path,
      media_type: contentTypeFor(file),
      media_name: file.name.slice(0, 180),
      media_size: file.size,
      media_expires_at: expiresAt,
    };
    const { error: insertError } = await supabase.from('direct_messages').insert(payload);
    if (insertError) throw insertError;

    if (body) {
      body.value = '';
      body.dispatchEvent(new Event('input', { bubbles: true }));
    }
    clearFile();
    say('File sent · expires in 24 hours.');
    scheduleRefresh();
  } catch (error) {
    if (uploaded) await supabase.storage.from('message-media').remove([path]);
    say(error.message || 'The file could not be sent.', true);
  } finally {
    busy = false;
    if (sendButton) sendButton.textContent = 'Send';
    syncEnabledState();
    if (sendButton && !videoInput?.disabled) sendButton.disabled = false;
  }
}

function secondsUntil(value) {
  const ms = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 1000));
}

async function addFileCard(bubble, row) {
  if (!bubble || bubble.querySelector('.temp-file-card')) return;
  const card = document.createElement('div');
  card.className = 'temp-file-card';
  const name = document.createElement('strong');
  name.textContent = row.media_name || 'Temporary file';
  const meta = document.createElement('small');
  const remaining = secondsUntil(row.media_expires_at);

  if (!remaining) {
    card.classList.add('is-expired');
    meta.textContent = `${row.media_size ? `${formatBytes(row.media_size)} · ` : ''}expired`;
    const expired = document.createElement('span');
    expired.textContent = 'FILE EXPIRED';
    card.append(name, meta, expired);
  } else {
    meta.textContent = `${row.media_size ? `${formatBytes(row.media_size)} · ` : ''}expires ${new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }).format(new Date(row.media_expires_at))}`;
    const ttl = Math.max(1, Math.min(SIGNED_URL_SECONDS, remaining));
    const { data, error } = await supabase.storage.from('message-media').createSignedUrl(row.media_path, ttl);
    if (error) {
      const unavailable = document.createElement('span');
      unavailable.textContent = 'FILE UNAVAILABLE';
      card.append(name, meta, unavailable);
    } else {
      const link = document.createElement('a');
      link.className = 'retro-button temp-file-download';
      link.href = data.signedUrl || data.signedURL;
      link.target = '_blank';
      link.rel = 'noopener';
      link.download = row.media_name || '';
      link.textContent = 'Open / Download';
      card.append(name, meta, link);
    }
  }

  const bubbleMeta = bubble.querySelector('.message-meta');
  bubble.insertBefore(card, bubbleMeta || bubble.firstChild);
}

async function refreshAttachmentCards() {
  if (!schemaReady || !supabase || !user || !messageLog) return;
  const thread = await currentThread().catch(() => null);
  if (!thread) return;
  const { data, error } = await supabase
    .from('direct_messages')
    .select('id,message_type,media_path,media_name,media_type,media_size,media_expires_at')
    .eq('thread_id', thread.id)
    .eq('message_type', 'file')
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) return;
  for (const row of data || []) {
    const bubble = messageLog.querySelector(`.message-bubble[data-message-id="${CSS.escape(String(row.id))}"]`);
    if (bubble && row.media_path && row.media_expires_at) await addFileCard(bubble, row);
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshAttachmentCards(), 120);
}

function installStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .file-preview{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid rgba(255,255,255,.18);background:rgba(8,12,18,.88);margin-bottom:10px}
    .file-preview-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.file-preview-copy strong,.file-preview-copy small{overflow-wrap:anywhere}
    .message-compose.is-file-dragover{outline:2px dashed #00ef9a;outline-offset:-5px;background:rgba(0,239,154,.06)}
    .temp-file-card{display:flex;flex-direction:column;gap:6px;padding:10px;margin:4px 0 8px;border:1px solid rgba(0,239,154,.55);background:rgba(4,24,18,.68);min-width:0}
    .temp-file-card strong,.temp-file-card small{overflow-wrap:anywhere}.temp-file-card small{opacity:.78}.temp-file-card.is-expired{border-color:rgba(255,255,255,.2);opacity:.72}
    .temp-file-download{align-self:flex-start;text-decoration:none}
  `;
  document.head.append(style);
}

async function init() {
  if (!form || !fileInput || !isSupabaseConfigured() || !window.supabase?.createClient) return;
  installStyles();
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  user = (await supabase.auth.getSession()).data.session?.user || null;
  if (!user) return;
  await checkSchema();
  if (schemaReady) void cleanupMyExpiredFiles();
  syncEnabledState();

  new MutationObserver(() => {
    syncEnabledState();
    scheduleRefresh();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });

  new MutationObserver(scheduleRefresh).observe(messageLog, { childList: true, subtree: true });
  window.addEventListener('popstate', scheduleRefresh);
  scheduleRefresh();
}

fileInput?.addEventListener('change', () => chooseFile(fileInput.files?.[0] || null));
removeFileButton?.addEventListener('click', clearFile);
videoInput?.addEventListener('change', () => {
  if (videoInput.files?.[0]) clearFile();
});
form?.addEventListener('submit', (event) => void sendTemporaryFile(event), { capture: true });
form?.addEventListener('dragover', (event) => {
  if (videoInput?.disabled || !schemaReady) return;
  event.preventDefault();
  form.classList.add('is-file-dragover');
});
form?.addEventListener('dragleave', () => form.classList.remove('is-file-dragover'));
form?.addEventListener('drop', (event) => {
  if (videoInput?.disabled || !schemaReady) return;
  event.preventDefault();
  form.classList.remove('is-file-dragover');
  chooseFile(event.dataTransfer?.files?.[0] || null);
});

void init();
