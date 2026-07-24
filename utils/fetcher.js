// utils/fetcher.js
// Shared fetch wrapper used by all extractors. Honors an optional PROXY_URL
// env var (format: http://user:pass@host:port or https://host:port) so that
// platforms which block datacenter IPs (Facebook, Instagram, TikTok) can be
// routed through a residential/mobile proxy. Node's global fetch has no native
// proxy support, so we use undici's ProxyAgent when a proxy is configured.

let _dispatcher = undefined;
async function getDispatcher() {
  if (_dispatcher !== undefined) return _dispatcher;
  const proxy = process.env.PROXY_URL;
  if (!proxy) { _dispatcher = null; return null; }
  try {
    const { ProxyAgent } = await import('undici');
    _dispatcher = new ProxyAgent(proxy);
  } catch {
    _dispatcher = null; // undici always available in Node 20
  }
  return _dispatcher;
}

export async function fetched(url, opts = {}) {
  const dispatcher = await getDispatcher();
  const init = { ...opts };
  if (dispatcher) init.dispatcher = dispatcher;
  return fetch(url, init);
}

// Build standard browser-like headers, with optional per-platform cookie.
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
