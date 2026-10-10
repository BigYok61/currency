// Währungen auf Cloudflare: statische PWA, gemeinsame Kurse, Abos je Gerät.
import { runCapture } from './capture.js';
import { LIMITS, runFxAlerts, sendTestPush, validAlertId, validTopic } from './alerts.js';
import { canonicalJson } from './json.js';
import { parseHour } from './schedule.js';
import { currenciesFor, mergeCurrencyRequests } from './currencies.js';
import {
  historyKey, historyResponseBody, isHistoryCode, readHistoryDocument, selectRange, shouldRefreshHistory, updateRecentHistory,
  RANGES,
} from './history.js';
import {
  bumpLimit, deleteSubscription, getSubscription, insertSubscription, readJson, readRaw, updateSubscription, writeRaw,
} from './storage.js';
import { zurichDateString } from './time.js';

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

const ALERT_CODES = ['USD', 'EUR'];
const MAX_BODY = 4096;

function jsonResponse(body, status = 200) {
  const text = typeof body === 'string' ? body : canonicalJson(body);
  return new Response(text.endsWith('\n') ? text : text + '\n', { status, headers: JSON_HEADERS });
}

export function normalizeAlerts(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const currencies = body.currencies;
  if (!currencies || typeof currencies !== 'object' || Array.isArray(currencies)) return null;
  const out = {};
  for (const code of ALERT_CODES) {
    const c = currencies[code];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    if (typeof c.enabled !== 'boolean') return null;
    const down = typeof c.down === 'number' ? c.down : Number(c.down);
    const up = typeof c.up === 'number' ? c.up : Number(c.up);
    if (!(down > 0 && down <= 20) || !(up > 0 && up <= 20)) return null;
    out[code] = { enabled: c.enabled, down, up };
  }
  if (Object.keys(currencies).some(code => !ALERT_CODES.includes(code))) return null;
  return { version: 1, currencies: out };
}

export function normalizeSubscription(body) {
  const alerts = normalizeAlerts(body);
  if (!alerts || !validTopic(body.topic)) return null;
  let start = 6;
  if (body.start != null && body.start !== '') {
    const n = parseHour(body.start);
    if (n == null) return null;
    start = n;
  }
  return { version: 1, topic: body.topic, start, currencies: alerts.currencies };
}

function publicAlert(row, now = new Date()) {
  const config = JSON.parse(row.config);
  const state = JSON.parse(row.state || '{"date":"","sent":{}}');
  const today = zurichDateString(now);
  return {
    version: 1,
    topic: row.topic,
    start: config.start ?? 6,
    currencies: config.currencies,
    sent: state.date === today ? (state.sent || {}) : {},
  };
}

function hourBucket(now) {
  return Math.floor(now / 3600000);
}

function nextHour(now) {
  return (hourBucket(now) + 1) * 3600000;
}

async function tooFast(env, request, id, kind) {
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const ipHits = await bumpLimit(env, `ip:${ip}:${hourBucket(now)}`, now, nextHour(now));
  if (ipHits > LIMITS.ipPerHour) return 'Zu viele Anfragen. Bitte später erneut versuchen.';
  if (id) {
    const idHits = await bumpLimit(env, `id:${id}:${hourBucket(now)}`, now, nextHour(now));
    if (idHits > LIMITS.idPerHour) return 'Zu viele Änderungen für dieses Gerät. Bitte später erneut versuchen.';
  }
  if (kind === 'test' && id) {
    const day = zurichDateString(new Date(now));
    const resetAt = nextHour(now) + 23 * 3600000;
    const testHits = await bumpLimit(env, `test:${id}:${day}`, now, resetAt);
    if (testHits > LIMITS.testPerDay) return 'Zu viele Test-Pushes heute.';
  }
  return null;
}

async function readJsonBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: 'Anfrage zu gross', status: 413 };
  if (!text.trim()) return { error: 'JSON ungültig', status: 400 };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: 'JSON ungültig', status: 400 };
  }
}

async function handleAlerts(request, env, id, test) {
  if (!validAlertId(id)) return jsonResponse({ error: 'Kennung ungültig' }, 400);
  const method = request.method.toUpperCase();
  const limited = await tooFast(env, request, id, test && method === 'POST' ? 'test' : '');
  if (limited) return jsonResponse({ error: limited }, 429);

  if (method === 'GET' && !test) {
    const row = await getSubscription(env, id);
    if (!row) return jsonResponse({ error: 'nicht vorhanden' }, 404);
    return jsonResponse(publicAlert(row));
  }

  if (method === 'DELETE' && !test) {
    await deleteSubscription(env, id);
    return jsonResponse({ ok: true });
  }

  if (method === 'POST' && test) {
    const row = await getSubscription(env, id);
    if (!row) return jsonResponse({ error: 'Zuerst die Schwellen speichern' }, 404);
    try {
      await sendTestPush(env, row);
    } catch (e) {
      return jsonResponse({ error: e && e.message ? e.message : 'Test-Push fehlgeschlagen' }, 502);
    }
    return jsonResponse({ ok: true });
  }

  if (method === 'POST' && !test) {
    const body = await readJsonBody(request);
    if (body.error) return jsonResponse({ error: body.error }, body.status);
    const next = normalizeSubscription(body.value);
    if (!next) return jsonResponse({ error: 'FX-Alarme ungültig' }, 400);
    const existing = await getSubscription(env, id);
    const config = canonicalJson({ version: 1, start: next.start, currencies: next.currencies });
    const now = Date.now();
    if (!existing) {
      await insertSubscription(env, id, next.topic, config, now);
    } else if (existing.topic !== next.topic) {
      return jsonResponse({ error: 'Thema gehört zu einem anderen Abo' }, 409);
    } else {
      await updateSubscription(env, id, config, now);
    }
    const row = await getSubscription(env, id);
    return jsonResponse(publicAlert(row));
  }

  return jsonResponse({ error: 'nicht gefunden' }, 404);
}

const HISTORY_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
};

function historyHttp(body, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = {
    ...HISTORY_HEADERS,
    'cache-control': status === 200 ? 'public, max-age=3600' : 'no-store',
  };
  return new Response(text.endsWith('\n') ? text : `${text}\n`, { status, headers });
}

export async function handleHistory(env, code, range, now = new Date()) {
  if (!Object.prototype.hasOwnProperty.call(RANGES, range)) return historyHttp({ error: 'Zeitraum ungültig' }, 400);
  if (!isHistoryCode(code)) return historyHttp({ error: 'nicht vorhanden' }, 404);
  const doc = readHistoryDocument(await readJson(env, historyKey(code)));
  if (!doc) return historyHttp({ error: 'nicht vorhanden' }, 404);
  const points = selectRange(doc.points, range, zurichDateString(now)) || [];
  return historyHttp(historyResponseBody(code, range, points));
}

async function handleCurrencies(request, env) {
  const method = request.method.toUpperCase();
  const doc = await readJson(env, 'currency-requests');
  const existing = doc && Array.isArray(doc.codes) ? doc.codes : [];
  if (method === 'GET') {
    return jsonResponse({ version: 1, codes: existing, capturing: currenciesFor(existing).map(c => c.code) });
  }
  if (method !== 'POST') return jsonResponse({ error: 'nicht gefunden' }, 404);
  const limited = await tooFast(env, request, null, '');
  if (limited) return jsonResponse({ error: limited }, 429);
  const body = await readJsonBody(request);
  if (body.error) return jsonResponse({ error: body.error }, body.status);
  const merged = mergeCurrencyRequests(existing, body.value);
  if (!merged) return jsonResponse({ error: 'JSON ungültig' }, 400);
  await writeRaw(env, 'currency-requests', canonicalJson({ version: 1, codes: merged }));
  return jsonResponse({ version: 1, codes: merged, capturing: currenciesFor(merged).map(c => c.code) });
}

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === 'GET' && path === '/api/runtime') {
    return jsonResponse({ runtime: 'cloudflare' });
  }

  const alertMatch = path.match(/^\/api\/alerts\/([A-Za-z0-9_-]+)(\/test)?$/);
  if (alertMatch) return handleAlerts(request, env, alertMatch[1], !!alertMatch[2]);

  if (path === '/api/currencies') return handleCurrencies(request, env);

  const historyMatch = path.match(/^\/data\/history\/([A-Za-z]{3})\.json$/);
  if (historyMatch && method === 'GET') {
    return handleHistory(env, historyMatch[1].toUpperCase(), url.searchParams.get('range') || '');
  }

  const docKey = DOCS[path];
  if (method === 'GET' && docKey) {
    const body = await readRaw(env, docKey);
    if (body == null) return jsonResponse({ error: 'nicht vorhanden' }, 404);
    return jsonResponse(body);
  }

  if (env.ASSETS) return env.ASSETS.fetch(request);
  return jsonResponse({ error: 'nicht gefunden' }, 404);
}

export default {
  fetch: handle,
  async scheduled(event, env) {
    const cron = String(event.cron || '');
    // `*/15 5-21 * * MON-FRI` sind die Alarme. `5 * * * MON-FRI` und `5 6 * * SAT` erfassen.
    if (cron.startsWith('*/15')) {
      await runFxAlerts(env);
      return;
    }
    await runCapture(env);
    if (!shouldRefreshHistory(cron, new Date())) return;
    try {
      await updateRecentHistory(env);
    } catch (err) {
      console.error('ECB-Verlauf', err && err.message ? err.message : err);
    }
  },
};
