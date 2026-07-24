// utils/platforms.js
// URL → platform detection. Domain-based and permissive: if a URL is on a
// platform's domain, we treat it as that platform (then the extractor decides
// whether the specific page type is supported). This avoids the previous bug
// where common URL shapes (e.g. facebook.com/watch?v=) fell through to unknown.

const PLATFORMS = [
  { id: 'youtube',     domains: ['youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'] },
  { id: 'tiktok',      domains: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'] },
  { id: 'instagram',   domains: ['instagram.com', 'instagr.am'] },
  { id: 'facebook',    domains: ['facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.watch', 'fb.com', 'free.facebook.com'] },
  { id: 'twitter',     domains: ['twitter.com', 'x.com', 't.co', 'mobile.twitter.com'] },
  { id: 'soundcloud',  domains: ['soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'] },
  { id: 'vimeo',       domains: ['vimeo.com', 'player.vimeo.com'] },
  { id: 'dailymotion', domains: ['dailymotion.com', 'dai.ly'] },
  { id: 'pinterest',   domains: ['pinterest.com', 'pin.it', 'pinterest.co.uk'] },
  { id: 'reddit',      domains: ['reddit.com', 'redd.it', 'v.redd.it'] },
  { id: 'twitch',      domains: ['twitch.tv', 'clips.twitch.tv'] },
  { id: 'bilibili',    domains: ['bilibili.com', 'b23.tv', 'bilibili.tv'] }
];

// Normalize a URL for host comparison (strip subdomain noise, lowercase).
function hostOf(input) {
  try {
    let u = String(input).trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function detectPlatform(url) {
  if (!url) return null;
  const host = hostOf(url);
  if (!host) return 'unknown';
  for (const p of PLATFORMS) {
    for (const d of p.domains) {
      const dd = d.toLowerCase().replace(/^www\./, '');
      if (host === dd || host.endsWith('.' + dd)) return p.id;
    }
  }
  return 'unknown';
}

export const SUPPORTED = PLATFORMS.map((p) => p.id);

// Platforms with a working extractor implemented today.
export const IMPLEMENTED = ['youtube', 'tiktok', 'facebook'];

export function isImplemented(platform) {
  return IMPLEMENTED.includes(platform);
}
