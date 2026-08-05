import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isSupabaseConfigured } from './supabase-config.js';

const byId = (id) => document.getElementById(id);
const warning = byId('settings-config-warning');
const signedOut = byId('settings-signed-out');
const app = byId('settings-app');
const form = byId('profile-settings-form');
const message = byId('settings-message');
const sessionLabel = byId('settings-session-label');
const viewProfile = byId('settings-view-profile');
const inputs = {
  name: byId('settings-display-name'), tagline: byId('settings-tagline'), status: byId('settings-status'), bio: byId('settings-bio'),
  accent: byId('settings-accent'), dim: byId('settings-dim'), avatar: byId('settings-avatar'), background: byId('settings-background'),
  removeBackground: byId('settings-remove-background'), instagram: byId('settings-instagram'), youtube: byId('settings-youtube'),
};
const preview = {
  card: byId('settings-preview-card'), background: byId('settings-preview-background'), shade: byId('settings-preview-shade'),
  avatar: byId('settings-preview-avatar'), name: byId('settings-preview-name'), tagline: byId('settings-preview-tagline'), status: byId('settings-preview-status'),
};
let supabase = null;
let activeUser = null;
let activeProfile = null;
let localAvatarUrl = '';
let localBackgroundUrl = '';

function setMessage(text, error = false) { message.textContent = text; message.classList.toggle('is-error', error); }
function fallbackName(user) { const named = user?.user_metadata?.display_name; return (typeof named === 'string' && named.trim().length >= 2 ? named.trim() : user?.email?.split('@')[0] || 'Member').slice(0, 32); }
function safeUrl(value) { const raw = String(value || '').trim(); if (!raw) return ''; try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function validateImage(file, maxMb) { if (!file) return ''; if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) return 'Use a PNG, JPG, WEBP, or GIF image.'; if (file.size > maxMb * 1024 * 1024) return `That image must be ${maxMb} MB or smaller.`; return ''; }

async function ensureProfile(user) {
  const fields = 'id,display_name,bio,status,avatar_url,background_url,background_dim,accent_color,profile_tagline,instagram_url,youtube_url';
  const { data, error } = await supabase.from('profiles').select(fields).eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const profile = { id:user.id, display_name:fallbackName(user), bio:'', status:'', avatar_url:'', background_url:'', background_dim:62, accent_color:'#ff6b36', profile_tagline:'', instagram_url:'', youtube_url:'' };
  const result = await supabase.from('profiles').insert(profile).select(fields).single();
  if (result.error) throw result.error;
  return result.data;
}

function setAvatar(url, name) {
  preview.avatar.replaceChildren();
  if (url) { const image = document.createElement('img'); image.src = url; image.alt = `${name}'s profile picture preview`; preview.avatar.append(image); }
  else preview.avatar.textContent = name.slice(0, 1).toUpperCase();
}

function updatePreview() {
  const name = inputs.name.value.trim() || 'Member';
  const accent = /^#[0-9a-f]{6}$/i.test(inputs.accent.value) ? inputs.accent.value : '#ff6b36';
  const dim = Math.max(20, Math.min(90, Number(inputs.dim.value) || 62));
  preview.card.style.setProperty('--settings-accent', accent);
  preview.name.textContent = name;
  preview.tagline.textContent = inputs.tagline.value.trim() || '0PTICBOX member';
  preview.status.textContent = inputs.status.value.trim() || 'Your current status appears here.';
  preview.shade.style.background = `rgba(2,4,9,${dim / 100})`;
  preview.background.style.backgroundImage = localBackgroundUrl && !inputs.removeBackground.checked ? `url("${localBackgroundUrl.replace(/"/g, '%22')}")` : '';
  setAvatar(localAvatarUrl, name);
}

function populate(profile) {
  inputs.name.value = profile.display_name || fallbackName(activeUser);
  inputs.tagline.value = profile.profile_tagline || '';
  inputs.status.value = profile.status || '';
  inputs.bio.value = profile.bio || '';
  inputs.accent.value = /^#[0-9a-f]{6}$/i.test(profile.accent_color || '') ? profile.accent_color : '#ff6b36';
  inputs.dim.value = String(Math.max(20, Math.min(90, Number(profile.background_dim) || 62)));
  inputs.instagram.value = profile.instagram_url || '';
  inputs.youtube.value = profile.youtube_url || '';
  inputs.removeBackground.checked = false;
  localAvatarUrl = profile.avatar_url || '';
  localBackgroundUrl = profile.background_url || '';
  sessionLabel.textContent = activeUser.email || 'signed in';
  viewProfile.href = `profile.html?id=${encodeURIComponent(activeUser.id)}`;
  updatePreview();
}

async function upload(file, prefix, maxMb) {
  if (!file) return '';
  const invalid = validateImage(file, maxMb); if (invalid) throw new Error(invalid);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${activeUser.id}/${prefix}-${Date.now()}.${ext}`;
  const result = await supabase.storage.from('profile-images').upload(path, file, { cacheControl:'3600', upsert:false, contentType:file.type });
  if (result.error) throw result.error;
  return supabase.storage.from('profile-images').getPublicUrl(path).data.publicUrl;
}

function showSignedOut() { signedOut.hidden = false; app.hidden = true; }

if (!isSupabaseConfigured()) { warning.hidden = false; showSignedOut(); }
else {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
  const session = (await supabase.auth.getSession()).data.session;
  activeUser = session?.user || null;
  if (!activeUser) showSignedOut();
  else {
    try { activeProfile = await ensureProfile(activeUser); signedOut.hidden = true; app.hidden = false; populate(activeProfile); }
    catch (error) { app.hidden = false; setMessage(error.message || 'Your profile settings could not load.', true); }
  }
}

[inputs.name, inputs.tagline, inputs.status, inputs.bio, inputs.accent, inputs.dim, inputs.removeBackground].forEach((input) => input?.addEventListener('input', updatePreview));
inputs.avatar?.addEventListener('change', () => { const file = inputs.avatar.files?.[0]; if (!file) { localAvatarUrl = activeProfile?.avatar_url || ''; updatePreview(); return; } const error = validateImage(file,5); if (error) { setMessage(error,true); inputs.avatar.value=''; return; } localAvatarUrl = URL.createObjectURL(file); updatePreview(); });
inputs.background?.addEventListener('change', () => { const file = inputs.background.files?.[0]; if (!file) { localBackgroundUrl = activeProfile?.background_url || ''; updatePreview(); return; } const error = validateImage(file,8); if (error) { setMessage(error,true); inputs.background.value=''; return; } localBackgroundUrl = URL.createObjectURL(file); inputs.removeBackground.checked=false; updatePreview(); });

form?.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!supabase || !activeUser || !activeProfile) return;
  const name = inputs.name.value.trim();
  const instagramRaw = inputs.instagram.value.trim(); const youtubeRaw = inputs.youtube.value.trim();
  const instagram = safeUrl(instagramRaw); const youtube = safeUrl(youtubeRaw);
  if (name.length < 2) return setMessage('Display names need at least 2 characters.', true);
  if (instagramRaw && !instagram) return setMessage('The Instagram link must start with http:// or https://.', true);
  if (youtubeRaw && !youtube) return setMessage('The YouTube link must start with http:// or https://.', true);
  setMessage('Saving profile settings…');
  try {
    let avatarUrl = activeProfile.avatar_url || '';
    let backgroundUrl = inputs.removeBackground.checked ? '' : activeProfile.background_url || '';
    if (inputs.avatar.files?.[0]) avatarUrl = await upload(inputs.avatar.files[0], 'avatar', 5);
    if (inputs.background.files?.[0]) backgroundUrl = await upload(inputs.background.files[0], 'background', 8);
    const payload = { display_name:name, profile_tagline:inputs.tagline.value.trim(), status:inputs.status.value.trim(), bio:inputs.bio.value.trim(), avatar_url:avatarUrl, background_url:backgroundUrl, background_dim:Math.max(20,Math.min(90,Number(inputs.dim.value)||62)), accent_color:/^#[0-9a-f]{6}$/i.test(inputs.accent.value)?inputs.accent.value:'#ff6b36', instagram_url:instagram, youtube_url:youtube, updated_at:new Date().toISOString() };
    const fields = 'id,display_name,bio,status,avatar_url,background_url,background_dim,accent_color,profile_tagline,instagram_url,youtube_url';
    const result = await supabase.from('profiles').update(payload).eq('id',activeUser.id).select(fields).single();
    if (result.error) throw result.error;
    await supabase.auth.updateUser({ data:{ display_name:name } });
    activeProfile=result.data; localAvatarUrl=result.data.avatar_url||''; localBackgroundUrl=result.data.background_url||''; inputs.avatar.value=''; inputs.background.value=''; inputs.removeBackground.checked=false; populate(result.data); setMessage('Profile settings saved.');
  } catch (error) { setMessage(error.message || 'Your profile settings could not be saved.', true); }
});
