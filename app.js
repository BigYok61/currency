'use strict';
// Währungen – liest data/rates.json (gleiches Format wie die macOS-App)
const DATA_URL = 'data/rates.json';
const CURRENCIES = [
  { code: 'EUR', label: '1 EUR', flag: '🇪🇺', symbol: 'EURCHF' },
  { code: 'USD', label: '1 USD', flag: '🇺🇸', symbol: 'USDCHF' },
  { code: 'GBP', label: '1 GBP', flag: '🇬🇧', symbol: 'GBPCHF' },
];
/** Standardreihenfolge: EUR, USD, GBP, danach übrige Währungen in der Reihenfolge von CURRENCIES. */
const DEFAULT_LEAD = ['EUR', 'USD', 'GBP'];
const LS_ORDER = 'wu.currencyOrder';
const LS_HIDDEN = 'wu.currencyHidden';
const LS_BASE = 'wu.baseCurrency';
const LS_VIEW_OPTS = 'wu.viewOptions';
const CHEV = '<svg class="sym" viewBox="0 0 12 20" width="8" height="14" aria-hidden="true" focusable="false"><path d="M2.2 2.4 9.2 10l-7 7.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** Gleiche Paare wie cloudflare/src/currencies.js. inv: Kehrwert, damit der Wert CHF je 1 Einheit ist. */
const PAIRS = {
  USD: { symbol: 'USDCHF', inv: false }, EUR: { symbol: 'EURCHF', inv: false }, GBP: { symbol: 'GBPCHF', inv: false },
  AUD: { symbol: 'AUDCHF', inv: false }, CAD: { symbol: 'CADCHF', inv: false }, NZD: { symbol: 'NZDCHF', inv: false },
  SEK: { symbol: 'CHFSEK', inv: true }, JPY: { symbol: 'CHFJPY', inv: true }, NOK: { symbol: 'CHFNOK', inv: true },
  DKK: { symbol: 'CHFDKK', inv: true }, PLN: { symbol: 'CHFPLN', inv: true }, HUF: { symbol: 'CHFHUF', inv: true },
  TRY: { symbol: 'CHFTRY', inv: true }, SGD: { symbol: 'CHFSGD', inv: true }, MXN: { symbol: 'CHFMXN', inv: true },
  ZAR: { symbol: 'CHFZAR', inv: true },
};
const CHF_CCY = { code: 'CHF', label: '1 CHF', flag: '🇨🇭', symbol: null };
/** Eindeutige Symbole. Danach das Symbol der Locale, danach der ISO-Code. */
const CURRENCY_SYMBOLS = {
  CHF: 'CHF', USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: 'CN¥',
  INR: '₹', KRW: '₩', ILS: '₪', TRY: '₺',
  CAD: 'C$', AUD: 'A$', NZD: 'NZ$', SGD: 'S$', HKD: 'HK$', MXN: 'MX$', TWD: 'NT$',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', ISK: 'kr',
  BRL: 'R$', ZAR: 'R', PLN: 'zł', HUF: 'Ft', CZK: 'Kč', THB: '฿', PHP: '₱', RUB: '₽',
};
const FLAG_EMOJI = {
  SEK: '🇸🇪', NOK: '🇳🇴', DKK: '🇩🇰', ISK: '🇮🇸', JPY: '🇯🇵', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿',
  PLN: '🇵🇱', HUF: '🇭🇺', TRY: '🇹🇷', SGD: '🇸🇬', MXN: '🇲🇽', ZAR: '🇿🇦', BRL: '🇧🇷',
  INR: '🇮🇳', CNY: '🇨🇳', KRW: '🇰🇷', ILS: '🇮🇱', HKD: '🇭🇰', CZK: '🇨🇿', RON: '🇷🇴', THB: '🇹🇭',
};
/** Region → Währung. Fehlende Regionen fallen auf CHF zurück. */
const REGION_CURRENCY = {
  CH: 'CHF', LI: 'CHF',
  AD: 'EUR', AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR',
  GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR', LV: 'EUR', MC: 'EUR', MT: 'EUR',
  NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR', SM: 'EUR', VA: 'EUR', ME: 'EUR', XK: 'EUR',
  GB: 'GBP', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON',
  BG: 'BGN', IS: 'ISK', RS: 'RSD', UA: 'UAH', RU: 'RUB', BY: 'BYN', MD: 'MDL', BA: 'BAM',
  MK: 'MKD', AL: 'ALL', TR: 'TRY',
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
  UY: 'UYU', PY: 'PYG', BO: 'BOB', VE: 'VES', EC: 'USD', PA: 'USD', SV: 'USD', PR: 'USD',
  GT: 'GTQ', HN: 'HNL', NI: 'NIO', CR: 'CRC', DO: 'DOP', CU: 'CUP', HT: 'HTG', JM: 'JMD',
  TT: 'TTD', BS: 'BSD', BB: 'BBD', GY: 'GYD', SR: 'SRD', BZ: 'BZD',
  JP: 'JPY', CN: 'CNY', AU: 'AUD', NZ: 'NZD', IN: 'INR', KR: 'KRW', SG: 'SGD', HK: 'HKD',
  TW: 'TWD', TH: 'THB', ZA: 'ZAR', IL: 'ILS', AE: 'AED', SA: 'SAR', PH: 'PHP', MY: 'MYR',
  ID: 'IDR', VN: 'VND',
};
const EUROPE = new Set([
  'AD', 'AL', 'AT', 'AX', 'BA', 'BE', 'BG', 'BY', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FO',
  'FR', 'GB', 'GG', 'GI', 'GR', 'HR', 'HU', 'IE', 'IM', 'IS', 'IT', 'JE', 'LT', 'LU', 'LV', 'MC',
  'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SJ', 'SK', 'SM',
  'TR', 'UA', 'VA', 'XK',
]);
const AMERICAS = new Set([
  'AG', 'AI', 'AR', 'AW', 'BB', 'BL', 'BM', 'BO', 'BQ', 'BR', 'BS', 'BZ', 'CA', 'CL', 'CO', 'CR',
  'CU', 'CW', 'DM', 'DO', 'EC', 'FK', 'GD', 'GF', 'GL', 'GP', 'GT', 'GY', 'HN', 'HT', 'JM', 'KN',
  'KY', 'LC', 'MF', 'MQ', 'MS', 'MX', 'NI', 'PA', 'PE', 'PM', 'PR', 'PY', 'SR', 'SV', 'SX', 'TC',
  'TT', 'US', 'UY', 'VC', 'VE', 'VG', 'VI',
]);
const EXTRA_CURRENCIES = [];
let baseCurrency = 'CHF';
let showFcDay = true;
let showDevDay = true;
let showFcWeek = true;
let showDevWeek = true;
/** intervals | chart | compact. intervals bleibt im Speicher, damit ältere Stände «Nur aktuell» noch verstehen. */
let viewMode = 'intervals';
let chartRange = '1M';
/** Additive Ansicht (Version 2.1). Erster Start: keine Blöcke, nur Name, Kurs und Kehrwert. */
let showChart = false;
let showIntervals = false;
let showForecast = false;
let showReference = false;
/** false, solange dieses Gerät die Erfassungszeiten nicht selbst gespeichert hat. */
let timesUserSet = false;
let baseHint = null;
/** Tag → CHF je 1 Basiseinheit, aus der EZB-Reihe, solange die Stunde noch nicht erfasst ist. */
let baseDaily = {};
const ICON_DRAG = '<svg class="sym" viewBox="0 0 20 14" width="18" height="12" aria-hidden="true" focusable="false"><path d="M1 1.6h18M1 7h18M1 12.4h18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const ICON_MINUS = '<svg class="sym" viewBox="0 0 22 22" width="22" height="22" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="10" fill="currentColor"/><path d="M6.1 11h9.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_PLUS = '<svg class="sym" viewBox="0 0 22 22" width="22" height="22" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="10" fill="currentColor"/><path d="M11 6.1v9.8M6.1 11h9.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';
const XMARK = '<svg class="sym" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false"><path d="M3.6 3.6 12.4 12.4M12.4 3.6 3.6 12.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
/** null = nichts gespeichert (Standard). Array = vom Nutzer gewählte Codes. undefined = noch nicht gelesen. */
let savedOrder;
/** undefined = noch nicht gelesen. Set = ausgeblendete Codes. */
let savedHidden;
/** Bearbeiten-Modus und die aufgeklappte Liste «Weitere Währungen…». Nur diese Sitzung. */
let editing = false;
let moreOpen = false;
/** Laufende Ziehgeste, damit ein Neutrendern sie abbricht statt die Zeilen zu verwischen. */
let drag = null;
const LEGACY_BASIS = 8; // ältere Tage und ältere Prognosen ohne gespeicherte Basisstunde
const CLOSE_HOUR = 16; // Tagesende = Ziel der Prognosen, immer erfasst, nur auf dem Raster als Uhrzeit sichtbar
const INTERVALS = [1, 2, 3, 4, 5, 8, 12, 24];
const DEFAULT_SCHEDULE = { start: 6, end: 20, intervalHours: 2 };
let schedule = { ...DEFAULT_SCHEDULE };
let HOURS = [];
let timesFit = true;
function parseHour(v) {
  if (typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,2}$/.test(v.trim()) ? Number(v.trim()) : NaN);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
}
/** Ganze Stunden 0–23, aufsteigend. Nur das Raster, ohne zusätzlich erfasste Stunden. */
function normalizeHours(list) {
  const out = new Set();
  const src = Array.isArray(list) ? list : [];
  for (const h of src) {
    const n = parseHour(h);
    if (n != null) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}
/** start, start+step, … bis zur grössten Stunde ≤ end. Leer, wenn Beginn nicht vor Ende liegt. */
function expandSchedule(start, end, step) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || !INTERVALS.includes(step)) return [];
  if (start < 0 || end > 23 || start >= end) return [];
  const out = [];
  for (let h = start; h <= end; h += step) out.push(h);
  return out;
}
function hoursFromSchedule(sch) {
  return normalizeHours(expandSchedule(sch.start, sch.end, sch.intervalHours));
}
function parseStep(v) {
  if (typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,2}$/.test(String(v).trim()) ? Number(String(v).trim()) : NaN);
  return INTERVALS.includes(n) ? n : null;
}
function parseSchedule(data) {
  if (!data || typeof data !== 'object') return null;
  const start = parseHour(data.start);
  const end = parseHour(data.end);
  const step = parseStep(data.intervalHours);
  if (start == null || end == null || start >= end || step == null) return null;
  return { start, end, intervalHours: step };
}
function sameHours(a, b) {
  return a.length === b.length && a.every((h, i) => h === b[i]);
}
/** Version-1-Liste auf ein Von/Bis/Intervall abbilden, dessen Ergebnis dieselbe Menge ist. */
function matchSchedule(hours) {
  const set = new Set(hours);
  let best = null;
  let bestKey = null;
  for (const step of INTERVALS) {
    for (let start = 0; start <= 22; start++) {
      for (let end = start + 1; end <= 23; end++) {
        const pattern = expandSchedule(start, end, step);
        const got = normalizeHours(pattern);
        if (!sameHours(got, hours)) continue;
        const last = pattern[pattern.length - 1];
        // Engstes Ende (letzter Slot), dann kleinerer Abstand, dann grössere Spanne.
        const key = (end - last) * 100000 + step * 10 - (last - start);
        if (bestKey == null || key < bestKey) { bestKey = key; best = { start, end, intervalHours: step }; }
      }
    }
  }
  return best;
}
/** Erststart: 07:00, 12:00 und 17:00, bis dieses Gerät eigene Zeiten speichert. */
function applyUnsetTimes() {
  schedule = { start: 7, end: 17, intervalHours: 5 };
  HOURS = [7, 12, 17];
  timesFit = false;
  timesUserSet = false;
}
function applyTimesConfig(data) {
  const sch = parseSchedule(data);
  if (sch) {
    schedule = sch;
    HOURS = hoursFromSchedule(sch);
    timesFit = true;
    timesUserSet = true;
    return;
  }
  if (data && Array.isArray(data.hours) && data.hours.length) {
    HOURS = normalizeHours(data.hours);
    const inferred = matchSchedule(HOURS);
    if (inferred) { schedule = inferred; timesFit = true; }
    else { schedule = { ...DEFAULT_SCHEDULE }; timesFit = false; }
    timesUserSet = true;
    return;
  }
  applyUnsetTimes();
}
applyTimesConfig(null);
const START = '2026-10-01';
const TZ = 'Europe/Zurich';
const EPS = 0.00005;

const nf = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const r = v => (v == null ? '–' : nf.format(v));
const pad = h => String(h).padStart(2, '0');

function zurichToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function weekdayKeys(from, to) {
  const out = []; const d = new Date(from + 'T12:00:00Z'); const end = new Date(to + 'T12:00:00Z');
  while (d <= end) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const hdrFmt = new Intl.DateTimeFormat('de-CH', { weekday: 'short', timeZone: 'UTC' });
function header(key) { const d = new Date(key + 'T12:00:00Z'); return `${hdrFmt.format(d).replace('.', '')} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`; }
const timeFmt = new Intl.DateTimeFormat('de-CH', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const hmFmt = new Intl.DateTimeFormat('de-CH', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const pctFmt = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });

let history = { days: {} };
/** Aktueller Kurs (Live-Abruf beim Öffnen/Aktualisieren): Code -> { v, at (Abrufzeit), quoteAt (Kurszeit), closed } – nie in rates.json */
const live = {};

const val = (c, k, h) => history.days[k]?.slots?.[pad(h)]?.[c.code] ?? null;
const fc = (c, k) => history.days[k]?.forecast?.[c.code] ?? null;
const ecb = (c, k) => history.days[k]?.ecb?.[c.code] ?? null;
const fc7 = (c, k) => history.days[k]?.forecast7?.[c.code] ?? null;
function baseDenom(day, hour) {
  if (baseCurrency === 'CHF') return 1;
  const slot = val({ code: baseCurrency }, day, hour);
  if (slot != null) return slot;
  if (baseDaily[day] != null) return baseDaily[day];
  return day === zurichToday() ? baseHint : null;
}
/** Angezeigter Kurs in der Berichtswährung. Bei Berichtswährung CHF der gespeicherte CHF-Kurs, unverändert. */
function shown(c, day, hour) {
  const raw = c.code === 'CHF' ? 1 : val(c, day, hour);
  if (baseCurrency === 'CHF') return c.code === 'CHF' ? null : raw;
  if (raw == null) return null;
  const den = baseDenom(day, hour);
  if (den == null || den === 0) return null;
  return raw / den;
}
function shownEcb(c, day) {
  const raw = c.code === 'CHF' ? 1 : ecb(c, day);
  if (baseCurrency === 'CHF') return c.code === 'CHF' ? null : raw;
  if (raw == null) return null;
  const den = ecb({ code: baseCurrency }, day) ?? baseDaily[day] ?? (day === zurichToday() ? baseHint : null);
  if (den == null || den === 0) return null;
  return raw / den;
}
function shownForecast(c, day, kind) {
  if (baseCurrency === 'CHF') return displayForecast(c, day, kind);
  const own = c.code === 'CHF' ? { value: 1, basis: null } : displayForecast(c, day, kind);
  const baseFc = displayForecast({ code: baseCurrency }, day, kind);
  const den = baseFc.value != null ? baseFc.value : baseDenom(day, baseFc.basis ?? schedule.start);
  if (own.value == null || den == null || den === 0) return { value: null, basis: own.basis ?? baseFc.basis };
  return { value: own.value / den, basis: own.basis ?? baseFc.basis };
}
function shownLive(c) {
  if (baseCurrency === 'CHF') return live[c.code] ? live[c.code].v : null;
  const raw = c.code === 'CHF' ? 1 : (live[c.code] ? live[c.code].v : null);
  const b = live[baseCurrency] ? live[baseCurrency].v : baseHint;
  if (raw == null || b == null || b === 0) return null;
  return raw / b;
}
function addDays(k, n) { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const target7 = k => history.days[k]?.forecast7Target ?? addDays(k, 7);
/** Ist-Wert zur 7-Tage-Prognose: Zieltag 16:00 (auch wenn die Zeile verborgen ist), sonst nächster vorhandener Zeitpunkt. */
function actual7(c, k) {
  const t = target7(k);
  for (let i = 0; i <= 5; i++) {
    const day = addDays(t, i);
    const hours = [];
    const push = hr => { if (!hours.includes(hr)) hours.push(hr); };
    if (i === 0) push(CLOSE_HOUR);
    for (const hr of HOURS) {
      if (i === 0 && hr < CLOSE_HOUR) continue;
      push(hr);
    }
    for (const hr of hours) {
      const v = val(c, day, hr);
      if (v != null) return { v, day, hr };
    }
  }
  return null;
}
function shownActual7(c, k) {
  if (baseCurrency === 'CHF') return actual7(c, k);
  if (c.code === 'CHF') {
    const a = actual7({ code: baseCurrency }, k);
    if (!a || !a.v) return null;
    return { ...a, v: 1 / a.v };
  }
  const a = actual7(c, k);
  if (!a || !a.v) return null;
  const den = val({ code: baseCurrency }, a.day, a.hr) ?? baseHint;
  if (den == null || den === 0) return null;
  return { ...a, v: a.v / den };
}
/** Stunde für «Veränderung seit …»: Start, sonst erste erfasste Stunde des Tages, sonst 08:00. */
function changeBasis(c, dayKey) {
  if (c.code === 'CHF' && baseCurrency !== 'CHF') return baseDenom(dayKey, schedule.start) != null ? schedule.start : null;
  if (val(c, dayKey, schedule.start) != null) return schedule.start;
  const slots = history.days[dayKey]?.slots || {};
  const hours = Object.keys(slots).map(h => parseHour(h)).filter(h => h != null && val(c, dayKey, h) != null).sort((a, b) => a - b);
  if (hours.length) return hours[0];
  if (val(c, dayKey, LEGACY_BASIS) != null) return LEGACY_BASIS;
  return null;
}
/** Stunde, mit der die gespeicherte Prognose gerechnet wurde. Ältere Einträge ohne Feld: 08:00. */
function forecastBasisHour(c, dayKey, kind) {
  const rec = history.days[dayKey];
  const map = kind === '7' ? rec?.forecast7Basis : rec?.forecastBasis;
  const stored = parseHour(map?.[c.code]);
  if (stored != null) return stored;
  const hasForecast = kind === '7' ? fc7(c, dayKey) != null : fc(c, dayKey) != null;
  if (hasForecast) return LEGACY_BASIS;
  return changeBasis(c, dayKey);
}
function weekdayDate(key) {
  const wd = new Date(key + 'T12:00:00Z').getUTCDay();
  return wd !== 0 && wd !== 6;
}
function previousCloses(code, day, limit) {
  const closes = [];
  let d = day;
  for (let i = 0; i < 40 && closes.length < limit; i++) {
    d = addDays(d, -1);
    if (!weekdayDate(d)) continue;
    const close = history.days[d]?.slots?.[pad(CLOSE_HOUR)]?.[code];
    if (close != null) closes.push(close);
    else if (history.days[d]?.ecb && Object.prototype.hasOwnProperty.call(history.days[d].ecb, code)) closes.push(history.days[d].ecb[code]);
  }
  return closes;
}
/** Prognose aus den gespeicherten Stundenkursen, wenn die Basis nicht die Startstunde dieses Geräts ist. */
function clientForecastDay(code, day, basisHour) {
  const spot = history.days[day]?.slots?.[pad(basisHour)]?.[code];
  if (spot == null) return null;
  const closes = [];
  let d = day;
  for (let i = 0; i < 14 && closes.length < 6; i++) {
    d = addDays(d, -1);
    if (!weekdayDate(d)) continue;
    const close = history.days[d]?.slots?.[pad(CLOSE_HOUR)]?.[code];
    if (close != null) closes.push(close);
  }
  if (closes.length < 2) return null;
  const trend = (closes[0] - closes[closes.length - 1]) / (closes.length - 1);
  const overnight = spot - closes[0];
  const avgRange = Math.abs(spot) * 0.005;
  let change = 0.5 * trend - 0.3 * overnight;
  const limit = 0.5 * avgRange;
  change = Math.min(Math.max(change, -limit), limit);
  return spot + change;
}
function clientForecast7(code, day, basisHour) {
  const spot = history.days[day]?.slots?.[pad(basisHour)]?.[code];
  if (spot == null) return null;
  const closes = previousCloses(code, day, 20);
  if (closes.length < 2) return null;
  const rets = [];
  for (let i = 0; i < closes.length - 1; i++) rets.push(Math.log(closes[i] / closes[i + 1]));
  const head = rets.slice(0, 10);
  const m = head.reduce((s, v) => s + v, 0) / head.length;
  const horizon = 5;
  const trend = spot * 0.3 * horizon * m;
  const revert = closes.length >= 5 ? 0.15 * (closes.reduce((s, v) => s + v, 0) / closes.length - spot) : 0;
  let sd = 0.005;
  if (rets.length >= 3) {
    const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
    sd = Math.sqrt(rets.reduce((s, r0) => s + (r0 - mean) ** 2, 0) / (rets.length - 1));
  }
  const limit = sd * Math.sqrt(horizon) * spot;
  const change = Math.min(Math.max(trend + revert, -limit), limit);
  return spot + change;
}
function displayForecast(c, dayKey, kind) {
  const stored = kind === '7' ? fc7(c, dayKey) : fc(c, dayKey);
  const basis = forecastBasisHour(c, dayKey, kind);
  if (runtime !== 'cloudflare' || (stored != null && basis === schedule.start)) return { value: stored, basis };
  const computed = kind === '7' ? clientForecast7(c.code, dayKey, schedule.start) : clientForecastDay(c.code, dayKey, schedule.start);
  if (computed != null) return { value: computed, basis: schedule.start };
  return { value: stored, basis };
}

function esc(s) { return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

function defaultCurrencies() {
  const byCode = new Map(CURRENCIES.map(c => [c.code, c]));
  const head = DEFAULT_LEAD.filter(code => byCode.has(code)).map(code => byCode.get(code));
  const lead = new Set(DEFAULT_LEAD);
  return [...head, ...CURRENCIES.filter(c => !lead.has(c.code))];
}
function currencyRecord(code) {
  if (code === 'CHF') return CHF_CCY;
  const builtin = CURRENCIES.find(c => c.code === code);
  if (builtin) return builtin;
  let extra = EXTRA_CURRENCIES.find(c => c.code === code);
  if (extra) return extra;
  extra = { code, label: `1 ${code}`, flag: FLAG_EMOJI[code] || '', symbol: PAIRS[code] ? PAIRS[code].symbol : null };
  EXTRA_CURRENCIES.push(extra);
  return extra;
}
function ensureCurrency(code) {
  if (code) currencyRecord(code);
}
function readSavedOrder() {
  try {
    const raw = localStorage.getItem(LS_ORDER);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const codes = arr.filter(code => typeof code === 'string' && code);
    return codes.length ? codes : null;
  } catch { return null; }
}
function orderCodes() {
  if (savedOrder === undefined) savedOrder = readSavedOrder();
  return savedOrder;
}
/** Angezeigte Reihenfolge: gespeicherte Codes, unbekannte ignorieren, neue Währungen hinten in Standardreihenfolge. */
let deCurrencyNames;
function deCurrencyDisplayName(code) {
  try {
    if (!deCurrencyNames) deCurrencyNames = new Intl.DisplayNames('de-CH', { type: 'currency' });
    return deCurrencyNames.of(code);
  } catch { return null; }
}
function swissSpelling(text) {
  return String(text).replace(/ß/g, 'ss');
}
/** Drei Grossbuchstaben, kein X-Code (XXX, XAU, XTS, …), und ein echter ISO-Name. */
function normalizeCurrency(code) {
  if (typeof code !== 'string') return null;
  const up = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(up) || up[0] === 'X') return null;
  const name = deCurrencyDisplayName(up);
  if (!name || name.toUpperCase() === up) return null;
  return up;
}
function germanCurrencyName(code) {
  const name = deCurrencyDisplayName(code);
  if (!name || name.toUpperCase() === String(code).toUpperCase()) return code;
  return swissSpelling(name);
}
function currencySymbol(code) {
  const up = String(code || '').toUpperCase();
  if (CURRENCY_SYMBOLS[up]) return CURRENCY_SYMBOLS[up];
  try {
    const parts = new Intl.NumberFormat('de-CH', { style: 'currency', currency: up, currencyDisplay: 'narrowSymbol' }).formatToParts(1);
    const sym = parts.find(p => p.type === 'currency')?.value;
    if (sym && sym.toUpperCase() !== up) return sym;
  } catch { /* ISO-Code */ }
  return up;
}
function isSelectableBase(code) {
  return !!normalizeCurrency(code);
}
function currencyExtension(tag) {
  const u = String(tag || '').match(/-u-([a-z0-9-]+)$/i);
  if (!u) return null;
  const parts = u[1].split('-');
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i].toLowerCase() === 'cu') return parts[i + 1];
  }
  return null;
}
function localeRegion(tag) {
  try {
    const region = new Intl.Locale(tag).region;
    return region && /^[A-Z]{2}$/.test(region) ? region : null;
  } catch { return null; }
}
/** ch, eu, am, other. Ohne Region gilt dieselbe Folge wie in Amerika. */
function regionGroup(region) {
  if (region === 'CH' || region === 'LI') return 'ch';
  if (region && EUROPE.has(region)) return 'eu';
  if (region && AMERICAS.has(region)) return 'am';
  return 'other';
}
function defaultOrder(base, region) {
  const group = regionGroup(region);
  const tail = group === 'ch'
    ? ['CHF', 'EUR', 'USD', 'GBP']
    : group === 'eu'
      ? ['EUR', 'USD', 'GBP', 'CHF']
      : ['USD', 'EUR', 'GBP', 'CHF'];
  const out = [];
  const push = code => { if (code && !out.includes(code)) out.push(code); };
  push(base);
  for (const code of tail) push(code);
  return out;
}
function readLocaleCurrency(tag) {
  const region = localeRegion(tag);
  const explicit = normalizeCurrency(currencyExtension(tag));
  if (explicit) return { currency: explicit, region };
  if (!region) return null;
  const mapped = normalizeCurrency(REGION_CURRENCY[region] || '');
  return { currency: mapped || 'CHF', region };
}
/**
 * Ersteinrichtung nur aus der Locale, ohne Nachfrage.
 * Währung: (a) gültiger ISO-Code der Locale, nicht mit X, (b) Währung der Region, (c) CHF.
 * Liste: die Berichtswährung zuerst, dann je nach Region. CH/LI: CHF, EUR, USD, GBP.
 * Europa: lokal, EUR, USD, GBP, CHF. Amerika und alle übrigen Regionen: lokal, USD, EUR, GBP, CHF.
 */
function firstInstallChoice(languages) {
  const list = Array.isArray(languages) ? languages : [];
  let picked = null;
  for (const tag of list) {
    const got = readLocaleCurrency(tag);
    if (got) { picked = got; break; }
  }
  if (!picked) picked = { currency: 'CHF', region: null };
  return { base: picked.currency, order: defaultOrder(picked.currency, picked.region) };
}
function baseChoices() {
  const codes = [];
  const push = code => {
    const n = normalizeCurrency(code);
    if (n && !codes.includes(n)) codes.push(n);
  };
  push(baseCurrency);
  for (const c of currenciesInOrder()) push(c.code);
  push('CHF');
  push('EUR');
  push('USD');
  push('GBP');
  for (const code of Object.keys(PAIRS)) push(code);
  for (const c of EXTRA_CURRENCIES) push(c.code);
  return codes;
}
function catalogEntries() {
  const codes = [];
  const add = code => {
    if (!code || code === baseCurrency || codes.includes(code)) return;
    codes.push(code);
  };
  const saved = orderCodes();
  if (saved) for (const code of saved) add(code);
  if (baseCurrency !== 'CHF') add('CHF');
  for (const c of defaultCurrencies()) add(c.code);
  return codes.map(currencyRecord);
}
function currenciesInOrder() {
  const catalog = catalogEntries();
  const saved = orderCodes();
  if (!saved) return catalog;
  const byCode = new Map(catalog.map(c => [c.code, c]));
  const seen = new Set();
  const out = [];
  for (const code of saved) {
    if (seen.has(code) || !byCode.has(code)) continue;
    out.push(byCode.get(code));
    seen.add(code);
  }
  for (const c of catalog) if (!seen.has(c.code)) out.push(c);
  return out;
}
function persistOrder(list) {
  savedOrder = list.map(c => c.code);
  try { localStorage.setItem(LS_ORDER, JSON.stringify(savedOrder)); } catch { /* Anzeige gilt trotzdem für diese Sitzung */ }
}
function readSavedHidden() {
  try {
    const raw = localStorage.getItem(LS_HIDDEN);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter(code => typeof code === 'string' && isSelectableBase(code)));
  } catch { return new Set(); }
}
function hiddenSet() {
  if (savedHidden === undefined) savedHidden = readSavedHidden();
  return savedHidden;
}
function persistHidden(set) {
  savedHidden = set;
  try { localStorage.setItem(LS_HIDDEN, JSON.stringify([...set])); } catch { /* Anzeige gilt trotzdem für diese Sitzung */ }
}
function visibleCurrencies() {
  const hidden = hiddenSet();
  return currenciesInOrder().filter(c => !hidden.has(c.code));
}
/** Sichtbare Reihenfolge in die Gesamtliste schreiben; ausgeblendete Codes bleiben an ihrem Platz. */
function applyVisibleOrder(visible) {
  const hidden = hiddenSet();
  const queue = visible.slice();
  const next = [];
  for (const c of currenciesInOrder()) {
    if (hidden.has(c.code)) next.push(c);
    else if (queue.length) next.push(queue.shift());
  }
  while (queue.length) next.push(queue.shift());
  persistOrder(next);
}
function ccyName(c) {
  const code = c && c.code ? c.code : c;
  return germanCurrencyName(code);
}
function announce(text) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('ccyLive');
  if (!el) return;
  el.textContent = '';
  queueMicrotask(() => { el.textContent = text; });
}
function starPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const outer = (i * 72 - 90) * Math.PI / 180;
    pts.push(`${(cx + Math.cos(outer) * r).toFixed(2)},${(cy + Math.sin(outer) * r).toFixed(2)}`);
    const inner = outer + 36 * Math.PI / 180;
    const ir = r * 0.4;
    pts.push(`${(cx + Math.cos(inner) * ir).toFixed(2)},${(cy + Math.sin(inner) * ir).toFixed(2)}`);
  }
  return pts.join(' ');
}
const flagCache = {};
/** Runde Flagge als SVG, damit sie auf Retina scharf bleibt (Emoji-Flaggen fehlen auf manchen Systemen). */
function flagSvg(code) {
  if (flagCache[code]) return flagCache[code];
  let svg = '';
  if (code === 'EUR') {
    let stars = '';
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 - 90) * Math.PI / 180;
      stars += `<polygon fill="#FC0" points="${starPoints(16 + Math.cos(a) * 9.15, 16 + Math.sin(a) * 9.15, 1.45)}"/>`;
    }
    svg = `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="16" fill="#003399"/>${stars}</svg>`;
  } else if (code === 'USD') {
    const h = 32 / 13;
    let stripes = '';
    for (let i = 1; i < 13; i += 2) stripes += `<rect y="${(i * h).toFixed(3)}" width="32" height="${h.toFixed(3)}" fill="#fff"/>`;
    svg = `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false"><defs><clipPath id="fUSD"><circle cx="16" cy="16" r="16"/></clipPath></defs><g clip-path="url(#fUSD)"><rect width="32" height="32" fill="#bf0a30"/>${stripes}<rect width="14" height="${(7 * h).toFixed(3)}" fill="#002868"/></g></svg>`;
  } else if (code === 'GBP') {
    svg = '<svg viewBox="0 0 60 60" width="32" height="32" aria-hidden="true" focusable="false"><defs><clipPath id="fGBP"><circle cx="30" cy="30" r="30"/></clipPath></defs><g clip-path="url(#fGBP)"><rect width="60" height="60" fill="#012169"/><path d="M0 0 L60 60 M60 0 L0 60" stroke="#fff" stroke-width="14"/><path d="M0 0 L60 60 M60 0 L0 60" stroke="#C8102E" stroke-width="8"/><path d="M30 0 V60 M0 30 H60" stroke="#fff" stroke-width="22"/><path d="M30 0 V60 M0 30 H60" stroke="#C8102E" stroke-width="12"/></g></svg>';
  } else if (code === 'CHF') {
    svg = '<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="16" fill="#d52b1e"/><rect x="13.2" y="6.2" width="5.6" height="19.6" fill="#fff"/><rect x="6.2" y="13.2" width="19.6" height="5.6" fill="#fff"/></svg>';
  } else {
    const known = code === 'CHF' ? CHF_CCY : (CURRENCIES.find(c => c.code === code) || EXTRA_CURRENCIES.find(c => c.code === code));
    const emoji = (known && known.flag) || FLAG_EMOJI[code] || '';
    svg = emoji
      ? `<span class="flag-emoji">${emoji}</span>`
      : `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="16" fill="#8e8e93"/><text x="16" y="20.5" text-anchor="middle" fill="#fff" font-size="11" font-family="sans-serif">${esc(String(code).slice(0, 3))}</text></svg>`;
  }
  flagCache[code] = svg;
  return svg;
}
function ccyIdentity(c, liveHtml) {
  return `<span class="flag">${flagSvg(c.code)}</span><span class="ccy-name"><span class="ccy-line"><span class="ccy-code">${esc(c.label)}</span>${liveHtml}</span><span class="ccy-sub">${esc(ccyName(c))}</span></span>`;
}
function moveCurrency(code, dir, opts = {}) {
  const list = visibleCurrencies();
  const i = list.findIndex(c => c.code === code);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  const next = list.slice();
  const [item] = next.splice(i, 1);
  next.splice(j, 0, item);
  applyVisibleOrder(next);
  announce(`${ccyName(item)}, Position ${j + 1} von ${next.length}`);
  render({ keepScroll: true, focusDrag: opts.focus ? code : null });
}
function hideCurrency(code) {
  const list = visibleCurrencies();
  const i = list.findIndex(c => c.code === code);
  if (i < 0) return;
  const neighbor = list[i + 1] || list[i - 1];
  const hidden = new Set(hiddenSet());
  hidden.add(code);
  persistHidden(hidden);
  if (!visibleCurrencies().length) moreOpen = true;
  announce(`${ccyName(list[i])} ausgeblendet`);
  render({ keepScroll: true, focusDrag: neighbor && editing ? neighbor.code : null, focusMore: !neighbor });
}
function showCurrency(code) {
  const hidden = new Set(hiddenSet());
  if (!hidden.has(code)) return;
  hidden.delete(code);
  persistHidden(hidden);
  const item = currencyRecord(code);
  const rest = currenciesInOrder().filter(c => c.code !== code);
  if (item) rest.push(item);
  persistOrder(rest);
  announce(`${ccyName(item || { code, label: code })} eingeblendet`);
  render({ keepScroll: true, focusDrag: editing ? code : null });
  if (!live[code]) loadLive();
}

function cancelDrag() {
  if (!drag || typeof document === 'undefined') return;
  const { list } = drag;
  drag = null;
  document.body.classList.remove('dragging');
  for (const el of list) {
    el.classList.remove('lift', 'shift');
    el.style.removeProperty('--move');
  }
}
const CHART_RANGES = [
  { id: '1T', label: 'Tag', aria: 'Tag', caption: '1 Tag', days: 1 },
  { id: '1W', label: 'Woche', aria: 'Woche', caption: '1 Woche', days: 7 },
  { id: '1M', label: 'Monat', aria: 'Monat', caption: '1 Monat', days: 30 },
  { id: '1J', label: 'Jahr', aria: 'Jahr', caption: '1 Jahr', days: 360 },
  { id: '5J', label: '5 Jahre', aria: '5 Jahre', caption: '5 Jahre', days: 1825 },
  { id: '10J', label: '10 Jahre', aria: '10 Jahre', caption: '10 Jahre', days: 3650 },
];
const HISTORY_ORIGIN = 'https://waehrungen.bigyok61.workers.dev';
/** CHF je 1 Einheit, Schlüssel code|range. Eine Basisumstellung rechnet daraus, ohne neu zu laden. */
const historyCache = new Map();
const historyFlight = new Map();
const seriesByCode = new Map();
let chartGen = 0;
function readViewOptions() {
  try {
    const raw = localStorage.getItem(LS_VIEW_OPTS);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && data.v === 21) {
      showChart = data.chart !== false;
      showIntervals = data.intervals !== false;
      showForecast = data.forecast !== false;
      showReference = data.reference !== false;
      if (CHART_RANGES.some(range => range.id === data.range)) chartRange = data.range;
      viewMode = showChart && !showIntervals ? 'chart' : (showIntervals ? 'intervals' : 'compact');
      showFcDay = showForecast;
      showDevDay = showForecast;
      showFcWeek = showForecast;
      showDevWeek = showForecast;
      return;
    }
    if (data && typeof data.fcDay === 'boolean') {
      showFcDay = data.fcDay;
      showDevDay = data.devDay !== false;
      showFcWeek = data.fcWeek !== false;
      showDevWeek = data.devWeek !== false;
    } else if (data && data.forecasts === false) {
      showFcDay = false;
      showDevDay = false;
      showFcWeek = false;
      showDevWeek = false;
    }
    showForecast = !!(showFcDay || showFcWeek || showDevDay || showDevWeek);
    if (data && (data.mode === 'intervals' || data.mode === 'chart' || data.mode === 'compact')) viewMode = data.mode;
    else if (data && data.intervals === false) viewMode = 'compact';
    showChart = viewMode === 'chart';
    showIntervals = viewMode === 'intervals';
    showReference = true;
    if (data && CHART_RANGES.some(range => range.id === data.range)) chartRange = data.range;
  } catch { /* Standard: keine Blöcke, Grafik 30 Tage */ }
}
function writeViewOptions() {
  showFcDay = showForecast;
  showDevDay = showForecast;
  showFcWeek = showForecast;
  showDevWeek = showForecast;
  viewMode = showChart && !showIntervals ? 'chart' : (showIntervals ? 'intervals' : 'compact');
  try {
    localStorage.setItem(LS_VIEW_OPTS, JSON.stringify({
      v: 21,
      chart: showChart,
      intervals: showIntervals,
      forecast: showForecast,
      reference: showReference,
      range: chartRange,
      forecasts: showForecast,
      fcDay: showForecast,
      devDay: showForecast,
      fcWeek: showForecast,
      devWeek: showForecast,
      mode: viewMode,
    }));
  } catch { /* gilt für diese Sitzung */ }
}
function latestOn(c, today, read) {
  let day = today;
  for (let i = 0; i < 12; i++) {
    const v = read(day);
    if (v != null) return { v, day };
    day = addDays(day, -1);
  }
  return null;
}
function quoteParts(c, today) {
  const L = c.code === 'CHF' ? live[baseCurrency] : live[c.code];
  const liveV = shownLive(c);
  const basisHour = changeBasis(c, today);
  const basis = basisHour != null ? shown(c, today, basisHour) : null;
  if (liveV != null && L) return { v: liveV, basis, basisHour, at: L.at, quoteAt: L.quoteAt, closed: !!L.closed, live: true };
  const hours = [...HOURS, CLOSE_HOUR].sort((a, b) => b - a);
  for (const hr of hours) {
    const v = shown(c, today, hr);
    if (v != null) return { v, basis, basisHour, hour: hr, live: false };
  }
  return { v: null, basis, basisHour, live: false };
}
function deltaBits(v, basis, basisHour) {
  if (v == null || basis == null || basisHour == null || basis === 0) return { arrow: '', text: '', title: '' };
  const d = v - basis;
  const arrow = d > EPS ? '<span class="arr up">▲</span>' : d < -EPS ? '<span class="arr down">▼</span>' : '<span class="arr flat">–</span>';
  const text = `${d > EPS ? '+' : ''}${r(d)} (${pctFmt.format((v / basis - 1) * 100)} %)`;
  return { arrow, text, title: `Veränderung seit ${pad(basisHour)}:00: ${r(d)}` };
}
function historyUrl(code, range) {
  const path = `data/history/${code}.json?range=${encodeURIComponent(range)}`;
  return runtime === 'cloudflare' ? path : `${HISTORY_ORIGIN}/${path}`;
}
function ensureHistory(code, range) {
  const key = `${code}|${range}`;
  if (Array.isArray(historyCache.get(key))) return Promise.resolve(historyCache.get(key));
  if (historyFlight.has(key)) return historyFlight.get(key);
  const job = fetch(historyUrl(code, range)).then(async res => {
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.points)) return [];
    return data.points.filter(row => Array.isArray(row) && typeof row[0] === 'string' && Number.isFinite(row[1]));
  }).catch(() => []).then(points => {
    historyCache.set(key, points);
    historyFlight.delete(key);
    return points;
  });
  historyFlight.set(key, job);
  return job;
}
function cachedHistory(code, range) {
  const hit = historyCache.get(`${code}|${range}`);
  return Array.isArray(hit) ? hit : null;
}
function zurichHourOf(date) {
  const text = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(date);
  const n = Number(text);
  return Number.isInteger(n) ? n : null;
}
function longDate(day) {
  const d = new Date(day + 'T12:00:00Z');
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}
function hourlySeries(code, daysBack, today) {
  const from = addDays(today, -(daysBack - 1));
  const pts = [];
  let day = from;
  while (day <= today) {
    const slots = history.days[day]?.slots || {};
    const hours = Object.keys(slots).map(h => parseHour(h)).filter(h => h != null).sort((a, b) => a - b);
    const grid = daysBack === 1 && HOURS.length ? new Set(HOURS) : null;
    for (const hr of hours) {
      if (grid && !grid.has(hr)) continue;
      const v = shown({ code }, day, hr);
      if (v == null) continue;
      const label = daysBack === 1 ? `${pad(hr)}:00` : `${header(day)} ${pad(hr)}:00`;
      pts.push({ day, hour: hr, v, label });
    }
    day = addDays(day, 1);
  }
  const liveV = shownLive({ code });
  const L = code === 'CHF' ? live[baseCurrency] : live[code];
  if (liveV != null && L) {
    const at = new Date(L.quoteAt || L.at);
    const qh = zurichHourOf(at);
    const last = pts[pts.length - 1];
    const older = last && last.day === today && last.hour != null && qh != null && qh <= last.hour;
    if (!older) pts.push({ day: today, hour: null, v: liveV, label: hmFmt.format(at), live: true });
  }
  return pts;
}
function dailyInBase(code, own, basePts) {
  if (code === 'CHF') {
    return (basePts || []).filter(row => row[1] > 0).map(([day, den]) => ({ day, v: 1 / den, label: dayLabel(day) }));
  }
  if (baseCurrency === 'CHF') return (own || []).map(([day, v]) => ({ day, v, label: dayLabel(day) }));
  const denoms = new Map(basePts || []);
  const out = [];
  for (const [day, v] of own || []) {
    const den = denoms.get(day);
    if (den > 0) out.push({ day, v: v / den, label: dayLabel(day) });
  }
  return out;
}
function dayLabel(day) {
  return chartRange === '1M' ? header(day) : longDate(day);
}
function buildSeries(code, today) {
  const range = chartRange;
  if (range === '1T' || range === '1W') {
    const points = hourlySeries(code, range === '1T' ? 1 : 7, today);
    return { status: points.length ? 'ready' : 'empty', points };
  }
  const own = code === 'CHF' ? [] : cachedHistory(code, range);
  const basePts = baseCurrency === 'CHF' ? [] : cachedHistory(baseCurrency, range);
  if ((code !== 'CHF' && own == null) || (baseCurrency !== 'CHF' && basePts == null)) return { status: 'loading', points: [] };
  const points = dailyInBase(code, own || [], basePts || []);
  return { status: points.length ? 'ready' : 'empty', points };
}
function neededHistory(rows) {
  if (chartRange === '1T' || chartRange === '1W') return [];
  const codes = new Set();
  for (const c of rows) {
    if (c.code !== 'CHF' && cachedHistory(c.code, chartRange) == null) codes.add(c.code);
  }
  if (baseCurrency !== 'CHF' && cachedHistory(baseCurrency, chartRange) == null) codes.add(baseCurrency);
  return [...codes];
}
function smoothPath(pts) {
  const n = pts.length;
  if (n === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  const yOf = y => Math.max(8, Math.min(160, y));
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = yOf(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = yOf(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}
function plotSeries(points) {
  const vals = points.map(p => p.v);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (!(max - min > 1e-12)) { min -= 1; max += 1; }
  const pad = (max - min) * 0.14;
  min -= pad;
  max += pad;
  const left = 4;
  const width = 312;
  const top = 16;
  const height = 136;
  return points.map((p, i) => ({
    ...p,
    x: points.length === 1 ? left + width / 2 : left + (i / (points.length - 1)) * width,
    y: top + (1 - (p.v - min) / (max - min)) * height,
  }));
}
function toneOf(v, basis) {
  if (v == null || basis == null) return 'flat';
  const d = v - basis;
  return d > EPS ? 'up' : d < -EPS ? 'down' : 'flat';
}
function changeHtml(v, basis) {
  if (v == null || basis == null || basis === 0) return '';
  const d = v - basis;
  const tone = toneOf(v, basis);
  const abs = `${d > EPS ? '+' : ''}${r(d)}`;
  return `<span class="chg ${tone}">${abs} (${pctFmt.format((v / basis - 1) * 100)} %)</span>`;
}
/** 1 Berichtswährung = x Fremdwährung, zum angezeigten Kurs. */
function inverseText(code, value) {
  if (!code || code === baseCurrency || value == null || !(Math.abs(value) > EPS)) return '';
  return `1 ${baseCurrency} = ${r(1 / value)} ${code}`;
}
function chartTip(code, value, when) {
  return [when, value == null ? '' : `${r(value)} ${baseCurrency}`, inverseText(code, value)].filter(Boolean).join(' · ');
}
function chartSvg(code, plotted, tone) {
  const range = CHART_RANGES.find(r => r.id === chartRange);
  const label = `${ccyName({ code })} ${range?.aria || ''}`.trim();
  const color = tone === 'down' ? 'var(--down)' : tone === 'up' ? 'var(--up)' : 'var(--muted)';
  const last = plotted[plotted.length - 1];
  const tip = last ? esc(chartTip(code, last.v, range?.aria || '')) : '';
  if (plotted.length < 2) {
    const p = plotted[0];
    if (!p) return '';
    return `<svg class="plot" style="color:${color}" viewBox="0 0 320 168" role="img" aria-label="${esc(label)}"><title>${tip}</title><circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="4" fill="currentColor"/></svg>`;
  }
  const line = smoothPath(plotted);
  const area = `${line} L ${last.x.toFixed(2)} 158 L ${plotted[0].x.toFixed(2)} 158 Z`;
  const id = `g${code}`;
  return `<svg class="plot" style="color:${color}" viewBox="0 0 320 168" role="img" aria-label="${esc(label)}"><title>${tip}</title><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity="0.32"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path class="area" d="${area}" fill="url(#${id})"/><path class="line" d="${line}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle class="end-dot" cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="3.5" fill="currentColor"/><line class="scrub-line" y1="12" y2="156" stroke="currentColor" stroke-opacity="0.45" stroke-width="1" visibility="hidden"/><circle class="scrub-dot" r="5" fill="var(--surface)" stroke="currentColor" stroke-width="2.25" visibility="hidden"/></svg>`;
}
function rangeBarHtml() {
  const buttons = CHART_RANGES.map(r => `<button type="button" data-range="${r.id}" aria-pressed="${r.id === chartRange ? 'true' : 'false'}" aria-label="${esc(r.aria)}">${r.label}</button>`).join('');
  return `<div class="rangebar" role="toolbar" aria-label="Zeitraum">${buttons}</div>`;
}
function signedDelta(d) {
  return `${d >= 0 ? '+' : ''}${r(d)}`;
}
function dayDevParts(c, k) {
  const f = shownForecast(c, k, 'day').value;
  const a = shown(c, k, CLOSE_HOUR);
  if (f != null && a != null) {
    const d = a - f;
    return { text: signedDelta(d), title: `Ist 16:00: ${r(a)} · Prognose: ${r(f)}` };
  }
  return { text: '–', title: '', empty: true };
}
function weekDevParts(c, k) {
  const f = shownForecast(c, k, '7').value;
  if (f == null) return { text: '–', title: '', empty: true };
  const a = shownActual7(c, k);
  if (a) {
    const d = a.v - f;
    return { text: signedDelta(d), title: `Ist ${header(a.day)} ${pad(a.hr)}:00: ${r(a.v)} · Prognose: ${r(f)}` };
  }
  const when = header(target7(k));
  return { text: `→ ${when.split(' ')[1]}`, title: `Ist-Wert ab ${when} 16:00`, pending: true };
}
function forecastCell(c, k, today, kind, showFc, showDev) {
  const bits = [];
  if (showFc) {
    const shownFc = shownForecast(c, k, kind);
    const f = shownFc.value;
    const basisHour = shownFc.basis;
    const base = basisHour != null ? shown(c, k, basisHour) : null;
    let arrow = '';
    if (f != null && base != null) {
      const d = f - base;
      const word = d < -EPS ? `Erwartung: ${baseCurrency} stärker` : d > EPS ? `Erwartung: ${baseCurrency} schwächer` : 'Erwartung: unverändert';
      arrow = `<span class="fcarr" title="${esc(word)}">${d < -EPS ? '↓' : d > EPS ? '↑' : '→'}</span>`;
    }
    let title = '';
    if (f != null && kind === 'day') title = `Schätzung, keine Anlageberatung${basisHour != null && base != null ? `\nBasis ${pad(basisHour)}:00: ${r(base)}` : ''}`;
    if (f != null && kind !== 'day') title = `Schätzung, keine Anlageberatung\nZiel: ${header(target7(k))} 16:00${basisHour != null && base != null ? ` · Basis ${pad(basisHour)}:00: ${r(base)}` : ''}`;
    bits.push(`<span class="fc-val${f == null ? ' empty' : ''}"${title ? ` title="${esc(title)}"` : ''}>${f == null ? '–' : arrow + r(f)}</span>`);
  }
  if (showDev) {
    const dev = kind === 'day' ? dayDevParts(c, k) : weekDevParts(c, k);
    bits.push(`<span class="fc-dev${dev.pending ? ' pending' : ''}${dev.empty ? ' empty' : ''}"${dev.title ? ` title="${esc(dev.title)}"` : ''}>${esc(dev.text)}</span>`);
  }
  const inner = bits.length > 1 ? `<span class="fc-stack">${bits.join('')}</span>` : bits.join('');
  return `<td class="${k === today ? 'today' : ''}">${inner}</td>`;
}
function forecastTableRow(c, days, today, kind) {
  const isDay = kind === 'day';
  const showFc = isDay ? showFcDay : showFcWeek;
  const showDev = isDay ? showDevDay : showDevWeek;
  if (!showFc && !showDev) return '';
  const pair = showFc && showDev;
  const name = isDay ? 'Prognose Tagesende *' : 'Prognose 7 Tage *';
  const hint = isDay
    ? 'Schätzung, keine Anlageberatung'
    : 'Schätzung, keine Anlageberatung – Kurs eine Woche später (gleicher Wochentag, 16:00)';
  const label = pair
    ? `<span class="fc-stack"><span class="fc-name">${name}</span><span class="fc-sub">Abweichung</span></span>`
    : (showFc ? name : (isDay ? 'Abweichung heute' : 'Abweichung 7 Tage'));
  const cls = showFc ? `fc${pair ? ' fc-pair' : ''}` : 'dev';
  let row = `<tr class="${cls}"><th class="lab"${showFc ? ` title="${esc(hint)}"` : ''}>${label}</th>`;
  for (const k of days) row += forecastCell(c, k, today, kind, showFc, showDev);
  return row + '</tr>';
}
function quoteForecastLine(c, today, kind) {
  const isDay = kind === 'day';
  const showFc = isDay ? showFcDay : showFcWeek;
  const showDev = isDay ? showDevDay : showDevWeek;
  if (!showFc && !showDev) return '';
  const dev = isDay ? dayDevParts(c, today) : weekDevParts(c, today);
  const devHtml = `<span class="fc-dev${dev.pending ? ' pending' : ''}${dev.empty ? ' empty' : ''}"${dev.title ? ` title="${esc(dev.title)}"` : ''}>${esc(dev.text)}</span>`;
  if (showFc && showDev) {
    const fc = shownForecast(c, today, kind);
    const name = isDay ? 'Prognose Tagesende *' : 'Prognose 7 Tage *';
    return `<p class="quote-sub quote-fc" title="Schätzung, keine Anlageberatung"><span class="fc-stack"><span class="fc-name">${name}</span><span class="fc-sub">Abweichung</span></span><span class="fc-stack"><span class="fc-val">${fc.value == null ? '–' : r(fc.value)}</span>${devHtml}</span></p>`;
  }
  if (showFc) {
    const fc = shownForecast(c, today, kind);
    const name = isDay ? 'Prognose Tagesende *' : 'Prognose 7 Tage *';
    return `<p class="quote-sub quote-fc" title="Schätzung, keine Anlageberatung"><span>${name}</span><span class="fc-val">${fc.value == null ? '–' : r(fc.value)}</span></p>`;
  }
  const name = isDay ? 'Abweichung heute' : 'Abweichung 7 Tage';
  return `<p class="quote-sub quote-devrow"${dev.title ? ` title="${esc(dev.title)}"` : ''}><span>${name}</span><span>${esc(dev.text)}</span></p>`;
}
function forecastQuoteHtml(c, today) {
  return quoteForecastLine(c, today, 'day') + quoteForecastLine(c, today, '7');
}
function renderCharts(rows, today) {
  const rangeName = CHART_RANGES.find(r => r.id === chartRange)?.aria || '';
  seriesByCode.clear();
  const bits = [rangeBarHtml()];
  for (const c of rows) {
    const name = ccyName(c);
    const hideBtn = editing ? `<button type="button" class="ccy-hide" data-code="${esc(c.code)}" aria-label="${esc(name)} ausblenden">${ICON_MINUS}</button>` : '';
    const dragBtn = editing ? `<button type="button" class="ccy-drag" data-code="${esc(c.code)}" aria-label="${esc(name)} verschieben. Pfeiltasten ändern die Position." aria-keyshortcuts="ArrowUp ArrowDown">${ICON_DRAG}</button>` : '';
    const built = buildSeries(c.code, today);
    let body = '';
    if (built.status === 'loading') body = '<p class="quote-rate">–</p><p class="quote-meta">Lade Kursverlauf …</p>';
    else if (built.status === 'empty') {
      const empty = chartRange === '1T' || chartRange === '1W' ? 'Keine erfassten Kurse in diesem Zeitraum.' : 'Keine Tageskurse für diesen Zeitraum.';
      body = `<p class="quote-rate">–</p><p class="quote-meta">${empty}</p>`;
    } else {
      const plotted = plotSeries(built.points);
      seriesByCode.set(c.code, { points: plotted, rangeName });
      const first = plotted[0];
      const last = plotted[plotted.length - 1];
      const tone = plotted.length > 1 ? toneOf(last.v, first.v) : 'flat';
      const chg = plotted.length > 1 ? changeHtml(last.v, first.v) : '';
      const inv = inverseText(c.code, last.v);
      body = `<p class="quote-rate ${tone}">${r(last.v)}</p><p class="quote-inv"${inv ? '' : ' hidden'}>${esc(inv)}</p><p class="quote-meta">${chg}<span class="when">${chg ? ' · ' : ''}${esc(rangeName)}</span></p>${chartSvg(c.code, plotted, tone)}`;
    }
    bits.push(`<article class="quote-card ccy chart-card" data-code="${esc(c.code)}"><div class="ccy-head">${hideBtn}${ccyIdentity(c, '')}${dragBtn}</div>${body}${built.status === 'ready' ? forecastQuoteHtml(c, today) : ''}</article>`);
  }
  if (editing) bits.push(extraCurrenciesCard());
  return bits.join('');
}
function paintChart(card, point, idle) {
  const rec = seriesByCode.get(card.dataset.code);
  if (!rec || !rec.points.length) return;
  const first = rec.points[0];
  const shownPoint = point || rec.points[rec.points.length - 1];
  const several = rec.points.length > 1;
  const tone = several ? toneOf(shownPoint.v, first.v) : 'flat';
  const rate = card.querySelector('.quote-rate');
  const meta = card.querySelector('.quote-meta');
  const invText = inverseText(card.dataset.code, shownPoint.v);
  if (rate) {
    rate.className = `quote-rate ${tone}`;
    rate.textContent = r(shownPoint.v);
  }
  const inv = card.querySelector('.quote-inv');
  if (inv) {
    inv.textContent = invText;
    inv.hidden = !invText;
  }
  if (meta) {
    const when = idle || !several ? rec.rangeName : shownPoint.label;
    const chg = several ? changeHtml(shownPoint.v, first.v) : '';
    meta.innerHTML = `${chg}<span class="when">${chg ? ' · ' : ''}${esc(when)}</span>`;
  }
  const svg = card.querySelector('.plot');
  if (!svg) return;
  const tip = svg.querySelector('title');
  if (tip) {
    const when = idle || !several ? rec.rangeName : shownPoint.label;
    tip.textContent = chartTip(card.dataset.code, shownPoint.v, when);
  }
  svg.style.color = tone === 'down' ? 'var(--down)' : tone === 'up' ? 'var(--up)' : 'var(--muted)';
  const line = svg.querySelector('.scrub-line');
  const dot = svg.querySelector('.scrub-dot');
  const end = svg.querySelector('.end-dot');
  if (!line || !dot) return;
  if (idle || !several) {
    line.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    if (end) end.setAttribute('visibility', 'visible');
    return;
  }
  line.setAttribute('x1', shownPoint.x.toFixed(2));
  line.setAttribute('x2', shownPoint.x.toFixed(2));
  line.setAttribute('visibility', 'visible');
  dot.setAttribute('cx', shownPoint.x.toFixed(2));
  dot.setAttribute('cy', shownPoint.y.toFixed(2));
  dot.setAttribute('visibility', 'visible');
  if (end) end.setAttribute('visibility', 'hidden');
}
function nearestChartPoint(svg, clientX) {
  const card = svg.closest('.ccy');
  const rec = card && seriesByCode.get(card.dataset.code);
  if (!rec || !rec.points.length) return null;
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0) return null;
  const x = ((clientX - rect.left) / rect.width) * 320;
  let best = rec.points[0];
  let dist = Math.abs(best.x - x);
  for (const p of rec.points) {
    const d = Math.abs(p.x - x);
    if (d < dist) { best = p; dist = d; }
  }
  return { card, point: best };
}
function bindChartScrub() {
  const root = document.getElementById('compact');
  if (!root || root.dataset.scrub) return;
  root.dataset.scrub = '1';
  let gesture = null;
  const show = (svg, clientX) => {
    const hit = nearestChartPoint(svg, clientX);
    if (!hit) return;
    root.querySelectorAll('.chart-card').forEach(card => {
      if (card !== hit.card) paintChart(card, null, true);
    });
    paintChart(hit.card, hit.point, false);
  };
  root.addEventListener('pointerdown', e => {
    if (document.getElementById('scroller')?.dataset.pulling) return;
    const svg = e.target.closest?.('.plot');
    if (!svg || !root.contains(svg)) return;
    gesture = { id: e.pointerId, svg, x: e.clientX, y: e.clientY, scrub: e.pointerType === 'mouse' };
    if (gesture.scrub) show(svg, e.clientX);
  });
  root.addEventListener('pointermove', e => {
    if (document.getElementById('scroller')?.dataset.pulling) return;
    if (gesture && gesture.id === e.pointerId) {
      if (!gesture.scrub) {
        const dx = e.clientX - gesture.x;
        const dy = e.clientY - gesture.y;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
        gesture.scrub = true;
        try { gesture.svg.setPointerCapture(e.pointerId); } catch { /* der Zeiger kann schon weg sein */ }
      }
      show(gesture.svg, e.clientX);
      return;
    }
    if (e.pointerType !== 'mouse' || gesture) return;
    const svg = e.target.closest?.('.plot');
    if (svg && root.contains(svg)) show(svg, e.clientX);
  });
  const end = e => {
    if (!gesture || (e && gesture.id !== e.pointerId)) return;
    const card = gesture.svg.closest('.ccy');
    gesture = null;
    if (card) paintChart(card, null, true);
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('pointerleave', () => {
    if (gesture) return;
    root.querySelectorAll('.chart-card').forEach(card => paintChart(card, null, true));
  });
}
function wireChartRange(compact) {
  compact.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.range === chartRange) return;
      chartRange = btn.dataset.range;
      writeViewOptions();
      render({ keepScroll: true });
    });
  });
  const bar = compact.querySelector('.rangebar');
  if (!bar) return;
  bar.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const buttons = [...bar.querySelectorAll('[data-range]')];
    const i = Math.max(0, buttons.findIndex(b => b.getAttribute('aria-pressed') === 'true'));
    const n = e.key === 'ArrowRight' ? Math.min(buttons.length - 1, i + 1) : Math.max(0, i - 1);
    if (buttons[n] && buttons[n] !== buttons[i]) buttons[n].click();
    e.preventDefault();
  });
}
function extraCurrenciesCard() {
  if (!editing) return '';
  const hidden = currenciesInOrder().filter(c => hiddenSet().has(c.code));
  const disabled = hidden.length === 0;
  let more = `<button type="button" class="more-btn" aria-expanded="${moreOpen && !disabled ? 'true' : 'false'}"${disabled ? ' disabled' : ''}><span class="plus">${ICON_PLUS}</span><span class="more-label">Weitere Währungen…</span></button>`;
  if (moreOpen && !disabled) {
    more += hidden.map(c => `<button type="button" class="ccy-add" data-code="${esc(c.code)}" aria-label="${esc(ccyName(c))} einblenden"><span class="plus">${ICON_PLUS}</span>${ccyIdentity(c, '')}</button>`).join('');
  }
  return `<div class="quote-card more-card">${more}</div>`;
}
function renderCompact(rows, today) {
  const bits = [];
  for (const c of rows) {
    const name = ccyName(c);
    const hideBtn = editing ? `<button type="button" class="ccy-hide" data-code="${esc(c.code)}" aria-label="${esc(name)} ausblenden">${ICON_MINUS}</button>` : '';
    const dragBtn = editing ? `<button type="button" class="ccy-drag" data-code="${esc(c.code)}" aria-label="${esc(name)} verschieben. Pfeiltasten ändern die Position." aria-keyshortcuts="ArrowUp ArrowDown">${ICON_DRAG}</button>` : '';
    const q = quoteParts(c, today);
    const delta = deltaBits(q.v, q.basis, q.basisHour);
    if (delta.arrow.includes('flat')) delta.arrow = '';
    let when = '';
    if (q.live) {
      when = hmFmt.format(q.quoteAt || q.at);
      if (q.closed) when += ' · geschlossen';
    } else if (q.hour != null) when = `${pad(q.hour)}:00`;
    const since = q.basisHour != null ? `seit ${pad(q.basisHour)}:00` : '';
    const meta = [since, delta.text, when].filter(Boolean).join(' · ');
    const inv = inverseText(c.code, q.v);
    const ecbHit = latestOn(c, today, day => shownEcb(c, day));
    const ecbV = ecbHit && ecbHit.v;
    const ecbLabel = ecbHit && ecbHit.day === today ? 'EZB-Referenzkurs' : `EZB-Referenzkurs`;
    let extra = '';
    if (ecbV != null) extra += `<p class="quote-sub"><span>${esc(ecbLabel)}</span><span>${r(ecbV)}</span><span class="ecb-src">Quelle EZB</span></p>`;
    extra += forecastQuoteHtml(c, today);
    const rateTitle = [delta.title, inv].filter(Boolean).join('\n');
    bits.push(`<article class="quote-card ccy" data-code="${esc(c.code)}"><div class="ccy-head">${hideBtn}${ccyIdentity(c, '')}${dragBtn}</div><p class="quote-rate"${rateTitle ? ` title="${esc(rateTitle)}"` : ''}>${q.v == null ? '–' : delta.arrow + r(q.v)}</p>${inv ? `<p class="quote-inv">${esc(inv)}</p>` : ''}<p class="quote-meta">${meta ? esc(meta) : 'Kein Kurs'}</p>${extra}</article>`);
  }
  const more = extraCurrenciesCard();
  if (more) bits.push(more);
  return bits.join('');
}
function cssPx(el, name) {
  const n = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(n) ? n : 0;
}
/** Tagespalten so breit, dass eine ganze Zahl davon zwischen Beschriftung und rechtem Kartenrand liegt. */
function fitDayColumns(sc, dayCount) {
  const edge = cssPx(document.body, '--edge');
  const labelVar = cssPx(document.body, '--label-w');
  const apply = (labelW) => {
    const minDay = sc.clientWidth <= 700 ? 72 : 88;
    const viewW = Math.max(minDay, sc.clientWidth - labelW - edge * 2);
    const columns = Math.max(1, Math.floor(viewW / minDay));
    const dayW = viewW / columns;
    const cardW = Math.max(0, sc.clientWidth - edge * 2);
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--day-w', dayW + 'px');
    rootStyle.setProperty('--card-w', cardW + 'px');
    const width = `calc(${labelW}px + ${dayCount} * ${dayW}px)`;
    const grid = document.getElementById('grid');
    grid.style.width = width;
    grid.style.minWidth = width;
    grid.closest('main').style.minWidth = width;
    return { labelW, dayW, cardW };
  };
  apply(labelVar);
  let labelW = labelVar;
  const lab = document.querySelector('#grid thead .lab');
  if (lab) {
    const measured = lab.getBoundingClientRect().width;
    if (measured > 1 && Math.abs(measured - labelVar) > 1) labelW = measured;
  }
  const used = apply(labelW);
  const signature = `${used.labelW.toFixed(2)}|${used.dayW.toFixed(3)}|${dayCount}|${used.cardW.toFixed(2)}`;
  const changed = fitDayColumns.signature !== signature;
  fitDayColumns.signature = signature;
  return changed;
}
/** Heute bündig an den rechten Kartenrand, linke Kante auf einer Spaltengrenze. */
function pinToday(sc) {
  const today = document.querySelector('#grid thead th.today') || document.querySelector('#grid thead th:last-child');
  if (!today) { sc.scrollLeft = sc.scrollWidth; return; }
  const edge = cssPx(document.body, '--edge');
  const place = () => {
    const target = sc.getBoundingClientRect().left + sc.clientWidth - edge;
    sc.scrollLeft += today.getBoundingClientRect().right - target;
  };
  place();
  place();
}
function render(opts = {}) {
  if (drag) cancelDrag();
  const keepDrag = opts.focusDrag
    || (!opts.focusMore && typeof document !== 'undefined' && document.activeElement && document.activeElement.classList
      && document.activeElement.classList.contains('ccy-drag')
      ? document.activeElement.dataset.code : null);
  const today = zurichToday();
  const days = weekdayKeys(START, today < START ? START : today);
  const rows = visibleCurrencies();
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('compact', viewMode !== 'intervals');
    document.body.classList.toggle('charting', viewMode === 'chart');
  }
  if (viewMode !== 'intervals' && typeof document !== 'undefined') {
    const gen = ++chartGen;
    const sc = document.getElementById('scroller');
    const top = sc.scrollTop;
    const grid = document.getElementById('grid');
    const compact = document.getElementById('compact');
    grid.innerHTML = '';
    grid.hidden = true;
    grid.style.minWidth = '';
    grid.style.width = '';
    compact.hidden = false;
    const pending = viewMode === 'chart' ? neededHistory(rows) : [];
    compact.innerHTML = viewMode === 'chart' ? renderCharts(rows, today) : renderCompact(rows, today);
    if (viewMode === 'chart') wireChartRange(compact);
    grid.closest('main').style.minWidth = '';
    if (pending.length) {
      const range = chartRange;
      Promise.all(pending.map(code => ensureHistory(code, range))).then(() => {
        if (gen !== chartGen || viewMode !== 'chart' || chartRange !== range) return;
        render({ keepScroll: true });
      });
    }
    if (opts.focusMore) {
      const moreBtn = compact.querySelector('.more-btn');
      if (moreBtn) moreBtn.focus({ preventScroll: true });
    } else if (keepDrag) {
      const btn = compact.querySelector(`.ccy-drag[data-code="${CSS.escape(keepDrag)}"]`);
      if (btn) btn.focus({ preventScroll: true });
    }
    sc.scrollTop = top;
    document.getElementById('updated').textContent = history.updated ? `Erfasst: ${timeFmt.format(new Date(history.updated))}` : '';
    syncBaseButton();
    return;
  }
  const td = (k, html, cls = '', title = '') =>
    `<td class="${k === today ? 'today ' : ''}${cls}"${title ? ` title="${esc(title)}"` : ''}>${html}</td>`;
  const blanks = days.map(k => td(k, '')).join('');
  let h = `<colgroup><col class="c-lab">${days.map(() => '<col class="c-day">').join('')}</colgroup><thead><tr><th class="lab"><span class="lab-face">Zeit (CH)</span></th>` +
    days.map(k => `<th class="${k === today ? 'today' : ''}">${header(k)}</th>`).join('') + '</tr></thead>';
  for (const c of rows) {
    // Kopfzeile zeigt den Live-Kurs nur, wenn es keine Spalte für heute gibt (Wochenende) – sonst steht er in der Zeile «Aktuell»
    const lvV = !days.includes(today) ? shownLive(c) : null;
    const lv = lvV != null ? `<span class="live" title="Letzter Mittelkurs (Markt geschlossen)">${r(lvV)}</span>` : '';
    const name = ccyName(c);
    const hideBtn = editing ? `<button type="button" class="ccy-hide" data-code="${esc(c.code)}" aria-label="${esc(name)} ausblenden">${ICON_MINUS}</button>` : '';
    const dragBtn = editing ? `<button type="button" class="ccy-drag" data-code="${esc(c.code)}" aria-label="${esc(name)} verschieben. Pfeiltasten ändern die Position." aria-keyshortcuts="ArrowUp ArrowDown">${ICON_DRAG}</button>` : '';
    h += `<tbody class="ccy" data-code="${esc(c.code)}"><tr class="group"><th class="lab" scope="rowgroup"><div class="ccy-head">${hideBtn}${ccyIdentity(c, lv)}${dragBtn}</div></th>${blanks}</tr>`;
    const move = (v, basisHour, basisVal) => {
      if (v == null || basisVal == null || basisHour == null) return { arrow: '', title: '' };
      const d = v - basisVal;
      const arrow = d > EPS ? '<span class="arr up">▲</span>' : d < -EPS ? '<span class="arr down">▼</span>' : '<span class="arr flat">–</span>';
      return { arrow, title: `Veränderung seit ${pad(basisHour)}:00: ${r(d)}` };
    };
    const slotRow = (hr, alt, label) => {
      let row = `<tr class="${alt || ''}"><th class="lab">${label}</th>`;
      for (const k of days) {
        const v = shown(c, k, hr), basisHour = changeBasis(c, k);
        const delta = basisHour != null && hr > basisHour ? move(v, basisHour, shown(c, k, basisHour)) : { arrow: '', title: '' };
        row += td(k, v == null ? '–' : delta.arrow + r(v), v == null ? 'empty' : '', delta.title);
      }
      return row + '</tr>';
    };
    h += forecastTableRow(c, days, today, 'day');
    h += forecastTableRow(c, days, today, '7');
    HOURS.forEach((hr, i) => { h += slotRow(hr, i % 2 === 1 ? 'alt' : '', `${pad(hr)}:00`); });
    // Aktuell: Live-Kurs nur in der Spalte von heute, getrennt von den erfassten Zeitpunkten
    const L = c.code === 'CHF' ? live[baseCurrency] : live[c.code];
    const liveV = shownLive(c);
    h += `<tr class="now"><th class="lab" title="Live-Mittelkurs (biquote.io), abgerufen beim Öffnen bzw. Aktualisieren – wird nicht gespeichert">Aktuell${L ? ' ' + hmFmt.format(L.at) : ''}</th>`;
    for (const k of days) {
      if (k !== today || liveV == null || !L) { h += td(k, '–', 'empty'); continue; }
      const basisHour = changeBasis(c, k);
      const base = basisHour != null ? shown(c, k, basisHour) : null;
      let arrow = '', title = `Abgerufen ${hmFmt.format(L.at)}`;
      if (L.quoteAt) title += ` · Kurs von ${hmFmt.format(L.quoteAt)}`;
      if (L.closed) title += ' (Markt geschlossen)';
      if (base != null && base !== 0) {
        const d = liveV - base;
        arrow = d > EPS ? '<span class="arr up">▲</span>' : d < -EPS ? '<span class="arr down">▼</span>' : '<span class="arr flat">–</span>';
        title = `Veränderung seit ${pad(basisHour)}:00: ${r(d)} (${pctFmt.format((liveV / base - 1) * 100)} %)\n` + title;
      }
      h += td(k, arrow + r(liveV), L.closed ? 'stale' : '', title);
    }
    h += '</tr>';
    h += `<tr class="ecb"><th class="lab"><span class="lab-face">EZB-Referenz</span></th>${days.map(k => { const v = shownEcb(c, k); return td(k, r(v), v == null ? 'empty' : ''); }).join('')}</tr></tbody>`;
  }
  if (editing) {
    const hidden = currenciesInOrder().filter(c => hiddenSet().has(c.code));
    const disabled = hidden.length === 0;
    h += `<tbody class="more"><tr class="more"><th class="lab"><button type="button" class="more-btn" aria-expanded="${moreOpen && !disabled ? 'true' : 'false'}"${disabled ? ' disabled' : ''}><span class="plus">${ICON_PLUS}</span><span class="more-label">Weitere Währungen…</span></button></th>${blanks}</tr>`;
    if (moreOpen && !disabled) {
      for (const c of hidden) {
        h += `<tr class="add"><th class="lab"><button type="button" class="ccy-add" data-code="${esc(c.code)}" aria-label="${esc(ccyName(c))} einblenden"><span class="plus">${ICON_PLUS}</span>${ccyIdentity(c, '')}</button></th>${blanks}</tr>`;
      }
    }
    h += '</tbody>';
  }
  const sc = document.getElementById('scroller');
  const left = sc.scrollLeft;
  const top = sc.scrollTop;
  const grid = document.getElementById('grid');
  const compact = document.getElementById('compact');
  if (compact) { compact.hidden = true; compact.innerHTML = ''; }
  grid.hidden = false;
  grid.innerHTML = h;
  if (opts.focusMore) {
    const moreBtn = grid.querySelector('.more-btn');
    if (moreBtn) moreBtn.focus({ preventScroll: true });
  } else if (keepDrag) {
    const btn = grid.querySelector(`.ccy-drag[data-code="${CSS.escape(keepDrag)}"]`);
    if (btn) btn.focus({ preventScroll: true });
  }
  const geometryChanged = fitDayColumns(sc, days.length);
  if (opts.keepScroll && !geometryChanged) sc.scrollLeft = left;
  else pinToday(sc);
  sc.scrollTop = top;

  document.getElementById('updated').textContent = history.updated ? `Erfasst: ${timeFmt.format(new Date(history.updated))}` : '';
  syncBaseButton();
}

function showError(msg) { const e = document.getElementById('error'); e.hidden = !msg; e.textContent = msg || ''; }

async function load() {
  const rates = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
    .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
    .catch(e => e);
  const localView = readViewDoc();
  if (localView) applyTimesConfig(localView);
  else applyUnsetTimes();
  if (rates instanceof Error) {
    showError(navigator.onLine === false ? 'Keine Internetverbindung. Es werden die zuletzt geladenen Kurse angezeigt.' : `Die Kurse konnten nicht geladen werden (${rates.message}).`);
  } else {
    history = rates; history.days ||= {};
    showError('');
  }
  await loadBaseHint();
  render();
  await loadLive();
  registerCurrency(baseCurrency);
}
function spinReload() {
  const b = document.getElementById('reload');
  if (!b) return;
  b.classList.remove('spin');
  void b.offsetWidth;
  b.classList.add('spin');
}
/**
 * Ziehen am oberen Rand lädt Kurse und Live-Kurs neu, wie der Knopf Aktualisieren.
 * Dasselbe Muster ist in der iOS-App UIRefreshControl bzw. .refreshable.
 * Waagrechtes Scrollen und der Grafik-Scrubber bleiben unangetastet.
 */
function bindPullToRefresh() {
  const sc = document.getElementById('scroller');
  const ptr = document.getElementById('ptr');
  if (!sc || !ptr) return;
  const spin = ptr.querySelector('.ptr-spin');
  const rotor = ptr.querySelector('.ptr-spinner');
  const status = document.getElementById('ptrStatus');
  const THRESHOLD = 64;
  const HOLD = 52;
  let gesture = null;
  let refreshing = false;
  let offset = 0;

  function rubber(dy) {
    const t = Math.max(0, dy) * 0.55;
    const limit = 132;
    return Math.min(limit, (t * limit) / (t + limit * 0.45));
  }
  function place(px, spinning) {
    offset = px;
    const rect = sc.getBoundingClientRect();
    if (px <= 0) {
      ptr.hidden = true;
      ptr.classList.remove('spinning');
      ptr.style.height = '';
      delete sc.dataset.pulling;
      if (status) status.textContent = '';
      return;
    }
    ptr.hidden = false;
    ptr.style.height = `${px}px`;
    ptr.classList.toggle('spinning', !!spinning);
    ptr.style.setProperty('--ptr', Math.min(1, px / THRESHOLD).toFixed(3));
    spin.style.left = `${rect.left + rect.width / 2}px`;
    spin.style.top = `${rect.top + px / 2}px`;
    rotor.style.transform = spinning ? '' : `rotate(${(px * 2.6).toFixed(1)}deg)`;
    sc.dataset.pulling = '1';
    if (status) status.textContent = spinning ? 'Aktualisieren' : '';
    if (sc.scrollTop > 0) {
      const left = sc.scrollLeft;
      sc.scrollTop = 0;
      sc.scrollLeft = left;
    }
  }
  function track(px) {
    ptr.classList.remove('settle');
    place(px, false);
  }
  function settleTo(px, spinning) {
    ptr.classList.remove('settle');
    void ptr.offsetWidth;
    ptr.classList.add('settle');
    if (px > 0) { place(px, spinning); return; }
    offset = 0;
    ptr.classList.remove('spinning');
    ptr.style.height = '0px';
    ptr.style.setProperty('--ptr', '0');
    const rect = sc.getBoundingClientRect();
    spin.style.top = `${rect.top}px`;
    delete sc.dataset.pulling;
    if (status) status.textContent = '';
    const hide = () => { if (offset === 0) ptr.hidden = true; };
    ptr.addEventListener('transitionend', hide, { once: true });
    setTimeout(hide, 420);
  }
  function canStart(target) {
    if (refreshing || !target || !target.closest) return false;
    if (document.body.classList.contains('calc-editing')) return false;
    if (document.querySelector('dialog[open]')) return false;
    if (sc.scrollTop > 1) return false;
    if (target.closest('.ccy-drag, button, a, input, select, textarea, label')) return false;
    return true;
  }
  function begin(id, x, y, target) {
    gesture = canStart(target) ? { id, x, y, mode: null } : null;
  }
  function move(id, x, y, prevent) {
    if (!gesture || gesture.id !== id || refreshing) return;
    const dx = x - gesture.x;
    const dy = y - gesture.y;
    if (!gesture.mode) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) >= Math.abs(dy) || dy < 0 || sc.scrollTop > 1) { gesture = null; return; }
      gesture.mode = 'pull';
    }
    if (sc.scrollTop > 1) { gesture = null; track(0); return; }
    prevent();
    track(rubber(dy));
  }
  async function end(id) {
    if (!gesture || gesture.id !== id) return;
    const pulled = gesture.mode === 'pull' ? offset : 0;
    gesture = null;
    if (pulled < THRESHOLD) { settleTo(0, false); return; }
    refreshing = true;
    settleTo(HOLD, true);
    spinReload();
    try { await load(); }
    finally { refreshing = false; settleTo(0, false); }
  }

  sc.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { gesture = null; return; }
    const t = e.touches[0];
    begin(t.identifier, t.clientX, t.clientY, e.target);
  }, { passive: true });
  sc.addEventListener('touchmove', e => {
    if (!gesture || e.touches.length !== 1) return;
    const t = e.touches[0];
    move(t.identifier, t.clientX, t.clientY, () => { if (e.cancelable) e.preventDefault(); });
  }, { passive: false });
  sc.addEventListener('touchend', e => { end(e.changedTouches[0] && e.changedTouches[0].identifier); });
  sc.addEventListener('touchcancel', e => { end(e.changedTouches[0] && e.changedTouches[0].identifier); });
  sc.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    begin('mouse', e.clientX, e.clientY, e.target);
  });
  sc.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    move('mouse', e.clientX, e.clientY, () => e.preventDefault());
  });
  sc.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') end('mouse'); });
  sc.addEventListener('pointercancel', e => { if (e.pointerType === 'mouse') end('mouse'); });
}

async function fetchQuote(code) {
  const spec = PAIRS[code];
  if (!spec) return;
  try {
    const res = await fetch(`https://biquote.io/api/${spec.symbol}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const t = await res.json();
    let mid = t.mid ?? ((t.bid ?? 0) + (t.ask ?? 0)) / 2;
    if (spec.inv) mid = mid > 0 ? 1 / mid : 0;
    if (mid > 0) {
      const qt = t.lastQuoteAt || t.timestamp;
      live[code] = { v: mid, at: new Date(), quoteAt: qt ? new Date(qt) : null, closed: t.marketState ? t.marketState !== 'open' : !!t.stale };
    }
  } catch { /* ignorieren: Zeile bleibt leer bzw. zeigt den letzten Abruf */ }
}
async function loadLive() {
  // Aktueller Mittelkurs direkt von biquote.io (gleiche Quelle wie die Zeitpunkte; nur Anzeige, wird nicht gespeichert)
  const codes = visibleCurrencies().map(c => c.code).filter(code => code !== 'CHF');
  if (baseCurrency !== 'CHF' && !codes.includes(baseCurrency)) codes.push(baseCurrency);
  await Promise.all(codes.map(fetchQuote));
  render();
}
async function loadBaseHint() {
  baseHint = null;
  baseDaily = {};
  if (baseCurrency === 'CHF') return;
  const symbols = baseCurrency === 'EUR' ? 'CHF' : `${baseCurrency},CHF`;
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${START}..?base=EUR&symbols=${symbols}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const rates = data.rates || {};
    const days = Object.keys(rates).sort();
    for (const day of days) {
      const row = rates[day] || {};
      const chf = row.CHF;
      if (!(chf > 0)) continue;
      if (baseCurrency === 'EUR') baseDaily[day] = chf;
      else if (row[baseCurrency] > 0) baseDaily[day] = chf / row[baseCurrency];
    }
    const lastDay = days[days.length - 1];
    if (lastDay && baseDaily[lastDay] > 0) baseHint = baseDaily[lastDay];
  } catch { /* ohne Reihe bleibt die Zeile leer, bis die Erfassung den Kurs hat */ }
}
function registerCurrency(code) {
  if (runtime !== 'cloudflare' || !PAIRS[code] || code === 'EUR' || code === 'USD' || code === 'GBP') return;
  fetch('/api/currencies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ codes: [code] }),
  }).catch(() => {});
}
function initBase() {
  let saved = null;
  try { saved = localStorage.getItem(LS_BASE); } catch { saved = null; }
  if (saved && isSelectableBase(saved)) {
    baseCurrency = normalizeCurrency(saved);
    ensureCurrency(baseCurrency);
    return;
  }
  let existing = false;
  try { existing = !!(localStorage.getItem(LS_ORDER) || localStorage.getItem(LS_HIDDEN)); } catch { existing = false; }
  if (existing) {
    baseCurrency = 'CHF';
    try { localStorage.setItem(LS_BASE, 'CHF'); } catch { /* diese Sitzung bleibt bei CHF */ }
    return;
  }
  const languages = typeof navigator !== 'undefined' && navigator.languages ? [...navigator.languages] : [];
  const choice = firstInstallChoice(languages);
  baseCurrency = choice.base;
  for (const code of choice.order) ensureCurrency(code);
  try { localStorage.setItem(LS_BASE, choice.base); } catch { /* Anzeige gilt für diese Sitzung */ }
  persistOrder(choice.order.filter(code => code !== choice.base).map(code => ({ code })));
}
function setBaseCurrency(code) {
  const next = normalizeCurrency(code);
  if (!next || next === baseCurrency) return;
  ensureCurrency(next);
  const prev = baseCurrency;
  ensureCurrency(prev);
  const pool = currenciesInOrder().map(c => c.code);
  if (!pool.includes(prev)) pool.unshift(prev);
  baseCurrency = next;
  try { localStorage.setItem(LS_BASE, next); } catch { /* Anzeige gilt für diese Sitzung */ }
  persistOrder(pool.filter(c => c !== next).map(c => ({ code: c })));
}
function syncBaseButton() {
  const btn = document.getElementById('baseBtn');
  if (!btn) return;
  const name = ccyName({ code: baseCurrency });
  btn.textContent = `Preis in ${baseCurrency}`;
  btn.setAttribute('aria-label', `Berichtswährung ${name}`);
}
function renderBase() {
  const dlg = document.getElementById('baseDlg');
  let picked = baseCurrency;
  const draw = () => {
    const rows = baseChoices().map(code => {
      const current = code === baseCurrency;
      const selected = code === picked;
      const sub = current ? 'Berichtswährung' : code;
      return `<button type="button" class="base-row${current ? ' is-default' : ''}" role="option" data-code="${esc(code)}" aria-selected="${selected ? 'true' : 'false'}"><span class="flag">${flagSvg(code)}</span><span class="ccy-name"><span class="ccy-code">${esc(ccyName({ code }))}</span><span class="ccy-sub">${esc(sub)}</span></span><span class="base-sym">${esc(currencySymbol(code))}</span></button>`;
    }).join('');
    dlg.innerHTML = `<form method="dialog" class="dlghead"><h2>Berichtswährung</h2><button value="close" aria-label="Schliessen">${XMARK}</button></form>
      <p class="note">Alle Kurse auf diesem Gerät in dieser Währung.</p>
      <div class="base-list" role="listbox" aria-label="Währungen">${rows}</div>
      <div class="row end"><button id="baseSave" type="button" class="primary base-apply"${picked === baseCurrency ? ' disabled' : ''}>Als Berichtswährung festlegen</button></div>`;
    dlg.querySelectorAll('.base-row').forEach(btn => {
      btn.onclick = () => { picked = btn.dataset.code; draw(); };
    });
    const save = dlg.querySelector('#baseSave');
    save.onclick = async () => {
      const code = picked;
      setBaseCurrency(code);
      dlg.close();
      await loadBaseHint();
      render({ keepScroll: true });
      loadLive();
      registerCurrency(code);
    };
  };
  draw();
}

function csv() {
  const days = weekdayKeys(START, zurichToday() < START ? START : zurichToday());
  const num = v => (v == null ? '' : v.toFixed(6));
  const dmy = k => `${k.slice(8, 10)}.${k.slice(5, 7)}.${k.slice(0, 4)}`;
  const lines = [['Währung', 'Zeit', ...days.map(dmy)].join(';')];
  for (const c of visibleCurrencies()) {
    const L = `${c.label} in ${baseCurrency}`;
    lines.push([L, 'Prognose 16:00 (Schätzung)', ...days.map(k => num(shownForecast(c, k, 'day').value))].join(';'));
    lines.push([L, 'Prognose 7 Tage (Schätzung, Ziel +7 Tage 16:00)', ...days.map(k => num(shownForecast(c, k, '7').value))].join(';'));
    lines.push([L, 'Abweichung Ist − Prognose', ...days.map(k => { const f = shownForecast(c, k, 'day').value, a = shown(c, k, CLOSE_HOUR); return f != null && a != null ? num(a - f) : ''; })].join(';'));
    lines.push([L, 'Abweichung 7 Tage Ist − Prognose', ...days.map(k => { const f = shownForecast(c, k, '7').value, a = shownActual7(c, k); return f != null && a ? num(a.v - f) : ''; })].join(';'));
    HOURS.forEach(hr => {
      lines.push([L, `${pad(hr)}:00`, ...days.map(k => num(shown(c, k, hr)))].join(';'));
    });
    const lv = c.code === 'CHF' ? live[baseCurrency] : live[c.code];
    const liveV = shownLive(c);
    lines.push([L, lv ? `Aktuell ${hmFmt.format(lv.at)} (Live, nicht gespeichert)` : 'Aktuell', ...days.map(k => (k === zurichToday() && liveV != null ? num(liveV) : ''))].join(';'));
    lines.push([L, 'EZB-Referenzkurs', ...days.map(k => num(shownEcb(c, k)))].join(';'));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- FX-Alarme (data/fx-alerts.json, Bearbeiten mit GitHub-Token)
const REPO = 'BigYok61/currency';
const ALERTS_PATH = 'data/fx-alerts.json';
const TIMES_PATH = 'data/capture-times.json';
const STATE_PATH = 'data/fx-alert-state.json';
const DEFAULT_TIMES = { version: 2, start: '06', end: '20', intervalHours: 2 };
const LS_TOKEN = 'wu.ghToken';
const LS_TIMES = 'wu.captureTimes';
const LS_VIEW = 'wu.viewSchedule';
const LS_ALERT_ID = 'wu.alertId';
const LS_ALERT_TOPIC = 'wu.alertTopic';
const TIMES_FRESH_MS = 10 * 60 * 1000;
const ALERT_CODES = ['USD', 'EUR'];
const DEFAULT_ALERTS = { version: 1, currencies: { USD: { enabled: true, down: 0.5, up: 0.25 }, EUR: { enabled: true, down: 0.5, up: 0.25 } } };
const ghToken = () => localStorage.getItem(LS_TOKEN) || '';
/** 'github' auf Pages und lokal, 'cloudflare' wenn /api/runtime vom Worker kommt. */
let runtime = 'github';
let runtimePromise;
const canWrite = () => runtime === 'cloudflare' || !!ghToken();
const b64e = str => btoa(String.fromCharCode(...new TextEncoder().encode(str)));
const b64d = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), ch => ch.charCodeAt(0)));
let alertCfg = null, alertState = null;
const $ = id => document.getElementById(id);

async function ghGet(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=main`, { headers: { Authorization: `Bearer ${ghToken()}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (res.status === 404) return { sha: null, data: null };
  if (!res.ok) throw new Error(res.status === 401 ? 'Token ungültig oder abgelaufen' : res.status === 403 ? 'Kein Zugriff (Token für dieses Repository freigeben)' : `GitHub HTTP ${res.status}`);
  const j = await res.json();
  return { sha: j.sha, data: JSON.parse(b64d(j.content)) };
}
/** Öffentlich lesen (ohne Token): raw.githubusercontent.com, sonst die Kopie auf GitHub Pages */
async function publicGet(path) {
  for (const url of [`https://raw.githubusercontent.com/${REPO}/main/${path}?t=${Date.now()}`, `${path}?t=${Date.now()}`]) {
    try { const res = await fetch(url, { cache: 'no-store' }); if (res.ok) return await res.json(); } catch { /* nächste Quelle */ }
  }
  return null;
}
async function fetchJson(url) {
  try { const res = await fetch(url, { cache: 'no-store' }); if (res.ok) return await res.json(); } catch { /* Quelle nicht erreichbar */ }
  return null;
}
function timesConfigOk(data) {
  return !!(data && (parseSchedule(data) || (Array.isArray(data.hours) && data.hours.some(h => parseHour(h) != null))));
}
function timesEqual(a, b) {
  const sa = parseSchedule(a), sb = parseSchedule(b);
  if (sa && sb) return sa.start === sb.start && sa.end === sb.end && sa.intervalHours === sb.intervalHours;
  if (sa || sb) return false;
  if (!a || !b || !Array.isArray(a.hours) || !Array.isArray(b.hours)) return false;
  return sameHours(normalizeHours(a.hours), normalizeHours(b.hours));
}
/** Gerade gespeichertes Raster merken, damit eine veraltete öffentliche Kopie es nicht überschreibt. */
function rememberTimes(data) {
  try { localStorage.setItem(LS_TIMES, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* privater Modus oder voll */ }
}
function rememberedTimes() {
  try {
    const raw = localStorage.getItem(LS_TIMES);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || typeof rec.savedAt !== 'number' || !timesConfigOk(rec.data)) return null;
    if (Date.now() - rec.savedAt > TIMES_FRESH_MS) return null;
    return rec.data;
  } catch { return null; }
}
/**
 * Mit Token gewinnt die API. Ohne Token raw.githubusercontent vor der Pages-Kopie.
 * Ein in dieser Sitzung gespeichertes Raster (etwa 10 Minuten) schlägt eine ältere öffentliche Quelle.
 */
function pickTimes({ api, raw, pages, saved }) {
  if (timesConfigOk(api)) return api;
  const rawOk = timesConfigOk(raw), savedOk = timesConfigOk(saved);
  if (savedOk && rawOk && !timesEqual(saved, raw)) return saved;
  if (rawOk) return raw;
  if (savedOk) return saved;
  if (timesConfigOk(pages)) return pages;
  return null;
}
async function detectRuntime() {
  try {
    const res = await fetch(`api/runtime?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return 'github';
    const j = await res.json();
    if (j && j.runtime === 'cloudflare') return 'cloudflare';
  } catch { /* GitHub Pages oder lokale Datei */ }
  return 'github';
}
function readViewDoc() {
  try {
    const raw = localStorage.getItem(LS_VIEW);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (parseSchedule(data)) return data;
    if (data && Array.isArray(data.hours) && data.hours.some(h => parseHour(h) != null)) return data;
    return null;
  } catch { return null; }
}
function writeView(sch) {
  const data = { version: 2, start: pad(sch.start), end: pad(sch.end), intervalHours: sch.intervalHours };
  localStorage.setItem(LS_VIEW, JSON.stringify(data));
  return data;
}
function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
}
function ensureAlertIdentity() {
  let id = localStorage.getItem(LS_ALERT_ID) || '';
  let topic = localStorage.getItem(LS_ALERT_TOPIC) || '';
  if (!/^[a-f0-9]{64}$/.test(id) || !/^wae-[a-f0-9]{32}$/.test(topic)) {
    id = randomHex(32);
    topic = `wae-${randomHex(16)}`;
    localStorage.setItem(LS_ALERT_ID, id);
    localStorage.setItem(LS_ALERT_TOPIC, topic);
  }
  return { id, topic };
}
function clearAlertIdentity() {
  localStorage.removeItem(LS_ALERT_ID);
  localStorage.removeItem(LS_ALERT_TOPIC);
}
async function fetchTimes() {
  if (runtime === 'cloudflare') return readViewDoc();
  let api = null;
  if (ghToken()) {
    try {
      const { data } = await ghGet(TIMES_PATH);
      if (timesConfigOk(data)) api = data;
    } catch { /* öffentlich weiter */ }
  }
  const saved = rememberedTimes();
  if (timesConfigOk(api)) return pickTimes({ api, raw: null, pages: null, saved });
  const raw = await fetchJson(`https://raw.githubusercontent.com/${REPO}/main/${TIMES_PATH}?t=${Date.now()}`);
  const early = pickTimes({ api: null, raw, pages: null, saved });
  if (early) return early;
  const pages = await fetchJson(`${TIMES_PATH}?t=${Date.now()}`);
  return pickTimes({ api: null, raw, pages, saved });
}
let alertLoadError = '';
async function loadAlerts() {
  if (runtime === 'cloudflare') {
    alertLoadError = '';
    const { id } = ensureAlertIdentity();
    try {
      const res = await fetch(`api/alerts/${id}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 404) {
        alertCfg = structuredClone(DEFAULT_ALERTS);
        alertState = null;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alertCfg = await res.json();
      alertState = { date: zurichToday(), sent: alertCfg.sent || {} };
    } catch (e) {
      alertCfg = structuredClone(DEFAULT_ALERTS);
      alertState = null;
      alertLoadError = e.message || 'Alarme konnten nicht geladen werden';
    }
    return;
  }
  try { alertCfg = ghToken() ? (await ghGet(ALERTS_PATH)).data : await publicGet(ALERTS_PATH); } catch (e) { alertCfg = await publicGet(ALERTS_PATH); }
  alertCfg ||= structuredClone(DEFAULT_ALERTS);
  alertState = await publicGet(STATE_PATH);
}
async function alertError(res) {
  let detail = '';
  try { detail = (await res.json()).error || ''; } catch { /* Antwort ohne JSON */ }
  return detail || `HTTP ${res.status}`;
}
/** Änderung auf den aktuellen Stand im Repo anwenden und committen (bei Konflikt erneut) */
async function saveRepoFile(path, message, fallback, mutate) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { sha, data } = await ghGet(path);
    const cur = data || structuredClone(fallback);
    mutate(cur);
    const body = { message, branch: 'main', content: b64e(JSON.stringify(cur, null, 2) + '\n') };
    if (sha) body.sha = sha;
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, { method: 'PUT', headers: { Authorization: `Bearer ${ghToken()}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return cur;
    if (res.status !== 409 && res.status !== 422) throw new Error(res.status === 403 ? 'Token ohne Schreibrecht (Contents: Read and write)' : res.status === 401 ? 'Token ungültig oder abgelaufen' : `GitHub HTTP ${res.status}`);
  }
  throw new Error('Konflikt beim Speichern – bitte erneut versuchen');
}
async function saveAlerts(mutate) {
  if (runtime === 'cloudflare') {
    const { id, topic } = ensureAlertIdentity();
    const cur = structuredClone(DEFAULT_ALERTS);
    if (alertCfg?.currencies) cur.currencies = structuredClone(alertCfg.currencies);
    mutate(cur);
    const res = await fetch(`api/alerts/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, start: schedule.start, currencies: cur.currencies }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(await alertError(res));
    alertCfg = await res.json();
    alertState = { date: zurichToday(), sent: alertCfg.sent || {} };
    return;
  }
  alertCfg = await saveRepoFile(ALERTS_PATH, 'FX-Alarme geändert', DEFAULT_ALERTS, mutate);
}
function readAlertForm(dlg) {
  const vals = {};
  for (const inp of dlg.querySelectorAll('input[data-code]')) {
    const o = (vals[inp.dataset.code] ||= {});
    if (inp.dataset.k === 'enabled') o.enabled = inp.checked;
    else {
      const v = parseFloat(String(inp.value).replace(',', '.'));
      if (!(v > 0 && v <= 20)) return { error: `Ungültige Schwelle bei ${inp.dataset.code}/${baseCurrency} (0.01–20 %).` };
      o[inp.dataset.k] = Math.round(v * 100) / 100;
    }
  }
  return { vals };
}
function applyAlertForm(mutateVals) {
  return saveAlerts(cur => {
    cur.version ||= 1;
    cur.currencies ||= {};
    for (const [code, o] of Object.entries(mutateVals)) cur.currencies[code] = Object.assign(cur.currencies[code] || {}, o);
  });
}
function alertMsg(text, ok) { const m = $('alMsg'); if (m) { m.textContent = text || ''; m.className = ok ? 'msg ok' : 'msg err'; m.hidden = !text; } }
function sentLabel(sent, code) {
  return ['down', 'up'].filter(d => sent[`${code}:${d}`]).map(d => `${d === 'down' ? '▼' : '▲'} ${esc(sent[`${code}:${d}`].time || '')}`).join(' ') || '–';
}
function renderCloudAlerts() {
  const dlg = $('alerts');
  const { topic } = ensureAlertIdentity();
  const todayKey = zurichToday();
  const sent = alertState && alertState.date === todayKey ? alertState.sent || {} : {};
  const href = `https://ntfy.sh/${topic}`;
  let h = `<form method="dialog" class="dlghead"><h2>FX-Alarme</h2><button value="close" aria-label="Schliessen">${XMARK}</button></form>
    <p class="note">Gilt nur für dieses Gerät. Push, wenn sich der Kurs gegenüber ${pad(schedule.start)}:00 Schweizer Zeit (vorher: Tageseröffnung) stärker als die Schwelle bewegt. Werktags etwa 07:00–22:00, alle 15 Minuten, je Währung und Richtung höchstens einmal am Tag.</p>
    <p class="note">So abonnieren:</p>
    <ol class="steps">
      <li>ntfy-App installieren oder ntfy.sh öffnen.</li>
      <li>Dieses Thema abonnieren: <code class="topic">${esc(topic)}</code></li>
      <li>Schwellen speichern. Ein Test-Push prüft, ob die Meldung ankommt.</li>
    </ol>
    <div class="row"><a class="btnlink" href="${esc(href)}" target="_blank" rel="noopener">Thema abonnieren</a><button id="alTest" type="button">Test-Push senden</button></div>`;
  for (const code of ALERT_CODES) {
    const c = alertCfg?.currencies?.[code] || DEFAULT_ALERTS.currencies[code];
    h += `<section class="alcard"><h3>${code}/${esc(baseCurrency)}</h3>
      <label class="alfield"><span>Aktiv</span><input type="checkbox" data-code="${code}" data-k="enabled" ${c.enabled ? 'checked' : ''}></label>
      <label class="alfield"><span>Fällt um mehr als</span><span><input type="number" step="0.01" min="0.01" max="20" inputmode="decimal" data-code="${code}" data-k="down" value="${c.down}"> %</span></label>
      <label class="alfield"><span>Steigt um mehr als</span><span><input type="number" step="0.01" min="0.01" max="20" inputmode="decimal" data-code="${code}" data-k="up" value="${c.up}"> %</span></label>
      <p class="note">Heute gesendet: ${sentLabel(sent, code)}</p></section>`;
  }
  h += `<p id="alMsg" class="msg"${alertLoadError ? '' : ' hidden'}>${alertLoadError ? esc(alertLoadError) : ''}</p>
    <div class="row"><button id="alSave" type="button" class="primary">Speichern</button><button id="alDrop" type="button" class="danger">Abo löschen</button></div>`;
  dlg.innerHTML = h;
  if (alertLoadError) { const m = $('alMsg'); m.className = 'msg err'; }
  const saveFromForm = () => {
    const form = readAlertForm(dlg);
    if (form.error) { alertMsg(form.error); return null; }
    return form.vals;
  };
  $('alSave').onclick = async () => {
    const vals = saveFromForm();
    if (!vals) return;
    const sv = $('alSave');
    sv.disabled = true; alertMsg('Speichere …', true);
    try {
      await applyAlertForm(vals);
      renderCloudAlerts();
      alertMsg('Gespeichert. Gilt ab dem nächsten Lauf (alle 15 Min.).', true);
    } catch (e) { sv.disabled = false; alertMsg(`Speichern fehlgeschlagen: ${e.message}`); }
  };
  $('alTest').onclick = async () => {
    const vals = saveFromForm();
    if (!vals) return;
    const btn = $('alTest');
    btn.disabled = true; alertMsg('Sende Test-Push …', true);
    try {
      await applyAlertForm(vals);
      const { id } = ensureAlertIdentity();
      const res = await fetch(`api/alerts/${id}/test`, { method: 'POST', cache: 'no-store' });
      if (!res.ok) throw new Error(await alertError(res));
      renderCloudAlerts();
      alertMsg('Test-Push gesendet. In ntfy sollte «TEST» erscheinen.', true);
    } catch (e) { btn.disabled = false; alertMsg(`Test-Push fehlgeschlagen: ${e.message}`); }
  };
  $('alDrop').onclick = async () => {
    if (!confirm('Alarm und Thema auf diesem Gerät löschen?')) return;
    const { id } = ensureAlertIdentity();
    try {
      const res = await fetch(`api/alerts/${id}`, { method: 'DELETE', cache: 'no-store' });
      if (!res.ok) throw new Error(await alertError(res));
      clearAlertIdentity();
      alertCfg = structuredClone(DEFAULT_ALERTS);
      alertState = null;
      alertLoadError = '';
      renderCloudAlerts();
      alertMsg('Abo gelöscht. Es gibt ein neues Thema.', true);
    } catch (e) { alertMsg(`Löschen fehlgeschlagen: ${e.message}`); }
  };
}
function renderAlerts() {
  if (runtime === 'cloudflare') return renderCloudAlerts();
  const dlg = $('alerts'), rw = canWrite();
  const todayKey = zurichToday();
  const sent = alertState && alertState.date === todayKey ? alertState.sent || {} : {};
  let h = `<form method="dialog" class="dlghead"><h2>FX-Alarme (Push via ntfy)</h2><button value="close" aria-label="Schliessen">${XMARK}</button></form>
    <p class="note">Push, wenn sich der Kurs im Tagesverlauf gegenüber ${pad(schedule.start)}:00 Schweizer Zeit (vorher: Tageseröffnung) stärker als die Schwelle bewegt.
    Geprüft alle 15 Minuten, werktags ca. 07:00–22:00 Uhr; je Währung und Richtung höchstens eine Meldung pro Tag.</p>
    <table class="altab"><thead><tr><th>Paar</th><th>Aktiv</th><th class="n">Fällt um mehr als</th><th class="n">Steigt um mehr als</th><th>Heute gesendet</th></tr></thead><tbody>`;
  for (const code of ALERT_CODES) {
    const c = alertCfg?.currencies?.[code] || DEFAULT_ALERTS.currencies[code];
    h += `<tr><td>${code}/${esc(baseCurrency)}</td><td><input type="checkbox" data-code="${code}" data-k="enabled" ${c.enabled ? 'checked' : ''} ${rw ? '' : 'disabled'}></td>
      <td class="n"><input type="number" step="0.01" min="0.01" max="20" inputmode="decimal" data-code="${code}" data-k="down" value="${c.down}" ${rw ? '' : 'disabled'}> %</td>
      <td class="n"><input type="number" step="0.01" min="0.01" max="20" inputmode="decimal" data-code="${code}" data-k="up" value="${c.up}" ${rw ? '' : 'disabled'}> %</td><td>${sentLabel(sent, code)}</td></tr>`;
  }
  h += '</tbody></table><p id="alMsg" class="msg" hidden></p>';
  if (rw) h += '<div class="row"><button id="alSave" type="button" class="primary">Speichern</button><button id="tokOut" type="button" class="danger">Token entfernen</button></div>';
  else h += `<p class="note">Nur lesbar. Zum Ändern einmalig einen GitHub-Token (Fine-grained, nur Repository ${REPO}, Contents: Read and write) eintragen –
    oder die Datei direkt auf GitHub bearbeiten: <a href="https://github.com/${REPO}/edit/main/${ALERTS_PATH}" target="_blank" rel="noopener">${ALERTS_PATH}</a>.</p>
    <div class="row"><input id="tok" type="password" placeholder="GitHub-Token (github_pat_…)" autocomplete="off"><button id="tokSave" type="button">Token speichern</button></div>
    <p class="note">Der Token wird nur in diesem Browser gespeichert (localStorage) und nur an api.github.com gesendet.</p>`;
  dlg.innerHTML = h;
  const sv = $('alSave');
  if (sv) sv.onclick = async () => {
    const form = readAlertForm(dlg);
    if (form.error) return alertMsg(form.error);
    sv.disabled = true; alertMsg('Speichere …', true);
    try {
      await applyAlertForm(form.vals);
      renderAlerts(); alertMsg('Gespeichert. Gilt ab dem nächsten Lauf (alle 15 Min.).', true);
    } catch (e) { sv.disabled = false; alertMsg(`Speichern fehlgeschlagen: ${e.message}`); }
  };
  const ts = $('tokSave');
  if (ts) ts.onclick = async () => {
    const t = $('tok').value.trim(); if (!t) return;
    localStorage.setItem(LS_TOKEN, t);
    try { alertCfg = (await ghGet(ALERTS_PATH)).data || alertCfg; renderAlerts(); alertMsg('Token gespeichert – Bearbeiten ist aktiv.', true); }
    catch (e) { localStorage.removeItem(LS_TOKEN); alertMsg(`Token abgelehnt: ${e.message}`); }
  };
  const to = $('tokOut'); if (to) to.onclick = () => { localStorage.removeItem(LS_TOKEN); renderAlerts(); };
}
async function openAlerts() {
  const dlg = $('alerts');
  dlg.innerHTML = '<p class="note">Lade …</p>';
  dlg.showModal();
  await loadAlerts();
  renderAlerts();
  const tok = $('tok');
  if (tok) tok.focus();
}
if (typeof document !== 'undefined') {
$('alerts').addEventListener('close', () => { if ($('times').open) renderTimes(); });
}
// ------------------------------------------------------- Erfassungszeiten (data/capture-times.json)
function tmMsg(text, ok) { const m = $('tmMsg'); if (m) { m.textContent = text || ''; m.className = ok ? 'msg ok' : 'msg err'; m.hidden = !text; } }
function measurementCaption(n) {
  return n === 1 ? '1 Messung pro Tag' : `${n} Messungen pro Tag`;
}
function previewPills(hours) {
  return hours.map(hr => `<span class="pill">${pad(hr)}</span>`).join('');
}
function timeOptions(selected) {
  let html = '';
  for (let hr = 0; hr < 24; hr++) html += `<option value="${hr}"${hr === selected ? ' selected' : ''}>${pad(hr)}:00</option>`;
  return html;
}
function renderTimes() {
  const dlg = $('times');
  const onWorker = runtime === 'cloudflare';
  const rw = onWorker || !!ghToken();
  let h = `<form method="dialog" class="dlghead"><h2>Erfassungszeiten</h2><button value="close" aria-label="Schliessen">${XMARK}</button></form>
    <p class="note">${runtime === 'cloudflare' ? 'Gilt nur für die Anzeige auf diesem Gerät. Volle Stunden Schweizer Zeit, von–bis.' : 'Volle Stunden Schweizer Zeit, von–bis.'}</p>
    <div class="tm">
      <div class="tm-row"><label for="tmStart">Von</label><select id="tmStart" class="tm-time">${timeOptions(schedule.start)}</select></div>
      <div class="tm-row"><label for="tmEnd">Bis</label><select id="tmEnd" class="tm-time">${timeOptions(schedule.end)}</select></div>
      <div class="tm-row tm-interval"><span id="tmIntLabel">Intervall</span>
        <div class="seg" role="group" aria-labelledby="tmIntLabel">${INTERVALS.map(n => `<button type="button" class="segbtn" data-step="${n}" aria-pressed="${n === schedule.intervalHours ? 'true' : 'false'}">${n} h</button>`).join('')}</div>
      </div>
    </div>
    <div class="tm-preview" aria-live="polite"><div id="tmPills" class="pills"></div><p id="tmCount" class="tm-count"></p></div>
    <p id="tmExtra" class="note" hidden></p>
    <p id="tmMsg" class="msg" hidden></p>`;
  if (rw) h += '<div class="row end"><button id="tmSave" type="button" class="primary">Speichern</button></div>';
  else if (!onWorker) h += '<button type="button" id="tmConnect" class="tm-link">Zum Speichern mit GitHub verbinden</button>';
  dlg.innerHTML = h;
  const readForm = () => ({
    start: Number($('tmStart').value),
    end: Number($('tmEnd').value),
    intervalHours: Number(dlg.querySelector('.segbtn[aria-pressed="true"]')?.dataset.step || schedule.intervalHours),
  });
  const refresh = () => {
    const sch = readForm();
    const pattern = expandSchedule(sch.start, sch.end, sch.intervalHours);
    const pills = $('tmPills'), count = $('tmCount'), extra = $('tmExtra'), save = $('tmSave');
    const notes = [];
    if (!pattern.length) {
      pills.innerHTML = '';
      count.textContent = 'Beginn muss vor dem Ende liegen.';
      extra.hidden = true;
      if (save) save.disabled = true;
      return null;
    }
    pills.innerHTML = previewPills(pattern);
    count.textContent = measurementCaption(pattern.length);
    if (!timesFit) notes.push('Die gespeicherte Liste folgt keinem Von/Bis-Raster und gilt bis zum Speichern.');
    extra.hidden = notes.length === 0;
    extra.textContent = notes.join(' ');
    if (save) save.disabled = false;
    return sch;
  };
  dlg.querySelectorAll('.segbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      dlg.querySelectorAll('.segbtn').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
      refresh();
    });
  });
  const seg = dlg.querySelector('.seg');
  if (seg) seg.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const btns = [...dlg.querySelectorAll('.segbtn')];
    if (!btns.length) return;
    const i = Math.max(0, btns.findIndex(b => b.getAttribute('aria-pressed') === 'true'));
    const n = e.key === 'ArrowRight' ? Math.min(btns.length - 1, i + 1) : Math.max(0, i - 1);
    if (btns[n] !== btns[i]) { btns[n].click(); btns[n].focus(); }
    e.preventDefault();
  });
  $('tmStart').addEventListener('change', refresh);
  $('tmEnd').addEventListener('change', refresh);
  refresh();
  const sv = $('tmSave');
  if (sv) sv.onclick = async () => {
    const sch = readForm();
    if (!expandSchedule(sch.start, sch.end, sch.intervalHours).length) return tmMsg('Beginn muss vor dem Ende liegen.');
    sv.disabled = true; tmMsg('Speichere …', true);
    try {
      if (runtime === 'cloudflare') {
        try { writeView(sch); } catch { /* Anzeige gilt trotzdem für diese Sitzung */ }
      } else {
        const saved = await saveRepoFile(TIMES_PATH, 'Erfassungszeiten geändert', DEFAULT_TIMES, cur => {
          cur.version = 2;
          cur.start = pad(sch.start);
          cur.end = pad(sch.end);
          cur.intervalHours = sch.intervalHours;
          delete cur.hours;
        });
        rememberTimes(saved);
      }
      schedule = sch;
      HOURS = hoursFromSchedule(sch);
      timesFit = true;
      render({ keepScroll: true });
      renderTimes();
      tmMsg(runtime === 'cloudflare'
        ? 'Gespeichert. Tabelle und Tagesgrafik zeigen jetzt dieses Raster.'
        : 'Gespeichert. Erfassung und Seitenveröffentlichung laufen jetzt; fehlende Kurse der letzten ca. 7 Tage werden nachgetragen. Neue Zeilen zeigen «–», bis ein Kurs erfasst ist.', true);
    } catch (e) { sv.disabled = false; tmMsg(`Speichern fehlgeschlagen: ${e.message}`); }
  };
  const connect = $('tmConnect');
  if (connect) connect.onclick = () => {
    const sch = readForm();
    schedule = sch;
    openAlerts();
  };
}
const SET_EYE = '<svg class="sym" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.2 12S6.2 6.4 12 6.4 21.8 12 21.8 12 17.8 17.6 12 17.6 2.2 12 2.2 12z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="#fff" stroke-width="1.8"/></svg>';
const SET_CLOCK = '<svg class="sym" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="7.4" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M12 8.1V12l2.7 1.7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SET_BELL = '<svg class="sym" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 16.2h12c-.7-1.1-.9-2.5-.9-4.4 0-3.1-1.7-5.1-4.3-5.5V5.5a.8.8 0 0 0-1.6 0v.8c-2.6.4-4.3 2.4-4.3 5.5 0 1.9-.2 3.3-.9 4.4z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 16.5a2 2 0 0 0 4 0" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>';
const SET_NOTE = '<svg class="sym" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.2" y="6.2" width="17.6" height="11.6" rx="2" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="12" cy="12" r="2.15" fill="none" stroke="#fff" stroke-width="1.7"/></svg>';
function viewModeName() {
  if (viewMode === 'chart') return 'Grafik';
  if (viewMode === 'compact') return 'Nur aktuell';
  return 'Intervalle';
}
function timesSummary() {
  if (!schedule || schedule.start == null || schedule.end == null || schedule.intervalHours == null) return '';
  return `${pad(schedule.start)}–${pad(schedule.end)} · ${schedule.intervalHours} h`;
}
function renderSettings() {
  const row = (go, kind, glyph, title, value) =>
    `<button type="button" class="set-row" data-go="${go}"><span class="set-ico set-ico-${kind}" aria-hidden="true">${glyph}</span><span class="set-title">${title}</span>${value ? `<span class="set-value">${esc(value)}</span>` : ''}<span class="chev">${CHEV}</span></button>`;
  $('settings').innerHTML = `<form method="dialog" class="dlghead"><h2>Einstellungen</h2><button class="done" value="close">Fertig</button></form>
    <div class="set-list">
      ${row('view', 'view', SET_EYE, 'Ansicht', viewModeName())}
      ${row('times', 'time', SET_CLOCK, 'Erfassungszeiten', timesSummary())}
      ${row('alerts', 'bell', SET_BELL, 'Alarme', '')}
      ${row('base', 'base', SET_NOTE, 'Berichtswährung', baseCurrency)}
    </div>
    <p class="app-version">Währungen · ${appVersionLabel()}</p>`;
}
function renderView() {
  const sw = (id, on, label) => `<div class="tm-row"><span id="${id}Label">${label}</span><button type="button" class="switch" id="${id}" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-labelledby="${id}Label"></button></div>`;
  const modes = [['intervals', 'Intervalle'], ['chart', 'Grafik'], ['compact', 'Nur aktuell']];
  const seg = modes.map(([id, label]) => `<button type="button" class="segbtn" role="radio" data-mode="${id}" aria-checked="${viewMode === id ? 'true' : 'false'}">${label}</button>`).join('');
  $('viewDlg').innerHTML = `<div class="dlghead nav"><button type="button" id="viewBack" class="back">Einstellungen</button><h2>Ansicht</h2><button type="button" id="viewClose" aria-label="Schliessen">${XMARK}</button></div>
    <div class="tm">
      <div class="tm-row tm-interval"><span id="viewModeLabel">Darstellung</span><div class="seg view-seg" role="radiogroup" aria-labelledby="viewModeLabel">${seg}</div></div>
    </div>
    <p class="sec-label">Prognosen</p>
    <div class="tm">
      ${sw('swFcDay', showFcDay, 'Prognose heute')}
      ${sw('swDevDay', showDevDay, 'Abweichung heute')}
      ${sw('swFcWeek', showFcWeek, 'Prognose 7 Tage')}
      ${sw('swDevWeek', showDevWeek, 'Abweichung 7 Tage')}
    </div>
    <p class="note">Gilt nur für dieses Gerät.</p>`;
  const flips = [
    ['swFcDay', () => showFcDay, v => { showFcDay = v; }],
    ['swDevDay', () => showDevDay, v => { showDevDay = v; }],
    ['swFcWeek', () => showFcWeek, v => { showFcWeek = v; }],
    ['swDevWeek', () => showDevWeek, v => { showDevWeek = v; }],
  ];
  for (const [id, get, set] of flips) {
    $('viewDlg').querySelector('#' + id).onclick = () => {
      set(!get());
      writeViewOptions();
      $('viewDlg').querySelector('#' + id).setAttribute('aria-checked', get() ? 'true' : 'false');
      render({ keepScroll: true });
    };
  }
  const group = $('viewDlg').querySelector('.view-seg');
  const pick = mode => {
    if (mode !== 'intervals' && mode !== 'chart' && mode !== 'compact') return;
    viewMode = mode;
    writeViewOptions();
    group.querySelectorAll('[data-mode]').forEach(btn => btn.setAttribute('aria-checked', btn.dataset.mode === viewMode ? 'true' : 'false'));
    render({ keepScroll: true });
  };
  group.querySelectorAll('[data-mode]').forEach(btn => { btn.onclick = () => pick(btn.dataset.mode); });
  group.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const buttons = [...group.querySelectorAll('[data-mode]')];
    const i = Math.max(0, buttons.findIndex(b => b.getAttribute('aria-checked') === 'true'));
    const n = e.key === 'ArrowRight' ? Math.min(buttons.length - 1, i + 1) : Math.max(0, i - 1);
    if (buttons[n] && buttons[n] !== buttons[i]) { pick(buttons[n].dataset.mode); buttons[n].focus(); }
    e.preventDefault();
  });
  $('viewBack').onclick = () => { $('viewDlg').close(); renderSettings(); $('settings').showModal(); };
  $('viewClose').onclick = () => $('viewDlg').close();
}
async function openTimes() {
  runtime = await runtimePromise || runtime;
  const dlg = $('times');
  dlg.innerHTML = '<p class="note">Lade …</p>';
  dlg.showModal();
  const data = await fetchTimes();
  if (data) applyTimesConfig(data);
  render({ keepScroll: true });
  renderTimes();
}
const LS_COACH = 'wu.seenSettingsHint';
function showSettingsCoach() {
  let seen = true;
  try { seen = localStorage.getItem(LS_COACH) === '1'; } catch { return; }
  if (seen) return;
  const btn = $('settingsBtn');
  if (!btn) return;
  const tip = document.createElement('div');
  tip.className = 'coach';
  tip.setAttribute('role', 'status');
  tip.innerHTML = '<p>Einstellungen: Ansicht, Erfassungszeiten, Alarme</p>';
  document.body.appendChild(tip);
  const place = () => {
    const r = btn.getBoundingClientRect();
    tip.style.top = `${Math.round(r.bottom + 8)}px`;
    tip.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
  };
  place();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) tip.classList.add('in');
  else requestAnimationFrame(() => tip.classList.add('in'));
  try { localStorage.setItem(LS_COACH, '1'); } catch { /* diese Sitzung zeigt ihn trotzdem nur einmal */ }
  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    tip.classList.remove('in');
    const remove = () => { if (tip.parentNode) tip.remove(); };
    tip.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 280);
  };
  tip.addEventListener('click', dismiss);
  btn.addEventListener('click', dismiss, { once: true });
  setTimeout(dismiss, 5600);
  window.addEventListener('resize', () => { if (!gone) place(); });
}
if (typeof document !== 'undefined') {
initBase();
readViewOptions();
syncBaseButton();
bindChartScrub();
bindPullToRefresh();
runtimePromise = detectRuntime().then(mode => { runtime = mode; return mode; });
showSettingsCoach();
const baseBtn = $('baseBtn');
if (baseBtn) baseBtn.addEventListener('click', () => {
  renderBase();
  $('baseDlg').showModal();
});
const settingsBtn = $('settingsBtn');
if (settingsBtn) settingsBtn.addEventListener('click', () => {
  renderSettings();
  $('settings').showModal();
});
$('settings').addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (!go || go.disabled) return;
  $('settings').close();
  if (go.dataset.go === 'view') {
    renderView();
    $('viewDlg').showModal();
    if (e.detail > 0 && document.activeElement && document.activeElement.classList.contains('back')) document.activeElement.blur();
  } else if (go.dataset.go === 'times') openTimes();
  else if (go.dataset.go === 'base') { renderBase(); $('baseDlg').showModal(); }
  else runtimePromise.then(() => openAlerts());
});

function placeDrag(dy) {
  const mid = drag.rects[drag.from].top + drag.height / 2 + dy;
  let index = 0;
  for (let i = 0; i < drag.rects.length; i++) {
    const m = drag.rects[i].top + drag.rects[i].height / 2;
    if (mid >= m) index = i;
  }
  drag.index = index;
  const { list, from, height } = drag;
  list.forEach((el, i) => {
    if (i === from) {
      el.style.setProperty('--move', `${dy}px`);
      return;
    }
    let shift = 0;
    if (index > from && i > from && i <= index) shift = -height;
    else if (index < from && i < from && i >= index) shift = height;
    if (shift === 0) {
      el.classList.remove('shift');
      el.style.removeProperty('--move');
    } else {
      el.classList.add('shift');
      el.style.setProperty('--move', `${shift}px`);
    }
  });
}
function startDrag(e) {
  if (!editing || drag) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const handle = e.target.closest('.ccy-drag');
  if (!handle || !handle.closest('main')) return;
  const tbody = handle.closest('.ccy');
  if (!tbody) return;
  e.preventDefault();
  const list = [...document.querySelectorAll('#grid tbody.ccy, #compact .ccy')];
  const rects = list.map(el => {
    const r = el.getBoundingClientRect();
    return { top: r.top, height: r.height };
  });
  const from = list.indexOf(tbody);
  drag = {
    code: handle.dataset.code,
    pointerId: e.pointerId,
    startY: e.clientY,
    from,
    index: from,
    list,
    rects,
    height: rects[from].height,
  };
  try { handle.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
  tbody.classList.add('lift');
  document.body.classList.add('dragging');
  placeDrag(0);
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(8); } catch { /* Gerät ohne Vibration */ }
  }
}
function moveDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  e.preventDefault();
  placeDrag(e.clientY - drag.startY);
}
function endDrag(e, commit) {
  if (!drag || (e && e.pointerId !== drag.pointerId)) return;
  const state = drag;
  if (commit && state.index !== state.from) {
    cancelDrag();
    const visible = visibleCurrencies();
    const next = visible.slice();
    const [item] = next.splice(state.from, 1);
    next.splice(state.index, 0, item);
    applyVisibleOrder(next);
    announce(`${ccyName(item)}, Position ${state.index + 1} von ${next.length}`);
    render({ keepScroll: true, focusDrag: state.code });
    return;
  }
  const el = state.list[state.from];
  drag = null;
  document.body.classList.remove('dragging');
  for (const other of state.list) {
    if (other === el) continue;
    other.classList.remove('shift');
    other.style.removeProperty('--move');
  }
  if (el) {
    el.classList.remove('lift');
    el.classList.add('shift');
    el.style.setProperty('--move', '0px');
    const done = () => {
      el.classList.remove('shift');
      el.style.removeProperty('--move');
    };
    el.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 320);
  }
  const btn = document.querySelector(`#grid .ccy-drag[data-code="${CSS.escape(state.code)}"]`);
  if (btn) btn.focus({ preventScroll: true });
}
function syncEditButton() {
  const btn = document.getElementById('editBtn');
  document.body.classList.toggle('editing', editing);
  if (!btn) return;
  btn.setAttribute('aria-pressed', editing ? 'true' : 'false');
  btn.setAttribute('aria-label', editing ? 'Fertig' : 'Bearbeiten');
}

const editBtn = document.getElementById('editBtn');
if (editBtn) editBtn.addEventListener('click', () => {
  editing = !editing;
  if (!editing) moreOpen = false;
  syncEditButton();
  render({ keepScroll: true });
});
const scrollerEl = document.getElementById('scroller');
if (scrollerEl && typeof ResizeObserver !== 'undefined') {
  let refitLock = false;
  new ResizeObserver(() => {
    if (refitLock || viewMode !== 'intervals') return;
    const days = document.querySelectorAll('#grid thead th:not(.lab)').length;
    if (!days) return;
    refitLock = true;
    const changed = fitDayColumns(scrollerEl, days);
    if (changed) pinToday(scrollerEl);
    refitLock = false;
  }).observe(scrollerEl);
}
document.querySelector('main').addEventListener('click', e => {
  const hide = e.target.closest('.ccy-hide');
  if (hide) { hideCurrency(hide.dataset.code); return; }
  const add = e.target.closest('.ccy-add');
  if (add) { showCurrency(add.dataset.code); return; }
  const more = e.target.closest('.more-btn');
  if (more && !more.disabled) {
    moreOpen = !moreOpen;
    render({ keepScroll: true, focusMore: true });
  }
});
document.querySelector('main').addEventListener('keydown', e => {
  const handle = e.target.closest('.ccy-drag');
  if (!handle) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  moveCurrency(handle.dataset.code, e.key === 'ArrowUp' ? 'up' : 'down', { focus: true });
});
document.querySelector('main').addEventListener('pointerdown', startDrag);
document.addEventListener('pointermove', moveDrag, { passive: false });
document.addEventListener('pointerup', e => endDrag(e, true));
document.addEventListener('pointercancel', e => endDrag(e, false));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !drag) return;
  e.preventDefault();
  const code = drag.code;
  cancelDrag();
  render({ keepScroll: true, focusDrag: code });
});
document.getElementById('reload').addEventListener('click', () => {
  spinReload();
  load();
});
document.getElementById('csv').addEventListener('click', e => {
  e.preventDefault();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv()], { type: 'text/csv;charset=utf-8' }));
  a.download = `Waehrungen_${zurichToday()}.csv`; a.click();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
setInterval(load, 10 * 60 * 1000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
runtimePromise.then(() => load());
}
