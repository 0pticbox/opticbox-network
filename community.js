import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

let supabase = null;
let user = null;
let profile = null;
let posts = [];
let filter = 'all';
let engagementReady = false;

const likesByPost = new Map();
const commentsByPost = new Map();
const likedByMe = new Set();
const openCommentPanels = new Set();
const busyLikes = new Set();
const busyComments = new Set();

const $ = (id) => document.getElementById(id);
const warning = $('activity-config-warning');
const signedOut = $('activity-signed-out');
const form = $('activity-form');
const sessionLabel = $('activity-session-label');
const typeInput = $('activity-post-type');
const feedback = $('activity-form-message');
const feedFeedback = $('activity-feed-message');
const caption = $('activity-caption');
const captionCount = $('activity-caption-count');
const imageInput = $('activity-image');
const root = $('activity-posts');
const count = $('activity-post-count');
const captionLabel = $('activity-caption-label');

function say(text, error = false) {
  if (!feedback) return;
  feedback.textContent = text;
  feedback.classList.toggle('is-error', error);
}

let feedMessageTimer = null;
function feedSay(text, error = false) {
  if (!feedFeedback) return;
  window.clearTimeout(feedMessageTimer);
  feedFeedback.textContent = text;
  feedFeedback.classList.toggle('is-error', error);
  if (text && !error) {
    feedMessageTimer = window.setTimeout(() => {
      feedFeedback.textContent = '';
    }, 2600);
  }
}

function fallbackName(value) {
  const named = value?.user_metadata?.display_name;
  const fallback = typeof named === 'string' && named.trim().length >= 2
    ? named.trim()
    : value?.email?.split('@')[0] || 'Member';
  return fallback.slice(0, 32);
}

function safeUrl(value) {
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
  const safe = safeUrl(value);
  if (!safe) return '';
  const parsed = new URL(safe);
  if (parsed.hostname.includes('youtu.be')) {
    return parsed.pathname.split('/').filter(Boolean)[0] || '';
  }
  if (parsed.hostname.includes('youtube.com')) {
    if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || '';
  }
  return '';
}

function platform(value) {
  const host = new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  if (host.includes('youtube') || host === 'youtu.be') return 'Open on YouTube';
  if (host.includes('spotify')) return 'Open on Spotify';
  if (host.includes('soundcloud')) return 'Open on SoundCloud';
  if (host.includes('music.apple')) return 'Open in Apple Music';
  if (host.includes('bandcamp')) return 'Open on Bandcamp';
  return 'Open link';
}

function relation(row) {
  return Array.isArray(row?.profiles) ? row.profiles[0] || null : row?.profiles || null;
}

async function attachProfiles(rows) {
  const source = Array.isArray(rows) ? rows : [];
  const userIds = [...new Set(source.map((row) => row?.user_id).filter(Boolean))];
  if (!userIds.length) return source;

  const result = await supabase
    .from('profiles')
    .select('id,display_name,avatar_url')
    .in('id', userIds);

  if (result.error) throw result.error;

  const profilesById = new Map(
    (result.data || []).map((item) => [item.id, item]),
  );

  return source.map((row) => ({
    ...row,
    profiles: profilesById.get(row.user_id) || null,
  }));
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatEventDate(value) {
  if (!value) return '';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function avatarNode(value, className = 'activity-avatar') {
  const node = document.createElement('span');
  node.className = className;
  if (value?.avatar_url) {
    const image = document.createElement('img');
    image.src = value.avatar_url;
    image.alt = '';
    image.loading = 'lazy';
    node.append(image);
  } else {
    node.textContent = (value?.display_name || 'M').slice(0, 1).toUpperCase();
  }
  return node;
}

function mediaNode(post) {
  const uploaded = safeUrl(post.image_url);
  const video = post.post_type === 'listening' ? youtubeId(post.media_url) : '';
  const source = uploaded || (video
    ? `https://i.ytimg.com/vi/${encodeURIComponent(video)}/hqdefault.jpg`
    : '');
  const media = document.createElement('div');
  media.className = `activity-card-media${source ? ' has-image' : ''}`;

  if (source) {
    const image = document.createElement('img');
    image.src = source;
    image.alt = post.title ? `Media for ${post.title}` : 'Community post image';
    image.loading = 'lazy';
    media.append(image);
  } else {
    const icon = document.createElement('span');
    icon.className = 'activity-media-fallback';
    icon.textContent = post.post_type === 'event' ? '✦' : post.post_type === 'listening' ? '♫' : '✎';
    icon.setAttribute('aria-hidden', 'true');
    media.append(icon);
  }
  return media;
}

function badge(type) {
  if (type === 'event') return 'GOING TO';
  if (type === 'listening') return 'NOW LISTENING';
  return 'POST';
}

function signInUrl() {
  return 'signin.html?next=community.html';
}

function commentNode(comment, post) {
  const person = relation(comment);
  const item = document.createElement('article');
  item.className = 'activity-comment';

  const identity = document.createElement('a');
  identity.className = 'activity-comment-person';
  identity.href = person?.id ? `profile.html?id=${encodeURIComponent(person.id)}` : 'members.html';
  identity.append(avatarNode(person, 'activity-comment-avatar'));

  const copy = document.createElement('span');
  const name = document.createElement('strong');
  const time = document.createElement('small');
  name.textContent = person?.display_name || 'Member';
  time.textContent = formatDate(comment.created_at);
  copy.append(name, time);
  identity.append(copy);

  const body = document.createElement('p');
  body.textContent = comment.body;

  item.append(identity, body);

  const canDelete = Boolean(user?.id) && (
    comment.user_id === user.id
    || post.user_id === user.id
  );
  if (canDelete) {
    const remove = document.createElement('button');
    remove.className = 'activity-comment-delete';
    remove.type = 'button';
    remove.dataset.deleteComment = String(comment.id);
    remove.dataset.postId = String(post.id);
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete comment by ${person?.display_name || 'member'}`);
    item.append(remove);
  }

  return item;
}

function engagementNode(post) {
  const postId = String(post.id);
  const likeCount = likesByPost.get(postId) || 0;
  const comments = commentsByPost.get(postId) || [];
  const liked = likedByMe.has(postId);
  const panelOpen = openCommentPanels.has(postId);

  const section = document.createElement('section');
  section.className = 'activity-engagement';
  section.setAttribute('aria-label', 'Likes and comments');

  const bar = document.createElement('div');
  bar.className = 'activity-engagement-bar';

  const likeButton = document.createElement('button');
  likeButton.className = `activity-like-button${liked ? ' is-liked' : ''}`;
  likeButton.type = 'button';
  likeButton.dataset.likePost = postId;
  likeButton.disabled = busyLikes.has(postId);
  likeButton.setAttribute('aria-pressed', String(liked));
  likeButton.setAttribute('aria-label', liked ? 'Remove like' : 'Like this post');
  likeButton.innerHTML = `<span aria-hidden="true">${liked ? '♥' : '♡'}</span><strong>${liked ? 'Liked' : 'Like'}</strong><small>${likeCount}</small>`;

  const commentButton = document.createElement('button');
  commentButton.className = `activity-comment-toggle${panelOpen ? ' is-open' : ''}`;
  commentButton.type = 'button';
  commentButton.dataset.toggleComments = postId;
  commentButton.setAttribute('aria-expanded', String(panelOpen));
  commentButton.innerHTML = `<span aria-hidden="true">▱</span><strong>Comments</strong><small>${comments.length}</small>`;

  bar.append(likeButton, commentButton);
  section.append(bar);

  const panel = document.createElement('div');
  panel.className = 'activity-comment-panel';
  panel.hidden = !panelOpen;
  panel.id = `comments-${postId}`;

  const list = document.createElement('div');
  list.className = 'activity-comment-list';
  if (!engagementReady) {
    const loading = document.createElement('p');
    loading.className = 'activity-comment-empty';
    loading.textContent = 'Loading comments…';
    list.append(loading);
  } else if (!comments.length) {
    const empty = document.createElement('p');
    empty.className = 'activity-comment-empty';
    empty.textContent = 'No comments yet. Start the conversation.';
    list.append(empty);
  } else {
    comments.forEach((comment) => list.append(commentNode(comment, post)));
  }
  panel.append(list);

  if (user) {
    const commentForm = document.createElement('form');
    commentForm.className = 'activity-comment-form';
    commentForm.dataset.commentPost = postId;

    const label = document.createElement('label');
    label.className = 'sr-only';
    label.htmlFor = `comment-input-${postId}`;
    label.textContent = 'Write a comment';

    const input = document.createElement('textarea');
    input.id = `comment-input-${postId}`;
    input.name = 'comment';
    input.maxLength = 600;
    input.rows = 2;
    input.required = true;
    input.placeholder = 'Write a comment…';

    const footer = document.createElement('div');
    footer.className = 'activity-comment-form-footer';
    const counter = document.createElement('small');
    counter.dataset.commentCount = postId;
    counter.textContent = '0/600';
    const submit = document.createElement('button');
    submit.className = 'retro-button primary';
    submit.type = 'submit';
    submit.disabled = busyComments.has(postId);
    submit.textContent = busyComments.has(postId) ? 'Posting…' : 'Comment';
    footer.append(counter, submit);

    commentForm.append(label, input, footer);
    panel.append(commentForm);
  } else {
    const note = document.createElement('p');
    note.className = 'activity-comment-signin';
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

function render() {
  const shown = filter === 'all' ? posts : posts.filter((post) => post.post_type === filter);
  root.replaceChildren();
  count.textContent = `${shown.length} ${shown.length === 1 ? 'post' : 'posts'}`;

  if (!shown.length) {
    const box = document.createElement('div');
    box.className = 'activity-empty';
    box.innerHTML = '<h3>Nothing here yet.</h3><p>Make the first post above.</p>';
    root.append(box);
    return;
  }

  for (const post of shown) {
    const person = relation(post);
    const article = document.createElement('article');
    article.className = `activity-card activity-card-${post.post_type}`;
    article.dataset.postId = String(post.id);

    const identity = document.createElement('div');
    identity.className = 'activity-card-identity';

    const personLink = document.createElement('a');
    personLink.className = 'activity-person';
    personLink.href = person?.id ? `profile.html?id=${encodeURIComponent(person.id)}` : 'members.html';
    personLink.append(avatarNode(person));

    const idCopy = document.createElement('span');
    const strong = document.createElement('strong');
    const small = document.createElement('small');
    strong.textContent = person?.display_name || 'Member';
    small.textContent = formatDate(post.created_at);
    idCopy.append(strong, small);
    personLink.append(idCopy);

    const badgeElement = document.createElement('span');
    badgeElement.className = 'activity-post-badge';
    badgeElement.textContent = badge(post.post_type);
    identity.append(personLink, badgeElement);

    const content = document.createElement('div');
    content.className = 'activity-card-content';
    content.append(mediaNode(post));

    const copy = document.createElement('div');
    copy.className = 'activity-card-copy';

    if (post.title) {
      const heading = document.createElement('h2');
      heading.textContent = post.title;
      copy.append(heading);
    }

    if (post.post_type === 'listening' && post.subtitle) {
      const subtitle = document.createElement('p');
      subtitle.className = 'activity-card-subtitle';
      subtitle.textContent = `by ${post.subtitle}`;
      copy.append(subtitle);
    }

    if (post.post_type === 'event') {
      const details = document.createElement('div');
      details.className = 'activity-event-details';
      for (const value of [formatEventDate(post.event_date), post.city].filter(Boolean)) {
        const detail = document.createElement('span');
        detail.textContent = value;
        details.append(detail);
      }
      copy.append(details);
    }

    if (post.caption) {
      const text = document.createElement('p');
      text.className = 'activity-card-caption';
      text.textContent = post.caption;
      copy.append(text);
    }

    const actions = document.createElement('div');
    actions.className = 'activity-card-actions';
    const linkUrl = safeUrl(post.media_url);
    if (linkUrl) {
      const link = document.createElement('a');
      link.className = 'retro-button';
      link.href = linkUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = post.post_type === 'event'
        ? 'Open event page'
        : post.post_type === 'listening'
          ? platform(linkUrl)
          : 'Open link';
      actions.append(link);
    }

    if (user?.id === post.user_id) {
      const remove = document.createElement('button');
      remove.className = 'retro-button danger';
      remove.type = 'button';
      remove.dataset.deleteActivity = String(post.id);
      remove.textContent = 'Delete my post';
      actions.append(remove);
    }

    if (actions.children.length) copy.append(actions);
    content.append(copy);
    article.append(identity, content, engagementNode(post));
    root.append(article);
  }
}

async function ensureProfile() {
  const found = await supabase
    .from('profiles')
    .select('id,display_name,avatar_url')
    .eq('id', user.id)
    .maybeSingle();
  if (found.error) throw found.error;
  if (found.data) return found.data;

  const made = await supabase
    .from('profiles')
    .insert({ id: user.id, display_name: fallbackName(user), avatar_url: '' })
    .select('id,display_name,avatar_url')
    .single();
  if (made.error) throw made.error;
  return made.data;
}

function sessionUi() {
  const signed = Boolean(user);
  signedOut.hidden = signed;
  form.hidden = !signed;
  sessionLabel.textContent = signed
    ? `posting as ${profile?.display_name || fallbackName(user)}`
    : 'member sign-in required';
}

function resetEngagement() {
  likesByPost.clear();
  commentsByPost.clear();
  likedByMe.clear();
  engagementReady = false;
}

async function loadEngagement() {
  resetEngagement();
  const postIds = posts.map((post) => post.id);
  if (!postIds.length) {
    engagementReady = true;
    return;
  }

  const [likesResult, commentsResult] = await Promise.all([
    supabase
      .from('activity_post_likes')
      .select('post_id,user_id')
      .in('post_id', postIds),
    supabase
      .from('activity_post_comments')
      .select('id,post_id,user_id,body,created_at')
      .in('post_id', postIds)
      .eq('visible', true)
      .order('created_at', { ascending: true })
      .limit(1000),
  ]);

  if (likesResult.error) throw likesResult.error;
  if (commentsResult.error) throw commentsResult.error;

  const commentsWithProfiles = await attachProfiles(commentsResult.data || []);

  for (const like of likesResult.data || []) {
    const key = String(like.post_id);
    likesByPost.set(key, (likesByPost.get(key) || 0) + 1);
    if (user?.id && like.user_id === user.id) likedByMe.add(key);
  }

  for (const comment of commentsWithProfiles) {
    const key = String(comment.post_id);
    if (!commentsByPost.has(key)) commentsByPost.set(key, []);
    commentsByPost.get(key).push(comment);
  }

  engagementReady = true;
}

async function load() {
  const result = await supabase
    .from('activity_posts')
    .select('id,user_id,post_type,title,subtitle,caption,media_url,image_url,event_date,city,visible,created_at,updated_at')
    .eq('visible', true)
    .order('created_at', { ascending: false })
    .limit(100);
  if (result.error) throw result.error;
  posts = await attachProfiles(result.data || []);

  try {
    await loadEngagement();
  } catch (error) {
    resetEngagement();
    engagementReady = true;
    feedSay('Likes and comments need the new Supabase SQL migration.', true);
    console.warn(error);
  }
  render();
}

function setType(value) {
  const next = ['post', 'listening', 'event'].includes(value) ? value : 'post';
  typeInput.value = next;
  document.querySelectorAll('[data-post-type]').forEach((button) => {
    const active = button.dataset.postType === next;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-fields]').forEach((group) => {
    group.hidden = group.dataset.fields !== next;
  });
  captionLabel.textContent = next === 'post' ? 'Post text' : 'Caption (optional)';
  caption.placeholder = next === 'post'
    ? 'What’s on your mind?'
    : next === 'listening'
      ? 'Why is this track hitting?'
      : 'Who are you excited to see?';
}

async function upload(file) {
  if (!file) return '';
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Use a PNG, JPG, WEBP, or GIF image.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Images must be 5 MB or smaller.');
  }

  const extension = (file.name.split('.').pop() || 'jpg')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${user.id}/activity-${Date.now()}.${extension}`;
  const result = await supabase.storage
    .from('community-media')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });
  if (result.error) throw result.error;
  return supabase.storage.from('community-media').getPublicUrl(path).data.publicUrl;
}

async function handleSession(session) {
  user = session?.user || null;
  profile = null;
  if (user) {
    try {
      profile = await ensureProfile();
    } catch (error) {
      say(error.message || 'Your profile could not be loaded.', true);
    }
  }
  sessionUi();
  if (supabase) {
    try {
      await load();
    } catch (error) {
      root.innerHTML = '<p class="review-empty">The feed could not load. Apply the newest Supabase schema, then refresh.</p>';
      console.warn(error);
    }
  } else {
    render();
  }
}

if (!isSupabaseConfigured()) {
  warning.hidden = false;
  form.querySelectorAll('input,textarea,button').forEach((element) => {
    element.disabled = true;
  });
  root.innerHTML = '<p class="review-empty">Connect Supabase and run the newest schema to turn on the community feed.</p>';
} else {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  await handleSession((await supabase.auth.getSession()).data.session);
  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => handleSession(session).catch(console.warn), 0);
  });
}

document.querySelectorAll('[data-post-type]').forEach((button) => {
  button.addEventListener('click', () => setType(button.dataset.postType));
});

document.querySelectorAll('[data-activity-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    filter = button.dataset.activityFilter || 'all';
    document.querySelectorAll('[data-activity-filter]').forEach((item) => {
      const active = item.dataset.activityFilter === filter;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    render();
  });
});

caption?.addEventListener('input', () => {
  captionCount.textContent = String(caption.value.length);
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase || !user) return;

  const type = ['post', 'listening', 'event'].includes(typeInput.value)
    ? typeInput.value
    : 'post';
  const text = caption.value.trim();
  let title = '';
  let subtitle = '';
  let mediaUrl = '';
  let eventDate = null;
  let city = '';

  if (type === 'post') {
    title = $('activity-post-title').value.trim();
    const raw = $('activity-post-url').value.trim();
    mediaUrl = raw ? safeUrl(raw) : '';
    if (raw && !mediaUrl) return say('The link needs to start with http:// or https://.', true);
    if (!text && !imageInput.files?.[0]) return say('Write something or add an image.', true);
  } else if (type === 'listening') {
    title = $('activity-track-title').value.trim();
    subtitle = $('activity-artist-name').value.trim();
    const raw = $('activity-media-url').value.trim();
    mediaUrl = raw ? safeUrl(raw) : '';
    if (!title || !subtitle) return say('Add both the track title and artist.', true);
    if (raw && !mediaUrl) return say('The listening link needs to start with http:// or https://.', true);
  } else {
    title = $('activity-event-name').value.trim();
    eventDate = $('activity-event-date').value || null;
    city = $('activity-event-city').value.trim();
    const raw = $('activity-event-url').value.trim();
    mediaUrl = raw ? safeUrl(raw) : '';
    if (!title || !eventDate || !city) return say('Add the event name, date, and city.', true);
    if (raw && !mediaUrl) return say('The event link needs to start with http:// or https://.', true);
  }

  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  say('Posting…');
  try {
    const imageUrl = await upload(imageInput.files?.[0] || null);
    const result = await supabase.from('activity_posts').insert({
      user_id: user.id,
      post_type: type,
      title,
      subtitle,
      caption: text,
      media_url: mediaUrl,
      image_url: imageUrl,
      event_date: eventDate,
      city,
      visible: true,
      updated_at: new Date().toISOString(),
    });
    if (result.error) throw result.error;
    form.reset();
    setType('post');
    captionCount.textContent = '0';
    say('Posted to the community feed.');
    await load();
  } catch (error) {
    say(error.message || 'The post could not be saved.', true);
  } finally {
    submit.disabled = false;
  }
});

root?.addEventListener('input', (event) => {
  const input = event.target.closest('textarea[name="comment"]');
  if (!input) return;
  const postId = input.closest('[data-comment-post]')?.dataset.commentPost;
  const counter = postId ? root.querySelector(`[data-comment-count="${CSS.escape(postId)}"]`) : null;
  if (counter) counter.textContent = `${input.value.length}/600`;
});

root?.addEventListener('submit', async (event) => {
  const commentForm = event.target.closest('[data-comment-post]');
  if (!commentForm) return;
  event.preventDefault();

  if (!supabase || !user) {
    window.location.href = signInUrl();
    return;
  }

  const postId = commentForm.dataset.commentPost;
  const textArea = commentForm.querySelector('textarea[name="comment"]');
  const body = textArea?.value.trim() || '';
  if (!body) return feedSay('Write a comment first.', true);
  if (body.length > 600) return feedSay('Comments can be up to 600 characters.', true);
  if (busyComments.has(postId)) return;

  busyComments.add(postId);
  render();
  try {
    const result = await supabase.from('activity_post_comments').insert({
      post_id: Number(postId),
      user_id: user.id,
      body,
      visible: true,
    });
    if (result.error) throw result.error;
    openCommentPanels.add(postId);
    await loadEngagement();
    render();
    feedSay('Comment posted.');
  } catch (error) {
    feedSay(error.message || 'The comment could not be posted.', true);
  } finally {
    busyComments.delete(postId);
    render();
  }
});

root?.addEventListener('click', async (event) => {
  const toggleComments = event.target.closest('[data-toggle-comments]');
  if (toggleComments) {
    const postId = toggleComments.dataset.toggleComments;
    if (openCommentPanels.has(postId)) openCommentPanels.delete(postId);
    else openCommentPanels.add(postId);
    render();
    return;
  }

  const likeButton = event.target.closest('[data-like-post]');
  if (likeButton) {
    const postId = likeButton.dataset.likePost;
    if (!supabase || !user) {
      window.location.href = signInUrl();
      return;
    }
    if (busyLikes.has(postId)) return;

    busyLikes.add(postId);
    render();
    try {
      const liked = likedByMe.has(postId);
      const result = liked
        ? await supabase
          .from('activity_post_likes')
          .delete()
          .eq('post_id', Number(postId))
          .eq('user_id', user.id)
        : await supabase
          .from('activity_post_likes')
          .insert({ post_id: Number(postId), user_id: user.id });
      if (result.error) throw result.error;
      await loadEngagement();
      render();
    } catch (error) {
      feedSay(error.message || 'The like could not be updated.', true);
    } finally {
      busyLikes.delete(postId);
      render();
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
      await loadEngagement();
      render();
      feedSay('Comment deleted.');
    } catch (error) {
      feedSay(error.message || 'The comment could not be deleted.', true);
    }
    return;
  }

  const deletePost = event.target.closest('[data-delete-activity]');
  if (!deletePost || !supabase || !user) return;
  const post = posts.find((item) => String(item.id) === deletePost.dataset.deleteActivity);
  if (!post || post.user_id !== user.id) return;
  if (!window.confirm(`Delete this ${post.post_type === 'post' ? 'post' : post.post_type}?`)) return;

  const result = await supabase
    .from('activity_posts')
    .delete()
    .eq('id', post.id)
    .eq('user_id', user.id);
  if (result.error) {
    feedSay(result.error.message, true);
    return;
  }
  openCommentPanels.delete(String(post.id));
  await load();
});

setType('post');
