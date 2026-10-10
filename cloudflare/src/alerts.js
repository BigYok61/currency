// FX-Push-Alarme via ntfy. Gleiche Regeln wie scripts/fx_alerts.py.
import { canonicalJson, formatFixed, roundHalfEven } from './json.js';
import { basisHour } from './schedule.js';
import { parseInstant, zurichDateString, zurichHourMinute, zurichParts, pad } from './time.js';

export const SYMBOLS = { USD: 'USDCHF', EUR: 'EURCHF', GBP: 'GBPCHF' };
export const DEFAULTS = {
  USD: { enabled: true, down: 0.5, up: 0.25 },
  EUR: { enabled: true, down: 0.5, up: 0.25 },
};
export const WINDOW = [7, 22];
export const LEGACY_BASIS_HOUR = 8;
export const MAX_QUOTE_AGE = 20 * 60;
export const UA = 'Waehrungsuebersicht/1.4 (+cloudflare)';
export const ALERT_ID_RE = /^[a-f0-9]{64}$/;
export const TOPIC_RE = /^wae-[a-f0-9]{32}$/;
export const INACTIVE_MS = 90 * 24 * 60 * 60 * 1000;
export const LIMITS = { ipPerHour: 30, idPerHour: 20, testPerDay: 8 };
export const ALERT_CODES = ['USD', 'EUR'];

export function formatPct(v) {
  const sign = v > 0 ? '+' : v < 0 ? '\u2212' : '\u00b1';
  return `${sign}${formatFixed(Math.abs(v), 2)} %`;
}

export function formatNum(v) {
  return formatFixed(v, 4);
}

export function formatThreshold(v) {
  // Python f"{down}" for a float: 0.5 -> "0.5", 1.0 -> "1.0".
  if (Number.isInteger(v)) return `${v}.0`;
  return String(v);
}

export function validAlertId(id) {
  return typeof id === 'string' && ALERT_ID_RE.test(id);
}

export function validTopic(topic) {
  return typeof topic === 'string' && TOPIC_RE.test(topic);
}

export function inactiveCutoff(nowMs) {
  return nowMs - INACTIVE_MS;
}

/** Nächster Zählerstand: abgelaufenes Fenster beginnt bei 1. */
export function nextHits(storedHits, storedReset, now) {
  if (storedReset == null || storedReset <= now) return 1;
  return storedHits + 1;
}

export function inWindow(date) {
  const { hour, minute } = zurichHourMinute(date);
  if (!(WINDOW[0] <= hour && hour <= WINDOW[1])) return false;
  if (hour === WINDOW[1] && minute > 14) return false;
  return true;
}

export function isWeekend(date) {
  const key = zurichDateString(date);
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 || wd === 6;
}

function asFloat(v) {
  if (typeof v === 'boolean' || v == null) return null;
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v.trim()) : NaN);
  return Number.isFinite(n) ? n : null;
}

export function pickBase(bars, now, hour) {
  const today = zurichDateString(now);
  let first = null;
  let atLegacy = null;
  const sorted = [...bars].sort((a, b) => a.openTime < b.openTime ? -1 : a.openTime > b.openTime ? 1 : 0);
  for (const b of sorted) {
    const t = new Date(parseInstant(String(b.openTime)));
    const z = zurichParts(t);
    const key = `${z.year}-${pad(z.month)}-${pad(z.day)}`;
    if (key !== today || z.minute !== 0) continue;
    if (!first) first = { open: b.open, label: `${pad(z.hour)}:${pad(z.minute)}` };
    if (z.hour === hour) return { rate: b.open, label: `${pad(hour)}:00` };
    if (z.hour === LEGACY_BASIS_HOUR) atLegacy = { rate: b.open, label: '08:00' };
  }
  const zh = zurichParts(now).hour;
  if (first && zh < hour) return { rate: first.open, label: 'Tageser\u00f6ffnung' };
  if (first) return { rate: first.open, label: first.label };
  if (atLegacy) return atLegacy;
  return { rate: null, label: null };
}

export function readQuote(ticker, now) {
  const midRaw = ticker.mid || ((ticker.bid || 0) + (ticker.ask || 0)) / 2;
  const mid = midRaw && midRaw > 0 ? midRaw : null;
  const qt = ticker.lastQuoteAt || ticker.timestamp;
  let age;
  if (qt) age = (now.getTime() - parseInstant(String(qt))) / 1000;
  else age = ticker.quoteAgeSeconds || 0;
  return { mid, age, marketState: ticker.marketState || 'open' };
}

function defaultState(date) {
  return { date, sent: {} };
}

/**
 * Pure decision step. `quotes[code]` is the ticker JSON, `bars[code]` the OHLC bars.
 * Returns logs, ntfy payloads (without topic) and the state object to store.
 */
export function evaluateAlerts({ now, times, cfg, state, force = false, quotes, bars }) {
  const logs = [];
  const pushes = [];
  if (!force) {
    if (isWeekend(now)) {
      logs.push('Wochenende – keine Prüfung.');
      return { logs, pushes, state, write: false, skipped: true };
    }
    if (!inWindow(now)) {
      const { hour } = zurichHourMinute(now);
      logs.push(`Ausserhalb ${pad(WINDOW[0])}:00–${pad(WINDOW[1])}:00 Zürich – keine Prüfung.`);
      void hour;
      return { logs, pushes, state, write: false, skipped: true };
    }
  }
  const currencies = (cfg && cfg.currencies) || DEFAULTS;
  const useCfg = currencies && Object.keys(currencies).length ? currencies : DEFAULTS;
  const key = zurichDateString(now);
  const prevDate = state && state.date;
  let next = state && typeof state === 'object' ? state : {};
  if (next.date !== key) next = defaultState(key);
  else next = { date: key, sent: { ...(next.sent || {}) } };
  const hadFile = state != null;
  let changed = false;
  const hour = basisHour(times);

  for (const [code, c] of Object.entries(useCfg)) {
    if (!SYMBOLS[code] || (c && c.enabled === false)) continue;
    const down = asFloat(c && c.down != null ? c.down : 0.5);
    const up = asFloat(c && c.up != null ? c.up : 0.25);
    if (down == null || up == null) {
      logs.push(`${code}: ungültige Schwelle – übersprungen`);
      continue;
    }
    let quote;
    let base;
    try {
      quote = readQuote(quotes[code], now);
      base = pickBase(bars[code], now, hour);
    } catch (e) {
      logs.push(`${code}: Abruf fehlgeschlagen (${e && e.name ? e.name : 'Error'})`);
      continue;
    }
    if (!quote.mid || !base.rate) {
      logs.push(`${code}: kein Kurs bzw. kein Basiskurs`);
      continue;
    }
    if (quote.age > MAX_QUOTE_AGE) {
      logs.push(`${code}: Kurs veraltet (${Math.trunc(quote.age)} s, Markt ${quote.marketState}) – kein Alarm`);
      continue;
    }
    const change = (quote.mid / base.rate - 1) * 100;
    logs.push(`${code}/CHF ${formatPct(change)} seit ${base.label} (${formatNum(base.rate)} → ${formatNum(quote.mid)}); Schwellen −${down} / +${up} %`);
    for (const [direction, hit] of [['down', change < -down], ['up', change > up]]) {
      const k = `${code}:${direction}`;
      if (!hit || Object.prototype.hasOwnProperty.call(next.sent, k)) continue;
      const msg = `${code}/CHF ${formatPct(change)} seit ${base.label} (${formatNum(base.rate)} → ${formatNum(quote.mid)})`;
      const title = `Währungsübersicht: ${code}/CHF ${direction === 'down' ? 'fällt' : 'steigt'}`;
      const tags = direction === 'down' ? ['chart_with_downwards_trend'] : ['chart_with_upwards_trend'];
      const threshold = direction === 'down' ? down : up;
      const sign = direction === 'down' ? '\u2212' : '+';
      pushes.push({
        code,
        direction,
        title,
        message: `${msg}\nSchwelle ${sign}${formatThreshold(threshold)} %`,
        tags,
        priority: 4,
        sent: {
          time: zurichHourMinute(now).label,
          pct: roundHalfEven(change, 3),
          base: roundHalfEven(base.rate, 6),
          rate: roundHalfEven(quote.mid, 6),
        },
      });
    }
  }

  return {
    logs,
    pushes,
    state: next,
    write: false,
    skipped: false,
    changed,
    hadFile,
    prevDate,
    key,
    applyPush(okIndices) {
      okIndices.forEach(i => {
        const p = pushes[i];
        next.sent[`${p.code}:${p.direction}`] = p.sent;
        changed = true;
        logs.push(`Push gesendet: ${p.code}:${p.direction}`);
      });
      const write = changed || !hadFile || prevDate !== key;
      return { state: next, write, changed };
    },
  };
}

export function testLines(now, times, quotes, bars) {
  const lines = [];
  const hour = basisHour(times);
  for (const code of ['USD', 'EUR']) {
    try {
      const quote = readQuote(quotes[code], now);
      const base = pickBase(bars[code], now, hour);
      if (quote.mid && base.rate) lines.push(`${code}/CHF ${formatPct((quote.mid / base.rate - 1) * 100)} seit ${base.label} (${formatNum(base.rate)} → ${formatNum(quote.mid)})`);
      else if (quote.mid) lines.push(`${code}/CHF aktuell ${formatNum(quote.mid)}`);
    } catch (e) {
      lines.push(`${code}/CHF: Kurs nicht abrufbar (${e && e.name ? e.name : 'Error'})`);
    }
  }
  return 'TEST – die FX-Alarme sind eingerichtet (keine echte Kursbewegung).\n' + lines.join('\n');
}

export async function pushNtfy(topic, title, message, tags, priority, appUrl, fetchImpl, dry) {
  if (dry) {
    console.log('DRY:', title, '|', message);
    return true;
  }
  const obj = { topic, title, message, tags, priority };
  if (appUrl) obj.click = appUrl;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetchImpl('https://ntfy.sh/', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
        body: JSON.stringify(obj),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
      return true;
    } catch (e) {
      console.log(`ntfy Fehler ${e && e.name ? e.name : 'Error'}`);
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return false;
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function wrapFetch(quotes, bars, errors, codes) {
  const wrappedQuotes = {};
  const wrappedBars = {};
  for (const code of codes) {
    if (errors[code]) {
      const err = errors[code];
      wrappedQuotes[code] = new Proxy({}, { get() { throw err; } });
      wrappedBars[code] = new Proxy({}, { get() { throw err; } });
    } else {
      wrappedQuotes[code] = quotes[code];
      wrappedBars[code] = bars[code];
    }
  }
  return { quotes: wrappedQuotes, bars: wrappedBars };
}

async function fetchPairs(codes, fetchImpl) {
  const quotes = {};
  const bars = {};
  const errors = {};
  for (const code of codes) {
    if (!SYMBOLS[code]) continue;
    try {
      quotes[code] = await getJson(`https://biquote.io/api/${SYMBOLS[code]}`, fetchImpl);
      bars[code] = (await getJson(`https://biquote.io/api/${SYMBOLS[code]}/ohlc?interval=1h&limit=30`, fetchImpl)).bars;
    } catch (e) {
      errors[code] = e;
    }
  }
  return wrapFetch(quotes, bars, errors, codes);
}

export async function sendTestPush(env, subscription, opts = {}) {
  const fetchImpl = opts.fetch || fetch;
  const now = opts.now || new Date();
  const dry = String(env.FX_DRY || '') === '1' || !!opts.dry;
  const appUrl = String(env.APP_URL || '').trim();
  const config = JSON.parse(subscription.config);
  const times = { start: config.start ?? 6 };
  const data = await fetchPairs(ALERT_CODES, fetchImpl);
  const message = testLines(now, times, data.quotes, data.bars);
  const ok = await pushNtfy(subscription.topic, 'TEST: Währungsübersicht FX-Alarm', message, ['test_tube'], 3, appUrl, fetchImpl, dry);
  console.log(ok ? 'Test-Push gesendet' : 'Test-Push fehlgeschlagen');
  if (!ok) throw new Error('Test-Push fehlgeschlagen');
  return { test: true, ok };
}

export async function runFxAlerts(env, opts = {}) {
  const fetchImpl = opts.fetch || fetch;
  const now = opts.now || new Date();
  const force = !!opts.force;
  const dry = String(env.FX_DRY || '') === '1' || !!opts.dry;
  const appUrl = String(env.APP_URL || '').trim();
  const { listSubscriptions, pruneSubscriptions, pruneRateLimits, saveSubscriptionState } = await import('./storage.js');
  const pruned = await pruneSubscriptions(env, inactiveCutoff(now.getTime()));
  await pruneRateLimits(env, now.getTime());
  if (pruned) console.log(`${pruned} inaktive Abos entfernt`);
  if (!force && (isWeekend(now) || !inWindow(now))) {
    const { hour, minute } = zurichHourMinute(now);
    console.log(isWeekend(now)
      ? 'Wochenende – keine Prüfung.'
      : `Ausserhalb ${pad(WINDOW[0])}:00–${pad(WINDOW[1])}:00 Zürich (${pad(hour)}:${pad(minute)}) – keine Prüfung.`);
    return { skipped: true, pruned };
  }
  const rows = await listSubscriptions(env);
  if (!rows.length) {
    console.log('Keine Abos.');
    return { skipped: true, subscriptions: 0, pruned };
  }
  const parsed = rows.map(row => ({
    ...row,
    config: JSON.parse(row.config),
    state: JSON.parse(row.state),
  }));
  const codes = new Set(ALERT_CODES);
  const data = await fetchPairs([...codes], fetchImpl);
  let pushes = 0;
  for (const sub of parsed) {
    const times = { start: sub.config.start ?? 6 };
    const decision = evaluateAlerts({
      now,
      times,
      cfg: sub.config,
      state: sub.state,
      force,
      quotes: data.quotes,
      bars: data.bars,
    });
    for (const line of decision.logs) console.log(`${sub.id.slice(0, 8)} ${line}`);
    if (decision.skipped) continue;
    const ok = [];
    for (let i = 0; i < decision.pushes.length; i++) {
      const p = decision.pushes[i];
      if (await pushNtfy(sub.topic, p.title, p.message, p.tags, p.priority, appUrl, fetchImpl, dry)) ok.push(i);
    }
    const applied = decision.applyPush(ok);
    if (applied.write) await saveSubscriptionState(env, sub.id, canonicalJson(applied.state));
    pushes += ok.length;
  }
  return { skipped: false, subscriptions: rows.length, pushes, pruned };
}
