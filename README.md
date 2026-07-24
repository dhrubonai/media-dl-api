# MediaDL — Multi-Platform Media URL Extractor API

Extract direct download links from YouTube, TikTok (and more coming) — returns JSON with every available format. Runs entirely on **Vercel serverless (Hobby tier, 10s limit)**. No server-side file downloading or conversion; the browser pulls directly from the source CDN.

Same technique used by [R-Gen APIs](https://r-gengpt-api.vercel.app/) — built here as a fresh, independent project.

## How it works

```
Browser → POST /api/download?url=... → Vercel serverless function
   → detect platform from URL
   → run extractor (youtubei.js for YouTube, tiktok-api-dl for TikTok)
   → resolve direct CDN URLs (decipher YouTube signatures client-by-client)
   → return JSON { title, thumbnail, medias: [{label, url, ...}] }
Browser → downloads the chosen format directly from googlevideo.com / tiktok CDN
```

## Endpoints

### `GET /api/download?url=<video_url>`

```bash
curl "https://YOUR-DOMAIN/api/download?url=https://youtube.com/watch?v=dQw4w9WgXcQ"
```

**Response (200):**
```json
{
  "status": "success",
  "code": "SUCCESS_FETCHED",
  "meta": { "platform": "YouTube", "execution_time_ms": 2931 },
  "data": {
    "title": "Video title",
    "thumbnail": "https://...",
    "duration": 213,
    "platform": "YouTube",
    "medias": [
      { "formatId": 137, "label": "mp4 (1080p)", "type": "video", "ext": "mp4", "url": "https://..." },
      { "formatId": 140, "label": "m4a (131kb/s)", "type": "audio", "url": "https://..." }
    ]
  }
}
```

**Errors:** `400 MISSING_URL` · `400 UNSUPPORTED_URL` · `400 BAD_URL` · `501 NOT_YET_IMPLEMENTED` · `502 EXTRACTION_ERROR` · `502 TIMEOUT`

## Supported platforms

| Platform | Status | Engine |
|----------|--------|--------|
| YouTube | ✅ Live | [`youtubei.js`](https://github.com/LuanRT/YouTube.js) (InnerTube) |
| TikTok | ✅ Live | built-in (zero-dep, public detail API + HTML fallback) |
| Facebook | ⚠️ Beta | built-in (mobile HTML parse; needs `FB_COOKIE` for gated posts) |
| Instagram, Facebook, Twitter/X, Reddit, SoundCloud, Vimeo, Pinterest, Twitch, Bilibili | 🔜 Detected, extractor TODO | — |

## Project structure

```
media-dl-api/
├── api/
│   └── download.js          # main router: detect platform → dispatch
├── extractors/
│   ├── youtube.js           # youtubei.js, player_id fallback, multi-client
│   └── tiktok.js            # v1/v2/v3 fallback
├── utils/
│   ├── platforms.js         # URL → platform detection
│   └── response.js          # unified JSON envelope + timeout guard
├── index.html               # frontend UI (self-contained)
├── vercel.json              # 10s maxDuration, 512MB
└── package.json             # node 20.x, ESM
```

## Develop locally

```bash
npm install
npm i -g vercel
vercel dev   # serves index.html + /api/* on localhost:3000
```

## Deploy

This repo is wired for Vercel. Import it on Vercel (or deploy via the Vercel API) — no extra config needed; `vercel.json` sets the Node 20 runtime, 10s timeout, and 512MB memory.

## Configuration (env vars)

Set these in **Vercel → your project → Settings → Environment Variables**. None are required for the site to run; they unlock extraction from platforms that block datacenter IPs.

### Proxy (recommended — fixes YouTube, Facebook, Instagram, TikTok at once)

A residential/mobile proxy makes every request come from a home/mobile IP instead of Vercel's datacenter IP, which is what triggers YouTube's "Sign in to confirm you're not a bot" and Facebook's HTTP 400.

| Var | Scope | Example |
|-----|-------|---------|
| `PROXY_URL` | all platforms | `http://user:pass@p.brightdata.com:22225` |
| `YT_PROXY_URL` | YouTube only (overrides `PROXY_URL`) | `http://user:pass@host:port` |
| `FB_PROXY_URL` | Facebook only | `http://user:pass@host:port` |
| `IG_PROXY_URL` | Instagram only | `http://user:pass@host:port` |
| `TT_PROXY_URL` | TikTok only | `http://user:pass@host:port` |
| `TW_PROXY_URL` | Twitter/X only | `http://user:pass@host:port` |

Residential proxy providers that work: **Bright Data**, **Smartproxy**, **Soax**, **IPRoyal**, **Oxylabs**. After signing up, each gives you an endpoint URL in `http://user:pass@host:port` form — paste it into the env var. Per-platform vars let you use a different proxy (or region) per site.

### Cookies (alternative to proxy for FB / IG / YouTube)

| Var | Purpose |
|-----|---------|
| `YT_COOKIE` | Logged-in YouTube browser cookie (or use `YT_PROXY_URL`). Optional `YT_PO_TOKEN` for BotGuard. |
| `FB_COOKIE` | Logged-in Facebook browser cookie. |
| `IG_COOKIE` | Logged-in Instagram `sessionid` cookie. |

Copy cookie strings from your browser: DevTools → Network → click any request to the site → copy the `Cookie` request header value.

### Cache (optional, durable)

| Var | Purpose |
|-----|---------|
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Vercel KV credentials. Without these, caching is in-memory per instance (resets on cold starts). With them, cache persists across instances/deploys. |

### Verify your setup

`GET /api/status` returns which platforms have a proxy/cookie configured (no secret values exposed):

```bash
curl https://YOUR-DOMAIN/api/status
```

## Honest limitations

- **YouTube / Facebook / Instagram / TikTok block datacenter IPs.** Without a proxy or cookie, cold extractions from Vercel will be throttled (YouTube returns "Sign in to confirm you're not a bot"; Facebook returns HTTP 400). This is the platforms' anti-bot systems — the same wall yt-dlp users hit. A residential proxy (`PROXY_URL`) is the single fix that covers all of them.
- **Caching mitigates this.** Successful extractions are cached (~5h, matching YouTube URL expiry), so a video that extracts once keeps serving instantly without re-hitting the platform — exactly how R-Gen stays reliable.
- **YouTube signatures break periodically.** YouTube rotates its player JS every few weeks; `youtubei.js` gets patched by maintainers within days. When extraction fails, run `npm update youtubei.js` and redeploy.
- **Extracted YouTube URLs expire (~6h) and are IP-locked** to the proxy/direct IP that requested them. Consume them promptly.
- **10s timeout.** Hobby tier caps each function at 10s. Extraction normally completes in 2–4s; a slow proxy may push cold extracts close to the limit.
- **Twitter/X works without auth** (public syndication endpoint).
- **Not 1000+ sites.** yt-dlp-level breadth requires a persistent Python backend. This is the Vercel-native equivalent covering the most-used platforms.

## Legal

Only download content you own, that is Creative Commons / public domain, or that qualifies as fair use in your jurisdiction. Downloading copyrighted material may violate platform Terms of Service and copyright law. You are responsible for your use of this software.

## License

MIT
