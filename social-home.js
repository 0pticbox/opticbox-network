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

const feedRoot = document.getElementById('thread-feed');
const memberRoot = document.getElementById('social-member-list');
const warning = document.getElementById('social-config-warning');
let filter = 'all';
let threads = [];

function profileFromRelation(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function cleanUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function youtubeId(value) {
  const safe = cleanUrl(value);
  if (!safe) return '';
  const parsed = new URL(safe);
  if (parsed.hostname.includes('youtu.be')) {
    return parsed.pathname.split('/').filter(Boolean)[0] || '';
  }
  if (parsed.hostname.includes('youtube.com')) {
    if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
    const pieces = parsed.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live'].includes(pieces[0])) return pieces[1] || '';
  }
  return '';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatEventDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function stars(value) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
}

function createAvatar(profile, fallback = '0') {
  const shell = document.createElement('span');
  shell.className = 'thread-avatar';
  if (profile?.avatar_url) {
    const image = document.createElement('img');
    image.src = profile.avatar_url;
    image.alt = '';
    image.loading = 'lazy';
    shell.append(image);
  } else {
    shell.textContent = (profile?.display_name || fallback).slice(0, 1).toUpperCase();
  }
  return shell;
}

function createImage(thread) {
  const media = document.createElement('div');
  media.className = 'thread-media';

  let source = cleanUrl(thread.image_url);
  if (!source && thread.type === 'listening') {
    const id = youtubeId(thread.media_url);
    if (id) source = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  }

  if (!source) return null;
  const image = document.createElement('img');
  image.src = source;
  image.alt = thread.image_alt || '';
  image.loading = 'lazy';
  media.append(image);
  return media;
}

function makeThreadCard(thread) {
  const article = document.createElement('article');
  article.className = `thread-card thread-${thread.type}`;

  const profile = thread.profile || null;
  const profileHref = profile?.id
    ? `profile.html?id=${encodeURIComponent(profile.id)}`
    : thread.type === 'official'
      ? 'opticbox.html'
      : 'members.html';

  const identity = document.createElement('a');
  identity.className = 'thread-identity';
  identity.href = profileHref;
  identity.append(createAvatar(profile, thread.type === 'official' ? '0' : 'M'));

  const identityText = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = profile?.display_name || thread.author || '0PTICBOX';
  const meta = document.createElement('small');
  meta.textContent = `${thread.label} · ${formatDate(thread.created_at)}`;
  identityText.append(name, meta);
  identity.append(identityText);

  const body = document.createElement('div');
  body.className = 'thread-body';

  const top = document.createElement('div');
  top.className = 'thread-topline';
  top.append(identity);

  const badge = document.createElement('span');
  badge.className = 'thread-type-badge';
  badge.textContent = thread.badge;
  top.append(badge);
  body.append(top);

  if (thread.title) {
    const title = document.createElement('h2');
    title.textContent = thread.title;
    body.append(title);
  }

  if (thread.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'thread-subtitle';
    subtitle.textContent = thread.subtitle;
    body.append(subtitle);
  }

  if (thread.details?.length) {
    const details = document.createElement('div');
    details.className = 'thread-detail-chips';
    for (const value of thread.details.filter(Boolean)) {
      const chip = document.createElement('span');
      chip.textContent = value;
      details.append(chip);
    }
    body.append(details);
  }

  if (thread.copy) {
    const copy = document.createElement('p');
    copy.className = 'thread-copy';
    copy.textContent = thread.copy;
    body.append(copy);
  }

  const media = createImage(thread);
  if (media) body.append(media);

  if (thread.rating) {
    const rating = document.createElement('div');
    rating.className = 'thread-rating';
    const starLine = document.createElement('span');
    starLine.textContent = stars(thread.rating);
    const product = document.createElement('strong');
    product.textContent = PRODUCTS[thread.product_slug] || thread.product_slug;
    rating.append(starLine, product);
    body.append(rating);
  }

  const actions = document.createElement('div');
  actions.className = 'thread-actions';

  const profileAction = document.createElement('a');
  profileAction.href = profileHref;
  profileAction.textContent = 'Profile';
  actions.append(profileAction);

  const external = cleanUrl(thread.media_url);
  if (external) {
    const open = document.createElement('a');
    open.href = external;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = thread.type === 'event'
      ? 'Event page'
      : thread.type === 'listening'
        ? 'Listen'
        : 'Open link';
    actions.append(open);
  }

  if (thread.type === 'review') {
    const reviewLink = document.createElement('a');
    reviewLink.href = 'members.html';
    reviewLink.textContent = 'View reviews';
    actions.append(reviewLink);
  }

  body.append(actions);
  article.append(body);
  return article;
}

function renderFeed() {
  if (!feedRoot) return;
  const visible = filter === 'all'
    ? threads
    : threads.filter((thread) => thread.type === filter);

  feedRoot.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement('article');
    empty.className = 'thread-empty';
    const heading = document.createElement('h2');
    heading.textContent = 'Nothing here yet.';
    const copy = document.createElement('p');
    copy.textContent = 'Try another feed tab or make the first post.';
    empty.append(heading, copy);
    feedRoot.append(empty);
    return;
  }

  for (const thread of visible) {
    feedRoot.append(makeThreadCard(thread));
  }
}

function renderMembers(profiles) {
  if (!memberRoot) return;
  memberRoot.replaceChildren();

  if (!profiles.length) {
    const copy = document.createElement('p');
    copy.textContent = 'No public member profiles yet.';
    memberRoot.append(copy);
    return;
  }

  for (const profile of profiles) {
    const link = document.createElement('a');
    link.className = 'social-member-row';
    link.href = `profile.html?id=${encodeURIComponent(profile.id)}`;
    link.append(createAvatar(profile, 'M'));

    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = profile.display_name;
    const status = document.createElement('small');
    status.textContent = profile.profile_tagline || profile.status || '0PTICBOX member';
    text.append(name, status);
    link.append(text);
    memberRoot.append(link);
  }
}

function normalizeOfficial(post) {
  return {
    id: `official-${post.id}`,
    type: 'official',
    badge: 'OFFICIAL',
    label: '0PTICBOX update',
    author: '0PTICBOX',
    title: post.title,
    copy: post.body,
    image_url: post.image_url,
    image_alt: post.title,
    created_at: post.published_at || post.created_at,
    media_url: '',
    profile: null,
  };
}

function normalizeActivity(post) {
  const profile = profileFromRelation(post.profiles);
  if (post.post_type === 'post') {
    return {
      id: `post-${post.id}`,
      type: 'post',
      badge: 'POST',
      label: 'community post',
      title: post.title,
      copy: post.caption,
      image_url: post.image_url,
      image_alt: post.title ? `Image for ${post.title}` : 'Community post image',
      created_at: post.created_at,
      media_url: post.media_url,
      profile,
    };
  }
  if (post.post_type === 'event') {
    return {
      id: `event-${post.id}`,
      type: 'event',
      badge: 'GOING',
      label: 'event post',
      title: post.title,
      copy: post.caption,
      image_url: post.image_url,
      image_alt: `Artwork for ${post.title}`,
      created_at: post.created_at,
      media_url: post.media_url,
      details: [formatEventDate(post.event_date), post.city],
      profile,
    };
  }

  return {
    id: `listening-${post.id}`,
    type: 'listening',
    badge: 'LISTENING',
    label: 'listening now',
    title: post.title,
    subtitle: post.subtitle ? `by ${post.subtitle}` : '',
    copy: post.caption,
    image_url: post.image_url,
    image_alt: `Artwork for ${post.title}`,
    created_at: post.created_at,
    media_url: post.media_url,
    profile,
  };
}

function normalizeReview(review) {
  return {
    id: `review-${review.id}`,
    type: 'review',
    badge: 'REVIEW',
    label: 'product rating',
    title: PRODUCTS[review.product_slug] || review.product_slug,
    copy: review.comment,
    created_at: review.updated_at || review.created_at,
    rating: review.rating,
    product_slug: review.product_slug,
    profile: profileFromRelation(review.profiles),
  };
}

document.querySelectorAll('[data-thread-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    filter = button.dataset.threadFilter || 'all';
    document.querySelectorAll('[data-thread-filter]').forEach((item) => {
      const active = item.dataset.threadFilter === filter;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderFeed();
  });
});

if (!isSupabaseConfigured()) {
  if (warning) warning.hidden = false;
  if (feedRoot) {
    feedRoot.innerHTML = `
      <article class="thread-empty">
        <h2>The network is waiting for Supabase.</h2>
        <p>Finish connecting supabase-config.js, then refresh this page.</p>
      </article>`;
  }
  if (memberRoot) memberRoot.innerHTML = '<p>Member profiles will appear after Supabase is connected.</p>';
} else {
  const { createClient } = await import(
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm'
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const [activityResult, officialResult, reviewResult, memberResult] = await Promise.all([
    supabase
      .from('activity_posts')
      .select('id,user_id,post_type,title,subtitle,caption,media_url,image_url,event_date,city,created_at,profiles(id,display_name,avatar_url,status,profile_tagline)')
      .eq('visible', true)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('community_posts')
      .select('id,title,body,image_url,published_at,created_at')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(30),
    supabase
      .from('product_reviews')
      .select('id,user_id,product_slug,rating,comment,created_at,updated_at,profiles(id,display_name,avatar_url,status,profile_tagline)')
      .eq('visible', true)
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase
      .from('profiles')
      .select('id,display_name,avatar_url,status,profile_tagline,created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const firstError =
    activityResult.error ||
    officialResult.error ||
    reviewResult.error ||
    memberResult.error;

  if (firstError) {
    console.warn('Social feed failed:', firstError);
    if (feedRoot) {
      feedRoot.innerHTML = `
        <article class="thread-empty">
          <h2>The feed could not load.</h2>
          <p>Run the newest supabase/schema.sql, then refresh.</p>
        </article>`;
    }
  } else {
    threads = [
      ...(activityResult.data || []).map(normalizeActivity),
      ...(officialResult.data || []).map(normalizeOfficial),
      ...(reviewResult.data || []).map(normalizeReview),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    renderFeed();
    renderMembers(memberResult.data || []);
  }
}
