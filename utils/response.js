// utils/response.js
// Unified JSON response envelope (JSend-inspired, mirrors R-Gen shape).
// All extractors return via these helpers so the frontend has one shape to parse.

export function ok(data, meta = {}) {
  return {
    status: 'success',
    code: 'SUCCESS_FETCHED',
    meta: {
      version: 'v1.0.0',
      execution_time_ms: meta.executionTimeMs ?? null,
      cache_status: meta.cacheStatus ?? 'MISS',
      platform: meta.platform ?? 'unknown',
      ...meta
    },
    request: meta.request ?? null,
    data
  };
}

export function fail(code, message, extra = {}) {
  return {
    status: 'error',
    code,
    meta: {
      version: 'v1.0.0',
      ...extra.meta
    },
    error: { message, ...extra }
  };
}

// Wrap an async extractor with a hard timeout so we never exceed Vercel's limit.
// Default 8500ms leaves headroom under Vercel Hobby's 10s cap.
export function withTimeout(promise, ms = 8500) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Extraction timed out'), { code: 'TIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Normalise a media format row so the frontend can render any platform identically.
export function formatMedia(m) {
  return {
    formatId: m.formatId ?? m.itag ?? m.id ?? null,
    label: m.label ?? m.quality ?? `${m.type ?? 'media'}`,
    type: m.type ?? (m.height ? 'video' : 'audio'),
    ext: m.ext ?? m.extension ?? null,
    quality: m.quality ?? m.label ?? null,
    width: m.width ?? null,
    height: m.height ?? null,
    bitrate: m.bitrate ?? null,
    fps: m.fps ?? null,
    mimeType: m.mimeType ?? m.mime_type ?? null,
    hasAudio: m.hasAudio ?? m.has_audio ?? null,
    size: m.size ?? null,
    url: m.url
  };
}

export function send(res, payload, status = 200) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}
