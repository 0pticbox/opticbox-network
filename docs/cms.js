import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

const postsRoot = document.getElementById('community-posts');

function safeExternalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function renderPosts(posts) {
  if (!postsRoot) return;
  postsRoot.replaceChildren();

  if (!posts.length) {
    const empty = document.createElement('article');
    empty.className = 'community-empty';
    const stamp = document.createElement('span');
    stamp.className = 'community-stamp';
    stamp.textContent = 'PROFILE BULLETIN';
    const heading = document.createElement('h3');
    heading.textContent = 'No posts yet';
    const copy = document.createElement('p');
    copy.textContent = 'The first community post will appear here after it is published from the admin page.';
    empty.append(stamp, heading, copy);
    postsRoot.append(empty);
    return;
  }

  for (const post of posts) {
    const article = document.createElement('article');
    article.className = 'community-post';

    const header = document.createElement('div');
    header.className = 'community-post-header';

    const avatar = document.createElement('div');
    avatar.className = 'community-post-avatar';
    avatar.textContent = '0B';
    avatar.setAttribute('aria-hidden', 'true');

    const meta = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = post.title || 'Untitled post';
    const byline = document.createElement('p');
    byline.textContent = `0PTICBOX · ${formatDate(post.published_at || post.created_at)}`;
    meta.append(title, byline);
    header.append(avatar, meta);

    const body = document.createElement('p');
    body.className = 'community-post-body';
    body.textContent = post.body || '';

    article.append(header);

    const imageUrl = safeExternalUrl(post.image_url);
    if (imageUrl) {
      const image = document.createElement('img');
      image.className = 'community-post-image';
      image.src = imageUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      article.append(image);
    }

    article.append(body);
    postsRoot.append(article);
  }
}

function safeSiteAssetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function applyBackgroundGif(value) {
  const url = safeSiteAssetUrl(value);
  if (!url) {
    document.body.classList.remove('has-custom-background');
    document.body.style.removeProperty('--custom-background-image');
    return;
  }

  document.body.style.setProperty('--custom-background-image', `url(${JSON.stringify(url)})`);
  document.body.classList.add('has-custom-background');
}

function applyContent(rows) {
  for (const row of rows) {
    if (!row?.key || typeof row.value !== 'string') continue;
    if (row.key === 'background_gif_url') {
      applyBackgroundGif(row.value);
      continue;
    }
    document.querySelectorAll(`[data-content-key="${CSS.escape(row.key)}"]`).forEach((element) => {
      element.textContent = row.value;
    });
  }
}

async function boot() {
  if (!isSupabaseConfigured()) return;

  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const [contentResult, postsResult] = await Promise.all([
    supabase.from('site_content').select('key,value'),
    supabase
      .from('community_posts')
      .select('id,title,body,image_url,published_at,created_at')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(20),
  ]);

  if (!contentResult.error && Array.isArray(contentResult.data)) {
    applyContent(contentResult.data);
  } else if (contentResult.error) {
    console.warn('Could not load editable site content:', contentResult.error.message);
  }

  if (!postsResult.error && Array.isArray(postsResult.data)) {
    renderPosts(postsResult.data);
  } else if (postsResult.error) {
    console.warn('Could not load community posts:', postsResult.error.message);
  }
}

boot().catch((error) => {
  console.warn('CMS connection failed:', error);
});
