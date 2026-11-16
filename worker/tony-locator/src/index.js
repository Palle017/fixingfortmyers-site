// Tony locator Worker. Stores only the latest point. No other project bindings.
const STORE_KEY = 'latest';
const ALLOWED_ORIGINS = new Set([
  'https://fixingfortmyers.com',
  'https://www.fixingfortmyers.com',
]);

export function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const headers = {
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return headers;
}

export function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const left = enc.encode(String(a ?? ''));
  const right = enc.encode(String(b ?? ''));
  const len = Math.max(left.length, right.length, 1);
  let diff = left.length === right.length ? 0 : 1;
  for (let i = 0; i < len; i += 1) {
    diff |= (left[i] || 0) ^ (right[i] || 0);
  }
  return diff === 0;
}

export function extractWriteKey(request, url) {
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.match(/^Bearer\s+(\S+)/i);
  if (bearer) return bearer[1];
  const queryKey = url.searchParams.get('key');
  return queryKey == null ? '' : queryKey;
}

export function isAuthorized(request, url, env) {
  const expected = env?.WRITE_KEY || '';
  const provided = extractWriteKey(request, url);
  if (!expected || !provided) {
    timingSafeEqual(provided || '0', expected || '1');
    return false;
  }
  return timingSafeEqual(provided, expected);
}

export function validatePoint(lat, lng, acc) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  let accuracy = acc == null || acc === '' ? null : Number(acc);
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0)) accuracy = null;
  return {lat: latitude, lng: longitude, acc: accuracy};
}

export function parseUpdate(body) {
  if (!body || typeof body !== 'object') return null;
  if (Array.isArray(body)) {
    for (let i = body.length - 1; i >= 0; i -= 1) {
      const point = parseUpdate(body[i]);
      if (point) return point;
    }
    return null;
  }
  const owntracks = body._type === 'location' || body._type === 'Location';
  if (owntracks) {
    const point = validatePoint(body.lat, body.lon ?? body.lng, body.acc);
    if (!point) return null;
    const tst = Number(body.tst);
    const updated = Number.isFinite(tst) ? (tst < 1e12 ? tst * 1000 : tst) : Date.now();
    return {...point, updated};
  }
  const point = validatePoint(body.lat, body.lng ?? body.lon, body.acc);
  if (!point) return null;
  return {...point, updated: Date.now()};
}

function jsonResponse(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request),
    },
  });
}

function isOwnTracksPayload(body) {
  return Boolean(body && (body._type === 'location' || body._type === 'Location' || Array.isArray(body)));
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS' && path === '/where') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(request),
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method === 'GET' && path === '/where') {
    if (!env?.LOCATION) return jsonResponse({enabled: false}, 200, request);
    const raw = await env.LOCATION.get(STORE_KEY);
    if (!raw) return jsonResponse({enabled: false}, 200, request);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return jsonResponse({enabled: false}, 200, request);
    }
    if (!data || !Number.isFinite(Number(data.lat)) || !Number.isFinite(Number(data.lng))) {
      return jsonResponse({enabled: false}, 200, request);
    }
    return jsonResponse({
      enabled: true,
      lat: Number(data.lat),
      lng: Number(data.lng),
      acc: data.acc ?? null,
      updated: data.updated,
    }, 200, request);
  }

  if (request.method === 'POST' && path === '/update') {
    if (!isAuthorized(request, url, env)) {
      return jsonResponse({error: 'unauthorized'}, 401, request);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({error: 'invalid json'}, 400, request);
    }
    const point = parseUpdate(body);
    if (!point) return jsonResponse({error: 'invalid location'}, 400, request);
    await env.LOCATION.put(STORE_KEY, JSON.stringify(point));
    if (isOwnTracksPayload(body)) {
      return new Response('[]', {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }
    return jsonResponse({ok: true}, 200, request);
  }

  return jsonResponse({error: 'not found'}, 404, request);
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};
