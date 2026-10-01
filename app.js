'use strict';
// Währungsübersicht – liest data/rates.json (gleiches Format wie die macOS-App)
const DATA_URL = 'data/rates.json';
const CURRENCIES = [
  { code: 'USD', label: '1 USD', flag: '🇺🇸', symbol: 'USDCHF' },
  { code: 'EUR', label: '1 EUR', flag: '🇪🇺', symbol: 'EURCHF' },
  { code: 'GBP', label: '1 GBP', flag: '🇬🇧', symbol: 'GBPCHF' },
];
const HOURS = [8, 10, 12, 14, 16, 18];
const CLOSE_HOUR = 16; // Tagesende = Ziel der Prognosen
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

let history = { days: {} };
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

function render() {
  const today = zurichToday();
  const days = weekdayKeys(START, today < START ? START : today);
  const td = (k, html, cls = '', title = '') =>
    `<td class="${k === today ? 'today ' : ''}${cls}"${title ? ` title="${esc(title)}"` : ''}>${html}</td>`;
  let h = '<thead><tr><th class="lab">Zeit (CH)</th>' +
    days.map(k => `<th class="${k === today ? 'today' : ''}">${header(k)}</th>`).join('') + '</tr></thead><tbody>';
  for (const c of CURRENCIES) {
    const lv = live[c.code] != null ? `<span class="live" title="Aktueller Mittelkurs">${r(live[c.code])}</span>` : '';
    h += `<tr class="group"><th class="lab">${c.flag} ${c.label}${lv}</th>${days.map(k => td(k, '')).join('')}</tr>`;
    const slotRow = (hr, alt) => {
      let row = `<tr class="${alt ? 'alt' : ''}"><th class="lab">${pad(hr)}:00</th>`;
      for (const k of days) {
        const v = val(c, k, hr), base = val(c, k, HOURS[0]);
        let arrow = '', title = '';
        if (v != null && base != null && hr !== HOURS[0]) {
          const d = v - base;
          arrow = d > EPS ? '<span class="arr up">▲</span>' : d < -EPS ? '<span class="arr down">▼</span>' : '<span class="arr flat">–</span>';
          title = `Veränderung seit 08:00: ${r(d)}`;
        }
        row += td(k, v == null ? '–' : arrow + r(v), v == null ? 'empty' : '', title);
      }
      return row + '</tr>';
    };
    h += slotRow(HOURS[0], false);
    // Prognose
    h += '<tr class="fc"><th class="lab" title="Schätzung, keine Anlageberatung">Prognose Tagesende *</th>';
    for (const k of days) {
      const f = fc(c, k), base = val(c, k, HOURS[0]);
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
      const f = fc7(c, k), base = val(c, k, HOURS[0]);
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
    HOURS.slice(1).forEach((hr, i) => { h += slotRow(hr, i % 2 === 0); });
    h += `<tr class="ecb"><th class="lab">EZB-Referenz</th>${days.map(k => { const v = ecb(c, k); return td(k, r(v), v == null ? 'empty' : ''); }).join('')}</tr>`;
  }
  document.getElementById('grid').innerHTML = h + '</tbody>';
  const sc = document.getElementById('scroller'); sc.scrollLeft = sc.scrollWidth;

  const ecbDays = Object.keys(history.days).filter(k => Object.keys(history.days[k].ecb || {}).length).sort();
  const last = ecbDays[ecbDays.length - 1];
  document.getElementById('stand').textContent = last ? `Stand: ${longFmt.format(new Date(last + 'T12:00:00Z'))}, EZB-Referenzkurse` : 'EZB-Referenzkurse (noch keine Daten)';
  document.getElementById('updated').textContent = history.updated ? `Erfasst: ${timeFmt.format(new Date(history.updated))}` : '';
}

function showError(msg) { const e = document.getElementById('error'); e.hidden = !msg; e.textContent = msg || ''; }

async function load() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    history = await res.json(); history.days ||= {};
    showError('');
  } catch (e) {
    showError(navigator.onLine === false ? 'Keine Internetverbindung. Es werden die zuletzt geladenen Kurse angezeigt.' : `Die Kurse konnten nicht geladen werden (${e.message}).`);
  }
  render();
  loadLive();
}

async function loadLive() {
  // Aktueller Mittelkurs direkt von biquote.io (optional, nur Anzeige)
  await Promise.all(CURRENCIES.map(async c => {
    try {
      const t = await (await fetch(`https://biquote.io/api/${c.symbol}`, { cache: 'no-store' })).json();
      const mid = t.mid ?? ((t.bid ?? 0) + (t.ask ?? 0)) / 2;
      if (mid > 0) live[c.code] = mid;
    } catch { /* ignorieren */ }
  }));
  render();
}

function csv() {
  const days = weekdayKeys(START, zurichToday() < START ? START : zurichToday());
  const num = v => (v == null ? '' : v.toFixed(6));
  const dmy = k => `${k.slice(8, 10)}.${k.slice(5, 7)}.${k.slice(0, 4)}`;
  const lines = [['Währung', 'Zeit', ...days.map(dmy)].join(';')];
  for (const c of CURRENCIES) {
    const L = `${c.label} in CHF`;
    HOURS.forEach((hr, i) => {
      lines.push([L, `${pad(hr)}:00`, ...days.map(k => num(val(c, k, hr)))].join(';'));
      if (i === 0) {
        lines.push([L, 'Prognose 16:00 (Schätzung)', ...days.map(k => num(fc(c, k)))].join(';'));
        lines.push([L, 'Abweichung Ist − Prognose', ...days.map(k => { const f = fc(c, k), a = val(c, k, CLOSE_HOUR); return f != null && a != null ? num(a - f) : ''; })].join(';'));
        lines.push([L, 'Prognose 7 Tage (Schätzung, Ziel +7 Tage 16:00)', ...days.map(k => num(fc7(c, k)))].join(';'));
        lines.push([L, 'Abweichung 7 Tage Ist − Prognose', ...days.map(k => { const f = fc7(c, k), a = actual7(c, k); return f != null && a ? num(a.v - f) : ''; })].join(';'));
      }
    });
    lines.push([L, 'EZB-Referenzkurs', ...days.map(k => num(ecb(c, k)))].join(';'));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

document.getElementById('reload').addEventListener('click', load);
document.getElementById('csv').addEventListener('click', e => {
  e.preventDefault();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv()], { type: 'text/csv;charset=utf-8' }));
  a.download = `Waehrungsuebersicht_${zurichToday()}.csv`; a.click();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
setInterval(load, 10 * 60 * 1000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
load();
