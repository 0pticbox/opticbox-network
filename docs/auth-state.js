import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

const settingsLinks = [
  ...document.querySelectorAll(
    'a[href="profile-settings.html"], a[href^="profile-settings.html?"], a[href^="profile-settings.html#"]'
  ),
];
const authOnly = [...document.querySelectorAll('[data-auth-only]')];
const signedOutOnly = [...document.querySelectorAll('[data-signed-out-only]')];

function showSignedInUi(signedIn) {
  settingsLinks.forEach((link) => {
    link.hidden = !signedIn;
  });
  authOnly.forEach((element) => {
    element.hidden = !signedIn;
  });
  signedOutOnly.forEach((element) => {
    element.hidden = signedIn;
  });
  document.documentElement.dataset.authState = signedIn ? 'signed-in' : 'signed-out';
}

showSignedInUi(false);

function safeCurrentTarget() {
  const name = window.location.pathname.split('/').pop() || 'index.html';
  const target = `${name}${window.location.search}${window.location.hash}`;
  return target.startsWith('signin.html') ? 'members.html' : target;
}

function redirectToSignIn() {
  const next = encodeURIComponent(safeCurrentTarget());
  window.location.replace(`signin.html?next=${next}`);
}

let createClient = window.supabase?.createClient || null;
if (!createClient) {
  try {
    ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
  } catch (_) {
    createClient = null;
  }
}

if (!isSupabaseConfigured() || !createClient) {
  if (document.body.dataset.authRequired === 'true') {
    document.body.classList.add('auth-config-missing');
  }
} else {
  const client = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

  window.opticboxAuth = { client, session: null };

  async function applySession(session) {
    window.opticboxAuth.session = session || null;
    const signedIn = Boolean(session?.user);
    showSignedInUi(signedIn);

    if (!signedIn && document.body.dataset.authRequired === 'true') {
      redirectToSignIn();
    }

    document.dispatchEvent(
      new CustomEvent('opticbox:auth-ready', {
        detail: { session: session || null },
      })
    );
  }

  const { data } = await client.auth.getSession();
  await applySession(data.session);

  client.auth.onAuthStateChange((_event, session) => {
    void applySession(session);
  });
}
