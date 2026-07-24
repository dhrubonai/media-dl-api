// utils/platforms.js
// URL detection — figures out which extractor to route a URL to.
// Add new platforms here as extractors are built.

const PLATFORMS = [
  { id: 'youtube',   match: [/youtube\.com\/watch/i, /youtu\.be\//i, /youtube\.com\/shorts\//i, /youtube\.com\/embed\//i, /m\.youtube\.com/i] },
  { id: 'tiktok',    match: [/tiktok\.com/i, /vm\.tiktok\.com/i, /vt\.tiktok\.com/i] },
  { id: 'instagram', match: [/instagram\.com\/(reel|p|tv|reels)\//i] },
  { id: 'facebook',  match: [/facebook\.com\/.*\/videos\//i, /fb\.watch/i, /fb\.com\/reel/i] },
  { id: 'twitter',   match: [/twitter\.com\/.*\/status\//i, /x\.com\/.*\/status\//i, /t\.co\//i] },
  { id: 'soundcloud', match: [/soundcloud\.com\//i] },
  { id: 'vimeo',     match: [/vimeo\.com\//i] },
  { id: 'dailymotion', match: [/dailymotion\.com/i, /dai\.ly\//i] },
  { id: 'pinterest', match: [/pinterest\.com\/pin\//i, /pin\.it\//i] },
  { id: 'reddit',    match: [/reddit\.com\/r\/.*\/comments\//i, /redd\.it\//i] },
  { id: 'twitch',    match: [/twitch\.tv\/.*\/clip\//i, /clips\.twitch\.tv/i] },
  { id: 'bilibili',  match: [/bilibili\.com\/video\//i, /b23\.tv\//i] }
];

export function detectPlatform(url) {
  if (!url) return null;
  const u = String(url).trim();
  for (const p of PLATFORMS) {
    if (p.match.some((re) => re.test(u))) return p.id;
  }
  return 'unknown';
}

export const SUPPORTED = PLATFORMS.map((p) => p.id);

// Which platforms have a working extractor implemented today.
export const IMPLEMENTED = ['youtube', 'tiktok'];

export function isImplemented(platform) {
  return IMPLEMENTED.includes(platform);
}
