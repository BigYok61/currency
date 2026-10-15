// Live-Mittelkurs alle 15 Minuten. Die Stundenslots in «rates» bleiben unverändert (nur volle Stunden).
import { captureList } from './currencies.js';
import { fetchJson } from './capture.js';
import { roundHalfEven } from './json.js';

/** CHF je 1 Einheit aus einem biquote-Ticker; null, wenn kein brauchbarer Kurs. */
export function liveMid(ticker, inv, unit) {
  if (!ticker || typeof ticker !== 'object' || ticker.stale === true) return null;
  let mid = typeof ticker.mid === 'number' && ticker.mid > 0 ? ticker.mid : null;
  if (mid == null && ticker.bid > 0 && ticker.ask > 0) mid = (ticker.bid + ticker.ask) / 2;
  if (mid == null) return null;
  return roundHalfEven((inv ? 1 / mid : mid) * unit, 6);
}

/** Holt alle Ticker und speichert { at, rates } unter «live». `at` = jüngste Kurszeit. */
export async function runLive(env, opts = {}) {
  const fetchImpl = opts.fetch || fetch;
  const now = opts.now || new Date();
  const { writeRaw } = await import('./storage.js');
  const rates = {};
  let newest = 0;
  for (const { code, symbol, inv, unit } of captureList()) {
    if (!symbol) continue;
    try {
      const ticker = await fetchJson(`https://biquote.io/api/${symbol}`, fetchImpl);
      const value = liveMid(ticker, inv, unit);
      if (value == null) continue;
      rates[code] = value;
      const t = Date.parse(ticker.lastQuoteAt || ticker.timestamp || '');
      if (Number.isFinite(t)) newest = Math.max(newest, t);
    } catch (e) {
      console.log(`Live ${symbol}: ${e && e.message ? e.message : e}`);
    }
  }
  if (!Object.keys(rates).length) return null;
  const stamp = Math.min(newest || now.getTime(), now.getTime());
  const live = { at: new Date(stamp).toISOString().slice(0, 19) + 'Z', fetched: now.toISOString().slice(0, 19) + 'Z', rates };
  await writeRaw(env, 'live', JSON.stringify(live));
  return live;
}

/** rates.json mit «live»-Block; `updated` wird die Live-Zeit, wenn sie neuer ist. */
export function mergeLive(ratesBody, liveBody) {
  if (!liveBody) return ratesBody;
  try {
    const doc = JSON.parse(ratesBody);
    const live = JSON.parse(liveBody);
    if (!live || !live.at || !live.rates) return ratesBody;
    doc.live = live;
    if (!doc.updated || Date.parse(live.at) > Date.parse(doc.updated)) doc.updated = live.at;
    return JSON.stringify(doc);
  } catch {
    return ratesBody;
  }
}

export const LIVE_MAX_AGE_MS = 60000;

/** Live-Block lesen; älter als 60 s (Abrufzeit): einmal frisch bei biquote holen. Fehler: alter Stand. */
export async function freshLive(env, opts = {}) {
  const { readRaw } = await import('./storage.js');
  const now = opts.now || new Date();
  const body = await readRaw(env, 'live');
  let fetched = 0;
  try {
    const doc = body ? JSON.parse(body) : null;
    fetched = Date.parse((doc && (doc.fetched || doc.at)) || '') || 0;
  } catch { fetched = 0; }
  if (now.getTime() - fetched < LIVE_MAX_AGE_MS) return body;
  try {
    const live = await runLive(env, opts);
    return live ? JSON.stringify(live) : body;
  } catch (e) {
    console.log(`Live frisch: ${e && e.message ? e.message : e}`);
    return body;
  }
}
