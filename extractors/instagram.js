// extractors/instagram.js
// Instagram extractor for reels/posts. Resolves direct CDN MP4 URLs + thumbnail.
// Instagram gates media behind a login wall for unauthenticated datacenter IPs,
// so an IG_COOKIE env var (a logged-in browser session cookie, minimally the
// `sessionid` cookie) is required for reliable extraction. With a proxy
// (PROXY_URL) and no cookie, we still attempt the public embed/oEmbed path.

import { fetched, browserHeaders } from '../utils/fetcher.js';

function cookie() { return process.env.IG_COOKIE || process.env.INSTAGRAM_COOKIE || ''; }

// Resolve share URLs (instagr.am, /share/...) to canonical instagram.com URLs.
async function resolveCanonical(url) {
  const res = await fetched(url, { method: 'GET', redirect: 'follow', headers: browserHeaders({ cookie: cookie() }) });
  return { finalUrl: res.url || url, status: res.status, html: await res.text() };
}

// Pull media URLs out of the embedded JSON in the page HTML.
function findMedia(html) {
  const medias = [];
  const seen = new Set();
  const push = (u, type, ext) => {
    if (!u || !/^https?:\/\//.test(u) || seen.has(u)) return;
    seen.add(u); medias.push({ u, type, ext });
  };

  // Video CDN URLs (various keys across IG page versions).
  const videoRe = /"(?:video_url|video_versions|playable_url|dash_url|video_dash_manifest)"\s*:\s*"?([^",}\s]+)"?/g;
  let m;
  while ((m = videoRe.exec(html)) !== null) push(m[1].replace(/\\\//g, '/'), 'video', 'mp4');

  // Direct .mp4 anywhere.
  const bareRe = /https?:\\?\/\\?\/[^\s"'<>]+?\.mp4[^\s"'<>?]*/g;
  while ((m = bareRe.exec(html)) !== null) push(m[0].replace(/\\\//g, '/'), 'video', 'mp4');

  // Images (display_url / src for image posts).
  const imgRe = /"(?:display_url|image_url|thumbnail_src)"\s*:\s*"([^"]+)"/g;
  while ((m = imgRe.exec(html)) !== null) push(m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/'), 'image', 'jpg');

  return medias;
}

function findMeta(html) {
  const get = (re) => { const m = html.match(re); return m ? m[1].replace(/&amp;/g, '&') : null; };
  return {
    title: get(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i),
    thumbnail: get(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i),
    description: get(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)
  };
}

export async function extract(url) {
  const { finalUrl, status, html } = await resolveCanonical(url);
  const found = findMedia(html);
  const meta = findMeta(html);

  if (!found.length) {
    const needsLogin = /login_required|"loginRequired"|<title[^>]*Log (in|into)/i.test(html) || status === 302;
    throw Object.assign(
      new Error(needsLogin
        ? 'Instagram returned a login wall. Set IG_COOKIE env var with a logged-in sessionid cookie to extract media.'
        : 'Instagram returned no media. The post may be private, a non-video post, or removed.'),
      { code: 'NO_FORMATS' }
    );
  }

  const medias = found.map(({ u, type, ext }, i) => ({
    formatId: `${type}_${i}`,
    label: type === 'video' ? 'mp4 · video' : `image (${i + 1})`,
    type,
    ext,
    quality: type === 'video' ? 'mp4 (HD)' : 'image',
    url: u
  }));

  return {
    title: meta.title || meta.description?.slice(0, 100) || null,
    thumbnail: meta.thumbnail || (medias.find((m) => m.type === 'image') || {}).url || null,
    duration: null,
    author: null,
    views: null,
    platform: 'Instagram',
    medias
  };
}
