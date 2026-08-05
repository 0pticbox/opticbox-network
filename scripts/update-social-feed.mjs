import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputPath = path.join(root, 'data', 'social-updates.json');
const instagramAssetDir = path.join(root, 'assets', 'social', 'instagram');

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const clip = (value = '', max = 280) => {
  const clean = String(value).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

const json = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }
  return response.json();
};

async function getYouTubeItems() {
  const apiKey = required('YOUTUBE_API_KEY');
  const channelId = required('YOUTUBE_CHANNEL_ID');

  const channelUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
  channelUrl.search = new URLSearchParams({
    part: 'contentDetails,snippet',
    id: channelId,
    key: apiKey,
  });
  const channelData = await json(channelUrl);
  const channel = channelData.items?.[0];
  if (!channel) throw new Error('YouTube channel not found. Check YOUTUBE_CHANNEL_ID.');

  const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) throw new Error('Could not find the YouTube uploads playlist.');

  const uploadsUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  uploadsUrl.search = new URLSearchParams({
    part: 'snippet,contentDetails',
    playlistId: uploadsId,
    maxResults: '8',
    key: apiKey,
  });
  const uploads = await json(uploadsUrl);

  return (uploads.items || []).map((item) => {
    const snippet = item.snippet || {};
    const videoId = item.contentDetails?.videoId || snippet.resourceId?.videoId;
    const thumbs = snippet.thumbnails || {};
    const image = thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || '';
    return {
      id: `youtube-${videoId}`,
      platform: 'youtube',
      title: snippet.title || 'New YouTube upload',
      caption: clip(snippet.description || '', 320),
      image,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt: snippet.publishedAt || new Date().toISOString(),
      author: channel.snippet?.title || '0PTICBOX',
    };
  });
}

function extensionFromType(contentType = '') {
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  return '.jpg';
}

async function downloadInstagramImage(url, mediaId) {
  if (!url) return '';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Instagram image download failed: ${response.status}`);
  const ext = extensionFromType(response.headers.get('content-type') || '');
  const filename = `${String(mediaId).replace(/[^a-zA-Z0-9_-]/g, '')}${ext}`;
  const target = path.join(instagramAssetDir, filename);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(target, bytes);
  return `assets/social/instagram/${filename}`;
}

async function getInstagramItems() {
  const accessToken = required('INSTAGRAM_ACCESS_TOKEN');
  const userId = required('INSTAGRAM_USER_ID');
  const version = (process.env.INSTAGRAM_GRAPH_VERSION || 'v23.0').trim();

  const mediaUrl = new URL(`https://graph.instagram.com/${version}/${encodeURIComponent(userId)}/media`);
  mediaUrl.search = new URLSearchParams({
    fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username',
    limit: '8',
    access_token: accessToken,
  });
  const data = await json(mediaUrl);

  const items = [];
  const keepFiles = new Set();
  for (const media of data.data || []) {
    const sourceImage = media.thumbnail_url || media.media_url || '';
    let image = '';
    try {
      image = await downloadInstagramImage(sourceImage, media.id);
      if (image) keepFiles.add(path.basename(image));
    } catch (error) {
      console.warn(`Could not cache Instagram image ${media.id}:`, error.message);
      image = sourceImage;
    }

    const caption = clip(media.caption || '', 420);
    items.push({
      id: `instagram-${media.id}`,
      platform: 'instagram',
      title: caption ? clip(caption.split(/[.!?\n]/)[0], 90) : 'New Instagram post',
      caption,
      image,
      url: media.permalink,
      publishedAt: media.timestamp || new Date().toISOString(),
      author: media.username ? `@${media.username}` : '@0pticbox',
      mediaType: media.media_type || 'IMAGE',
    });
  }

  try {
    const existing = await fs.readdir(instagramAssetDir);
    await Promise.all(existing.map((name) => keepFiles.has(name) ? null : fs.rm(path.join(instagramAssetDir, name), { force: true })));
  } catch {}

  return items;
}

async function main() {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(instagramAssetDir, { recursive: true });

  const results = await Promise.allSettled([getYouTubeItems(), getInstagramItems()]);
  const items = [];
  for (const result of results) {
    if (result.status === 'fulfilled') items.push(...result.value);
    else console.error(result.reason?.stack || result.reason);
  }

  if (!items.length) throw new Error('Neither social source returned content. Existing feed was not overwritten.');

  items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const payload = {
    updatedAt: new Date().toISOString(),
    items: items.slice(0, 12),
  };
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${payload.items.length} social updates.`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
