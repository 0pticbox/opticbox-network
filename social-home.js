import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

console.info('0PTICBOX opinion hub v14 loaded');

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
const feedMessage = document.getElementById('hub-feed-message');
const composeAvatar = document.getElementById('hub-compose-avatar');

let supabase = null;
let user = null;
let filter = 'all';
let threads = [];
let activityPosts = [];
let engagementReady = false;
let reloadTimer = null;

const likesByPost = new Map();
const commentsByPost = new Map();
const likedByMe = new Set();
const openCommentPanels = new Set();
const busyLikes = new Set();
const busyComments = new Set();
const profileById = new Map();

function say(text, error = false) {
  if (!feedMessage) return;
  feedMessage.textContent = text || '';
  feedMessage.classList.toggle('is-error', Boolean(error));
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
    year: 'numeric',
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

function createAvatar(profile, fallback = 'M', className = 'thread-avatar') {
  const shell = document.createElement('span');
  shell.className = className;
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

function signInUrl() {
  return 'signin.html?next=index.html';
}

function commentNode(comment, thread) {
  const person = profileById.get(comment.user_id) || null;
  const item = document.createElement('article');
  item.className = 'hub-comment';

  const identity = document.createElement('a');
  identity.className = 'hub-comment-person';
  identity.href = person?.id
    ? `profile.html?id=${encodeURIComponent(person.id)}`
    : 'members.html';
  identity.append(createAvatar(person, 'M', 'hub-comment-avatar'));

  const identityText = document.createElement('span');
  const name = document.createElement('strong');
  const time = document.createElement('small');
  name.textContent = person?.display_name || 'Member';
  time.textContent = formatDate(comment.created_at);
  identityText.append(name, time);
  identity.append(identityText);

  const body = document.createElement('p');
  body.textContent = comment.body;
  item.append(identity, body);

  const canDelete = Boolean(user?.id) && (
    comment.user_id === user.id
    || thread.user_id === user.id
  );
  if (canDelete) {
    const remove = document.createElement('button');
    remove.className = 'hub-comment-delete';
    remove.type = 'button';
    remove.dataset.deleteComment = String(comment.id);
    remove.dataset.postId = String(thread.activityPostId);
    remove.textContent = 'Delete';
    item.append(remove);
  }

  return item;
}

function engagementNode(thread) {
  const postId = String(thread.activityPostId);
  const likeCount = likesByPost.get(postId) || 0;
  const comments = commentsByPost.get(postId) || [];
  const liked = likedByMe.has(postId);
  const panelOpen = openCommentPanels.has(postId);

  const section = document.createElement('section');
  section.className = 'hub-engagement';
  section.setAttribute('aria-label', 'Likes and comments');

  const bar = document.createElement('div');
  bar.className = 'hub-engagement-bar';

  const likeButton = document.createElement('button');
  likeButton.className = `hub-like-button${liked ? ' is-liked' : ''}`;
  likeButton.type = 'button';
  likeButton.dataset.likePost = postId;
  likeButton.disabled = busyLikes.has(postId);
  likeButton.setAttribute('aria-pressed', String(liked));
  likeButton.innerHTML = `<span aria-hidden="true">${liked ? '♥' : '♡'}</span><strong>${liked ? 'Liked' : 'Like'}</strong><small>${likeCount}</small>`;

  const commentButton = document.createElement('button');
  commentButton.className = `hub-comment-toggle${panelOpen ? ' is-open' : ''}`;
  commentButton.type = 'button';
  commentButton.dataset.toggleComments = postId;
  commentButton.setAttribute('aria-expanded', String(panelOpen));
  commentButton.innerHTML = `<span aria-hidden="true">▱</span><strong>Comments</strong><small>${comments.length}</small>`;

  bar.append(likeButton, commentButton);
  section.append(bar);

  const panel = document.createElement('div');
  panel.className = 'hub-comment-panel';
  panel.hidden = !panelOpen;

  const list = document.createElement('div');
  list.className = 'hub-comment-list';
  if (!engagementReady) {
    const loading = document.createElement('p');
    loading.className = 'hub-comment-empty';
    loading.textContent = 'Loading comments…';
    list.append(loading);
  } else if (!comments.length) {
    const empty = document.createElement('p');
    empty.className = 'hub-comment-empty';
    empty.textContent = 'No comments yet. Start the conversation.';
    list.append(empty);
  } else {
    for (const comment of comments) list.append(commentNode(comment, thread));
  }
  panel.append(list);

  if (user) {
    const form = document.createElement('form');
    form.className = 'hub-comment-form';
    form.dataset.commentPost = postId;

    const label = document.createElement('label');
    label.className = 'sr-only';
    label.htmlFor = `hub-comment-${postId}`;
    label.textContent = 'Write a comment';

    const input = document.createElement('textarea');
    input.id = `hub-comment-${postId}`;
    input.name = 'comment';
    input.maxLength = 600;
    input.rows = 2;
    input.required = true;
    input.placeholder = 'Write a comment…';

    const footer = document.createElement('div');
    footer.className = 'hub-comment-form-footer';
    const counter = document.createElement('small');
    counter.dataset.commentCount = postId;
    counter.textContent = '0/600';
    const submit = document.createElement('button');
    submit.className = 'hub-comment-submit';
    submit.type = 'submit';
    submit.disabled = busyComments.has(postId);
    submit.textContent = busyComments.has(postId) ? 'Posting…' : 'Comment';
    footer.append(counter, submit);

    form.append(label, input, footer);
    panel.append(form);
  } else {
    const note = document.createElement('p');
    note.className = 'hub-comment-signin';
    note.append('Want to respond? ');
    const link = document.createElement('a');
    link.href = signInUrl();
    link.textContent = 'Sign in to like and comment.';
    note.append(link);
    panel.append(note);
  }

  section.append(panel);
  return section;
}

function makeThreadCard(thread) {
  const article = document.createElement('article');
  article.className = `thread-card thread-${thread.type}`;
  article.dataset.threadId = thread.id;

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
  const meta = document.createElement('small');
  name.textContent = profile?.display_name || thread.author || '0PTICBOX';
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
  if (thread.activityPostId != null) body.append(engagementNode(thread));
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

  for (const thread of visible) feedRoot.append(makeThreadCard(thread));
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
    const status = document.createElement('small');
    name.textContent = profile.display_name || 'Member';
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
  const profile = profileById.get(post.user_id) || null;
  const common = {
    id: `activity-${post.id}`,
    activityPostId: post.id,
    user_id: post.user_id,
    created_at: post.created_at,
    media_url: post.media_url,
    image_url: post.image_url,
    profile,
  };

  if (post.post_type === 'event') {
    return {
      ...common,
      type: 'event',
      badge: 'EVENT',
      label: 'event post',
      title: post.title,
      copy: post.caption,
      image_alt: post.title ? `Artwork for ${post.title}` : 'Event image',
      details: [formatEventDate(post.event_date), post.city],
    };
  }

  if (post.post_type === 'listening') {
    return {
      ...common,
      type: 'listening',
      badge: 'LISTENING',
      label: 'listening now',
      title: post.title,
      subtitle: post.subtitle ? `by ${post.subtitle}` : '',
      copy: post.caption,
      image_alt: post.title ? `Artwork for ${post.title}` : 'Listening post image',
    };
  }

  return {
    ...common,
    type: 'post',
    badge: 'POST',
    label: 'community opinion',
    title: post.title,
    copy: post.caption,
    image_alt: post.title ? `Image for ${post.title}` : 'Community post image',
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
    profile: profileById.get(review.user_id) || null,
  };
}

async function fetchAllPages(makeQuery, pageSize = 500) {
  const rows = [];
  let from = 0;
  while (true) {
    const result = await makeQuery().range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function chunk(values, size = 100) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function loadProfiles(userIds) {
  profileById.clear();
  const ids = [...new Set(userIds.filter(Boolean))];
  for (const group of chunk(ids, 100)) {
    const result = await supabase
      .from('profiles')
      .select('id,display_name,avatar_url,status,profile_tagline,created_at')
      .in('id', group);
    if (result.error) throw result.error;
    for (const profile of result.data || []) profileById.set(profile.id, profile);
  }
}

function resetEngagement() {
  likesByPost.clear();
  commentsByPost.clear();
  likedByMe.clear();
  engagementReady = false;
}

async function loadEngagement(posts) {
  resetEngagement();
  const postIds = posts.map((post) => post.id).filter((id) => id != null);
  if (!postIds.length) {
    engagementReady = true;
    return;
  }

  const allLikes = [];
  const allComments = [];
  for (const group of chunk(postIds, 100)) {
    const [likesResult, commentsResult] = await Promise.all([
      supabase
        .from('activity_post_likes')
        .select('post_id,user_id')
        .in('post_id', group),
      supabase
        .from('activity_post_comments')
        .select('id,post_id,user_id,body,created_at')
        .in('post_id', group)
        .eq('visible', true)
        .order('created_at', { ascending: true }),
    ]);
    if (likesResult.error) throw likesResult.error;
    if (commentsResult.error) throw commentsResult.error;
    allLikes.push(...(likesResult.data || []));
    allComments.push(...(commentsResult.data || []));
  }

  const missingCommentProfiles = allComments
    .map((comment) => comment.user_id)
    .filter((id) => id && !profileById.has(id));
  if (missingCommentProfiles.length) {
    for (const group of chunk([...new Set(missingCommentProfiles)], 100)) {
      const result = await supabase
        .from('profiles')
        .select('id,display_name,avatar_url,status,profile_tagline,created_at')
        .in('id', group);
      if (result.error) throw result.error;
      for (const profile of result.data || []) profileById.set(profile.id, profile);
    }
  }

  for (const like of allLikes) {
    const key = String(like.post_id);
    likesByPost.set(key, (likesByPost.get(key) || 0) + 1);
    if (user?.id && like.user_id === user.id) likedByMe.add(key);
  }

  for (const comment of allComments) {
    const key = String(comment.post_id);
    if (!commentsByPost.has(key)) commentsByPost.set(key, []);
    commentsByPost.get(key).push(comment);
  }

  engagementReady = true;
}

async function loadHub({ quiet = false } = {}) {
  if (!supabase) return;
  if (!quiet) say('Loading every public post…');

  const [activity, official, reviews, members] = await Promise.all([
    fetchAllPages(() => supabase
      .from('activity_posts')
      .select('id,user_id,post_type,title,subtitle,caption,media_url,image_url,event_date,city,created_at')
      .eq('visible', true)
      .order('created_at', { ascending: false })),
    fetchAllPages(() => supabase
      .from('community_posts')
      .select('id,title,body,image_url,published_at,created_at')
      .eq('published', true)
      .order('published_at', { ascending: false })),
    fetchAllPages(() => supabase
      .from('product_reviews')
      .select('id,user_id,product_slug,rating,comment,created_at,updated_at')
      .eq('visible', true)
      .order('updated_at', { ascending: false })),
    supabase
      .from('profiles')
      .select('id,display_name,avatar_url,status,profile_tagline,created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  if (members.error) throw members.error;

  activityPosts = activity;
  await loadProfiles([
    ...activity.map((post) => post.user_id),
    ...reviews.map((review) => review.user_id),
  ]);

  try {
    await loadEngagement(activityPosts);
  } catch (error) {
    resetEngagement();
    engagementReady = true;
    console.warn('Opinion hub engagement could not load:', error);
    say('Posts loaded. Likes and comments still need the v11 Supabase migration.', true);
  }

  threads = [
    ...activity.map(normalizeActivity),
    ...official.map(normalizeOfficial),
    ...reviews.map(normalizeReview),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  renderFeed();
  renderMembers(members.data || []);
  updateComposeAvatar();

  if (!feedMessage?.classList.contains('is-error')) {
    say(`${activity.length} public ${activity.length === 1 ? 'post' : 'posts'} in the opinion hub.`);
    window.setTimeout(() => {
      if (feedMessage?.textContent?.includes('opinion hub')) say('');
    }, 2600);
  }
}

function updateComposeAvatar() {
  if (!composeAvatar) return;
  composeAvatar.replaceChildren();
  const profile = user?.id ? profileById.get(user.id) : null;
  if (profile?.avatar_url) {
    const image = document.createElement('img');
    image.src = profile.avatar_url;
    image.alt = '';
    composeAvatar.append(image);
    composeAvatar.classList.add('has-image');
  } else {
    composeAvatar.textContent = profile?.display_name?.slice(0, 1).toUpperCase() || (user ? 'M' : '?');
    composeAvatar.classList.remove('has-image');
  }
}

function scheduleReload(delay = 250) {
  window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => {
    loadHub({ quiet: true }).catch((error) => {
      console.warn('Opinion hub refresh failed:', error);
    });
  }, delay);
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

feedRoot?.addEventListener('input', (event) => {
  const input = event.target.closest('textarea[name="comment"]');
  if (!input) return;
  const postId = input.closest('[data-comment-post]')?.dataset.commentPost;
  const counter = postId
    ? feedRoot.querySelector(`[data-comment-count="${CSS.escape(postId)}"]`)
    : null;
  if (counter) counter.textContent = `${input.value.length}/600`;
});

feedRoot?.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-comment-post]');
  if (!form) return;
  event.preventDefault();

  if (!supabase || !user) {
    window.location.href = signInUrl();
    return;
  }

  const postId = form.dataset.commentPost;
  const numericPostId = Number(postId);
  const input = form.querySelector('textarea[name="comment"]');
  const body = input?.value.trim() || '';
  if (!Number.isFinite(numericPostId)) return;
  if (!body) return say('Write a comment first.', true);
  if (body.length > 600) return say('Comments can be up to 600 characters.', true);
  if (busyComments.has(postId)) return;

  busyComments.add(postId);
  renderFeed();
  try {
    const result = await supabase.from('activity_post_comments').insert({
      post_id: numericPostId,
      user_id: user.id,
      body,
      visible: true,
    });
    if (result.error) throw result.error;
    openCommentPanels.add(postId);
    await loadEngagement(activityPosts);
    renderFeed();
    say('Comment posted.');
  } catch (error) {
    say(error.message || 'The comment could not be posted.', true);
  } finally {
    busyComments.delete(postId);
    renderFeed();
  }
});

feedRoot?.addEventListener('click', async (event) => {
  const commentToggle = event.target.closest('[data-toggle-comments]');
  if (commentToggle) {
    const postId = commentToggle.dataset.toggleComments;
    if (openCommentPanels.has(postId)) openCommentPanels.delete(postId);
    else openCommentPanels.add(postId);
    renderFeed();
    return;
  }

  const likeButton = event.target.closest('[data-like-post]');
  if (likeButton) {
    const postId = likeButton.dataset.likePost;
    const numericPostId = Number(postId);
    if (!supabase || !user) {
      window.location.href = signInUrl();
      return;
    }
    if (!Number.isFinite(numericPostId) || busyLikes.has(postId)) return;

    busyLikes.add(postId);
    renderFeed();
    try {
      const liked = likedByMe.has(postId);
      const result = liked
        ? await supabase
          .from('activity_post_likes')
          .delete()
          .eq('post_id', numericPostId)
          .eq('user_id', user.id)
        : await supabase
          .from('activity_post_likes')
          .insert({ post_id: numericPostId, user_id: user.id });
      if (result.error) throw result.error;
      await loadEngagement(activityPosts);
      renderFeed();
    } catch (error) {
      say(error.message || 'The like could not be updated.', true);
    } finally {
      busyLikes.delete(postId);
      renderFeed();
    }
    return;
  }

  const deleteComment = event.target.closest('[data-delete-comment]');
  if (deleteComment) {
    if (!supabase || !user) return;
    const commentId = Number(deleteComment.dataset.deleteComment);
    const postId = deleteComment.dataset.postId;
    if (!Number.isFinite(commentId)) return;
    if (!window.confirm('Delete this comment?')) return;

    try {
      const result = await supabase
        .from('activity_post_comments')
        .delete()
        .eq('id', commentId);
      if (result.error) throw result.error;
      openCommentPanels.add(postId);
      await loadEngagement(activityPosts);
      renderFeed();
      say('Comment deleted.');
    } catch (error) {
      say(error.message || 'The comment could not be deleted.', true);
    }
  }
});

if (!isSupabaseConfigured()) {
  if (warning) warning.hidden = false;
  if (feedRoot) {
    feedRoot.innerHTML = `
      <article class="thread-empty">
        <h2>The opinion hub is waiting for Supabase.</h2>
        <p>Finish connecting supabase-config.js, then refresh this page.</p>
      </article>`;
  }
  if (memberRoot) memberRoot.innerHTML = '<p>Member profiles will appear after Supabase is connected.</p>';
} else {
  const { createClient } = await import(
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm'
  );

  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const sessionResult = await supabase.auth.getSession();
  user = sessionResult.data.session?.user || null;

  try {
    await loadHub();
  } catch (error) {
    console.warn('Opinion hub failed:', error);
    say(error.message || 'The opinion hub could not load.', true);
    if (feedRoot) {
      feedRoot.innerHTML = `
        <article class="thread-empty">
          <h2>The feed could not load.</h2>
          <p>Make sure the latest community files and Supabase migrations are installed.</p>
        </article>`;
    }
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    user = session?.user || null;
    scheduleReload(50);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleReload(100);
  });
}
