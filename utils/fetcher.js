// utils/fetcher.js
// Shared fetch wrapper + proxy support used by all extractors.
//
// Proxy configuration (set any in Vercel project env):
//   PROXY_URL          — default proxy for ALL platforms
//   YT_PROXY_URL       — proxy for YouTube only (overrides PROXY_URL)
//   FB_PROXY_URL       — proxy for Facebook only
//   IG_PROXY_URL       — proxy for Instagram only
//   TT_PROXY_URL       — proxy for TikTok only
//   TW_PROXY_URL       — proxy for Twitter/X only
//
// Format: http://user:pass@host:port  (or https://..., or socks5://... via undici)
// Residential/mobile proxies from Bright Data, Smartproxy, Soax, IPRoyal, etc.
// all produce a URL in this form. Without a proxy, requests go direct (and
// Facebook/Instagram/TikTok/YouTube will throttle datacenter IPs).

// undici ProxyAgent is cached per proxy URL.
const _agents = new Map();

async function agentFor(proxyUrl) {
  if (!proxyUrl) return null;
  if (_agents.has(proxyUrl)) return _agents.get(proxyUrl);
  let agent = null;
  try {
    const undici = await import('undici');
    const Agent = undici.ProxyAgent || undici.default?.ProxyAgent;
    if (Agent) agent = new Agent({ uri: proxyUrl.startsWith('http') ? proxyUrl : 'http://' + proxyUrl });
  } catch { agent = null; }
  _agents.set(proxyUrl, agent);
  return agent;
}

// Resolve which proxy URL applies to a given platform key.
function proxyFor(platform) {
  const key = ({ youtube: 'YT', facebook: 'FB', instagram: 'IG', tiktok: 'TT', twitter: 'TW' })[platform] || '';
  return process.env[`${key}_PROXY_URL`] || process.env.PROXY_URL || '';
}

// A fetch bound to a platform's proxy. `platform` may be passed as the 3rd arg
// or as opts.platform. Used by every extractor except YouTube (which takes a
// custom fetch into Innertube — see youtube.js).
export async function fetched(url, opts = {}, platform = '') {
  const plat = platform || opts.platform || '';
  if (opts.platform) { const { platform: _p, ...rest } = opts; opts = rest; }
  const proxy = proxyFor(plat);
  const dispatcher = await agentFor(proxy);
  const init = { ...opts };
  if (dispatcher) init.dispatcher = dispatcher;
  return fetch(url, init);
}

// Build a custom fetch function (for passing into libraries like youtubei.js
// that accept a fetch option) bound to a platform's proxy.
export async function makeFetch(platform = '') {
  const proxy = proxyFor(platform);
  const dispatcher = await agentFor(proxy);
  if (!dispatcher) return globalThis.fetch;
  return (input, init = {}) => fetch(input, { ...init, dispatcher });
}

// True if a proxy is configured for the given platform (for status reporting).
export function hasProxy(platform = '') {
  return Boolean(proxyFor(platform));
}

export function browserHeaders(opts = {}) {
  const h = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    ...opts.extra
  };
  if (opts.cookie) h['Cookie'] = opts.cookie;
  return h;
}
