import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

const PRODUCTS = Object.freeze({
  opticscope: '0PTICSCOPE',
  spectravault: 'SPECTRAVAULT',
  distortion: 'DISTORTION',
  'dj-visual-studio': 'DJ Visual Studio',
  'boxed-arp': 'BOXED ARP',
  'orbital-repair': 'Orbital Repair',
  'inner-light-runner': 'Inner Light Runner',
});

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const requestedId = params.get('id');
const requestedHandle = cleanHandle(params.get('handle') || '', '');
const editLink = $('profile-edit-link');
const messageLink = $('profile-message-link');
const message = $('profile-message');

const OPTICBOX_FALLBACK = Object.freeze({
  id: '',
  display_name: '0PTICBOX',
  profile_handle: '0pticbox',
  profile_tagline: 'DJ, producer, and visual-tool maker',
  status: 'Things are getting W€!RD',
  bio: 'Electronic music, live visuals, browser experiments, and tiny games.',
  genre: 'EDM · House · Dubstep',
  occupation: 'DJ / producer / creative coder',
  here_for: 'Music, visuals, and weird internet projects',
  interests: 'EDM, Music, DJ, House music, Rave, Dance, Electronic music, Dubstep, VJ tools, Glitch art, Web audio, PICO-8',
  avatar_url: 'assets/profile/0pticbox-avatar.jpg',
  background_url: '',
  background_dim: 62,
  background_mode: 'cover',
  accent_color: '#ff6b36',
  instagram_url: 'https://www.instagram.com/0pticbox/',
  instagram_highlight_image_url: 'assets/profile/0pticbox-instagram-highlight.png',
  instagram_highlight_post_url: 'https://www.instagram.com/p/CIQsKb5loyL/',
  instagram_embeds: 'https://www.instagram.com/p/CIQsKb5loyL/',
  youtube_url: 'https://www.youtube.com/playlist?list=PLey2Gllwi6MQN1PMlx25zVkTHuVnQKVxR',
  // Existing public Instagram snapshot from the original 0PTICBOX profile (Aug 5, 2026).
  // This prevents the owner profile from showing an empty audience total before the
  // new editable social-count fields have been saved in Supabase.
  instagram_followers: 957,
  youtube_subscribers: null,
  youtube_embeds: 'https://www.youtube.com/playlist?list=PLey2Gllwi6MQN1PMlx25zVkTHuVnQKVxR\nhttps://www.youtube.com/playlist?list=PLey2Gllwi6MQF7k3X_ptILi6WKp6DJCdH\nhttps://www.youtube.com/watch?v=x3szoFCz8SM&t=972s',
  soundcloud_url: '',
  github_url: 'https://github.com/0pticbox/opticbox-network',
  website_url: '',
  contact_email: '0pticboxsound@gmail.com',
  meet_people: 'Zedd | Anton Zaslavski\nLSDREAM | Sami Diament\nCloZee | Chloé Herry\nChampagne Drip | Samuel “Sam” Pool\nGRiZ | Grant Richard Kwiecinski\nLiquid Stranger | Martin Johan Stääf',
  featured_title: '0PTICSCOPE',
  featured_kicker: 'Oscilloscope art lab',
  featured_description: 'Turn audio, images, and generated signals into live motion. The full visualizer opens when you launch it.',
  featured_url: 'apps/opticscope/index.html',
  created_at: '2026-08-05T00:00:00Z',
});

function mergeOpticboxFallback(profile) {
  if (!profile) return { ...OPTICBOX_FALLBACK };
  const isOpticbox = cleanHandle(profile.profile_handle || '', '').toLowerCase() === '0pticbox' || String(profile.display_name || '').trim().toLowerCase() === '0pticbox';
  if (!isOpticbox) return profile;
  const merged = { ...OPTICBOX_FALLBACK, ...profile };
  for (const [key, fallback] of Object.entries(OPTICBOX_FALLBACK)) {
    if (typeof fallback === 'string' && String(profile[key] ?? '').trim() === '') merged[key] = fallback;
    // Numeric profile fallbacks (such as the known social snapshot) must also
    // survive a database row whose newly-added column is still NULL. v27 only
    // restored strings, which is why Total Followers rendered as a dash.
    if (typeof fallback === 'number' && (profile[key] === null || profile[key] === undefined || profile[key] === '')) merged[key] = fallback;
  }
  if (profile.id) merged.id = profile.id;
  if (profile.created_at) merged.created_at = profile.created_at;
  return merged;
}

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

function safeLinkUrl(value) {
  try {
    const url = new URL(String(value || '').trim(), window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function cleanHandle(value, fallback = 'member') {
  const raw = String(value || '').trim().replace(/^@+/, '');
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 32);
  if (cleaned) return cleaned;
  return String(fallback || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32) || (fallback ? 'member' : '');
}

function dateText(value, short = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', short ? { year: 'numeric' } : { month: 'long', year: 'numeric' }).format(date);
}

function socialCount(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.floor(number);
}

function compactCount(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function renderFollowerTotal(profile) {
  const root = $('profile-followers-total');
  if (!root) return;

  // TOTAL FOLLOWERS is always the combined audience:
  // Instagram followers + YouTube subscribers.
  // The alias fallbacks keep older profile rows working if a previous build
  // used a slightly different YouTube field name.
  const instagram = socialCount(profile.instagram_followers);
  const youtube = socialCount(
    profile.youtube_subscribers ??
    profile.youtube_subscriber_count ??
    profile.youtube_subscriptions ??
    profile.youtube_followers
  );
  const hasInstagram = instagram !== null;
  const hasYouTube = youtube !== null;

  if (!hasInstagram && !hasYouTube) {
    root.textContent = '—';
    root.title = 'Add Instagram followers and/or YouTube subscribers in Profile Settings.';
    root.removeAttribute('aria-label');
    root.dataset.instagram = '';
    root.dataset.youtube = '';
    return;
  }

  const instagramCount = hasInstagram ? instagram : 0;
  const youtubeCount = hasYouTube ? youtube : 0;
  const total = instagramCount + youtubeCount;

  root.textContent = compactCount(total);
  root.dataset.instagram = String(instagramCount);
  root.dataset.youtube = String(youtubeCount);
  root.dataset.total = String(total);

  const exact = new Intl.NumberFormat('en-US');
  const breakdown = `Instagram ${exact.format(instagramCount)} + YouTube ${exact.format(youtubeCount)} = ${exact.format(total)} total followers`;
  root.title = breakdown;
  root.setAttribute('aria-label', breakdown);
}

function starText(value) {
  const number = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return `${'★'.repeat(number)}${'☆'.repeat(5 - number)}`;
}

function listLines(value, max = 3) {
  return String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
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
  root.append(document.createElement('i'));
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
  const interests = listLines(profile.interests, 30);
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

function renderMeet(profile) {
  const root = $('profile-meet-list');
  root.replaceChildren();
  const rows = String(profile.meet_people || '')
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!rows.length) {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = 'Community';
    const span = document.createElement('span');
    span.textContent = 'Friends, artists, and collaborators';
    item.append(strong, span);
    root.append(item);
    return;
  }
  for (const row of rows) {
    const [name, ...detailParts] = row.split('|');
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = name.trim();
    const span = document.createElement('span');
    span.textContent = detailParts.join('|').trim() || 'Would love to connect';
    item.append(strong, span);
    root.append(item);
  }
}

function renderPublicContact(profile) {
  const root = $('profile-public-contact');
  root.replaceChildren();
  const email = String(profile.contact_email || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const link = document.createElement('a');
    link.href = `mailto:${email}`;
    link.textContent = email;
    root.append(link);
    return;
  }
  const website = safeHttpUrl(profile.website_url);
  if (website) {
    const link = document.createElement('a');
    link.href = website;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Website';
    root.append(link);
    return;
  }
  root.textContent = '—';
}

function renderFeatured(profile, name) {
  const title = String(profile.featured_title || '').trim();
  const kicker = String(profile.featured_kicker || '').trim();
  const description = String(profile.featured_description || '').trim();
  const url = safeLinkUrl(profile.featured_url);
  $('profile-featured-title').textContent = title || `${name}'s page`;
  $('profile-featured-kicker').textContent = kicker || 'Featured link';
  $('profile-featured-description').textContent = description || 'This member has not featured a project, track, video, or page yet.';
  const link = $('profile-featured-link');
  link.hidden = !url;
  if (url) link.href = url;
}

function renderAboutPoints(profile) {
  const root = $('profile-about-points');
  root.replaceChildren();
  const points = [profile.occupation, profile.genre, profile.here_for].map((v) => String(v || '').trim()).filter(Boolean);
  if (!points.length) points.push('Part of the 0PTICBOX Network');
  for (const point of points.slice(0, 3)) {
    const li = document.createElement('li');
    li.textContent = point;
    root.append(li);
  }
}

function instagramPostUrl(value) {
  const url = safeHttpUrl(value);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (host !== 'instagram.com') return '';
    return /^\/(p|reel|tv)\/[A-Za-z0-9_-]+/i.test(parsed.pathname) ? parsed.href : '';
  } catch {
    return '';
  }
}

function instagramHandle(value, fallback) {
  const url = safeHttpUrl(value);
  if (!url) return cleanHandle(fallback, 'member');
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (['p', 'reel', 'tv', 'explore'].includes(segment.toLowerCase())) return cleanHandle(fallback, 'member');
    return cleanHandle(segment, fallback);
  } catch {
    return cleanHandle(fallback, 'member');
  }
}

function createInstagramPhoto(src, href, name) {
  const image = document.createElement('img');
  image.className = 'member-instagram-photo';
  image.src = src;
  image.alt = `${name}'s favorite Instagram photo`;
  image.loading = 'lazy';
  image.decoding = 'async';

  if (!href) return image;

  const link = document.createElement('a');
  link.className = 'member-instagram-photo-link';
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.setAttribute('aria-label', `Open ${name}'s highlighted Instagram photo`);
  link.append(image);
  return link;
}

function renderInstagram(profile, name, handle) {
  const section = $('profile-instagram-section');
  const instagramUrl = safeHttpUrl(profile.instagram_url);
  const imageUrl = safeLinkUrl(profile.instagram_highlight_image_url);
  const legacyPost = listLines(profile.instagram_embeds, 1)[0] || '';
  const highlightPostUrl = instagramPostUrl(profile.instagram_highlight_post_url || legacyPost);
  if (!instagramUrl && !imageUrl) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  $('profile-instagram-title').textContent = `${name} on Instagram`;
  const igHandle = instagramHandle(instagramUrl, handle);
  $('profile-instagram-name').textContent = name;
  $('profile-instagram-handle').textContent = `@${igHandle}`;
  $('profile-instagram-copy').textContent = imageUrl
    ? `${name} chose this as a favorite Instagram photo to highlight.`
    : `${name} connected an Instagram profile and can choose one favorite photo from Profile Settings.`;

  const tags = $('profile-instagram-tags');
  tags.replaceChildren();
  listLines(profile.interests, 8).forEach((item) => {
    const tag = document.createElement('span');
    tag.textContent = `#${item.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24)}`;
    if (tag.textContent.length > 1) tags.append(tag);
  });

  const link = $('profile-instagram-link');
  link.hidden = !instagramUrl;
  if (instagramUrl) link.href = instagramUrl;

  const feature = $('profile-instagram-feature');
  const grid = $('profile-instagram-grid');
  feature.replaceChildren();
  grid.replaceChildren();

  if (imageUrl) {
    feature.append(createInstagramPhoto(imageUrl, highlightPostUrl || instagramUrl, name));
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'member-social-placeholder';
    placeholder.innerHTML = '<span>◎</span><strong>Instagram connected</strong><small>Choose one favorite photo in Profile Settings to show it here.</small>';
    feature.append(placeholder);
  }
}

function youtubeEmbed(value) {
  const url = safeHttpUrl(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    let videoId = '';
    let listId = parsed.searchParams.get('list') || '';
    let start = 0;
    const timeRaw = parsed.searchParams.get('t') || parsed.searchParams.get('start') || '';
    if (/^\d+$/.test(timeRaw)) start = Number(timeRaw);
    else {
      const m = String(timeRaw).match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
      if (m && m[0]) start = (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
    }
    if (host === 'youtu.be') videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (host.endsWith('youtube.com')) {
      if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v') || '';
      const pathMatch = parsed.pathname.match(/^\/(shorts|embed)\/([A-Za-z0-9_-]{6,})/);
      if (pathMatch) videoId = pathMatch[2];
    }
    if (parsed.pathname.includes('/playlist') && listId) {
      return { src: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}&playsinline=1&rel=0`, label: 'Playlist' };
    }
    if (videoId) {
      const query = new URLSearchParams({ playsinline: '1', rel: '0' });
      if (start > 0) query.set('start', String(start));
      if (listId) query.set('list', listId);
      return { src: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${query.toString()}`, label: 'Video' };
    }
    if (listId) return { src: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}&playsinline=1&rel=0`, label: 'Playlist' };
    return null;
  } catch {
    return null;
  }
}

function renderYouTube(profile, name) {
  const section = $('profile-media-section');
  let rawLinks = listLines(profile.youtube_embeds, 3);
  if (!rawLinks.length && youtubeEmbed(profile.youtube_url)) rawLinks = [profile.youtube_url];
  const embeds = rawLinks.map(youtubeEmbed).filter(Boolean).slice(0, 3);
  if (!embeds.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  $('profile-media-title').textContent = `${name}'s Videos`;
  $('profile-media-count').textContent = `${embeds.length} YouTube ${embeds.length === 1 ? 'embed' : 'embeds'}`;
  const grid = $('profile-media-grid');
  grid.replaceChildren();
  embeds.forEach((embed, index) => {
    const article = document.createElement('article');
    article.className = `media-card${embeds.length === 3 && index === 2 ? ' featured-video' : ''}`;
    const frameWrap = document.createElement('div');
    frameWrap.className = 'video-frame';
    const frame = document.createElement('iframe');
    frame.src = embed.src;
    frame.title = `${name} YouTube ${embed.label.toLowerCase()} ${index + 1}`;
    frame.loading = 'lazy';
    frame.allowFullscreen = true;
    frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.referrerPolicy = 'origin-when-cross-origin';
    frameWrap.append(frame);
    const copy = document.createElement('div');
    copy.className = 'media-copy';
    const label = document.createElement('span');
    label.textContent = `${embed.label} ${String(index + 1).padStart(2, '0')}`;
    const p = document.createElement('p');
    p.textContent = 'Watch without leaving this profile page.';
    copy.append(label, p);
    article.append(frameWrap, copy);
    grid.append(article);
  });
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

function restoreHashTarget() {
  if (!window.location.hash) return;
  const target = document.querySelector(window.location.hash);
  if (!target || target.hidden) return;
  requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
}

function renderProfile(profile, reviews = []) {
  const name = profile.display_name || 'Member';
  const handle = cleanHandle(profile.profile_handle, name);
  const joined = dateText(profile.created_at);
  document.title = `${name} | 0PTICBOX Network`;
  applyWallpaper(profile);
  renderAvatar(profile);
  renderInterests(profile);
  renderContactLinks(profile);
  renderMeet(profile);
  renderPublicContact(profile);
  renderFeatured(profile, name);
  renderAboutPoints(profile);
  renderInstagram(profile, name, handle);
  renderYouTube(profile, name);
  renderReviews(reviews);
  renderFollowerTotal(profile);

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
  $('profile-about-label').textContent = `ABOUT ${name}`;
  $('profile-bio').textContent = profile.bio || 'This member has not added an about section yet.';
  $('profile-status-title').textContent = `${name} is...`;
}

async function run() {
  if (!requestedId && !requestedHandle) {
    say('That profile link is missing a member ID or handle.', true);
    return;
  }

  if (!isSupabaseConfigured()) {
    if (requestedHandle.toLowerCase() === '0pticbox') {
      renderProfile(OPTICBOX_FALLBACK, []);
      restoreHashTarget();
      if (messageLink) messageLink.hidden = true;
      say('');
      return;
    }
    say('Member profiles need Supabase connected before they can load.', true);
    return;
  }

  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const viewer = (await supabase.auth.getSession()).data.session?.user || null;

  let profileQuery = supabase.from('profiles').select('*');
  if (requestedId) profileQuery = profileQuery.eq('id', requestedId);
  else profileQuery = profileQuery.ilike('profile_handle', requestedHandle);
  const profileResult = await profileQuery.limit(1).maybeSingle();

  let profile = profileResult.data;
  if (!profile && requestedHandle.toLowerCase() === '0pticbox') profile = { ...OPTICBOX_FALLBACK };
  profile = mergeOpticboxFallback(profile);

  if (profileResult.error && !profile) {
    say(profileResult.error.message, true);
    return;
  }
  if (!profile) {
    say('This member profile could not be found.', true);
    return;
  }

  const actualId = profile.id || '';
  let reviews = [];
  if (actualId) {
    const reviewResult = await supabase.from('product_reviews').select('product_slug,rating,comment,created_at,updated_at').eq('user_id', actualId).eq('visible', true).order('updated_at', { ascending: false }).limit(20);
    if (!reviewResult.error) reviews = (reviewResult.data || []).filter((review) => Boolean(PRODUCTS[review.product_slug]));
  }

  if (editLink) editLink.hidden = !actualId || viewer?.id !== actualId;
  if (messageLink) {
    if (!actualId) {
      messageLink.hidden = true;
    } else if (!viewer) {
      messageLink.href = `signin.html?next=${encodeURIComponent(`profile.html?id=${actualId}`)}`;
      messageLink.textContent = 'Sign in to message';
    } else if (viewer.id === actualId) {
      messageLink.hidden = true;
    } else {
      messageLink.href = `messages.html?with=${encodeURIComponent(actualId)}`;
    }
  }

  renderProfile(profile, reviews);
  restoreHashTarget();
  say('');
}

run().catch((error) => say(error?.message || 'This profile could not load.', true));
