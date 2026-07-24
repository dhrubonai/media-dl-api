// extractors/youtube.js
// YouTube extractor using youtubei.js (InnerTube). Resolves direct googlevideo.com
// URLs for every format. Built to be resilient against YouTube's IP/rotation blocks:
//  - Tries multiple InnerTube clients, leading with iOS/TV which return pre-signed
//    URLs and rarely need deciphering (sidesteps the "n transform" / decipher errors).
//  - Retries once on transient failures.
//  - Honors optional YT_COOKIE and YT_PO_TOKEN env vars for when unauthenticated
//    datacenter IPs get throttled. Set them in Vercel project env to harden extraction.
//  - Falls back to client with the most usable formats rather than all-or-nothing.

import { Innertube } from 'youtubei.js';
import { makeFetch, hasProxy } from '../utils/fetcher.js';

// Client order matters. iOS and TV (TVHTML5) hit different endpoints and often
// return URLs that don't need deciphering, so they're the most reliable from a
// datacenter IP. ANDROID/MWEB/WEB_EMBEDDED follow as fallbacks.
const CLIENT_ORDER = ['IOS', 'TV', 'TVHTML5', 'ANDROID', 'MWEB', 'WEB_EMBEDDED'];

const OPTS_BASE = (extra = {}) => ({
  retrieve_player: true,
  enable_session_cache: false,
  ...(process.env.YT_COOKIE ? { cookie: process.env.YT_COOKIE } : {}),
  ...(process.env.YT_PO_TOKEN ? { po_token: process.env.YT_PO_TOKEN } : {}),
  ...extra
});

let _clientPromise = null;
function getClient() {
  if (!_clientPromise) {
    _clientPromise = (async () => {
      const errs = [];
      // Build base opts, then attach a proxy-aware fetch if a proxy is configured.
      const base = OPTS_BASE();
      if (hasProxy('youtube')) {
        try { base.fetch = await makeFetch('youtube'); } catch { /* proxy unavailable, fall back to direct */ }
      }
      try {
        return await Innertube.create(base);
      } catch (e) { errs.push('default: ' + e.message); }
      // Retry without player retrieval (gives metadata + some formats).
      try {
        const np = OPTS_BASE({ retrieve_player: false });
        if (hasProxy('youtube')) { try { np.fetch = await makeFetch('youtube'); } catch {} }
        return await Innertube.create(np);
      } catch (e) { errs.push('no-player: ' + e.message); }
      throw new Error('Innertube init failed: ' + errs.join(' | '));
    })().catch((e) => { _clientPromise = null; throw e; });
  }
  return _clientPromise;
}

export function extractId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(shorts|embed)\/([\w-]{11})/);
    if (m) return m[2];
    return null;
  } catch { return null; }
}

// Fetch info from ONE client, returning { info, formats } or throwing.
async function tryClient(innertube, videoId, client) {
  const info = await innertube.getBasicInfo(videoId, { client });
  const streaming = info?.streaming_data;
  const formats = [
    ...(streaming?.adaptive_formats || []),
    ...(streaming?.formats || []),
    ...(info?.formats || [])
  ];
  if (!formats.length) {
    const why = info?.playability_status;
    throw Object.assign(new Error(`${client}: ${why?.status || 'no formats'}${why?.reason ? ' — ' + why.reason : ''}`), { soft: true });
  }
  return { info, formats };
}

// Resolve a single format's URL: prefer pre-signed, then decipher, then fallback.
function resolveUrl(innertube, f) {
  const player = innertube.session?.player;
  if (f.url) return f.url;
  if (f.deciphered_url) return f.deciphered_url;
  const cipher = f.signature_cipher || f.cipher;
  if (cipher && player) {
    try { const out = player.decipher(cipher); if (out) return out; } catch { /* next */ }
  }
  return null;
}

function labelFor(f) {
  const mime = f.mime_type || f.mimeType || '';
  const ext = mime.includes('webm') ? 'webm'
            : mime.includes('opus') ? 'opus'
            : mime.includes('audio/mp4') || mime.includes('audio/mp4') ? 'm4a'
            : 'mp4';
  const isAudio = mime.startsWith('audio') || (f.has_audio && !f.has_video);
  if (isAudio) return `${ext} · ${Math.round((f.bitrate || 0) / 1000)}kbps`;
  return `${ext} · ${f.height || '?'}p`;
}

function toMedia(f, resolved) {
  const mime = f.mime_type || f.mimeType || '';
  const isAudio = mime.startsWith('audio') || (f.has_audio && !f.has_video);
  return {
    formatId: f.itag ?? f.format_id ?? null,
    label: labelFor(f),
    type: isAudio ? 'audio' : 'video',
    ext: mime.includes('webm') ? 'webm' : mime.includes('opus') ? 'opus'
       : mime.includes('audio/mp4') ? 'm4a' : 'mp4',
    quality: labelFor(f),
    width: f.width ?? null,
    height: f.height ?? null,
    bitrate: f.bitrate ?? f.average_bitrate ?? null,
    fps: f.fps ?? null,
    mimeType: mime || null,
    hasAudio: f.has_audio ?? null,
    url: resolved
  };
}

export async function extract(url) {
  const videoId = extractId(url);
  if (!videoId) throw Object.assign(new Error('Could not parse a YouTube video ID from that URL'), { code: 'BAD_URL' });

  const innertube = await getClient();

  // Try each client; keep the first one that yields formats. Collect errors so
  // the failure message tells the user exactly what YouTube refused.
  const errs = [];
  let best = null;
  for (const client of CLIENT_ORDER) {
    try {
      const { info, formats } = await tryClient(innertube, videoId, client);
      const resolved = formats.map((f) => ({ f, url: resolveUrl(innertube, f) }));
      const usable = resolved.filter((r) => r.url);
      // Prefer the client that gave us the most usable URLs.
      if (!best || usable.length > best.usable.length) {
        best = { info, usable };
      }
      if (usable.length) break; // good enough, stop trying clients
    } catch (e) {
      errs.push(e.soft ? e.message : `${client}: ${e.message}`);
    }
  }

  if (!best || !best.usable.length) {
    throw Object.assign(
      new Error('YouTube returned no playable formats from any client. ' + errs.join(' | ') +
        '. This usually means YouTube is throttling the server IP — set YT_COOKIE + YT_PO_TOKEN env vars in Vercel to authenticate.'),
      { code: 'NO_FORMATS' }
    );
  }

  const medias = best.usable.map(({ f, url }) => toMedia(f, url));
  // Sort: video desc by height, audio after.
  medias.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'video' ? -1 : 1;
    if (a.type === 'video') return (b.height || 0) - (a.height || 0);
    return (b.bitrate || 0) - (a.bitrate || 0);
  });

  const info = best.info;
  return {
    title: info.basic_info?.title ?? null,
    thumbnail: info.basic_info?.thumbnail?.[0]?.url ?? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    duration: info.basic_info?.duration ?? null,
    author: info.basic_info?.author ?? null,
    views: info.basic_info?.view_count ?? null,
    platform: 'YouTube',
    medias
  };
}
