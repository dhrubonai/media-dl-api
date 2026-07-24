// extractors/youtube.js
// YouTube extractor — resolves direct googlevideo.com URLs for every format
// (144p–4K mp4/webm video + m4a/opus audio) using youtubei.js (InnerTube).
// Technique mirrors R-Gen: extract URLs, return JSON, no server-side download.

import { Innertube } from 'youtubei.js';

const SUPPORTED_PLAYER_IDS = ['0004de42', '2b83d2e0']; // fallbacks when auto-extract fails

// youtubei.js may try to fetch+eval YouTube's player JS, which is slow and can
// fail under YouTube's rotation. We attempt a few inits in order.
async function createClient() {
  const errors = [];
  // 1) Default (auto player_id from /iframe_api) — most resilient long term.
  try {
    const client = await Innertube.create({ retrieve_player: true });
    return client;
  } catch (e) {
    errors.push('default: ' + e.message);
  }
  // 2) Hardcoded player_id fallbacks.
  for (const pid of SUPPORTED_PLAYER_IDS) {
    try {
      const client = await Innertube.create({ retrieve_player: true, player_id: pid });
      return client;
    } catch (e) {
      errors.push(`player_id:${pid}: ` + e.message);
    }
  }
  // 3) No-player init — gives metadata + some formats even when decipher fails.
  try {
    const client = await Innertube.create({ retrieve_player: false });
    return client;
  } catch (e) {
    errors.push('no-player: ' + e.message);
  }
  throw new Error('All Innertube init strategies failed: ' + errors.join(' | '));
}

// Extract the 11-char video id from any YouTube URL shape.
export function extractId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(shorts|embed)\/([\w-]{11})/);
    if (m) return m[2];
    return null;
  } catch {
    return null;
  }
}

// Try several InnerTube clients; iOS/ANDROID/TY often yield pre-signed URLs
// that don't need deciphering, which sidesteps the "n transform" failures.
const CLIENTS = ['IOS', 'ANDROID', 'MWEB', 'WEB_EMBEDDED'];

async function getInfo(innertube, videoId) {
  const errors = [];
  for (const client of CLIENTS) {
    try {
      const info = await innertube.getBasicInfo(videoId, { client });
      if (info?.streaming_data || info?.formats?.length) return info;
    } catch (e) {
      errors.push(`${client}: ${e.message}`);
    }
  }
  throw new Error('Could not fetch video info from any client. ' + errors.join(' | '));
}

// Decipher a single format's URL safely; fall back to any pre-deciphered URL.
function resolveUrl(innertube, format) {
  const player = innertube.session?.player;
  const candidates = [];
  if (format.signature_cipher) candidates.push(() => player?.decipher(format.signature_cipher));
  if (format.cipher) candidates.push(() => player?.decipher(format.cipher));
  if (format.url) candidates.push(() => format.url);
  if (format.deciphered_url) candidates.push(() => format.deciphered_url);
  for (const fn of candidates) {
    try {
      const out = fn();
      if (out) return out;
    } catch {
      /* try next */
    }
  }
  return null;
}

function labelFor(f) {
  const res = f.height ? `${f.height}p` : '';
  const ext = (f.mime_type || f.mimeType || '').includes('webm') ? 'webm'
            : (f.mime_type || f.mimeType || '').includes('mp4') ? 'mp4'
            : (f.mime_type || f.mimeType || '').includes('opus') ? 'opus'
            : (f.mime_type || f.mimeType || '').includes('audio/mp4') ? 'm4a'
            : 'media';
  if (f.has_audio && !f.has_video) return `${ext} (${Math.round((f.bitrate || 0) / 1000)}kb/s)`;
  return `${ext} (${res || 'audio'})`.trim();
}

export async function extract(url) {
  const videoId = extractId(url);
  if (!videoId) throw Object.assign(new Error('Could not parse YouTube video id'), { code: 'BAD_URL' });

  const innertube = await createClient();
  const info = await getInfo(innertube, videoId);

  const streaming = info.streaming_data;
  const formats = [
    ...(streaming?.adaptive_formats || []),
    ...(streaming?.formats || []),
    ...(info.formats || [])
  ];

  const medias = [];
  for (const f of formats) {
    const resolved = resolveUrl(innertube, f);
    if (!resolved) continue;
    const mime = f.mime_type || f.mimeType || '';
    const isAudio = mime.startsWith('audio') || (f.has_audio && !f.has_video);
    medias.push({
      formatId: f.itag ?? f.format_id ?? null,
      label: labelFor(f),
      type: isAudio ? 'audio' : 'video',
      ext: mime.includes('webm') ? 'webm' : mime.includes('opus') ? 'opus' : mime.includes('audio/mp4') ? 'm4a' : 'mp4',
      quality: labelFor(f),
      width: f.width ?? null,
      height: f.height ?? null,
      bitrate: f.bitrate ?? f.average_bitrate ?? null,
      fps: f.fps ?? null,
      mimeType: mime || null,
      hasAudio: f.has_audio ?? null,
      url: resolved
    });
  }

  // Sort: video desc by height, then audio desc by bitrate.
  medias.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'video' ? -1 : 1;
    if (a.type === 'video') return (b.height || 0) - (a.height || 0);
    return (b.bitrate || 0) - (a.bitrate || 0);
  });

  if (!medias.length) {
    throw Object.assign(new Error('YouTube returned no downloadable formats (video may be private/age-restricted, or player decipher failed)'), { code: 'NO_FORMATS' });
  }

  return {
    title: info.basic_info?.title ?? null,
    thumbnail: info.basic_info?.thumbnail?.[0]?.url ?? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    duration: info.basic_info?.duration ?? null,
    author: info.basic_info?.author ?? null,
    views: info.basic_info?.view_count ?? null,
    platform: 'YouTube',
    medias
  };
}
