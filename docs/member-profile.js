import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

const PRODUCTS = Object.freeze({
  opticscope: '0PTICSCOPE',
  '0ps3': '0PS3 Visualizer',
  spectravault: 'SPECTRAVAULT',
  distortion: 'DISTORTION',
  'dj-visual-studio': 'DJ Visual Studio',
  'boxed-arp': 'BOXED ARP',
  'orbital-repair': 'Orbital Repair',
  'inner-light-runner': 'Inner Light Runner',
});

const $ = (id) => document.getElementById(id);
const profileId = new URLSearchParams(window.location.search).get('id');
const editLink = $('profile-edit-link');
const messageLink = $('profile-message-link');
const message = $('profile-message');

function say(text, error = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('is-error', error);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function cleanHandle(value, fallback = 'member') {
  const raw = String(value || '').trim().replace(/^@+/, '');
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 32);
  if (cleaned) return cleaned;
  return String(fallback || 'member').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32) || 'member';
}

function dateText(value, short = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', short ? { year: 'numeric' } : { month: 'long', year: 'numeric' }).format(date);
}

function starText(value) {
  const number = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return `${'★'.repeat(number)}${'☆'.repeat(5 - number)}`;
}

function renderAvatar(profile) {
  const root = $('profile-avatar');
  root.replaceChildren();
  if (profile.avatar_url) {
    const image = document.createElement('img');
    image.src = profile.avatar_url;
    image.alt = `${profile.display_name}'s profile picture`;
    root.append(image);
  } else {
    const letter = document.createElement('span');
    letter.textContent = (profile.display_name || '?').slice(0, 1).toUpperCase();
    root.append(letter);
  }
  const scan = document.createElement('i');
  root.append(scan);
}

function applyWallpaper(profile) {
  const stage = $('member-profile-stage');
  const background = $('profile-background');
  const overlay = $('profile-background-overlay');
  const accent = /^#[0-9a-f]{6}$/i.test(profile.accent_color || '') ? profile.accent_color : '#ff6b36';
  stage.style.setProperty('--member-accent', accent);
  document.documentElement.style.setProperty('--member-accent', accent);

  const dim = Math.max(20, Math.min(90, Number(profile.background_dim) || 62));
  overlay.style.background = `rgba(3, 5, 10, ${dim / 100})`;
  const wallpaper = safeHttpUrl(profile.background_url);
  const mode = ['cover', 'contain', 'tile'].includes(profile.background_mode) ? profile.background_mode : 'cover';
  background.className = `member-profile-wallpaper wallpaper-${mode}`;
  background.style.backgroundImage = wallpaper ? `url("${wallpaper.replace(/"/g, '%22')}")` : '';
  background.classList.toggle('has-custom-wallpaper', Boolean(wallpaper));
}

function renderInterests(profile) {
  const root = $('profile-interests');
  root.replaceChildren();
  const interests = String(profile.interests || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
  if (!interests.length) interests.push('0PTICBOX Network');
  for (const item of interests) {
    const tag = document.createElement('span');
    tag.textContent = item;
    root.append(tag);
  }
}

function renderContactLinks(profile) {
  const root = $('profile-contact-links');
  root.replaceChildren();
  const email = String(profile.contact_email || '').trim();
  const links = [
    ['◎', 'Instagram', safeHttpUrl(profile.instagram_url)],
    ['▶', 'YouTube', safeHttpUrl(profile.youtube_url)],
    ['◉', 'SoundCloud', safeHttpUrl(profile.soundcloud_url)],
    ['⌘', 'GitHub', safeHttpUrl(profile.github_url)],
    ['↗', 'Website', safeHttpUrl(profile.website_url)],
    ['✉', 'Contact', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : ''],
  ].filter(([, , url]) => url);

  if (!links.length) {
    const empty = document.createElement('p');
    empty.className = 'member-contact-empty';
    empty.textContent = 'No public links yet.';
    root.append(empty);
    return;
  }

  for (const [symbol, label, url] of links) {
    const link = document.createElement('a');
    link.href = url;
    if (!url.startsWith('mailto:')) {
      link.target = '_blank';
      link.rel = 'noopener';
    }
    const icon = document.createElement('span');
    icon.textContent = symbol;
    link.append(icon, document.createTextNode(label));
    root.append(link);
  }
}

function renderReviews(reviews) {
  const root = $('profile-reviews');
  root.replaceChildren();
  $('detail-reviews').textContent = String(reviews.length);
  if (!reviews.length) {
    const empty = document.createElement('p');
    empty.className = 'review-empty';
    empty.textContent = 'No product reviews yet.';
    root.append(empty);
    return;
  }
  for (const review of reviews) {
    const article = document.createElement('article');
    article.className = 'personal-review-card';
    const heading = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = PRODUCTS[review.product_slug] || review.product_slug;
    const stars = document.createElement('span');
    stars.textContent = starText(review.rating);
    heading.append(title, stars);
    const comment = document.createElement('p');
    comment.textContent = review.comment || '';
    const stamp = document.createElement('small');
    stamp.textContent = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(review.updated_at || review.created_at));
    article.append(heading, comment, stamp);
    root.append(article);
  }
}

if (!profileId) {
  say('That profile link is missing a member ID.', true);
} else if (!isSupabaseConfigured()) {
  say('Member profiles need Supabase connected before they can load.', true);
} else {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const viewer = (await supabase.auth.getSession()).data.session?.user || null;

  if (editLink) editLink.hidden = viewer?.id !== profileId;
  if (messageLink) {
    if (!viewer) {
      messageLink.href = 'signin.html?next=members.html';
      messageLink.textContent = 'Sign in to message';
    } else if (viewer.id === profileId) {
      messageLink.hidden = true;
    } else {
      messageLink.href = `messages.html?with=${encodeURIComponent(profileId)}`;
    }
  }

  const [profileResult, reviewResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    supabase.from('product_reviews').select('product_slug,rating,comment,created_at,updated_at').eq('user_id', profileId).eq('visible', true).order('updated_at', { ascending: false }).limit(20),
  ]);

  const error = profileResult.error || reviewResult.error;
  const profile = profileResult.data;
  const reviews = reviewResult.data || [];

  if (error) {
    say(error.message, true);
  } else if (!profile) {
    say('This member profile could not be found.', true);
  } else {
    const name = profile.display_name || 'Member';
    const handle = cleanHandle(profile.profile_handle, name);
    const joined = dateText(profile.created_at);
    document.title = `${name} | 0PTICBOX Network`;
    applyWallpaper(profile);
    renderAvatar(profile);
    renderInterests(profile);
    renderContactLinks(profile);
    renderReviews(reviews);

    $('profile-card-title').textContent = `${name}'s Profile`;
    $('profile-name').textContent = name;
    $('profile-handle').textContent = `@${handle}`;
    $('profile-public-handle').textContent = `@${handle}`;
    $('profile-tagline').textContent = profile.profile_tagline || '0PTICBOX community member';
    $('profile-status').textContent = profile.status || 'Checking out the 0PTICBOX network.';
    $('detail-status').textContent = profile.status || '—';
    $('profile-genre').textContent = profile.genre || '—';
    $('profile-occupation').textContent = profile.occupation || '—';
    $('profile-here-for').textContent = profile.here_for || 'Community, music, art, and projects';
    $('profile-joined').textContent = joined;
    $('profile-joined-short').textContent = dateText(profile.created_at, true);
    $('profile-contact-title').textContent = `Contacting ${name}`;
    $('profile-details-title').textContent = `${name}'s Details`;
    $('profile-blurb-title').textContent = `${name}'s Blurbs`;
    $('profile-about-heading').textContent = profile.profile_tagline || `Welcome to ${name}'s page`;
    $('profile-bio').textContent = profile.bio || 'This member has not added an about section yet.';
    say('');
  }
}