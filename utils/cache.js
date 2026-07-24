// utils/cache.js
// Result cache so each URL is extracted once, then served from cache (mirrors
// R-Gen behavior). Two tiers:
//   1) Module-level in-memory Map — fast, but per serverless instance (cold
//      starts reset it; fine since Vercel reuses warm instances for a window).
//   2) Optional Vercel KV (@vercel/kv) if KV_REST_API_URL + KV_REST_API_TOKEN
//      env vars are set — persists across instances/deploys. Set these in
//      Vercel project env to get durable cross-instance caching.
//
// YouTube URLs expire ~6h, so we TTL at 5h. Other platforms' direct URLs are
// generally long-lived, but we still refresh to avoid stale/moved content.

const TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

const mem = new Map();

let kv = null;
function getKv() {
  if (kv !== null) return kv;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    // Lazy import so projects without KV don't fail the build.
    try {
      kv = import('@vercel/kv').then((m) => m.kv).catch(() => null);
    } catch { kv = null; }
  } else {
    kv = null;
  }
  return kv;
}

// Stable cache key: platform + normalized URL.
function keyOf(platform, url) {
  return 'dl:' + platform + ':' + String(url).trim();
}

export async function getCache(platform, url) {
  const k = keyOf(platform, url);
  // 1. memory
  const m = mem.get(k);
  if (m && Date.now() - m.t < TTL_MS) {
    return { ...m.v, _cache: 'HIT' };
  }
  // 2. KV
  const kvPromise = getKv();
  if (kvPromise) {
    try {
      const client = await kvPromise;
      if (client) {
        const raw = await client.get(k);
        if (raw) {
          const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
          // repopulate memory
          mem.set(k, { t: Date.now(), v });
          return { ...v, _cache: 'HIT' };
        }
      }
    } catch { /* KV optional */ }
  }
  return null;
}

export async function setCache(platform, url, value) {
  const k = keyOf(platform, url);
  mem.set(k, { t: Date.now(), v: value });
  const kvPromise = getKv();
  if (kvPromise) {
    try {
      const client = await kvPromise;
      if (client) await client.set(k, JSON.stringify(value), { ex: Math.floor(TTL_MS / 1000) });
    } catch { /* KV optional */ }
  }
}
