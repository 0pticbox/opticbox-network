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
const message = $('profile-message');
const profileId = new URLSearchParams(window.location.search).get('id');
const editLink = $('profile-edit-link');
const messageLink = $('profile-message-link');

function say(text, error = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('is-error', error);
}

function dateText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function starText(value) {
  const number = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return `${'★'.repeat(number)}${'☆'.repeat(5 - number)}`;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
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
}

function renderSocialLinks(profile) {
  const root = $('profile-social-links');
  root.replaceChildren();

  const links = [
    ['Instagram', safeHttpUrl(profile.instagram_url)],
    ['YouTube', safeHttpUrl(profile.youtube_url)],
  ].filter(([, url]) => url);

  for (const [label, url] of links) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = label;
    root.append(link);
  }
}

function applyTheme(profile) {
  const stage = $('member-profile-stage');
  const background = $('profile-background');
  const overlay = $('profile-background-overlay');

  const accent = /^#[0-9a-f]{6}$/i.test(profile.accent_color || '')
    ? profile.accent_color
    : '#ff6b36';

  stage.style.setProperty('--member-accent', accent);
  const dim = Math.max(20, Math.min(90, Number(profile.background_dim) || 62));
  overlay.style.background = `rgba(3, 5, 10, ${dim / 100})`;

  const backgroundUrl = safeHttpUrl(profile.background_url);
  if (backgroundUrl) {
    background.style.backgroundImage = `url("${backgroundUrl.replace(/"/g, '%22')}")`;
    background.classList.add('has-custom-background');
  } else {
    background.style.backgroundImage = '';
    background.classList.remove('has-custom-background');
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

    const date = document.createElement('small');
    date.textContent = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(review.updated_at || review.created_at));

    article.append(heading, comment, date);
    root.append(article);
  }
}

if (!profileId) {
  say('That profile link is missing a member ID.', true);
} else if (!isSupabaseConfigured()) {
  say('Member profiles need Supabase connected before they can load.', true);
} else {
  const { createClient } = await import(
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm'
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const viewer = (await supabase.auth.getSession()).data.session?.user || null;
  if (editLink) editLink.hidden = viewer?.id !== profileId;
  if (messageLink) {
    if (!viewer) {
      messageLink.href = 'members.html';
      messageLink.textContent = 'Sign in to message';
    } else if (viewer.id === profileId) {
      messageLink.hidden = true;
    } else {
      messageLink.href = `messages.html?with=${encodeURIComponent(profileId)}`;
      messageLink.textContent = 'Message';
    }
  }

  const [profileResult, reviewResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,display_name,bio,status,avatar_url,background_url,background_dim,accent_color,profile_tagline,instagram_url,youtube_url,created_at')
      .eq('id', profileId)
      .maybeSingle(),
    supabase
      .from('product_reviews')
      .select('product_slug,rating,comment,created_at,updated_at')
      .eq('user_id', profileId)
      .eq('visible', true)
      .order('updated_at', { ascending: false })
      .limit(20),
  ]);

  const error = profileResult.error || reviewResult.error;
  const profile = profileResult.data;
  const reviews = reviewResult.data || [];

  if (error) {
    say(error.message, true);
  } else if (!profile) {
    say('This member profile could not be found.', true);
  } else {
    document.title = `${profile.display_name} | 0PTICBOX Network`;
    applyTheme(profile);
    renderAvatar(profile);
    renderSocialLinks(profile);

    $('profile-name').textContent = profile.display_name;
    $('profile-tagline').textContent =
      profile.profile_tagline || '0PTICBOX community member';
    $('profile-status').textContent =
      profile.status || 'Checking out the 0PTICBOX network.';
    $('profile-bio').textContent =
      profile.bio || 'This member has not added an about section yet.';
    $('detail-bio').textContent =
      profile.bio || 'This member has not added an about section yet.';
    $('detail-status').textContent = profile.status || '—';
    $('detail-joined').textContent = dateText(profile.created_at);
    $('profile-joined').textContent = `Joined ${dateText(profile.created_at)}`;

    renderReviews(reviews);
    say('');
  }
}
