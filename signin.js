import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isSupabaseConfigured } from './supabase-config.js';

const $ = (id) => document.getElementById(id);
const warning = $('signin-config-warning');
const forms = $('signin-forms');
const sessionBox = $('signin-session');
const sessionLabel = $('signin-session-label');
const continueLink = $('signin-continue');
const signOutButton = $('signin-signout');
const signInForm = $('signin-form');
const signUpForm = $('signup-form');
const message = $('signin-message');
let supabase = null;

function setMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle('is-error', error);
}

function safeNext() {
  const raw = new URLSearchParams(location.search).get('next') || 'members.html';
  try {
    const target = new URL(raw, location.href);
    if (target.origin !== location.origin) return 'members.html';
    return `${target.pathname.split('/').pop() || 'members.html'}${target.search}${target.hash}`;
  } catch {
    return 'members.html';
  }
}

function renderSession(session) {
  const signedIn = Boolean(session?.user);
  forms.hidden = signedIn;
  sessionBox.hidden = !signedIn;
  continueLink.href = safeNext();
  if (signedIn) sessionLabel.textContent = `Signed in as ${session.user.email || 'member'}.`;
}

if (!isSupabaseConfigured()) {
  warning.hidden = false;
  forms.querySelectorAll('input,button').forEach((element) => { element.disabled = true; });
  setMessage('Add your Supabase project URL and publishable key before signing in.', true);
} else {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data } = await supabase.auth.getSession();
  renderSession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => renderSession(session));
}

signInForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase) return;
  setMessage('Signing in…');
  const email = $('signin-email').value.trim();
  const password = $('signin-password').value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return setMessage(error.message, true);
  signInForm.reset();
  const confirmed = (await supabase.auth.getSession()).data.session;
  if (!confirmed) return setMessage('The session did not finish loading. Please try once more.', true);
  setMessage('Signed in. Opening your account…');
  location.replace(safeNext());
});

signUpForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase) return;
  const displayName = $('signup-name').value.trim();
  const email = $('signup-email').value.trim();
  const password = $('signup-password').value;
  if (displayName.length < 2) return setMessage('Display names need at least 2 characters.', true);
  setMessage('Creating your account…');
  const redirectTo = new URL(`signin.html?next=${encodeURIComponent(safeNext())}`, location.href).href;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: redirectTo },
  });
  if (error) return setMessage(error.message, true);
  signUpForm.reset();
  if (data.session) {
    setMessage('Account created. Opening your account…');
    location.replace(safeNext());
  } else {
    setMessage('Account created. Check your email to confirm it, then return here to sign in.');
  }
});

signOutButton?.addEventListener('click', async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  setMessage('Signed out.');
  renderSession(null);
});
