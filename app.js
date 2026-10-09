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
const CCY_NAMES = { EUR: 'Euro', USD: 'US-Dollar', GBP: 'Britisches Pfund' };
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
const INTERVALS = [1, 2, 3, 4, 8, 12, 24];
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
function applyTimesConfig(data) {
  const sch = parseSchedule(data);
  if (sch) {
    schedule = sch;
    HOURS = hoursFromSchedule(sch);
    timesFit = true;
    return;
  }
  if (data && Array.isArray(data.hours) && data.hours.length) {
    HOURS = normalizeHours(data.hours);
    const inferred = matchSchedule(HOURS);
    if (inferred) { schedule = inferred; timesFit = true; }
    else { schedule = { ...DEFAULT_SCHEDULE }; timesFit = false; }
    return;
  }
  schedule = { ...DEFAULT_SCHEDULE };
  HOURS = hoursFromSchedule(schedule);
  timesFit = true;
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
/** Stunde für «Veränderung seit …»: Start, sonst erste erfasste Stunde des Tages, sonst 08:00. */
function changeBasis(c, dayKey) {
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
function currenciesInOrder() {
  const base = defaultCurrencies();
  const saved = orderCodes();
  if (!saved) return base;
  const byCode = new Map(CURRENCIES.map(c => [c.code, c]));
  const seen = new Set();
  const out = [];
  for (const code of saved) {
    if (seen.has(code) || !byCode.has(code)) continue;
    out.push(byCode.get(code));
    seen.add(code);
  }
  for (const c of base) if (!seen.has(c.code)) out.push(c);
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
    const known = new Set(CURRENCIES.map(c => c.code));
    return new Set(arr.filter(code => typeof code === 'string' && known.has(code)));
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
function ccyName(c) { return CCY_NAMES[c.code] || c.label; }
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
  } else {
    const c = CURRENCIES.find(x => x.code === code);
    svg = `<span class="flag-emoji">${c ? c.flag : ''}</span>`;
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
  const item = CURRENCIES.find(c => c.code === code);
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
function render(opts = {}) {
  if (drag) cancelDrag();
  const keepDrag = opts.focusDrag
    || (!opts.focusMore && typeof document !== 'undefined' && document.activeElement && document.activeElement.classList
      && document.activeElement.classList.contains('ccy-drag')
      ? document.activeElement.dataset.code : null);
  const today = zurichToday();
  const days = weekdayKeys(START, today < START ? START : today);
  const shown = visibleCurrencies();
  const td = (k, html, cls = '', title = '') =>
    `<td class="${k === today ? 'today ' : ''}${cls}"${title ? ` title="${esc(title)}"` : ''}>${html}</td>`;
  const blanks = days.map(k => td(k, '')).join('');
  let h = `<colgroup><col class="c-lab">${days.map(() => '<col class="c-day">').join('')}</colgroup><thead><tr><th class="lab">Zeit (CH)</th>` +
    days.map(k => `<th class="${k === today ? 'today' : ''}">${header(k)}</th>`).join('') + '</tr></thead>';
  for (const c of shown) {
    // Kopfzeile zeigt den Live-Kurs nur, wenn es keine Spalte für heute gibt (Wochenende) – sonst steht er in der Zeile «Aktuell»
    const lv = live[c.code] && !days.includes(today) ? `<span class="live" title="Letzter Mittelkurs (Markt geschlossen)">${r(live[c.code].v)}</span>` : '';
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
        const v = val(c, k, hr), basisHour = changeBasis(c, k);
        const shown = basisHour != null && hr > basisHour ? move(v, basisHour, val(c, k, basisHour)) : { arrow: '', title: '' };
        row += td(k, v == null ? '–' : shown.arrow + r(v), v == null ? 'empty' : '', shown.title);
      }
      return row + '</tr>';
    };
    // Prognosen vor den Uhrzeiten. Die Basis ist die Startstunde (bei älteren Prognosen 08:00).
    h += '<tr class="fc"><th class="lab" title="Schätzung, keine Anlageberatung">Prognose Tagesende *</th>';
    for (const k of days) {
      const shownFc = displayForecast(c, k, 'day');
      const f = shownFc.value, basisHour = shownFc.basis;
      const base = basisHour != null ? val(c, k, basisHour) : null;
      let arrow = '';
      if (f != null && base != null) {
        const d = f - base;
        arrow = `<span class="fcarr" title="${d < -EPS ? 'Erwartung: CHF stärker' : d > EPS ? 'Erwartung: CHF schwächer' : 'Erwartung: unverändert'}">${d < -EPS ? '↓' : d > EPS ? '↑' : '→'}</span>`;
      }
      const title = f == null ? '' : `Schätzung, keine Anlageberatung${basisHour != null && base != null ? `\nBasis ${pad(basisHour)}:00: ${r(base)}` : ''}`;
      h += td(k, f == null ? '–' : arrow + r(f), f == null ? 'empty' : '', title);
    }
    h += '</tr>';
    // Prognose 7 Tage (erstellt zur Basisstunde, Ziel: gleicher Wochentag eine Woche später, 16:00)
    h += '<tr class="fc"><th class="lab" title="Schätzung, keine Anlageberatung – Kurs eine Woche später (gleicher Wochentag, 16:00)">Prognose 7 Tage *</th>';
    for (const k of days) {
      const shownFc = displayForecast(c, k, '7');
      const f = shownFc.value, basisHour = shownFc.basis;
      const base = basisHour != null ? val(c, k, basisHour) : null;
      let arrow = '';
      if (f != null && base != null) {
        const d = f - base;
        arrow = `<span class="fcarr">${d < -EPS ? '↓' : d > EPS ? '↑' : '→'}</span>`;
      }
      h += td(k, f == null ? '–' : arrow + r(f), f == null ? 'empty' : '',
        f == null ? '' : `Schätzung, keine Anlageberatung\nZiel: ${header(target7(k))} 16:00${basisHour != null && base != null ? ` · Basis ${pad(basisHour)}:00: ${r(base)}` : ''}`);
    }
    h += '</tr><tr class="dev"><th class="lab">Abweichung Tagesende</th>';
    for (const k of days) {
      const f = displayForecast(c, k, 'day').value, a = val(c, k, CLOSE_HOUR);
      if (f != null && a != null) { const d = a - f; h += td(k, (d >= 0 ? '+' : '') + r(d), '', `Ist 16:00: ${r(a)} · Prognose: ${r(f)}`); }
      else h += td(k, '–', 'empty');
    }
    h += '</tr><tr class="dev"><th class="lab">Abweichung 7 Tage</th>';
    for (const k of days) {
      const f = displayForecast(c, k, '7').value;
      if (f == null) { h += td(k, '–', 'empty'); continue; }
      const a = actual7(c, k);
      if (a) { const d = a.v - f; h += td(k, (d >= 0 ? '+' : '') + r(d), '', `Ist ${header(a.day)} ${pad(a.hr)}:00: ${r(a.v)} · Prognose: ${r(f)}`); }
      else h += td(k, `→ ${header(target7(k)).split(' ')[1]}`, 'empty pending', `Ist-Wert ab ${header(target7(k))} 16:00`);
    }
    h += '</tr>';
    HOURS.forEach((hr, i) => { h += slotRow(hr, i % 2 === 1 ? 'alt' : '', `${pad(hr)}:00`); });
    h += slotRow(CLOSE_HOUR, 'close', 'Tagesendkurs');
    // Aktuell: Live-Kurs nur in der Spalte von heute, getrennt von den erfassten Zeitpunkten
    const L = live[c.code];
    h += `<tr class="now"><th class="lab" title="Live-Mittelkurs (biquote.io), abgerufen beim Öffnen bzw. Aktualisieren – wird nicht gespeichert">Aktuell${L ? ' ' + hmFmt.format(L.at) : ''}</th>`;
    for (const k of days) {
      if (k !== today || !L) { h += td(k, '–', 'empty'); continue; }
      const basisHour = changeBasis(c, k);
      const base = basisHour != null ? val(c, k, basisHour) : null;
      let arrow = '', title = `Abgerufen ${hmFmt.format(L.at)}`;
      if (L.quoteAt) title += ` · Kurs von ${hmFmt.format(L.quoteAt)}`;
      if (L.closed) title += ' (Markt geschlossen)';
      if (base != null) {
        const d = L.v - base;
        arrow = d > EPS ? '<span class="arr up">▲</span>' : d < -EPS ? '<span class="arr down">▼</span>' : '<span class="arr flat">–</span>';
        title = `Veränderung seit ${pad(basisHour)}:00: ${r(d)} (${pctFmt.format((L.v / base - 1) * 100)} %)\n` + title;
      }
      h += td(k, arrow + r(L.v), L.closed ? 'stale' : '', title);
    }
    h += '</tr>';
    h += `<tr class="ecb"><th class="lab">EZB-Referenz</th>${days.map(k => { const v = ecb(c, k); return td(k, r(v), v == null ? 'empty' : ''); }).join('')}</tr></tbody>`;
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
  grid.innerHTML = h;
  if (opts.focusMore) {
    const moreBtn = grid.querySelector('.more-btn');
    if (moreBtn) moreBtn.focus({ preventScroll: true });
  } else if (keepDrag) {
    const btn = grid.querySelector(`.ccy-drag[data-code="${CSS.escape(keepDrag)}"]`);
    if (btn) btn.focus({ preventScroll: true });
  }
  const tableMin = `calc(var(--label-w) + ${days.length} * 108px)`;
  grid.style.minWidth = tableMin;
  // Karte so breit wie die Tabelle, damit Hintergrund und Ecken alle Spalten umfassen.
  grid.closest('main').style.minWidth = `max(calc(100% - 2 * var(--edge)), ${tableMin})`;
  sc.scrollLeft = opts.keepScroll ? left : sc.scrollWidth;
  sc.scrollTop = top;

  document.getElementById('updated').textContent = history.updated ? `Erfasst: ${timeFmt.format(new Date(history.updated))}` : '';
}

function showError(msg) { const e = document.getElementById('error'); e.hidden = !msg; e.textContent = msg || ''; }

async function load() {
  const [rates, times] = await Promise.all([
    fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .catch(e => e),
    fetchTimes(),
  ]);
  if (times) applyTimesConfig(times);
  if (rates instanceof Error) {
    showError(navigator.onLine === false ? 'Keine Internetverbindung. Es werden die zuletzt geladenen Kurse angezeigt.' : `Die Kurse konnten nicht geladen werden (${rates.message}).`);
  } else {
    history = rates; history.days ||= {};
    showError('');
  }
  render();
  loadLive();
}

async function loadLive() {
  // Aktueller Mittelkurs direkt von biquote.io (gleiche Quelle wie die Zeitpunkte; nur Anzeige, wird nicht gespeichert)
  await Promise.all(visibleCurrencies().map(async c => {
    try {
      const res = await fetch(`https://biquote.io/api/${c.symbol}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const t = await res.json();
      const mid = t.mid ?? ((t.bid ?? 0) + (t.ask ?? 0)) / 2;
      if (mid > 0) {
        const qt = t.lastQuoteAt || t.timestamp;
        live[c.code] = { v: mid, at: new Date(), quoteAt: qt ? new Date(qt) : null, closed: t.marketState ? t.marketState !== 'open' : !!t.stale };
      }
    } catch { /* ignorieren: Zeile bleibt leer bzw. zeigt den letzten Abruf */ }
  }));
  render();
}

function csv() {
  const days = weekdayKeys(START, zurichToday() < START ? START : zurichToday());
  const num = v => (v == null ? '' : v.toFixed(6));
  const dmy = k => `${k.slice(8, 10)}.${k.slice(5, 7)}.${k.slice(0, 4)}`;
  const lines = [['Währung', 'Zeit', ...days.map(dmy)].join(';')];
  for (const c of visibleCurrencies()) {
    const L = `${c.label} in CHF`;
    lines.push([L, 'Prognose 16:00 (Schätzung)', ...days.map(k => num(displayForecast(c, k, 'day').value))].join(';'));
    lines.push([L, 'Prognose 7 Tage (Schätzung, Ziel +7 Tage 16:00)', ...days.map(k => num(displayForecast(c, k, '7').value))].join(';'));
    lines.push([L, 'Abweichung Ist − Prognose', ...days.map(k => { const f = displayForecast(c, k, 'day').value, a = val(c, k, CLOSE_HOUR); return f != null && a != null ? num(a - f) : ''; })].join(';'));
    lines.push([L, 'Abweichung 7 Tage Ist − Prognose', ...days.map(k => { const f = displayForecast(c, k, '7').value, a = actual7(c, k); return f != null && a ? num(a.v - f) : ''; })].join(';'));
    HOURS.forEach(hr => {
      lines.push([L, `${pad(hr)}:00`, ...days.map(k => num(val(c, k, hr)))].join(';'));
    });
    lines.push([L, 'Tagesendkurs 16:00', ...days.map(k => num(val(c, k, CLOSE_HOUR)))].join(';'));
    const lv = live[c.code];
    lines.push([L, lv ? `Aktuell ${hmFmt.format(lv.at)} (Live, nicht gespeichert)` : 'Aktuell', ...days.map(k => (k === zurichToday() && lv ? num(lv.v) : ''))].join(';'));
    lines.push([L, 'EZB-Referenzkurs', ...days.map(k => num(ecb(c, k)))].join(';'));
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
    return parseSchedule(data) ? data : null;
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
      if (!(v > 0 && v <= 20)) return { error: `Ungültige Schwelle bei ${inp.dataset.code}/CHF (0.01–20 %).` };
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
    h += `<section class="alcard"><h3>${code}/CHF</h3>
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
    h += `<tr><td>${code}/CHF</td><td><input type="checkbox" data-code="${code}" data-k="enabled" ${c.enabled ? 'checked' : ''} ${rw ? '' : 'disabled'}></td>
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
$('alertsBtn').addEventListener('click', () => { runtimePromise.then(() => openAlerts()); });
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
  const dlg = $('times'), rw = canWrite();
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
  else h += '<button type="button" id="tmConnect" class="tm-link">Zum Speichern mit GitHub verbinden</button>';
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
        ? 'Gespeichert. Die Tabelle zeigt jetzt dieses Raster.'
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
if (typeof document !== 'undefined') {
runtimePromise = detectRuntime().then(mode => { runtime = mode; });
$('timesBtn').addEventListener('click', async () => {
  await runtimePromise;
  const dlg = $('times');
  dlg.innerHTML = '<p class="note">Lade …</p>'; dlg.showModal();
  const data = await fetchTimes();
  if (data) applyTimesConfig(data);
  render({ keepScroll: true });
  renderTimes();
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
  if (!handle || !handle.closest('#grid')) return;
  const tbody = handle.closest('tbody.ccy');
  if (!tbody) return;
  e.preventDefault();
  const list = [...document.querySelectorAll('#grid tbody.ccy')];
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
  btn.setAttribute('aria-pressed', editing ? 'true' : 'false');
  btn.setAttribute('aria-label', editing ? 'Fertig' : 'Bearbeiten');
}

document.getElementById('editBtn').addEventListener('click', () => {
  editing = !editing;
  if (!editing) moreOpen = false;
  syncEditButton();
  render({ keepScroll: true });
});
document.getElementById('grid').addEventListener('click', e => {
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
document.getElementById('grid').addEventListener('keydown', e => {
  const handle = e.target.closest('.ccy-drag');
  if (!handle) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  moveCurrency(handle.dataset.code, e.key === 'ArrowUp' ? 'up' : 'down', { focus: true });
});
document.getElementById('grid').addEventListener('pointerdown', startDrag);
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
document.getElementById('reload').addEventListener('click', e => {
  const b = e.currentTarget;
  b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
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
