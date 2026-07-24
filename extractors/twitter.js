// extractors/twitter.js
// Twitter / X extractor. Resolves direct MP4/m4a URLs for a tweet's media.
// Strategy: hit the public syndication endpoint (cdn.syndication.twitter.com)
// which returns tweet media JSON without authentication for most public tweets,
// then fall back to parsing the oEmbed/og metadata.

import { fetched, browserHeaders } from '../utils/fetcher.js';

function tweetId(url) {
  const m = String(url).match(/\/status(?:es)?\/(\d+)/) || String(url).match(/\/(\d{15,})/);
  return m ? m[1] : null;
}

export async function extract(url) {
  const id = tweetId(url);
  if (!id) throw Object.assign(new Error('Could not parse a tweet ID from that URL'), { code: 'BAD_URL' });

  let medias = [];
  let meta = { title: null, thumbnail: null, author: null };

  // 1. Public syndication endpoint — no auth, returns media for public tweets.
  try {
    const res = await fetched(`https://cdn.syndication.twitter.com/tweet-result?id=${id}&token=0`, {
      headers: browserHeaders({ extra: { 'Accept': 'application/json' } })
    }, 'twitter');
    if (res.ok) {
      const j = await res.json();
      meta.author = j?.user?.name || j?.user?.screen_name || null;
      meta.title = j?.text || null;
      const vids = (j?.videos || (j?.media?.length ? j.media : [])).filter((x) => x && (x.type === 'video' || x.type === 'gif' || x.variants));
      for (const v of vids) {
        const variants = (v.variants || []).filter((x) => x?.src || x?.url).sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0));
        for (const va of variants) {
          const u = va.src || va.url;
          if (u) medias.push({
            formatId: `${v.id || 'tw'}_${va.bit_rate || 'a'}`,
            label: va.content_type?.includes('mp4') ? 'mp4 · video' : (va.content_type?.includes('audio') ? 'm4a · audio' : 'media'),
            type: va.content_type?.includes('audio') ? 'audio' : 'video',
            ext: va.content_type?.includes('mp4') ? 'mp4' : 'm4a',
            quality: va.bit_rate ? `mp4 (${Math.round(va.bit_rate / 1000)}kbps)` : 'mp4',
            url: u
          });
        }
        if (!medias.length && v.thumbnail_url) meta.thumbnail = v.thumbnail_url;
      }
      if (!meta.thumbnail && j?.user?.profile_image_url_https) meta.thumbnail = j.user.profile_image_url_https.replace(/_normal\./, '.');
    }
  } catch { /* fall through */ }

  // 2. Fallback: oEmbed + og:image from the tweet page.
  if (!medias.length) {
    try {
      const res = await fetched(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`, {
        headers: browserHeaders({ extra: { 'Accept': 'application/json' } })
      }, 'twitter');
      if (res.ok) {
        const j = await res.json();
        const html = j?.html || '';
        const img = html.match(/https?:\/\/pbs\.twimg\.com\/[^\s"'<>]+\.(jpg|png)/i);
        if (img) meta.thumbnail = img[0];
        if (!meta.title) meta.title = (j?.author_name || 'X') + ' on X';
      }
    } catch { /* ignore */ }
  }

  if (!medias.length) {
    throw Object.assign(
      new Error('Twitter returned no media. The tweet may have no video, be private/deleted, or be gated.'),
      { code: 'NO_FORMATS' }
    );
  }

  // Dedupe + sort video by bitrate desc, audio after.
  const seen = new Set(); const dedup = [];
  for (const m of medias) { if (!seen.has(m.url)) { seen.add(m.url); dedup.push(m); } }
  dedup.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'video' ? -1 : 1;
    return (parseInt(b.quality.replace(/\D/g, '') || 0) - parseInt(a.quality.replace(/\D/g, '') || 0));
  });

  return {
    title: meta.title || null,
    thumbnail: meta.thumbnail || null,
    duration: null,
    author: meta.author || null,
    views: null,
    platform: 'Twitter',
    medias: dedup
  };
}
