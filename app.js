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
const CCY_NAMES = { EUR: 'Euro', USD: 'US-Dollar', GBP: 'Britisches Pfund' };
const CHEVRON_UP = '<svg class="chev" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"><path d="M3.25 10.35 8 5.65 12.75 10.35" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_DOWN = '<svg class="chev" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"><path d="M3.25 5.65 8 10.35 12.75 5.65" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const XMARK = '<svg class="sym" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false"><path d="M3.6 3.6 12.4 12.4M12.4 3.6 3.6 12.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
/** null = nichts gespeichert (Standard). Array = vom Nutzer gewählte Codes. undefined = noch nicht gelesen. */
let savedOrder;
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
function hoursLabel() {
  const parts = HOURS.map(pad);
  if (parts.length <= 1) return parts[0] || pad(schedule.start);
  return `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}`;
}
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
const longFmt = new Intl.DateTimeFormat('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
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
function moveButtons(c, index, total) {
  const name = CCY_NAMES[c.code] || c.label;
  const btn = (dir, icon, disabled) =>
    `<button type="button" class="ccy-move" data-move="${dir}" data-code="${esc(c.code)}" aria-label="${esc(name)} nach ${dir === 'up' ? 'oben' : 'unten'}"${disabled ? ' disabled' : ''}>${icon}</button>`;
  return `<span class="ccy-moves">${btn('up', CHEVRON_UP, index === 0)}${btn('down', CHEVRON_DOWN, index === total - 1)}</span>`;
}
function moveCurrency(code, dir, opts = {}) {
  const list = currenciesInOrder();
  const i = list.findIndex(c => c.code === code);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  const next = list.slice();
  const [item] = next.splice(i, 1);
  next.splice(j, 0, item);
  persistOrder(next);
  render({ keepScroll: true });
  if (!opts.focus) return;
  const pick = d => document.querySelector(`.ccy-move[data-code="${CSS.escape(code)}"][data-move="${d}"]:not(:disabled)`);
  const btn = pick(dir) || pick(dir === 'up' ? 'down' : 'up');
  if (btn) btn.focus({ preventScroll: true });
}

function render(opts = {}) {
  const today = zurichToday();
  const days = weekdayKeys(START, today < START ? START : today);
  const shown = currenciesInOrder();
  const td = (k, html, cls = '', title = '') =>
    `<td class="${k === today ? 'today ' : ''}${cls}"${title ? ` title="${esc(title)}"` : ''}>${html}</td>`;
  let h = `<colgroup><col class="c-lab">${days.map(() => '<col class="c-day">').join('')}</colgroup><thead><tr><th class="lab">Zeit (CH)</th>` +
    days.map(k => `<th class="${k === today ? 'today' : ''}">${header(k)}</th>`).join('') + '</tr></thead><tbody>';
  for (const [i, c] of shown.entries()) {
    // Kopfzeile zeigt den Live-Kurs nur, wenn es keine Spalte für heute gibt (Wochenende) – sonst steht er in der Zeile «Aktuell»
    const lv = live[c.code] && !days.includes(today) ? `<span class="live" title="Letzter Mittelkurs (Markt geschlossen)">${r(live[c.code].v)}</span>` : '';
    h += `<tr class="group"><th class="lab"><div class="ccy-head"><span class="ccy-name"><span class="ccy-title">${c.flag} ${c.label}</span>${lv}</span>${moveButtons(c, i, shown.length)}</div></th>${days.map(k => td(k, '')).join('')}</tr>`;
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
      const f = fc(c, k), basisHour = forecastBasisHour(c, k, 'day');
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
      const f = fc7(c, k), basisHour = forecastBasisHour(c, k, '7');
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
      const f = fc(c, k), a = val(c, k, CLOSE_HOUR);
      if (f != null && a != null) { const d = a - f; h += td(k, (d >= 0 ? '+' : '') + r(d), '', `Ist 16:00: ${r(a)} · Prognose: ${r(f)}`); }
      else h += td(k, '–', 'empty');
    }
    h += '</tr><tr class="dev"><th class="lab">Abweichung 7 Tage</th>';
    for (const k of days) {
      const f = fc7(c, k);
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
    h += `<tr class="ecb"><th class="lab">EZB-Referenz</th>${days.map(k => { const v = ecb(c, k); return td(k, r(v), v == null ? 'empty' : ''); }).join('')}</tr>`;
  }
  const sc = document.getElementById('scroller');
  const left = sc.scrollLeft;
  const top = sc.scrollTop;
  const grid = document.getElementById('grid');
  grid.innerHTML = h + '</tbody>';
  const tableMin = `calc(var(--label-w) + ${days.length} * 108px)`;
  grid.style.minWidth = tableMin;
  // Karte so breit wie die Tabelle, damit Hintergrund und Ecken alle Spalten umfassen.
  grid.closest('main').style.minWidth = `max(calc(100% - 2 * var(--edge)), ${tableMin})`;
  sc.scrollLeft = opts.keepScroll ? left : sc.scrollWidth;
  sc.scrollTop = top;

  const ecbDays = Object.keys(history.days).filter(k => Object.keys(history.days[k].ecb || {}).length).sort();
  const last = ecbDays[ecbDays.length - 1];
  const note = document.getElementById('hoursNote');
  if (note) note.textContent = `Mittelkurs werktags um ${hoursLabel()} Uhr Schweizer Zeit (Europe/Zurich), Eröffnungskurs der Stundenkerze. Tagesendkurs 16:00 wird immer erfasst. «Aktuell» = Live-Kurs beim Öffnen/Aktualisieren (nur heute, wird nicht gespeichert)`;
  const fcNote = document.getElementById('fcNote');
  if (fcNote) fcNote.textContent = `* Prognose Tagesende (16:00) und Prognose 7 Tage (gleicher Wochentag eine Woche später, 16:00), jeweils zum Startzeitpunkt ${pad(schedule.start)}:00 erstellt: Schätzung, keine Anlageberatung. ↓ = CHF stärker, ↑ = CHF schwächer`;
  document.getElementById('stand').textContent = last ? `Stand: ${longFmt.format(new Date(last + 'T12:00:00Z'))}, EZB-Referenzkurse` : 'EZB-Referenzkurse (noch keine Daten)';
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
  await Promise.all(currenciesInOrder().map(async c => {
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
  for (const c of currenciesInOrder()) {
    const L = `${c.label} in CHF`;
    lines.push([L, 'Prognose 16:00 (Schätzung)', ...days.map(k => num(fc(c, k)))].join(';'));
    lines.push([L, 'Prognose 7 Tage (Schätzung, Ziel +7 Tage 16:00)', ...days.map(k => num(fc7(c, k)))].join(';'));
    lines.push([L, 'Abweichung Ist − Prognose', ...days.map(k => { const f = fc(c, k), a = val(c, k, CLOSE_HOUR); return f != null && a != null ? num(a - f) : ''; })].join(';'));
    lines.push([L, 'Abweichung 7 Tage Ist − Prognose', ...days.map(k => { const f = fc7(c, k), a = actual7(c, k); return f != null && a ? num(a.v - f) : ''; })].join(';'));
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
const TIMES_FRESH_MS = 10 * 60 * 1000;
const ALERT_CODES = ['USD', 'EUR'];
const DEFAULT_ALERTS = { version: 1, currencies: { USD: { enabled: true, down: 0.5, up: 0.25 }, EUR: { enabled: true, down: 0.5, up: 0.25 } } };
const ghToken = () => localStorage.getItem(LS_TOKEN) || '';
const LS_PASSWORD = 'wu.appPassword';
/** 'github' auf Pages und lokal, 'cloudflare' wenn /api/runtime vom Worker kommt. */
let runtime = 'github';
let runtimePromise;
const appPassword = () => localStorage.getItem(LS_PASSWORD) || '';
const canWrite = () => runtime === 'cloudflare' ? !!appPassword() : !!ghToken();
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
async function fetchTimes() {
  if (runtime === 'cloudflare') {
    const saved = rememberedTimes();
    const local = await fetchJson(`${TIMES_PATH}?t=${Date.now()}`);
    return pickTimes({ api: local, raw: null, pages: null, saved });
  }
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
async function loadAlerts() {
  if (runtime === 'cloudflare') {
    alertCfg = await fetchJson(`${ALERTS_PATH}?t=${Date.now()}`);
    alertCfg ||= structuredClone(DEFAULT_ALERTS);
    alertState = await fetchJson(`${STATE_PATH}?t=${Date.now()}`);
    return;
  }
  try { alertCfg = ghToken() ? (await ghGet(ALERTS_PATH)).data : await publicGet(ALERTS_PATH); } catch (e) { alertCfg = await publicGet(ALERTS_PATH); }
  alertCfg ||= structuredClone(DEFAULT_ALERTS);
  alertState = await publicGet(STATE_PATH);
}
async function saveCloud(path, body) {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${appPassword()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('Passwort ungültig');
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* Antwort ohne JSON */ }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}
async function checkPassword(pw) {
  const res = await fetch('api/auth', { headers: { Authorization: `Bearer ${pw}` }, cache: 'no-store' });
  if (res.status === 401) throw new Error('Passwort ungültig');
  if (!res.ok) throw new Error(res.status === 503 ? 'App-Passwort ist auf dem Server nicht gesetzt' : `Passwortprüfung HTTP ${res.status}`);
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
    const cur = (await fetchJson(`${ALERTS_PATH}?t=${Date.now()}`)) || structuredClone(DEFAULT_ALERTS);
    mutate(cur);
    alertCfg = await saveCloud('api/fx-alerts', cur);
    return;
  }
  alertCfg = await saveRepoFile(ALERTS_PATH, 'FX-Alarme geändert', DEFAULT_ALERTS, mutate);
}
function alertMsg(text, ok) { const m = $('alMsg'); if (m) { m.textContent = text || ''; m.className = ok ? 'msg ok' : 'msg err'; m.hidden = !text; } }
function renderAlerts() {
  const dlg = $('alerts'), rw = canWrite();
  const todayKey = zurichToday();
  const sent = alertState && alertState.date === todayKey ? alertState.sent || {} : {};
  let h = `<form method="dialog" class="dlghead"><h2>FX-Alarme (Push via ntfy)</h2><button value="close" aria-label="Schliessen">${XMARK}</button></form>
    <p class="note">Push, wenn sich der Kurs im Tagesverlauf gegenüber ${pad(schedule.start)}:00 Schweizer Zeit (vorher: Tageseröffnung) stärker als die Schwelle bewegt.
    Geprüft alle 15 Minuten, werktags ca. 07:00–22:00 Uhr; je Währung und Richtung höchstens eine Meldung pro Tag.</p>
    <table class="altab"><thead><tr><th>Paar</th><th>Aktiv</th><th class="n">Fällt um mehr als</th><th class="n">Steigt um mehr als</th><th>Heute gesendet</th></tr></thead><tbody>`;
  for (const code of ALERT_CODES) {
    const c = alertCfg?.currencies?.[code] || DEFAULT_ALERTS.currencies[code];
    const s = ['down', 'up'].filter(d => sent[`${code}:${d}`]).map(d => `${d === 'down' ? '▼' : '▲'} ${esc(sent[`${code}:${d}`].time || '')}`).join(' ') || '–';
    h += `<tr><td>${code}/CHF</td><td><input type="checkbox" data-code="${code}" data-k="enabled" ${c.enabled ? 'checked' : ''} ${rw ? '' : 'disabled'}></td>
      <td class="n"><input type="number" step="0.01" min="0.01" max="20" inputmode="decimal" data-code="${code}" data-k="down" value="${c.down}" ${rw ? '' : 'disabled'}> %</td>
      <td class="n"><input type="number" step="0.01" min="0.01" max="20" inputmode="decimal" data-code="${code}" data-k="up" value="${c.up}" ${rw ? '' : 'disabled'}> %</td><td>${s}</td></tr>`;
  }
  h += '</tbody></table><p id="alMsg" class="msg" hidden></p>';
  if (rw) h += `<div class="row"><button id="alSave" type="button" class="primary">Speichern</button><button id="tokOut" type="button" class="danger">${runtime === 'cloudflare' ? 'Passwort entfernen' : 'Token entfernen'}</button></div>`;
  else if (runtime === 'cloudflare') h += `<p class="note">Nur lesbar. Zum Ändern einmalig das App-Passwort eintragen.</p>
    <div class="row"><input id="tok" type="password" placeholder="App-Passwort" autocomplete="current-password"><button id="tokSave" type="button">Passwort speichern</button></div>
    <p class="note">Das Passwort bleibt nur in diesem Browser (localStorage) und wird nur an diese Website gesendet.</p>`;
  else h += `<p class="note">Nur lesbar. Zum Ändern einmalig einen GitHub-Token (Fine-grained, nur Repository ${REPO}, Contents: Read and write) eintragen –
    oder die Datei direkt auf GitHub bearbeiten: <a href="https://github.com/${REPO}/edit/main/${ALERTS_PATH}" target="_blank" rel="noopener">${ALERTS_PATH}</a>.</p>
    <div class="row"><input id="tok" type="password" placeholder="GitHub-Token (github_pat_…)" autocomplete="off"><button id="tokSave" type="button">Token speichern</button></div>
    <p class="note">Der Token wird nur in diesem Browser gespeichert (localStorage) und nur an api.github.com gesendet.</p>`;
  dlg.innerHTML = h;
  const sv = $('alSave');
  if (sv) sv.onclick = async () => {
    const vals = {};
    for (const inp of dlg.querySelectorAll('input[data-code]')) {
      const o = (vals[inp.dataset.code] ||= {});
      if (inp.dataset.k === 'enabled') o.enabled = inp.checked;
      else {
        const v = parseFloat(String(inp.value).replace(',', '.'));
        if (!(v > 0 && v <= 20)) return alertMsg(`Ungültige Schwelle bei ${inp.dataset.code}/CHF (0.01–20 %).`);
        o[inp.dataset.k] = Math.round(v * 100) / 100;
      }
    }
    sv.disabled = true; alertMsg('Speichere …', true);
    try {
      await saveAlerts(cur => { cur.version ||= 1; cur.currencies ||= {}; for (const [code, o] of Object.entries(vals)) cur.currencies[code] = Object.assign(cur.currencies[code] || {}, o); });
      renderAlerts(); alertMsg('Gespeichert. Gilt ab dem nächsten Lauf (alle 15 Min.).', true);
    } catch (e) { sv.disabled = false; alertMsg(`Speichern fehlgeschlagen: ${e.message}`); }
  };
  const ts = $('tokSave');
  if (ts) ts.onclick = async () => {
    const t = $('tok').value.trim(); if (!t) return;
    if (runtime === 'cloudflare') {
      try {
        await checkPassword(t);
        localStorage.setItem(LS_PASSWORD, t);
        alertCfg = (await fetchJson(`${ALERTS_PATH}?t=${Date.now()}`)) || alertCfg;
        renderAlerts();
        alertMsg('Passwort gespeichert – Bearbeiten ist aktiv.', true);
      } catch (e) {
        localStorage.removeItem(LS_PASSWORD);
        alertMsg(`Passwort abgelehnt: ${e.message}`);
      }
      return;
    }
    localStorage.setItem(LS_TOKEN, t);
    try { alertCfg = (await ghGet(ALERTS_PATH)).data || alertCfg; renderAlerts(); alertMsg('Token gespeichert – Bearbeiten ist aktiv.', true); }
    catch (e) { localStorage.removeItem(LS_TOKEN); alertMsg(`Token abgelehnt: ${e.message}`); }
  };
  const to = $('tokOut'); if (to) to.onclick = () => {
    if (runtime === 'cloudflare') localStorage.removeItem(LS_PASSWORD);
    else localStorage.removeItem(LS_TOKEN);
    renderAlerts();
  };
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
    <p class="note">Volle Stunden Schweizer Zeit, von–bis.</p>
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
  if (rw) h += '<div class="row"><button id="tmSave" type="button" class="primary">Speichern</button></div>';
  else if (runtime === 'cloudflare') h += '<button type="button" id="tmConnect" class="tm-link">Zum Speichern Passwort eingeben</button>';
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
    notes.push('Tagesendkurs 16:00 wird immer erfasst.');
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
      const saved = runtime === 'cloudflare'
        ? await saveCloud('api/capture-times', { version: 2, start: pad(sch.start), end: pad(sch.end), intervalHours: sch.intervalHours })
        : await saveRepoFile(TIMES_PATH, 'Erfassungszeiten geändert', DEFAULT_TIMES, cur => {
          cur.version = 2;
          cur.start = pad(sch.start);
          cur.end = pad(sch.end);
          cur.intervalHours = sch.intervalHours;
          delete cur.hours;
        });
      rememberTimes(saved);
      schedule = sch;
      HOURS = hoursFromSchedule(sch);
      timesFit = true;
      render({ keepScroll: true });
      renderTimes();
      tmMsg(runtime === 'cloudflare'
        ? 'Gespeichert. Die Erfassung läuft jetzt; fehlende Kurse der letzten ca. 7 Tage werden nachgetragen. Neue Zeilen zeigen «–», bis ein Kurs erfasst ist.'
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

document.getElementById('grid').addEventListener('click', e => {
  const btn = e.target.closest('.ccy-move');
  if (!btn || btn.disabled) return;
  moveCurrency(btn.dataset.code, btn.dataset.move, { focus: e.detail === 0 });
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
