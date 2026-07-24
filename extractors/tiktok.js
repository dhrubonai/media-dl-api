// extractors/tiktok.js
// TikTok extractor — resolves direct MP4 URLs (with and without watermark)
// plus audio/music URL. Uses @tobyg74/tiktok-api-dl which has v1/v2/v3 fallbacks.

import Tiktok from '@tobyg74/tiktok-api-dl';

export async function extract(url) {
  // Try v1 first (most reliable for direct URLs), fall back through versions.
  const versions = ['v1', 'v2', 'v3'];
  let lastErr;
  let result;

  for (const version of versions) {
    try {
      result = await Tiktok.Downloader(url, { version, showOriginalResponse: false });
      if (result && (result.status === 'success' || result.result)) break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!result || (result.status && result.status !== 'success' && !result.result)) {
    throw Object.assign(new Error(`TikTok extraction failed: ${lastErr?.message || 'no result'}`), { code: 'TIKTOK_FAIL' });
  }

  const r = result.result || result;
  const medias = [];
  const v = r.video || {};
  const covers = r.cover || r.originCover || [];
  const thumb = Array.isArray(covers) ? covers[0] : covers;

  // No-watermark play address (preferred).
  const playAddr = v.playAddr || v.play_addr;
  if (Array.isArray(playAddr) && playAddr[0]) {
    medias.push({
      formatId: 'play_addr',
      label: 'mp4 (no watermark)',
      type: 'video',
      ext: 'mp4',
      quality: v.ratio ? `mp4 (${v.ratio})` : 'mp4 (no watermark)',
      url: playAddr[0]
    });
  }
  // Watermarked download address (fallback).
  const dlAddr = v.downloadAddr || v.download_addr;
  if (Array.isArray(dlAddr) && dlAddr[0]) {
    medias.push({
      formatId: 'download_addr',
      label: 'mp4 (with watermark)',
      type: 'video',
      ext: 'mp4',
      quality: 'mp4 (watermarked)',
      url: dlAddr[0]
    });
  }
  // Audio / music.
  const music = r.music || {};
  const playUrl = music.playUrl || music.play_url;
  if (Array.isArray(playUrl) && playUrl[0]) {
    medias.push({
      formatId: 'music',
      label: 'mp3 (audio)',
      type: 'audio',
      ext: 'mp3',
      quality: music.title ? `mp3 (${music.title})` : 'mp3 (audio)',
      url: playUrl[0]
    });
  }
  // Image / slideshow posts.
  if (Array.isArray(r.images) && r.images.length) {
    r.images.forEach((img, i) => medias.push({
      formatId: `image_${i}`,
      label: `image (${i + 1})`,
      type: 'image',
      ext: 'jpg',
      quality: 'image',
      url: img
    }));
  }

  if (!medias.length) {
    throw Object.assign(new Error('TikTok returned no media URLs'), { code: 'NO_FORMATS' });
  }

  return {
    title: r.desc || r.title || null,
    thumbnail: thumb || null,
    duration: v.duration ? Math.round(v.duration / 1000) : null,
    author: r.author?.nickname || r.author?.unique_id || null,
    views: r.statistics?.playCount ?? null,
    platform: 'TikTok',
    medias
  };
}
