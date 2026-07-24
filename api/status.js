// api/status.js
// GET /api/status — reports which platforms have a proxy and/or cookie
// configured via env vars. Lets you verify your setup without running a full
// extraction. Does NOT echo secret values.
import { hasProxy } from '../utils/fetcher.js';
import { IMPLEMENTED, SUPPORTED } from '../utils/platforms.js';
import { send } from '../utils/response.js';

const COOKIES = {
  youtube: 'YT_COOKIE',
  facebook: 'FB_COOKIE',
  instagram: 'IG_COOKIE',
  tiktok: null,
  twitter: null
};

export default async function handler(req, res) {
  const platforms = SUPPORTED.map((id) => ({
    id,
    implemented: IMPLEMENTED.includes(id),
    proxy: hasProxy(id),
    cookie: COOKIES[id] ? Boolean(process.env[COOKIES[id]]) : null,
    cookieEnvName: COOKIES[id] || null
  }));
  const payload = {
    status: 'success',
    data: {
      defaultProxy: Boolean(process.env.PROXY_URL),
      kvCache: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
      platforms
    }
  };
  return send(res, payload, 200);
}
