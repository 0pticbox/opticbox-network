const feed = document.querySelector('#social-latest-updates');

const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function render(items, updatedAt) {
  if (!feed) return;
  if (!items.length) {
    feed.innerHTML = '<article class="social-update-empty"><h3>Updates are getting connected</h3><p>The newest YouTube and Instagram posts will appear here automatically.</p></article>';
    return;
  }

  feed.innerHTML = items.map((item) => {
    const platform = item.platform === 'instagram' ? 'Instagram' : 'YouTube';
    const image = item.image ? `<img loading="lazy" src="${escapeHTML(item.image)}" alt="${escapeHTML(platform)} post preview"/>` : '';
    const caption = item.caption ? `<p>${escapeHTML(item.caption)}</p>` : '';
    return `
      <article class="social-update-card social-${escapeHTML(item.platform)}">
        <a class="social-update-media" href="${escapeHTML(item.url)}" target="_blank" rel="noopener">
          ${image}
          <span class="social-platform-badge">${platform}</span>
        </a>
        <div class="social-update-copy">
          <div class="social-update-meta"><span>${escapeHTML(item.author || '0PTICBOX')}</span><time datetime="${escapeHTML(item.publishedAt)}">${escapeHTML(formatDate(item.publishedAt))}</time></div>
          <h3><a href="${escapeHTML(item.url)}" target="_blank" rel="noopener">${escapeHTML(item.title || `New ${platform} post`)}</a></h3>
          ${caption}
          <a class="social-update-link" href="${escapeHTML(item.url)}" target="_blank" rel="noopener">View on ${platform} →</a>
        </div>
      </article>`;
  }).join('');

  const stamp = document.querySelector('#social-feed-stamp');
  if (stamp && updatedAt) stamp.textContent = `synced ${formatDate(updatedAt)}`;
}

async function loadSocialFeed() {
  if (!feed) return;
  try {
    const response = await fetch(`data/social-updates.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);
    const data = await response.json();
    render(Array.isArray(data.items) ? data.items : [], data.updatedAt);
  } catch (error) {
    console.error(error);
    feed.innerHTML = '<article class="social-update-empty"><h3>Could not load updates</h3><p>Use the Instagram and YouTube links above while the feed reconnects.</p></article>';
  }
}

loadSocialFeed();
