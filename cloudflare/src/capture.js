// Stündliche Erfassung. Gleiche Merge-Regel wie scripts/capture.py: nur ergänzen, nie überschreiben.
import { canonicalJson, roundHalfEven } from './json.js';
import { loadTimes } from './schedule.js';
import { forecast7Days, forecastEndOfDay, forecastTargetDay, resolveBasisHour } from './forecast.js';
import {
  ECB_LOOKBACK_DAYS, START_DAY, addDays, isWeekday, pad, parseInstant, slotUtcMs, weekdays, zurichDateString, zurichParts,
} from './time.js';
import { currenciesFor } from './currencies.js';

export const CURRENCIES = [
  { code: 'USD', symbol: 'USDCHF', inv: false, unit: 1 },
  { code: 'EUR', symbol: 'EURCHF', inv: false, unit: 1 },
  { code: 'GBP', symbol: 'GBPCHF', inv: false, unit: 1 },
];

export const UA = 'Waehrungsuebersicht/1.0 (+cloudflare)';

export function emptyHistory() {
  return { version: 1, days: {} };
}

export function put(dct, key, val) {
  if (Object.prototype.hasOwnProperty.call(dct, key)) return false;
  dct[key] = roundHalfEven(val, 6);
  return true;
}

function dayRec(history, key) {
  const rec = history.days[key] || (history.days[key] = {});
  if (!rec.slots) rec.slots = {};
  if (!rec.ecb) rec.ecb = {};
  return rec;
}

function convert(q, inv, unit) {
  return (inv ? 1 / q : q) * unit;
}

export function ecbStartDay(today) {
  const fourteen = addDays(today, -14);
  const minDay = START_DAY < fourteen ? START_DAY : fourteen;
  return addDays(minDay, -ECB_LOOKBACK_DAYS);
}

export function ohlcLimit(now) {
  const hoursBack = Math.floor((now.getTime() - slotUtcMs(START_DAY, 0)) / 3600000) + 3;
  return Math.max(24, Math.min(hoursBack + 14 * 24, 1000));
}

export function ecbUrl(today, currencies = CURRENCIES) {
  const syms = [...new Set([...currencies.map(c => c.code).filter(c => c !== 'EUR'), 'CHF'])].sort().join(',');
  return `https://api.frankfurter.dev/v1/${ecbStartDay(today)}..?base=EUR&symbols=${syms}`;
}

export function ohlcUrl(symbol, limit) {
  return `https://biquote.io/api/${symbol}/ohlc?interval=1h&limit=${limit}`;
}

/** Alle vollen Stunden 00–23. Prognose im gemeinsamen rates.json bleibt auf 06:00 (Mac-App). */
export function workerCapturePlan() {
  const capture = [];
  for (let hour = 0; hour < 24; hour++) capture.push(hour);
  return { start: 6, grid: capture.slice(), capture };
}

/**
 * @param {object} history mutated
 * @param {object|null} timesDoc
 * @param {Date} now
 * @param {(url: string) => Promise<any>} getJson
 */
export async function applyCapture(history, timesDoc, now, getJson, plan, currencies = CURRENCIES) {
  if (!history.version) history.version = 1;
  if (!history.days) history.days = {};
  const { start, grid, capture } = plan || loadTimes(timesDoc);
  const captureSet = new Set(capture);
  const today = zurichDateString(now);
  const firstKey = START_DAY;
  const days = weekdays(START_DAY, today);
  let changed = 0;
  const errors = [];

  const ecbAll = Object.fromEntries(currencies.map(c => [c.code, {}]));
  try {
    const resp = await getJson(ecbUrl(today, currencies));
    const rates = resp && resp.rates ? resp.rates : {};
    for (const key of Object.keys(rates)) {
      const r = rates[key] || {};
      const chf = r.CHF;
      if (!chf) continue;
      for (const { code, unit } of currencies) {
        const x = code === 'EUR' ? 1 : r[code];
        if (x) {
          ecbAll[code][key] = chf / x * unit;
          if (key >= firstKey) {
            if (put(dayRec(history, key).ecb, code, chf / x * unit)) changed += 1;
          }
        }
      }
    }
  } catch (e) {
    errors.push(`EZB: ${e && e.message ? e.message : e}`);
  }

  const limit = ohlcLimit(now);
  for (const { code, symbol, inv, unit } of currencies) {
    let bars;
    try {
      const body = await getJson(ohlcUrl(symbol, limit));
      bars = body.bars;
      if (!Array.isArray(bars)) throw new Error('bars fehlt');
    } catch (e) {
      errors.push(`${symbol}: ${e && e.message ? e.message : e}`);
      continue;
    }
    const candles = [];
    for (const b of bars) {
      const t = parseInstant(String(b.openTime).replace(/Z$/, 'Z'));
      const o = convert(b.open, inv, unit);
      const hi = convert(b.high, inv, unit);
      const lo = convert(b.low, inv, unit);
      candles.push({ t, o, h: Math.max(hi, lo), l: Math.min(hi, lo) });
      const z = zurichParts(new Date(t));
      const key = dateKey(z);
      if (!isWeekday(key) || z.minute !== 0 || !captureSet.has(z.hour)) continue;
      if (key < firstKey) continue;
      const slot = dayRec(history, key).slots[pad(z.hour)] || (dayRec(history, key).slots[pad(z.hour)] = {});
      if (put(slot, code, o)) changed += 1;
    }
    candles.sort((a, b) => a.t - b.t);
    for (const d of days) {
      const existing = history.days[d];
      if (existing && existing.forecast && Object.prototype.hasOwnProperty.call(existing.forecast, code)) continue;
      const basis = resolveBasisHour(candles, d, start, grid);
      if (basis == null) continue;
      const f = forecastEndOfDay(candles, d, basis);
      if (f == null) continue;
      const rec = dayRec(history, d);
      if (!rec.forecast) rec.forecast = {};
      if (put(rec.forecast, code, f)) {
        changed += 1;
        if (!rec.forecastBasis) rec.forecastBasis = {};
        rec.forecastBasis[code] = basis;
      }
    }
    for (const d of days) {
      if (!Object.keys(ecbAll[code]).length) break;
      const existing = history.days[d];
      if (existing && existing.forecast7 && Object.prototype.hasOwnProperty.call(existing.forecast7, code)) continue;
      const basis = resolveBasisHour(candles, d, start, grid);
      if (basis == null) continue;
      const f = forecast7Days(candles, ecbAll[code], d, basis);
      if (f == null) continue;
      const rec = dayRec(history, d);
      if (!rec.forecast7) rec.forecast7 = {};
      if (!rec.forecast7Target) rec.forecast7Target = forecastTargetDay(d);
      if (put(rec.forecast7, code, f)) {
        changed += 1;
        if (!rec.forecast7Basis) rec.forecast7Basis = {};
        rec.forecast7Basis[code] = basis;
      }
    }
  }

  if (changed) history.updated = now.toISOString().slice(0, 19) + 'Z';
  history.days = Object.fromEntries(Object.entries(history.days).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return { history, changed, errors, fatal: errors.length === currencies.length + 1 };
}

function dateKey(z) {
  return `${z.year}-${pad(z.month)}-${pad(z.day)}`;
}

export function historyJson(history) {
  return canonicalJson(history);
}

export async function fetchJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function runCapture(env, opts = {}) {
  const fetchImpl = opts.fetch || fetch;
  const now = opts.now || new Date();
  const { readJson, readRaw, writeRaw } = await import('./storage.js');
  const stored = await readJson(env, 'rates');
  const history = stored && typeof stored === 'object' ? stored : emptyHistory();
  const requested = await readJson(env, 'currency-requests');
  const list = currenciesFor(requested && requested.codes);
  const result = await applyCapture(history, null, now, url => fetchJson(url, fetchImpl), workerCapturePlan(), list);
  const body = historyJson(result.history);
  const prev = await readRaw(env, 'rates');
  if (prev !== body) await writeRaw(env, 'rates', body);
  const errText = result.errors.length ? result.errors.join('; ') : 'keine';
  console.log(`${result.changed} neue Werte; Fehler: ${errText}`);
  if (result.fatal) throw new Error(errText);
  return result;
}
