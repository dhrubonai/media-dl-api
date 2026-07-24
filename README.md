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

## Honest limitations

- **YouTube signatures break periodically.** YouTube rotates its player JS every few weeks; `youtubei.js` gets patched by maintainers within days. When extraction fails, run `npm update youtubei.js` and redeploy. This is inherent to *any* non-yt-dlp approach — the original R-Gen project has the same fragility.
- **Extracted YouTube URLs expire (~6h) and are IP-locked.** They must be consumed by the requester promptly; they cannot be cached and shared later.
- **10s timeout.** Hobby tier caps each function at 10s. Extraction normally completes in 2–4s; very slow origins may time out.
- **Not 1000+ sites.** yt-dlp-level breadth requires a persistent Python backend. This is the Vercel-native equivalent covering the most-used platforms.

## Legal

Only download content you own, that is Creative Commons / public domain, or that qualifies as fair use in your jurisdiction. Downloading copyrighted material may violate platform Terms of Service and copyright law. You are responsible for your use of this software.

## License

MIT
