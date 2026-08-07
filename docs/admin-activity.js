import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

const root = document.getElementById('admin-activity-posts');
const count = document.getElementById('admin-activity-count');
const message = document.getElementById('admin-activity-message');
let posts = [];

function setMessage(text, error = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('is-error', error);
}

function profileName(post) {
  const relation = Array.isArray(post?.profiles) ? post.profiles[0] : post?.profiles;
  return relation?.display_name || 'Member';
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

function render() {
  if (!root) return;
  root.replaceChildren();
  if (count) count.textContent = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`;

  if (!posts.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No member activity posts yet.';
    root.append(empty);
    return;
  }

  for (const post of posts) {
    const article = document.createElement('article');
    article.className = `admin-post-row${post.visible ? '' : ' admin-review-hidden'}`;

    const copy = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = `${profileName(post)} · ${post.post_type === 'event' ? 'Going to' : post.post_type === 'listening' ? 'Listening to' : 'Post'}${post.title ? ` · ${post.title}` : ''}`;

    const meta = document.createElement('p');
    meta.className = 'admin-review-meta';
    const state = document.createElement('span');
    state.textContent = post.visible ? 'Visible' : 'Hidden';
    const date = document.createElement('span');
    date.textContent = formatDate(post.created_at);
    meta.append(state, date);

    const details = document.createElement('p');
    details.textContent = post.post_type === 'event'
      ? [post.event_date, post.city, post.caption].filter(Boolean).join(' · ')
      : post.post_type === 'listening'
        ? [post.subtitle, post.caption].filter(Boolean).join(' · ')
        : post.caption;

    copy.append(heading, meta, details);

    const actions = document.createElement('div');
    actions.className = 'admin-row-actions';

    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'retro-button';
    visibility.dataset.activityAction = post.visible ? 'hide' : 'show';
    visibility.dataset.activityId = String(post.id);
    visibility.textContent = post.visible ? 'Hide' : 'Restore';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'retro-button danger';
    remove.dataset.activityAction = 'delete';
    remove.dataset.activityId = String(post.id);
    remove.textContent = 'Delete';

    actions.append(visibility, remove);
    article.append(copy, actions);
    root.append(article);
  }
}

if (root && isSupabaseConfigured()) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) {
      setMessage('Admin session required.', true);
      return;
    }

    const { data, error } = await supabase
      .from('activity_posts')
      .select('id,user_id,post_type,title,subtitle,caption,event_date,city,visible,created_at,profiles(display_name)')
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) {
      setMessage(error.message, true);
      return;
    }

    posts = data || [];
    setMessage('');
    render();
  }

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-activity-action]');
    if (!button) return;
    const post = posts.find((item) => String(item.id) === button.dataset.activityId);
    if (!post) return;

    if (button.dataset.activityAction === 'delete') {
      const confirmed = window.confirm(`Permanently delete “${post.title}”?`);
      if (!confirmed) return;
      const { error } = await supabase.from('activity_posts').delete().eq('id', post.id);
      if (error) {
        setMessage(error.message, true);
        return;
      }
      await load();
      return;
    }

    const visible = button.dataset.activityAction === 'show';
    const { error } = await supabase
      .from('activity_posts')
      .update({ visible, updated_at: new Date().toISOString() })
      .eq('id', post.id);

    if (error) {
      setMessage(error.message, true);
      return;
    }
    await load();
  });

  await load();
} else if (root) {
  root.innerHTML = '<p class="admin-empty">Connect Supabase to moderate member activity.</p>';
}
