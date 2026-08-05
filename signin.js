import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

const signInForm = document.getElementById('signin-form');
const signUpForm = document.getElementById('signup-form');
const signInTab = document.getElementById('show-signin');
const signUpTab = document.getElementById('show-signup');
const message = document.getElementById('auth-message');
const warning = document.getElementById('auth-config-warning');

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('is-error', isError);
}

function safeNextPage() {
  const candidate = new URLSearchParams(window.location.search).get('next') || 'members.html';
  try {
    const url = new URL(candidate, window.location.href);
    if (url.origin !== window.location.origin) return 'members.html';
    if (url.pathname.endsWith('/signin.html')) return 'members.html';
    return `${url.pathname.split('/').pop() || 'members.html'}${url.search}${url.hash}`;
  } catch (_) {
    return 'members.html';
  }
}

function switchPanel(panel) {
  const signIn = panel === 'signin';
  signInForm.hidden = !signIn;
  signUpForm.hidden = signIn;
  signInTab.setAttribute('aria-selected', String(signIn));
  signUpTab.setAttribute('aria-selected', String(!signIn));
  signInTab.classList.toggle('primary', signIn);
  signUpTab.classList.toggle('primary', !signIn);
  setMessage('');
  requestAnimationFrame(() => {
    document.getElementById(signIn ? 'signin-email' : 'signup-name')?.focus();
  });
}

signInTab.addEventListener('click', () => switchPanel('signin'));
signUpTab.addEventListener('click', () => switchPanel('signup'));

if (!isSupabaseConfigured() || !window.supabase?.createClient) {
  warning.hidden = false;
  signInForm.querySelectorAll('input,button').forEach((element) => { element.disabled = true; });
  signUpForm.querySelectorAll('input,button').forEach((element) => { element.disabled = true; });
} else {
  const supabase = window.supabase.createClient(
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

  let redirecting = false;
  async function finishSignIn(session) {
    if (!session?.user || redirecting) return;
    redirecting = true;
    setMessage('Signed in. Opening your account…');

    // Force one final read from the persisted auth store before navigating.
    await supabase.auth.getSession();
    await new Promise((resolve) => window.setTimeout(resolve, 90));
    window.location.replace(safeNextPage());
  }

  const { data: initial } = await supabase.auth.getSession();
  if (initial.session) await finishSignIn(initial.session);

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) void finishSignIn(session);
  });

  signInForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = signInForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    setMessage('Signing in…');

    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      submit.disabled = false;
      setMessage(error.message, true);
      return;
    }
    await finishSignIn(data.session);
  });

  signUpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = signUpForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    setMessage('Creating your account…');

    const displayName = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const redirectUrl = new URL('signin.html', window.location.href);
    redirectUrl.searchParams.set('next', safeNextPage());

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: redirectUrl.href,
      },
    });

    if (error) {
      submit.disabled = false;
      setMessage(error.message, true);
      return;
    }
    if (data.session) {
      await finishSignIn(data.session);
      return;
    }

    submit.disabled = false;
    switchPanel('signin');
    document.getElementById('signin-email').value = email;
    setMessage('Account created. Check your email to confirm it, then return here to sign in.');
  });
}
