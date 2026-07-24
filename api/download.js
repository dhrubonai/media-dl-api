// api/download.js
// Main entry — GET /api/download?url=...
// Detects platform from URL, routes to the right extractor, returns unified JSON.
import { detectPlatform, isImplemented, SUPPORTED } from '../utils/platforms.js';
import { ok, fail, withTimeout, send } from '../utils/response.js';

const extractors = {
  youtube: () => import('../extractors/youtube.js').then((m) => m.extract),
  tiktok: () => import('../extractors/tiktok.js').then((m) => m.extract)
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, { status: 'ok' }, 204);

  const start = Date.now();
  const url = (req.query && req.query.url) || (req.body && req.body.url);

  if (!url) {
    return send(res, fail('MISSING_URL', 'Required query parameter "url" is missing.'), 400);
  }

  const platform = detectPlatform(url);

  if (platform === 'unknown') {
    return send(res, fail('UNSUPPORTED_URL', `Could not detect platform from URL. Supported: ${SUPPORTED.join(', ')}`, { meta: { platform } }), 400);
  }

  if (!isImplemented(platform)) {
    return send(res, fail('NOT_YET_IMPLEMENTED', `${platform} support is detected but the extractor is not built yet. Currently working: YouTube, TikTok.`, { meta: { platform } }), 501);
  }

  try {
    const extract = await extractors[platform]();
    const data = await withTimeout(extract(url), 8500);
    const payload = ok(data, {
      platform,
      executionTimeMs: Date.now() - start,
      request: { original_url: url }
    });
    return send(res, payload, 200);
  } catch (e) {
    return send(res, fail(e.code || 'EXTRACTION_ERROR', e.message || 'Extraction failed', {
      meta: { platform, execution_time_ms: Date.now() - start }
    }), e.code === 'BAD_URL' ? 400 : 502);
  }
}
