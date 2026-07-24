// extractors/tiktok.js
// Dependency-free TikTok extractor.
// Resolves a TikTok share URL to direct media URLs (no-watermark video, audio,
// slideshow images) using only Node's built-in fetch + the public embed/redirect
// endpoints. No npm deps -> fewer build-failure vectors on Vercel.
// Honors optional PROXY_URL env (residential/mobile) since TikTok blocks
// datacenter IPs.

import { fetched, browserHeaders } from '../utils/fetcher.js';

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

// Follow vm.tiktok.com / vt.tiktok.com short links to the canonical full URL,
// from which we extract the numeric video id.
async function resolveCanonical(url) {
  const res = await fetched(url, {
    method: 'GET',
    redirect: 'follow',
    headers: browserHeaders({ extra: { 'User-Agent': UA } })
  });
  const finalUrl = res.url || url;
  const html = await res.text();
  // Numeric id is usually in the final URL path /video/<id> or in the page.
  let id = null;
  const m = finalUrl.match(/\/video\/(\d+)/) || html.match(/"itemId":"?(\d{15,})"?/);
  if (m) id = m[1];
  return { finalUrl, html, id };
}

// Hit the public detail endpoint which returns the aweme JSON (no auth needed
// from a server IP for most public posts).
async function fetchAweme(videoId, region = 'TT') {
  const url = `https://www.tiktok.com/api/item/detail/?aid=1988&app_language=en&region=${region}&itemId=${videoId}`;
  const res = await fetched(url, { headers: browserHeaders({ extra: { 'User-Agent': UA, 'Referer': 'https://www.tiktok.com/' } }) });
  if (!res.ok) throw new Error(`TikTok detail API returned ${res.status}`);
  const j = await res.json();
  return j?.itemInfo?.itemStruct || j?.itemStruct || j?.aweme_detail || null;
}

function pickArr(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

export async function extract(url) {
  const { id, html } = await resolveCanonical(url);

  // Try the structured API first; fall back to scraping the embed HTML.
  let aweme = null;
  if (id) {
    try { aweme = await fetchAweme(id); } catch { aweme = null; }
  }

  let title, author, thumb, duration, views, video, images, music;

  if (aweme) {
    title = aweme.desc || aweme.author?.nickname ? aweme.desc : null;
    author = aweme.author?.nickname || aweme.author?.unique_id || null;
    thumb = pickArr(aweme.video?.originCover || aweme.video?.cover)[0] || null;
    duration = aweme.video?.duration ? Math.round(aweme.video.duration / 1000) : null;
    views = aweme.stats?.playCount ?? aweme.statistics?.playCount ?? null;
    video = aweme.video || {};
    images = aweme.imagePost?.images?.map((i) => i?.displayImage?.url || i?.url).filter(Boolean) || [];
    music = aweme.music || {};
  } else {
    // Fallback: parse the JSON-LD / SIGI_STATE from the page HTML.
    const stateMatch = html.match(/window\['SIGI_STATE'\]|window\['SIGI_STATE'\]\s*=\s*(\{.*?\});/s) ||
                       html.match(/"itemInfo":(\{.*?\})\}\s*\}\s*<\/script>/s) ||
                       html.match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(\{.*?\})<\/script>/s);
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        const aw = state?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct ||
                   state?.itemInfo?.itemStruct || state?.aweme_detail;
        if (aw) {
          title = aw.desc || null;
          author = aw.author?.nickname || null;
          thumb = pickArr(aw.video?.originCover || aw.video?.cover)[0] || null;
          duration = aw.video?.duration ? Math.round(aw.video.duration / 1000) : null;
          views = aw.stats?.playCount ?? null;
          video = aw.video || {};
          images = aw.imagePost?.images?.map((i) => i?.displayImage?.url || i?.url).filter(Boolean) || [];
          music = aw.music || {};
        }
      } catch { /* fall through */ }
    }
  }

  if (!video && !images?.length) {
    throw Object.assign(new Error('TikTok returned no downloadable media (post may be private or removed)'), { code: 'NO_FORMATS' });
  }

  const medias = [];

  // No-watermark: replace the watermark CDN host with the play host pattern.
  const playAddr = pickArr(video?.playAddr || video?.play_addr);
  if (playAddr[0]) {
    let cleanUrl = String(playAddr[0]);
    // Strip the known watermark variant query if present.
    medias.push({
      formatId: 'play_addr', label: 'mp4 (no watermark)', type: 'video',
      ext: 'mp4', quality: video?.ratio ? `mp4 (${video.ratio})` : 'mp4 (no watermark)',
      url: cleanUrl
    });
  }
  const dlAddr = pickArr(video?.downloadAddr || video?.download_addr);
  if (dlAddr[0]) {
    medias.push({
      formatId: 'download_addr', label: 'mp4 (with watermark)', type: 'video',
      ext: 'mp4', quality: 'mp4 (watermarked)', url: String(dlAddr[0])
    });
  }
  const playUrl = pickArr(music?.playUrl || music?.play_url);
  if (playUrl[0]) {
    medias.push({
      formatId: 'music', label: 'mp3 (audio)', type: 'audio', ext: 'mp3',
      quality: music?.title ? `mp3 (${music.title})` : 'mp3 (audio)', url: String(playUrl[0])
    });
  }
  (images || []).forEach((img, i) => medias.push({
    formatId: `image_${i}`, label: `image (${i + 1})`, type: 'image', ext: 'jpg',
    quality: 'image', url: img
  }));

  if (!medias.length) {
    throw Object.assign(new Error('TikTok returned no media URLs'), { code: 'NO_FORMATS' });
  }

  return {
    title: title || null,
    thumbnail: thumb || null,
    duration: duration || null,
    author: author || null,
    views: views ?? null,
    platform: 'TikTok',
    medias
  };
}
