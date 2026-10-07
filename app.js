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
const BASE_HOUR = 8; // Veränderungspfeile, Prognose-Basis, FX-Alarme
const CLOSE_HOUR = 16; // Tagesende = Ziel der Prognosen
const LOCKED_HOURS = [BASE_HOUR, CLOSE_HOUR];
const DEFAULT_HOURS = [6, 8, 10, 12, 14, 16, 18, 20];
let HOURS = DEFAULT_HOURS.slice();
/** Ganze Stunden 0–23, aufsteigend, 08 und 16 immer dabei (Prognosen und FX-Alarme). */
function normalizeHours(list) {
  const out = new Set(LOCKED_HOURS);
  const src = Array.isArray(list) && list.length ? list : DEFAULT_HOURS;
  for (const h of src) {
    if (typeof h === 'boolean') continue;
    const n = typeof h === 'number' ? h : (typeof h === 'string' && /^\d{1,2}$/.test(h.trim()) ? Number(h.trim()) : NaN);
    if (Number.isInteger(n) && n >= 0 && n <= 23) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}
function hoursLabel() {
  const parts = HOURS.map(pad);
  if (parts.length <= 1) return parts[0] || pad(BASE_HOUR);
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
/** Ist-Wert zur 7-Tage-Prognose: Zieltag 16:00, sonst nächster vorhandener Zeitpunkt (bis 5 Tage später) */
function actual7(c, k) {
  const t = target7(k);
  for (let i = 0; i <= 5; i++) {
    const day = addDays(t, i);
    for (const hr of HOURS) {
      if (i === 0 && hr < CLOSE_HOUR) continue;
      const v = val(c, day, hr);
      if (v != null) return { v, day, hr };
    }
  }
  return null;
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
    const slotRow = (hr, alt) => {
      let row = `<tr class="${alt ? 'alt' : ''}"><th class="lab">${pad(hr)}:00</th>`;
      for (const k of days) {
        const v = val(c, k, hr), base = val(c, k, BASE_HOUR);
        let arrow = '', title = '';
        if (v != null && base != null && hr > BASE_HOUR) {
          const d = v - base;
          arrow = d > EPS ? '<span class="arr up">▲</span>' : d < -EPS ? '<span class="arr down">▼</span>' : '<span class="arr flat">–</span>';
          title = `Veränderung seit 08:00: ${r(d)}`;
        }
        row += td(k, v == null ? '–' : arrow + r(v), v == null ? 'empty' : '', title);
      }
      return row + '</tr>';
    };
    // Prognosen vor den Uhrzeiten; 08:00 steht bei den übrigen Messpunkten
    h += '<tr class="fc"><th class="lab" title="Schätzung, keine Anlageberatung">Prognose Tagesende *</th>';
    for (const k of days) {
      const f = fc(c, k), base = val(c, k, BASE_HOUR);
      let arrow = '';
      if (f != null && base != null) {
        const d = f - base;
        arrow = `<span class="fcarr" title="${d < -EPS ? 'Erwartung: CHF stärker' : d > EPS ? 'Erwartung: CHF schwächer' : 'Erwartung: unverändert'}">${d < -EPS ? '↓' : d > EPS ? '↑' : '→'}</span>`;
      }
      h += td(k, f == null ? '–' : arrow + r(f), f == null ? 'empty' : '', f == null ? '' : 'Schätzung, keine Anlageberatung');
    }
    h += '</tr>';
    // Prognose 7 Tage (erstellt um 08:00, Ziel: gleicher Wochentag eine Woche später, 16:00)
    h += '<tr class="fc"><th class="lab" title="Schätzung, keine Anlageberatung – Kurs eine Woche später (gleicher Wochentag, 16:00)">Prognose 7 Tage *</th>';
    for (const k of days) {
      const f = fc7(c, k), base = val(c, k, BASE_HOUR);
      let arrow = '';
      if (f != null && base != null) {
        const d = f - base;
        arrow = `<span class="fcarr">${d < -EPS ? '↓' : d > EPS ? '↑' : '→'}</span>`;
      }
      h += td(k, f == null ? '–' : arrow + r(f), f == null ? 'empty' : '',
        f == null ? '' : `Schätzung, keine Anlageberatung\nZiel: ${header(target7(k))} 16:00 · Basis 08:00: ${r(base)}`);
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
    HOURS.forEach((hr, i) => { h += slotRow(hr, i % 2 === 1); });
    // Aktuell: Live-Kurs nur in der Spalte von heute, getrennt von den erfassten Zeitpunkten
    const L = live[c.code];
    h += `<tr class="now"><th class="lab" title="Live-Mittelkurs (biquote.io), abgerufen beim Öffnen bzw. Aktualisieren – wird nicht gespeichert">Aktuell${L ? ' ' + hmFmt.format(L.at) : ''}</th>`;
    for (const k of days) {
      if (k !== today || !L) { h += td(k, '–', 'empty'); continue; }
      const base = val(c, k, BASE_HOUR);
      let arrow = '', title = `Abgerufen ${hmFmt.format(L.at)}`;
      if (L.quoteAt) title += ` · Kurs von ${hmFmt.format(L.quoteAt)}`;
      if (L.closed) title += ' (Markt geschlossen)';
      if (base != null) {
        const d = L.v - base;
        arrow = d > EPS ? '<span class="arr up">▲</span>' : d < -EPS ? '<span class="arr down">▼</span>' : '<span class="arr flat">–</span>';
        title = `Veränderung seit 08:00: ${r(d)} (${pctFmt.format((L.v / base - 1) * 100)} %)\n` + title;
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
  if (note) note.textContent = `Mittelkurs werktags um ${hoursLabel()} Uhr Schweizer Zeit (Europe/Zurich), Eröffnungskurs der Stundenkerze. «Aktuell» = Live-Kurs beim Öffnen/Aktualisieren (nur heute, wird nicht gespeichert)`;
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
  if (times && Array.isArray(times.hours)) HOURS = normalizeHours(times.hours);
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
const DEFAULT_TIMES = { version: 1, hours: DEFAULT_HOURS.slice() };
const LS_TOKEN = 'wu.ghToken';
const ALERT_CODES = ['USD', 'EUR'];
const DEFAULT_ALERTS = { version: 1, currencies: { USD: { enabled: true, down: 0.5, up: 0.25 }, EUR: { enabled: true, down: 0.5, up: 0.25 } } };
const ghToken = () => localStorage.getItem(LS_TOKEN) || '';
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
async function fetchTimes() {
  try {
    if (ghToken()) {
      const { data } = await ghGet(TIMES_PATH);
      if (data && Array.isArray(data.hours) && data.hours.length) return data;
    }
  } catch { /* öffentlich weiter */ }
  return publicGet(TIMES_PATH);
}
async function loadAlerts() {
  try { alertCfg = ghToken() ? (await ghGet(ALERTS_PATH)).data : await publicGet(ALERTS_PATH); } catch (e) { alertCfg = await publicGet(ALERTS_PATH); }
  alertCfg ||= structuredClone(DEFAULT_ALERTS);
  alertState = await publicGet(STATE_PATH);
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
  alertCfg = await saveRepoFile(ALERTS_PATH, 'FX-Alarme geändert', DEFAULT_ALERTS, mutate);
}
function alertMsg(text, ok) { const m = $('alMsg'); if (m) { m.textContent = text || ''; m.className = ok ? 'msg ok' : 'msg err'; m.hidden = !text; } }
function renderAlerts() {
  const dlg = $('alerts'), rw = !!ghToken();
  const todayKey = zurichToday();
  const sent = alertState && alertState.date === todayKey ? alertState.sent || {} : {};
  let h = `<form method="dialog" class="dlghead"><h2>FX-Alarme (Push via ntfy)</h2><button value="close" aria-label="Schliessen">${XMARK}</button></form>
    <p class="note">Push, wenn sich der Kurs im Tagesverlauf gegenüber 08:00 Schweizer Zeit (vorher: Tageseröffnung) stärker als die Schwelle bewegt.
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
  if (rw) h += '<div class="row"><button id="alSave" type="button" class="primary">Speichern</button><button id="tokOut" type="button" class="danger">Token entfernen</button></div>';
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
    localStorage.setItem(LS_TOKEN, t);
    try { alertCfg = (await ghGet(ALERTS_PATH)).data || alertCfg; renderAlerts(); alertMsg('Token gespeichert – Bearbeiten ist aktiv.', true); }
    catch (e) { localStorage.removeItem(LS_TOKEN); alertMsg(`Token abgelehnt: ${e.message}`); }
  };
  const to = $('tokOut'); if (to) to.onclick = () => { localStorage.removeItem(LS_TOKEN); renderAlerts(); };
}
$('alertsBtn').addEventListener('click', async () => {
  const dlg = $('alerts');
  dlg.innerHTML = '<p class="note">Lade …</p>'; dlg.showModal();
  await loadAlerts(); renderAlerts();
});

// ------------------------------------------------------- Erfassungszeiten (data/capture-times.json)
function tmMsg(text, ok) { const m = $('tmMsg'); if (m) { m.textContent = text || ''; m.className = ok ? 'msg ok' : 'msg err'; m.hidden = !text; } }
function renderTimes() {
  const dlg = $('times'), rw = !!ghToken();
  const selected = new Set(HOURS);
  let h = `<form method="dialog" class="dlghead"><h2>Erfassungszeiten</h2><button value="close" aria-label="Schliessen">${XMARK}</button></form>
    <p class="note">Volle Stunden Schweizer Zeit, die erfasst und in der Tabelle gezeigt werden. Sortiert, mindestens eine Stunde.</p>
    <div class="hours" role="group" aria-label="Stunden">`;
  for (let hr = 0; hr < 24; hr++) {
    const locked = LOCKED_HOURS.includes(hr);
    const on = selected.has(hr);
    const why = locked ? ' title="Immer erfasst: Prognosen (08:00 → 16:00) und FX-Alarme (Vergleich mit 08:00)"' : '';
    h += `<button type="button" class="hour${locked ? ' locked' : ''}" data-hour="${hr}" aria-pressed="${on ? 'true' : 'false'}"${why}${(rw && !locked) ? '' : ' disabled'}>${pad(hr)}:00</button>`;
  }
  h += `</div>
    <p class="note">08:00 und 16:00 lassen sich nicht abwählen. Die Prognosen werden um 08:00 erstellt und zielen auf 16:00; die FX-Alarme vergleichen mit 08:00. Beide Zeitpunkte werden immer erfasst, auch wenn sie in der Datei fehlen.</p>
    <p id="tmMsg" class="msg" hidden></p>`;
  if (rw) h += '<div class="row"><button id="tmSave" type="button" class="primary">Speichern</button><button id="tmTokOut" type="button" class="danger">Token entfernen</button></div>';
  else h += `<p class="note">Nur lesbar. Zum Ändern denselben GitHub-Token wie bei den FX-Alarmen eintragen –
    oder die Datei direkt auf GitHub bearbeiten: <a href="https://github.com/${REPO}/edit/main/${TIMES_PATH}" target="_blank" rel="noopener">${TIMES_PATH}</a>.</p>
    <div class="row"><input id="tmTok" type="password" placeholder="GitHub-Token (github_pat_…)" autocomplete="off"><button id="tmTokSave" type="button">Token speichern</button></div>
    <p class="note">Der Token wird nur in diesem Browser gespeichert (localStorage) und nur an api.github.com gesendet.</p>`;
  dlg.innerHTML = h;
  dlg.querySelectorAll('.hour:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', on ? 'false' : 'true');
    });
  });
  const sv = $('tmSave');
  if (sv) sv.onclick = async () => {
    const picked = [...dlg.querySelectorAll('.hour[aria-pressed="true"]')].map(b => Number(b.dataset.hour));
    const hours = normalizeHours(picked);
    if (!hours.length) return tmMsg('Mindestens eine ganze Stunde zwischen 00 und 23 wählen.');
    sv.disabled = true; tmMsg('Speichere …', true);
    try {
      await saveRepoFile(TIMES_PATH, 'Erfassungszeiten geändert', DEFAULT_TIMES, cur => { cur.version = 1; cur.hours = hours; });
      HOURS = hours;
      render({ keepScroll: true });
      renderTimes();
      tmMsg('Gespeichert. Gilt ab dem nächsten stündlichen Lauf; fehlende Kurse der letzten ca. 7 Tage werden nachgetragen. Neue Zeilen zeigen «–», bis ein Kurs erfasst ist.', true);
    } catch (e) { sv.disabled = false; tmMsg(`Speichern fehlgeschlagen: ${e.message}`); }
  };
  const ts = $('tmTokSave');
  if (ts) ts.onclick = async () => {
    const t = $('tmTok').value.trim(); if (!t) return;
    localStorage.setItem(LS_TOKEN, t);
    try {
      await ghGet(TIMES_PATH);
      const data = await fetchTimes();
      if (data && Array.isArray(data.hours)) HOURS = normalizeHours(data.hours);
      render({ keepScroll: true });
      renderTimes();
      tmMsg('Token gespeichert – Bearbeiten ist aktiv.', true);
    } catch (e) { localStorage.removeItem(LS_TOKEN); tmMsg(`Token abgelehnt: ${e.message}`); }
  };
  const to = $('tmTokOut'); if (to) to.onclick = () => { localStorage.removeItem(LS_TOKEN); renderTimes(); };
}
$('timesBtn').addEventListener('click', async () => {
  const dlg = $('times');
  dlg.innerHTML = '<p class="note">Lade …</p>'; dlg.showModal();
  const data = await fetchTimes();
  if (data && Array.isArray(data.hours)) HOURS = normalizeHours(data.hours);
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
load();
