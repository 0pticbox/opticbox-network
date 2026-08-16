import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

/* Shared performance bootstrap ------------------------------------------------
   Runs through site.js on the network pages. It pauses nonessential animation
   during first load and gives CSS a lightweight device tier to work with. */
const performanceRoot = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = window.matchMedia('(hover: none), (pointer: coarse)').matches;
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
const coreCount = Number(navigator.hardwareConcurrency) || 0;
const deviceMemory = Number(navigator.deviceMemory) || 0;
const slowConnection = Boolean(
  connection && ['slow-2g', '2g'].includes(String(connection.effectiveType || '').toLowerCase())
);
const saveData = Boolean(connection?.saveData);

const lowPerformance = Boolean(
  reducedMotion ||
  saveData ||
  slowConnection ||
  (coreCount > 0 && coreCount <= 2) ||
  (deviceMemory > 0 && deviceMemory <= 2)
);
const midPerformance = Boolean(
  !lowPerformance && (
    coarsePointer ||
    (coreCount > 0 && coreCount <= 4) ||
    (deviceMemory > 0 && deviceMemory <= 4)
  )
);

performanceRoot.classList.add('perf-loading');
performanceRoot.classList.toggle('perf-low', lowPerformance);
performanceRoot.classList.toggle('perf-mid', midPerformance);
performanceRoot.dataset.performanceTier = lowPerformance ? 'low' : (midPerformance ? 'mid' : 'full');

let savedCursorStyle = 'default';
try {
  savedCursorStyle = localStorage.getItem('opticbox-cursor-style') || 'default';
} catch (_) {
  savedCursorStyle = 'default';
}

function requestCursorStyle(style) {
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('opticbox:cursor-change', {
      detail: { style },
    }));
  }, 0);
}

/* Suspend custom cursor painting while the page is competing for first-load
   resources. Very low-tier devices stay on the native cursor unless the user
   explicitly changes the setting again after the page is ready. */
requestCursorStyle('default');

let performanceReleased = false;
function releasePerformanceLoading() {
  if (performanceReleased) return;
  performanceReleased = true;
  const settleDelay = lowPerformance ? 120 : (midPerformance ? 60 : 0);
  window.setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        performanceRoot.classList.remove('perf-loading');
        performanceRoot.classList.add('perf-ready');
        window.dispatchEvent(new Event('resize'));
        if (!lowPerformance && savedCursorStyle !== 'default') {
          requestCursorStyle(savedCursorStyle);
        }
      });
    });
  }, settleDelay);
}

/* Nudge the shared particle canvas after the tier class is applied so low-power
   and touch devices do not keep a full-resolution background buffer. */
requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));

if (document.readyState === 'complete') {
  releasePerformanceLoading();
} else {
  window.addEventListener('load', releasePerformanceLoading, { once: true });
  window.setTimeout(releasePerformanceLoading, 2200);
}

const settingsLinks = [
  ...document.querySelectorAll(
    'a[href="profile-settings.html"], a[href^="profile-settings.html?"], a[href^="profile-settings.html#"]'
  ),
];
const authOnly = [...document.querySelectorAll('[data-auth-only]')];
const signedOutOnly = [...document.querySelectorAll('[data-signed-out-only]')];
const myProfileLinks = [...document.querySelectorAll('[data-my-profile]')];

function updateMyProfileLinks(session) {
  const id = session?.user?.id || '';
  const href = id ? `profile.html?id=${encodeURIComponent(id)}` : 'members.html';
  myProfileLinks.forEach((link) => { link.href = href; });
}

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
updateMyProfileLinks(null);

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
    updateMyProfileLinks(session);

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
