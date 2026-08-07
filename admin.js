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

const configured = isSupabaseConfigured();
let supabase = null;
if (configured) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

const loginPanel = document.getElementById('login-panel');
const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');
const dashboard = document.getElementById('admin-dashboard');
const signOutButton = document.getElementById('sign-out-button');
const configWarning = document.getElementById('config-warning');
const postForm = document.getElementById('post-form');
const postMessage = document.getElementById('post-message');
const postsRoot = document.getElementById('admin-posts');
const postCount = document.getElementById('post-count');
const contentForm = document.getElementById('content-form');
const contentMessage = document.getElementById('content-message');
const resetPostButton = document.getElementById('reset-post-button');
const reviewsRoot = document.getElementById('admin-reviews');
const reviewCount = document.getElementById('admin-review-count');
const backgroundGifInput = document.getElementById('content-background-gif');
const backgroundGifPreview = document.getElementById('background-gif-preview');
const clearBackgroundButton = document.getElementById('clear-background-button');

let activeUser = null;
let posts = [];
let reviews = [];

function setMessage(element, text, isError = false) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('is-error', isError);
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

function updateBackgroundPreview() {
  if (!backgroundGifPreview) return;
  const raw = backgroundGifInput?.value.trim() || '';
  const url = safeSiteAssetUrl(raw);
  backgroundGifPreview.style.removeProperty('background-image');
  backgroundGifPreview.classList.toggle('has-preview', Boolean(url));
  backgroundGifPreview.replaceChildren();

  if (!raw) {
    const message = document.createElement('span');
    message.textContent = 'No custom background selected';
    backgroundGifPreview.append(message);
    return;
  }

  if (!url) {
    const message = document.createElement('span');
    message.textContent = 'Enter a valid web URL or site file path';
    backgroundGifPreview.append(message);
    return;
  }

  backgroundGifPreview.style.backgroundImage = `linear-gradient(rgba(3,5,10,.25),rgba(3,5,10,.55)),url(${JSON.stringify(url)})`;
  const label = document.createElement('span');
  label.textContent = 'Live background preview';
  backgroundGifPreview.append(label);
}

function clearPostForm() {
  postForm?.reset();
  const id = document.getElementById('post-id');
  if (id) id.value = '';
  const published = document.getElementById('post-published');
  if (published) published.checked = true;
  setMessage(postMessage, '');
}

function formatDate(value) {
  if (!value) return 'Draft';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Draft';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(date);
}

function profileNameFromReview(review) {
  const relation = review?.profiles;
  if (Array.isArray(relation)) return relation[0]?.display_name || 'Member';
  return relation?.display_name || 'Member';
}

function starText(value) {
  const rating = Math.max(1, Math.min(5, Number(value) || 1));
  return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
}

async function verifyAdmin(user) {
  if (!user || !supabase) return false;
  const { data, error } = await supabase
    .from('site_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function renderPosts() {
  if (!postsRoot) return;
  postsRoot.replaceChildren();
  if (postCount) postCount.textContent = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`;

  if (!posts.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No posts yet. Use the editor to publish the first one.';
    postsRoot.append(empty);
    return;
  }

  for (const post of posts) {
    const article = document.createElement('article');
    article.className = 'admin-post-row';

    const copy = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = post.title || 'Untitled post';
    const meta = document.createElement('p');
    meta.textContent = `${post.published ? 'Published' : 'Draft'} · ${formatDate(post.published_at || post.updated_at || post.created_at)}`;
    const excerpt = document.createElement('p');
    excerpt.textContent = post.body || '';
    copy.append(heading, meta, excerpt);

    const actions = document.createElement('div');
    actions.className = 'admin-row-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'retro-button';
    edit.textContent = 'Edit';
    edit.dataset.action = 'edit';
    edit.dataset.id = String(post.id);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'retro-button danger';
    remove.textContent = 'Delete';
    remove.dataset.action = 'delete';
    remove.dataset.id = String(post.id);
    actions.append(edit, remove);

    article.append(copy, actions);
    postsRoot.append(article);
  }
}

function renderReviews() {
  if (!reviewsRoot) return;
  reviewsRoot.replaceChildren();
  if (reviewCount) reviewCount.textContent = `${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`;

  if (!reviews.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No member reviews yet.';
    reviewsRoot.append(empty);
    return;
  }

  for (const review of reviews) {
    const article = document.createElement('article');
    article.className = `admin-post-row admin-review-row${review.visible ? '' : ' admin-review-hidden'}`;

    const copy = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = `${profileNameFromReview(review)} on ${PRODUCTS[review.product_slug] || review.product_slug}`;
    const meta = document.createElement('p');
    meta.className = 'admin-review-meta';
    const stars = document.createElement('span');
    stars.className = 'admin-review-stars';
    stars.textContent = starText(review.rating);
    const date = document.createElement('span');
    date.textContent = formatDate(review.updated_at || review.created_at);
    const state = document.createElement('span');
    state.textContent = review.visible ? 'Visible' : 'Hidden';
    meta.append(stars, date, state);
    const excerpt = document.createElement('p');
    excerpt.textContent = review.comment || '';
    copy.append(heading, meta, excerpt);

    const actions = document.createElement('div');
    actions.className = 'admin-row-actions';
    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'retro-button';
    visibility.textContent = review.visible ? 'Hide' : 'Restore';
    visibility.dataset.action = review.visible ? 'review-hide' : 'review-show';
    visibility.dataset.id = String(review.id);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'retro-button danger';
    remove.textContent = 'Delete';
    remove.dataset.action = 'review-delete';
    remove.dataset.id = String(review.id);
    actions.append(visibility, remove);

    article.append(copy, actions);
    reviewsRoot.append(article);
  }
}

async function loadPosts() {
  const { data, error } = await supabase
    .from('community_posts')
    .select('id,title,body,image_url,published,published_at,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  posts = data || [];
  renderPosts();
}

async function loadReviews() {
  const { data, error } = await supabase
    .from('product_reviews')
    .select('id,product_slug,user_id,rating,comment,visible,created_at,updated_at,profiles(display_name)')
    .order('updated_at', { ascending: false })
    .limit(250);
  if (error) throw error;
  reviews = (data || []).filter((review) => Boolean(PRODUCTS[review.product_slug]));
  renderReviews();
}

async function loadContent() {
  const { data, error } = await supabase.from('site_content').select('key,value');
  if (error) throw error;
  const byKey = new Map((data || []).map((row) => [row.key, row.value]));
  contentForm?.querySelectorAll('[data-key]').forEach((field) => {
    field.value = byKey.get(field.dataset.key) || '';
  });
  updateBackgroundPreview();
}

const isDashboardPage = Boolean(dashboard);
const isLoginPage = Boolean(loginForm) && !isDashboardPage;

async function openDashboard(user) {
  const isAdmin = await verifyAdmin(user);
  if (!isAdmin) {
    await supabase.auth.signOut();
    throw new Error('This account is not listed as a site admin.');
  }

  activeUser = user;
  if (signOutButton) signOutButton.hidden = false;
  if (isLoginPage) {
    window.location.replace('admin-dashboard.html');
    return;
  }
  await Promise.all([loadPosts(), loadReviews(), loadContent()]);
}

async function handleSession(session) {
  if (!session?.user) {
    activeUser = null;
    if (signOutButton) signOutButton.hidden = true;
    if (isDashboardPage) {
      window.location.replace('admin.html');
    }
    return;
  }

  try {
    await openDashboard(session.user);
  } catch (error) {
    if (isDashboardPage) {
      window.location.replace('admin.html?error=unauthorized');
      return;
    }
    setMessage(loginMessage, error.message || 'Admin access could not be verified.', true);
  }
}

if (!configured) {
  if (configWarning) configWarning.hidden = false;
  loginForm?.querySelectorAll('input,button').forEach((element) => { element.disabled = true; });
  setMessage(loginMessage, 'Connect Supabase before signing in.', true);
} else {
  const { data } = await supabase.auth.getSession();
  await handleSession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => {
      handleSession(session).catch((error) => console.warn('Admin auth failed:', error));
    }, 0);
  });
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase) return;
  setMessage(loginMessage, 'Signing in…');
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setMessage(loginMessage, error.message, true);
    return;
  }
  setMessage(loginMessage, 'Signed in.');
  await handleSession(data.session);
});

signOutButton?.addEventListener('click', async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  clearPostForm();
  window.location.replace('admin.html');
});

resetPostButton?.addEventListener('click', clearPostForm);

postForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase || !activeUser) return;

  const id = document.getElementById('post-id').value;
  const published = document.getElementById('post-published').checked;
  const existing = posts.find((post) => String(post.id) === id);
  const payload = {
    title: document.getElementById('post-title').value.trim(),
    body: document.getElementById('post-body').value.trim(),
    image_url: document.getElementById('post-image').value.trim() || null,
    published,
    published_at: published ? (existing?.published_at || new Date().toISOString()) : null,
    author_id: activeUser.id,
    updated_at: new Date().toISOString(),
  };

  setMessage(postMessage, 'Saving…');
  const result = id
    ? await supabase.from('community_posts').update(payload).eq('id', id)
    : await supabase.from('community_posts').insert(payload);

  if (result.error) {
    setMessage(postMessage, result.error.message, true);
    return;
  }
  clearPostForm();
  setMessage(postMessage, 'Post saved.');
  await loadPosts();
});

postsRoot?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || !supabase) return;
  const post = posts.find((item) => String(item.id) === button.dataset.id);
  if (!post) return;

  if (button.dataset.action === 'edit') {
    document.getElementById('post-id').value = post.id;
    document.getElementById('post-title').value = post.title || '';
    document.getElementById('post-body').value = post.body || '';
    document.getElementById('post-image').value = post.image_url || '';
    document.getElementById('post-published').checked = Boolean(post.published);
    postForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMessage(postMessage, 'Editing selected post.');
    return;
  }

  if (button.dataset.action === 'delete') {
    const confirmed = window.confirm(`Delete “${post.title || 'Untitled post'}”?`);
    if (!confirmed) return;
    const { error } = await supabase.from('community_posts').delete().eq('id', post.id);
    if (error) {
      setMessage(postMessage, error.message, true);
      return;
    }
    setMessage(postMessage, 'Post deleted.');
    await loadPosts();
  }
});

reviewsRoot?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || !supabase) return;
  const review = reviews.find((item) => String(item.id) === button.dataset.id);
  if (!review) return;

  if (button.dataset.action === 'review-hide' || button.dataset.action === 'review-show') {
    const visible = button.dataset.action === 'review-show';
    const { error } = await supabase
      .from('product_reviews')
      .update({ visible, updated_at: new Date().toISOString() })
      .eq('id', review.id);
    if (error) {
      setMessage(loginMessage, error.message, true);
      return;
    }
    await loadReviews();
    return;
  }

  if (button.dataset.action === 'review-delete') {
    const confirmed = window.confirm(`Permanently delete this review by ${profileNameFromReview(review)}?`);
    if (!confirmed) return;
    const { error } = await supabase.from('product_reviews').delete().eq('id', review.id);
    if (error) {
      setMessage(loginMessage, error.message, true);
      return;
    }
    await loadReviews();
  }
});

backgroundGifInput?.addEventListener('input', updateBackgroundPreview);

clearBackgroundButton?.addEventListener('click', () => {
  if (!backgroundGifInput) return;
  backgroundGifInput.value = '';
  updateBackgroundPreview();
  setMessage(contentMessage, 'Background cleared in the editor. Click Save site settings to publish the change.');
});

contentForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase) return;
  const backgroundValue = backgroundGifInput?.value.trim() || '';
  if (backgroundValue && !safeSiteAssetUrl(backgroundValue)) {
    setMessage(contentMessage, 'The background GIF needs a valid web URL or site file path.', true);
    backgroundGifInput?.focus();
    return;
  }
  const rows = [...contentForm.querySelectorAll('[data-key]')].map((field) => ({
    key: field.dataset.key,
    value: field.value.trim(),
    updated_at: new Date().toISOString(),
  }));
  setMessage(contentMessage, 'Saving…');
  const { error } = await supabase.from('site_content').upsert(rows, { onConflict: 'key' });
  if (error) {
    setMessage(contentMessage, error.message, true);
    return;
  }
  setMessage(contentMessage, 'Site settings saved. Refresh the public site to see the new background.');
});
