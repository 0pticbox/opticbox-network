import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isSupabaseConfigured } from './supabase-config.js';
const cursor = document.getElementById('settings-cursor-style');
const cursorNote = document.getElementById('settings-cursor-note');
const allowed = new Set(['default', 'atom', 'star', 'heart', 'smile', 'rainbow']);
try { const saved = localStorage.getItem('opticbox-cursor-style'); if (allowed.has(saved)) cursor.value = saved; } catch {}
cursor?.addEventListener('change', () => {
  const value = allowed.has(cursor.value) ? cursor.value : 'default';
  try { localStorage.setItem('opticbox-cursor-style', value); } catch {}
  cursorNote.textContent = 'Saved. The cursor updates when you open the next page or refresh.';
});

const root = document.getElementById('settings-blocked-users');
const feedback = document.getElementById('settings-blocked-message');
function say(text, error = false) { feedback.textContent = text; feedback.classList.toggle('is-error', error); }
function avatar(profile) { const span = document.createElement('span'); span.className = 'messages-avatar'; if (profile?.avatar_url) { const img = document.createElement('img'); img.src = profile.avatar_url; img.alt = ''; span.append(img); } else span.textContent = (profile?.display_name || 'M').slice(0, 1).toUpperCase(); return span; }
if (isSupabaseConfigured() && root) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const user = (await supabase.auth.getSession()).data.session?.user || null;
  async function load() {
    if (!user) return;
    const blocks = await supabase.from('blocked_users').select('blocked_id,created_at').eq('blocker_id', user.id).order('created_at', { ascending: false });
    if (blocks.error) return say(blocks.error.message, true);
    const ids = (blocks.data || []).map((row) => row.blocked_id);
    root.replaceChildren();
    if (!ids.length) { const p = document.createElement('p'); p.className = 'review-empty'; p.textContent = 'You have not blocked anyone.'; root.append(p); return; }
    const found = await supabase.from('profiles').select('id,display_name,avatar_url,profile_tagline,status').in('id', ids);
    if (found.error) return say(found.error.message, true);
    const map = new Map((found.data || []).map((profile) => [profile.id, profile]));
    for (const id of ids) {
      const profile = map.get(id) || { id, display_name: 'Member' };
      const row = document.createElement('div'); row.className = 'settings-blocked-row'; row.append(avatar(profile));
      const copy = document.createElement('span'); const strong = document.createElement('strong'); const small = document.createElement('small'); strong.textContent = profile.display_name; small.textContent = profile.profile_tagline || profile.status || 'Blocked member'; copy.append(strong, small); row.append(copy);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'retro-button compact'; button.dataset.unblockUser = id; button.textContent = 'Unblock'; row.append(button); root.append(row);
    }
  }
  root.addEventListener('click', async (event) => { const button = event.target.closest('[data-unblock-user]'); if (!button) return; const result = await supabase.from('blocked_users').delete().eq('blocker_id', user.id).eq('blocked_id', button.dataset.unblockUser); if (result.error) return say(result.error.message, true); say('Member unblocked.'); await load(); });
  await load();
}
