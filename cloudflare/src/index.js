// Währungen auf Cloudflare: statische PWA, D1-Dokumente, Cron für Erfassung und FX-Alarme.
import { runCapture } from './capture.js';
import { runFxAlerts } from './alerts.js';
import { canonicalJson } from './json.js';
import { expandSchedule, parseHour, parseStep } from './schedule.js';
import { readRaw, writeRaw } from './storage.js';
import { pad } from './time.js';

const DOCS = {
  '/data/rates.json': 'rates',
  '/data/capture-times.json': 'capture-times',
  '/data/fx-alerts.json': 'fx-alerts',
  '/data/fx-alert-state.json': 'fx-alert-state',
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function jsonResponse(body, status = 200) {
  const text = typeof body === 'string' ? body : canonicalJson(body);
  return new Response(text.endsWith('\n') ? text : text + '\n', { status, headers: JSON_HEADERS });
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function passwordStatus(request, env) {
  const expected = env.APP_PASSWORD;
  if (!expected) return 'unset';
  const header = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+/i.test(header)) return false;
  const got = header.replace(/^Bearer\s+/i, '');
  return timingSafeEqual(got, expected);
}

export function normalizeTimes(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const start = parseHour(body.start);
  const end = parseHour(body.end);
  const step = parseStep(body.intervalHours);
  const grid = expandSchedule(start, end, step);
  if (!grid) return null;
  return { version: 2, start: pad(start), end: pad(end), intervalHours: step };
}

export function normalizeAlerts(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const currencies = body.currencies;
  if (!currencies || typeof currencies !== 'object' || Array.isArray(currencies)) return null;
  const out = {};
  for (const [code, c] of Object.entries(currencies)) {
    if (!/^[A-Z]{3}$/.test(code)) return null;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    if (typeof c.enabled !== 'boolean') return null;
    const down = typeof c.down === 'number' ? c.down : Number(c.down);
    const up = typeof c.up === 'number' ? c.up : Number(c.up);
    if (!(down > 0 && down <= 20) || !(up > 0 && up <= 20)) return null;
    out[code] = { enabled: c.enabled, down, up };
  }
  if (!Object.keys(out).length) return null;
  return { version: 1, currencies: out };
}

async function readBody(request) {
  const text = await request.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === 'GET' && path === '/api/runtime') {
    return jsonResponse({ runtime: 'cloudflare' });
  }

  if (method === 'GET' && path === '/api/auth') {
    const status = passwordStatus(request, env);
    if (status === 'unset') return jsonResponse({ error: 'APP_PASSWORD ist nicht gesetzt' }, 503);
    if (status !== true) return jsonResponse({ error: 'Passwort ungültig' }, 401);
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  }

  const docKey = DOCS[path];
  if (method === 'GET' && docKey) {
    const body = await readRaw(env, docKey);
    if (body == null) return jsonResponse({ error: 'nicht vorhanden' }, 404);
    return jsonResponse(body);
  }

  if ((method === 'PUT' || method === 'POST') && (path === '/api/capture-times' || path === '/api/fx-alerts' || path === '/api/fx-alerts/test')) {
    const status = passwordStatus(request, env);
    if (status === 'unset') return jsonResponse({ error: 'APP_PASSWORD ist nicht gesetzt' }, 503);
    if (status !== true) return jsonResponse({ error: 'Passwort ungültig' }, 401);

    if (path === '/api/fx-alerts/test') {
      try {
        await runFxAlerts(env, { test: true });
      } catch (e) {
        return jsonResponse({ error: e && e.message ? e.message : 'Test-Push fehlgeschlagen' }, 502);
      }
      return jsonResponse({ ok: true });
    }

    let parsed;
    try {
      parsed = await readBody(request);
    } catch {
      return jsonResponse({ error: 'JSON ungültig' }, 400);
    }
    if (path === '/api/capture-times') {
      const next = normalizeTimes(parsed);
      if (!next) return jsonResponse({ error: 'Erfassungszeiten ungültig (Von vor Bis, Intervall 1, 2, 3, 4, 8, 12 oder 24)' }, 400);
      const body = canonicalJson(next);
      await writeRaw(env, 'capture-times', body);
      ctx.waitUntil(runCapture(env).catch(err => console.error('Erfassung nach Speichern:', err && err.message ? err.message : err)));
      return jsonResponse(body);
    }
    const next = normalizeAlerts(parsed);
    if (!next) return jsonResponse({ error: 'FX-Alarme ungültig' }, 400);
    const body = canonicalJson(next);
    await writeRaw(env, 'fx-alerts', body);
    return jsonResponse(body);
  }

  if (env.ASSETS) return env.ASSETS.fetch(request);
  return jsonResponse({ error: 'nicht gefunden' }, 404);
}

export default {
  fetch: handle,
  async scheduled(event, env) {
    const cron = String(event.cron || '');
    if (cron.startsWith('*/15')) await runFxAlerts(env);
    else await runCapture(env);
  },
};
