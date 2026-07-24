// extractors/facebook.js
// Facebook extractor. Resolves direct MP4 URLs for public videos by:
//  1) Fetching the mobile page HTML and extracting the embedded JSON (relay data)
//     which usually contains a playable_video_url / image candidate.
//  2) Falling back to the public oEmbed/graphvideo metadata.
// Facebook aggressively gates content; without cookies many posts return a
// login wall. We extract what's publicly available and fail honestly otherwise.
// Honors optional PROXY_URL env (residential/mobile) since FB blocks datacenter IPs.

import { fetched } from '../utils/fetcher.js';

const UA = 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

// If FB_COOKIE is set (a logged-in browser cookie string), send it on every
// request. Without it Facebook returns HTTP 400 to datacenter IPs.
const fbHeaders = () => {
  const h = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' };
  if (process.env.FB_COOKIE) {
    h['Cookie'] = process.env.FB_COOKIE;
    h['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  }
  return h;
};

// Extract the canonical video URL from a fb.watch short link or any FB URL.
async function resolveCanonical(url) {
  const res = await fetched(url, { method: 'GET', redirect: 'follow', headers: fbHeaders() }, 'facebook');
  return { finalUrl: res.url || url, status: res.status, html: await res.text() };
}

// Pull the first JSON-encoded value for a key out of the raw HTML. FB embeds
// several large JSON blobs (relay payload, __comet_data, etc.) where the
// playable URL lives under varying keys.
function findPlayableUrls(html) {
  const urls = new Set();
  const push = (s) => { if (s && /^https?:\/\//.test(s) && /\.(mp4|webm)/i.test(s)) urls.add(s); };

  // 1. Direct quoted playable_video_url / videoUrl fields.
  const keyRe = /"(?:playable_video_url|playableUrl|videoUrl|browser_native_hd_url|browser_native_sd_url|hd_src|sd_src|permalink_url)"\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = keyRe.exec(html)) !== null) {
    push(m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/'));
  }

  // 2. Bare .mp4 URLs anywhere in the document.
  const bareRe = /https?:\\?\/\\?\/[^\s"'<>]+?\.(?:mp4|webm)[^\s"'<>?]*/g;
  while ((m = bareRe.exec(html)) !== null) {
    push(m[0].replace(/\\\//g, '/'));
  }
  return [...urls];
}

function findMeta(html) {
  const get = (re) => {
    const m = html.match(re);
    return m ? m[1].replace(/&amp;/g, '&').replace(/\\u002F/g, '/').replace(/\\\//g, '/') : null;
  };
  const ogTitle = get(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  const ogImage = get(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  const ogDesc = get(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
  const durationMatch = html.match(/"playable_duration_in_seconds"|"length":\s*"?\d+"?|"duration":\s*"?(\d+)"?/);
  return {
    title: ogTitle,
    thumbnail: ogImage,
    description: ogDesc,
    duration: durationMatch ? Number(durationMatch[1]) : null
  };
}

export async function extract(url) {
  let { finalUrl, status, html } = await resolveCanonical(url);

  // Facebook sometimes serves a login/consent interstitial to datacenter IPs.
  // Try the m.facebook.com host explicitly, which tends to return the mobile
  // HTML with embedded video data more often than www.
  if (status !== 200 || /<form[^>]+login|<title[^>]*Log (in|into)/i.test(html)) {
    try {
      const alt = new URL(finalUrl || url);
      alt.hostname = alt.hostname.replace(/^www\./, 'm.');
      const r2 = await fetched(alt.toString(), { redirect: 'follow', headers: fbHeaders() }, 'facebook');
      const h2 = await r2.text();
      if (r2.status === 200 && h2.length > html.length) { html = h2; finalUrl = r2.url; status = r2.status; }
    } catch { /* keep original */ }
  }

  const urls = findPlayableUrls(html);
  const meta = findMeta(html);

  if (!urls.length) {
    const blocked = status === 400 || /Error Facebook|Bad Request/i.test(html);
    const gated = blocked || /login|<title[^>]*Log into|checkpoint|require_login/i.test(html);
    throw Object.assign(
      new Error(
        gated
          ? 'Facebook blocks requests from server/datacenter IPs (returns HTTP 400). To extract Facebook media you must set a FB_COOKIE env var with a logged-in browser cookie. See README.'
          : 'Facebook returned no direct video URL. The post may be private, a non-video post, or removed.'
      ),
      { code: 'NO_FORMATS' }
    );
  }

  const medias = [];
  const seen = new Set();
  // Prefer HD, then SD, then any other mp4.
  const ordered = urls.sort((a, b) => {
    const score = (u) => /_720|_1080|hd|720p|1080p/i.test(u) ? 0 : /_480|_360|sd/i.test(u) ? 1 : 2;
    return score(a) - score(b);
  });
  for (const u of ordered) {
    if (seen.has(u)) continue;
    seen.add(u);
    const hd = /_720|_1080|hd|720p|1080p/i.test(u);
    medias.push({
      formatId: hd ? 'hd' : 'sd',
      label: `mp4 · ${hd ? 'HD' : 'SD'}`,
      type: 'video',
      ext: 'mp4',
      quality: `mp4 (${hd ? 'HD' : 'SD'})`,
      url: u
    });
  }

  return {
    title: meta.title || meta.description?.slice(0, 80) || null,
    thumbnail: meta.thumbnail || null,
    duration: meta.duration || null,
    author: null,
    views: null,
    platform: 'Facebook',
    medias
  };
}
