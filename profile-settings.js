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
const CURSORS = new Set(['default', 'cube', 'star', 'heart', 'smile', 'rainbow']);
let supabase = null;
let user = null;
let profile = null;
let previewAvatarUrl = '';
let previewWallpaperUrl = '';

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('is-error', isError);
}
function fallbackName() {
  const metadataName = user?.user_metadata?.display_name;
  if (typeof metadataName === 'string' && metadataName.trim().length >= 2) return metadataName.trim().slice(0, 32);
  return (user?.email?.split('@')[0] || 'Member').slice(0, 32);
}
function safeFileName(name) { return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image'; }
function cleanHandle(value) { return String(value || '').trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 32); }
function safeUrl(value) { const raw=String(value||'').trim(); if(!raw)return ''; try{const url=new URL(raw);return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return ''} }
function validEmail(value) { const raw=String(value||'').trim(); return !raw || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw); }

async function uploadProfileImage(file, kind) {
  if (!file) return '';
  const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  if (!allowed.has(file.type)) throw new Error('Use a PNG, JPG, WebP, or GIF image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Profile images must be 8 MB or smaller.');
  const path = `${user.id}/${kind}-${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from('profile-images').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('profile-images').getPublicUrl(path).data.publicUrl || '';
}
function selectedCursor() {
  try {
    const value = localStorage.getItem(CURSOR_KEY);
    if (value === 'atom') { localStorage.setItem(CURSOR_KEY, 'cube'); return 'cube'; }
    return CURSORS.has(value) ? value : 'default';
  } catch (_) { return 'default'; }
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
  try { localStorage.setItem(CURSOR_KEY, next); } catch (_) {}
  updateCursorButtons(next);
  window.dispatchEvent(new CustomEvent('opticbox:cursor-change', { detail: { style: next } }));
  setMessage(`${next === 'default' ? 'Normal' : next === 'cube' ? 'Cube particle' : next[0].toUpperCase() + next.slice(1)} cursor selected for this browser.`);
}
function applyWallpaperMode(element, mode) {
  const selected = ['cover','contain','tile'].includes(mode) ? mode : 'cover';
  element.style.backgroundSize = selected === 'tile' ? 'auto' : selected;
  element.style.backgroundRepeat = selected === 'tile' ? 'repeat' : 'no-repeat';
  element.style.backgroundPosition = 'center';
}
function updatePreview() {
  const name = $('settings-display-name').value.trim() || 'Member';
  const tagline = $('settings-profile-tagline').value.trim() || 'Your profile tagline';
  const status = $('settings-status').value.trim();
  const accent = $('settings-accent-color').value || '#ff6b36';
  const dim = Number($('settings-background-dim').value || 62);
  const avatar = previewAvatarUrl || profile?.avatar_url || '';
  const wallpaper = $('settings-remove-background').checked ? '' : (previewWallpaperUrl || profile?.background_url || '');
  $('settings-preview-name').textContent = name;
  $('settings-preview-tagline').textContent = tagline;
  $('settings-preview-status').textContent = status;
  $('settings-preview-avatar').textContent = avatar ? '' : name.slice(0, 1).toUpperCase();
  $('settings-preview-avatar').style.backgroundImage = avatar ? `url("${avatar.replaceAll('"', '%22')}")` : '';
  $('settings-preview-avatar').style.borderColor = accent;
  $('settings-preview-cover').style.backgroundImage = wallpaper ? `url("${wallpaper.replaceAll('"', '%22')}")` : '';
  applyWallpaperMode($('settings-preview-cover'), $('settings-background-mode').value);
  $('settings-preview-cover').style.setProperty('--preview-dim', String(dim / 100));
  $('settings-dim-value').textContent = `${dim}%`;
}
function fillForm() {
  $('settings-display-name').value = profile.display_name || fallbackName();
  $('settings-profile-tagline').value = profile.profile_tagline || '';
  $('settings-profile-handle').value = profile.profile_handle || '';
  $('settings-status').value = profile.status || '';
  $('settings-bio').value = profile.bio || '';
  $('settings-genre').value = profile.genre || '';
  $('settings-occupation').value = profile.occupation || '';
  $('settings-here-for').value = profile.here_for || '';
  $('settings-interests').value = profile.interests || '';
  $('settings-accent-color').value = profile.accent_color || '#ff6b36';
  $('settings-background-dim').value = String(profile.background_dim ?? 62);
  $('settings-background-mode').value = ['cover','contain','tile'].includes(profile.background_mode) ? profile.background_mode : 'cover';
  $('settings-instagram-url').value = profile.instagram_url || '';
  $('settings-youtube-url').value = profile.youtube_url || '';
  $('settings-soundcloud-url').value = profile.soundcloud_url || '';
  $('settings-github-url').value = profile.github_url || '';
  $('settings-website-url').value = profile.website_url || '';
  $('settings-contact-email').value = profile.contact_email || '';
  $('settings-remove-background').checked = false;
  $('settings-account-email').textContent = user.email || '';
  $('settings-view-profile').href = `profile.html?id=${encodeURIComponent(user.id)}`;
  previewAvatarUrl = '';
  previewWallpaperUrl = '';
  updateCursorButtons(selectedCursor());
  updatePreview();
}

async function loadBlockedAccounts() {
  const root = $('settings-blocked-list');
  if (!root || !supabase || !user) return;
  const { data: blocks, error } = await supabase.from('blocked_users').select('blocked_id,created_at').eq('blocker_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  const ids = (blocks || []).map((row) => row.blocked_id);
  root.replaceChildren();
  if (!ids.length) { const empty=document.createElement('p');empty.className='empty-state';empty.textContent='No blocked accounts.';root.append(empty);return; }
  const { data: profiles, error: profileError } = await supabase.from('profiles').select('id,display_name,avatar_url').in('id', ids);
  if (profileError) throw profileError;
  const profileMap = new Map((profiles || []).map((item) => [item.id, item]));
  ids.forEach((id) => {
    const blocked = profileMap.get(id) || { id, display_name: 'Blocked member', avatar_url: '' };
    const row=document.createElement('div');row.className='request-row';
    const avatar=document.createElement('span');avatar.className='friend-avatar';avatar.textContent=blocked.avatar_url?'':(blocked.display_name||'B').slice(0,1).toUpperCase();avatar.style.backgroundImage=blocked.avatar_url?`url("${blocked.avatar_url.replaceAll('"','%22')}")`:'';
    const copy=document.createElement('span');copy.className='friend-copy';const name=document.createElement('strong');name.textContent=blocked.display_name||'Blocked member';const note=document.createElement('small');note.textContent='Hidden from messages';copy.append(name,note);
    const actions=document.createElement('span');actions.className='friend-actions';const unblock=document.createElement('button');unblock.type='button';unblock.className='retro-button';unblock.textContent='Unblock';
    unblock.addEventListener('click',async()=>{unblock.disabled=true;const{error:unblockError}=await supabase.rpc('unblock_member',{p_other_user:id});if(unblockError){setMessage(unblockError.message,true);unblock.disabled=false;return;}setMessage(`${blocked.display_name||'Member'} unblocked.`);await loadBlockedAccounts();});
    actions.append(unblock);row.append(avatar,copy,actions);root.append(row);
  });
}
async function ensureProfile() {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const seed = { id:user.id, display_name:fallbackName(), bio:'', status:'', avatar_url:'' };
  const inserted = await supabase.from('profiles').insert(seed).select('*').single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}
async function bootstrap() {
  if (!isSupabaseConfigured() || !window.supabase?.createClient) {
    warning.hidden = false;
    form.querySelectorAll('input,textarea,button,select').forEach((element) => { element.disabled = true; });
    return;
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) { window.location.replace(`signin.html?next=${encodeURIComponent('profile-settings.html')}`); return; }
  user = data.session.user;
  profile = await ensureProfile();
  fillForm();
  await loadBlockedAccounts();
}

form.addEventListener('input', updatePreview);
document.querySelectorAll('[data-cursor-style]').forEach((button) => button.addEventListener('click', () => chooseCursor(button.dataset.cursorStyle)));
$('settings-avatar-file').addEventListener('change', () => { const file=$('settings-avatar-file').files?.[0];previewAvatarUrl=file?URL.createObjectURL(file):'';updatePreview(); });
$('settings-background-file').addEventListener('change', () => { const file=$('settings-background-file').files?.[0];previewWallpaperUrl=file?URL.createObjectURL(file):'';if(file)$('settings-remove-background').checked=false;updatePreview(); });

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
    if (avatarFile) { setMessage('Uploading avatar…'); avatarUrl = await uploadProfileImage(avatarFile, 'avatar'); }
    if ($('settings-remove-background').checked) backgroundUrl = '';
    else if (backgroundFile) { setMessage('Uploading wallpaper…'); backgroundUrl = await uploadProfileImage(backgroundFile, 'wallpaper'); }

    const urlFields = ['instagram','youtube','soundcloud','github','website'];
    const urls = {};
    for (const field of urlFields) {
      const raw = $(`settings-${field}-url`).value.trim();
      const clean = safeUrl(raw);
      if (raw && !clean) throw new Error(`${field[0].toUpperCase()+field.slice(1)} must be a full http:// or https:// link.`);
      urls[field] = clean;
    }
    const contactEmail = $('settings-contact-email').value.trim();
    if (!validEmail(contactEmail)) throw new Error('Enter a valid public contact email or leave it blank.');

    const changes = {
      display_name: $('settings-display-name').value.trim(),
      profile_handle: cleanHandle($('settings-profile-handle').value),
      profile_tagline: $('settings-profile-tagline').value.trim(),
      status: $('settings-status').value.trim(),
      bio: $('settings-bio').value.trim(),
      genre: $('settings-genre').value.trim(),
      occupation: $('settings-occupation').value.trim(),
      here_for: $('settings-here-for').value.trim(),
      interests: $('settings-interests').value.trim(),
      avatar_url: avatarUrl,
      background_url: backgroundUrl,
      background_dim: Number($('settings-background-dim').value || 62),
      background_mode: $('settings-background-mode').value,
      accent_color: $('settings-accent-color').value,
      instagram_url: urls.instagram,
      youtube_url: urls.youtube,
      soundcloud_url: urls.soundcloud,
      github_url: urls.github,
      website_url: urls.website,
      contact_email: contactEmail,
      updated_at: new Date().toISOString(),
    };
    if (changes.display_name.length < 2) throw new Error('Display name must contain at least two characters.');
    const { data, error } = await supabase.from('profiles').update(changes).eq('id', user.id).select('*').single();
    if (error) {
      if (/column|schema cache/i.test(error.message || '')) throw new Error('Run supabase/2026-08-profile-layout-wallpaper.sql in Supabase, then save again.');
      throw error;
    }
    await supabase.auth.updateUser({ data: { display_name: changes.display_name } });
    profile = data;
    $('settings-avatar-file').value = '';
    $('settings-background-file').value = '';
    $('settings-remove-background').checked = false;
    fillForm();
    setMessage('Profile, links, and wallpaper saved.');
  } catch (error) {
    setMessage(error.message || 'Settings could not be saved.', true);
  } finally { submit.disabled = false; }
});
$('settings-signout').addEventListener('click', async () => { if (!supabase) return; await supabase.auth.signOut(); window.location.replace('signin.html'); });
bootstrap().catch((error) => setMessage(error.message || 'Profile settings could not load.', true));