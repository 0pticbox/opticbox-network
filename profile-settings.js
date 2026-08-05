import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

const $ = (id) => document.getElementById(id);
const warning = $('settings-config-warning');
const form = $('profile-settings-form');
const message = $('settings-message');
const CURSOR_KEY = 'opticbox-cursor-style';
const CURSORS = new Set(['default', 'atom', 'star', 'heart', 'smile', 'rainbow']);
let supabase = null;
let user = null;
let profile = null;

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('is-error', isError);
}

function fallbackName() {
  const metadataName = user?.user_metadata?.display_name;
  if (typeof metadataName === 'string' && metadataName.trim().length >= 2) {
    return metadataName.trim().slice(0, 32);
  }
  return (user?.email?.split('@')[0] || 'Member').slice(0, 32);
}

function safeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
}

async function uploadProfileImage(file, kind) {
  if (!file) return '';
  const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  if (!allowed.has(file.type)) throw new Error('Use a PNG, JPG, WebP, or GIF image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Profile images must be 8 MB or smaller.');

  const path = `${user.id}/${kind}-${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from('profile-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('profile-images').getPublicUrl(path);
  return data.publicUrl || '';
}

function selectedCursor() {
  try {
    const value = localStorage.getItem(CURSOR_KEY);
    return CURSORS.has(value) ? value : 'default';
  } catch (_) {
    return 'default';
  }
}

function updateCursorButtons(style) {
  document.querySelectorAll('[data-cursor-style]').forEach((button) => {
    const selected = button.dataset.cursorStyle === style;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function chooseCursor(style) {
  const next = CURSORS.has(style) ? style : 'default';
  try { localStorage.setItem(CURSOR_KEY, next); } catch (_) { /* optional */ }
  updateCursorButtons(next);
  window.dispatchEvent(new CustomEvent('opticbox:cursor-change', { detail: { style: next } }));
  setMessage(`${next === 'default' ? 'Normal' : next[0].toUpperCase() + next.slice(1)} cursor selected for this browser.`);
}

function updatePreview() {
  const name = $('settings-display-name').value.trim() || 'Member';
  const tagline = $('settings-profile-tagline').value.trim() || 'Your profile tagline';
  const status = $('settings-status').value.trim();
  const accent = $('settings-accent-color').value || '#ff6b36';
  const dim = Number($('settings-background-dim').value || 62);
  const avatar = profile?.avatar_url || '';
  const background = $('settings-remove-background').checked ? '' : (profile?.background_url || '');

  $('settings-preview-name').textContent = name;
  $('settings-preview-tagline').textContent = tagline;
  $('settings-preview-status').textContent = status;
  $('settings-preview-avatar').textContent = avatar ? '' : name.slice(0, 1).toUpperCase();
  $('settings-preview-avatar').style.backgroundImage = avatar ? `url("${avatar.replaceAll('"', '%22')}")` : '';
  $('settings-preview-avatar').style.setProperty('--preview-accent', accent);
  $('settings-preview-avatar').style.borderColor = accent;
  $('settings-preview-cover').style.backgroundImage = background ? `url("${background.replaceAll('"', '%22')}")` : '';
  $('settings-preview-cover').style.setProperty('--preview-dim', String(dim / 100));
  $('settings-dim-value').textContent = `${dim}%`;
}

function fillForm() {
  $('settings-display-name').value = profile.display_name || fallbackName();
  $('settings-profile-tagline').value = profile.profile_tagline || '';
  $('settings-status').value = profile.status || '';
  $('settings-bio').value = profile.bio || '';
  $('settings-accent-color').value = profile.accent_color || '#ff6b36';
  $('settings-background-dim').value = String(profile.background_dim ?? 62);
  $('settings-instagram-url').value = profile.instagram_url || '';
  $('settings-youtube-url').value = profile.youtube_url || '';
  $('settings-remove-background').checked = false;
  $('settings-account-email').textContent = user.email || '';
  $('settings-view-profile').href = `profile.html?id=${encodeURIComponent(user.id)}`;
  updateCursorButtons(selectedCursor());
  updatePreview();
}


async function loadBlockedAccounts() {
  const root = $('settings-blocked-list');
  if (!root || !supabase || !user) return;
  const { data: blocks, error } = await supabase
    .from('blocked_users')
    .select('blocked_id,created_at')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const ids = (blocks || []).map((row) => row.blocked_id);
  root.replaceChildren();
  if (!ids.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No blocked accounts.';
    root.append(empty);
    return;
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id,display_name,avatar_url')
    .in('id', ids);
  if (profileError) throw profileError;
  const profileMap = new Map((profiles || []).map((item) => [item.id, item]));

  ids.forEach((id) => {
    const blocked = profileMap.get(id) || { id, display_name: 'Blocked member', avatar_url: '' };
    const row = document.createElement('div');
    row.className = 'request-row';
    const avatar = document.createElement('span');
    avatar.className = 'friend-avatar';
    avatar.textContent = blocked.avatar_url ? '' : (blocked.display_name || 'B').slice(0, 1).toUpperCase();
    avatar.style.backgroundImage = blocked.avatar_url ? `url("${blocked.avatar_url.replaceAll('"', '%22')}")` : '';
    const copy = document.createElement('span');
    copy.className = 'friend-copy';
    const name = document.createElement('strong');
    name.textContent = blocked.display_name || 'Blocked member';
    const note = document.createElement('small');
    note.textContent = 'Hidden from messages';
    copy.append(name, note);
    const actions = document.createElement('span');
    actions.className = 'friend-actions';
    const unblock = document.createElement('button');
    unblock.type = 'button';
    unblock.className = 'retro-button';
    unblock.textContent = 'Unblock';
    unblock.addEventListener('click', async () => {
      unblock.disabled = true;
      const { error: unblockError } = await supabase.rpc('unblock_member', { p_other_user: id });
      if (unblockError) {
        setMessage(unblockError.message, true);
        unblock.disabled = false;
        return;
      }
      setMessage(`${blocked.display_name || 'Member'} unblocked.`);
      await loadBlockedAccounts();
    });
    actions.append(unblock);
    row.append(avatar, copy, actions);
    root.append(row);
  });
}

async function ensureProfile() {
  const fields = 'id,display_name,bio,status,avatar_url,background_url,background_dim,accent_color,profile_tagline,instagram_url,youtube_url';
  const { data, error } = await supabase.from('profiles').select(fields).eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (data) return data;

  const seed = {
    id: user.id,
    display_name: fallbackName(),
    bio: '',
    status: '',
    avatar_url: '',
    background_url: '',
    background_dim: 62,
    accent_color: '#ff6b36',
    profile_tagline: '',
    instagram_url: '',
    youtube_url: '',
  };
  const { data: inserted, error: insertError } = await supabase.from('profiles').insert(seed).select(fields).single();
  if (insertError) throw insertError;
  return inserted;
}

async function bootstrap() {
  if (!isSupabaseConfigured() || !window.supabase?.createClient) {
    warning.hidden = false;
    form.querySelectorAll('input,textarea,button,select').forEach((element) => { element.disabled = true; });
    return;
  }

  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) {
    const next = encodeURIComponent('profile-settings.html');
    window.location.replace(`signin.html?next=${next}`);
    return;
  }
  user = data.session.user;
  profile = await ensureProfile();
  fillForm();
  await loadBlockedAccounts();
}

form.addEventListener('input', updatePreview);
document.querySelectorAll('[data-cursor-style]').forEach((button) => {
  button.addEventListener('click', () => chooseCursor(button.dataset.cursorStyle));
});

$('settings-avatar-file').addEventListener('change', () => {
  const file = $('settings-avatar-file').files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  $('settings-preview-avatar').textContent = '';
  $('settings-preview-avatar').style.backgroundImage = `url("${url}")`;
});
$('settings-background-file').addEventListener('change', () => {
  const file = $('settings-background-file').files?.[0];
  if (!file) return;
  $('settings-remove-background').checked = false;
  const url = URL.createObjectURL(file);
  $('settings-preview-cover').style.backgroundImage = `url("${url}")`;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase || !user) return;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  setMessage('Saving settings…');

  try {
    let avatarUrl = profile.avatar_url || '';
    let backgroundUrl = profile.background_url || '';
    const avatarFile = $('settings-avatar-file').files?.[0];
    const backgroundFile = $('settings-background-file').files?.[0];
    if (avatarFile) {
      setMessage('Uploading avatar…');
      avatarUrl = await uploadProfileImage(avatarFile, 'avatar');
    }
    if ($('settings-remove-background').checked) {
      backgroundUrl = '';
    } else if (backgroundFile) {
      setMessage('Uploading background…');
      backgroundUrl = await uploadProfileImage(backgroundFile, 'background');
    }

    const changes = {
      display_name: $('settings-display-name').value.trim(),
      profile_tagline: $('settings-profile-tagline').value.trim(),
      status: $('settings-status').value.trim(),
      bio: $('settings-bio').value.trim(),
      avatar_url: avatarUrl,
      background_url: backgroundUrl,
      background_dim: Number($('settings-background-dim').value || 62),
      accent_color: $('settings-accent-color').value,
      instagram_url: $('settings-instagram-url').value.trim(),
      youtube_url: $('settings-youtube-url').value.trim(),
      updated_at: new Date().toISOString(),
    };
    if (changes.display_name.length < 2) throw new Error('Display name must contain at least two characters.');

    const { data, error } = await supabase.from('profiles').update(changes).eq('id', user.id).select('*').single();
    if (error) throw error;
    profile = data;
    $('settings-avatar-file').value = '';
    $('settings-background-file').value = '';
    $('settings-remove-background').checked = false;
    fillForm();
    setMessage('Settings saved.');
  } catch (error) {
    setMessage(error.message || 'Settings could not be saved.', true);
  } finally {
    submit.disabled = false;
  }
});

$('settings-signout').addEventListener('click', async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.replace('signin.html');
});

bootstrap().catch((error) => setMessage(error.message || 'Profile settings could not load.', true));
