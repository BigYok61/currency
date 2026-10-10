'use strict';
// Währungen 2.1 – Liste, Ansicht, Grafik, Alarme, Erfassungszeiten.
const LS_LIST = 'wu.listOrder';
const LS_MASTER = 'wu.alertsMaster';
const DISCLAIMER = 'Prognosen sind unverbindliche, automatisch berechnete Schätzungen und keine Anlage- oder Finanzberatung. Für Entscheidungen auf Basis dieser Angaben wird keine Haftung übernommen.';
const ALERT_INTRO = 'Die Alarmeinstellungen gelten nur für dieses Gerät. Wenn sich der Kurs gegenüber der Standardwährung innerhalb des Tages stärker als die unten gesetzten Schwellen verändert, werden Sie mit einer Push-Mitteilung gewarnt. Je Währung und Richtung gibt es höchstens eine Warnung am Tag.';
const APP_STORE = 'https://apps.apple.com/app/ntfy/id1625396347';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=io.heckel.ntfy';
const UP = '#34C759';
const DOWN = '#FF3B30';
const FLAT = '#8e8e93';
const SHEET_X = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M3.2 3.2 12.8 12.8M12.8 3.2 3.2 12.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const CHECK_MARK = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M5.2 12.4 9.6 16.7 18.8 7.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLUS_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M12 5.2v13.6M5.2 12h13.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';
const AR_UP = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M6 14.5 12 8.5l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const AR_DN = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M6 9.5 12 15.5l6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M5 7.5h14M9.2 7.4V5.8h5.6v1.6M8 7.5l.7 11h6.6l.7-11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const FIRED_BELL = '<svg class="fired-bell" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false"><path fill="#FF3B30" d="M12 3.1a1.05 1.05 0 0 0-1.05 1v.42C8.05 5.05 6.2 7.15 6.2 10.3c0 1.9-.3 3.35-1.05 4.5h13.7c-.75-1.15-1.05-2.6-1.05-4.5 0-3.15-1.85-5.25-4.75-5.78V4.1A1.05 1.05 0 0 0 12 3.1z"/><path fill="#FF3B30" d="M9.5 16.15a2.5 2.5 0 0 0 5 0z"/></svg>';
const COPY_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><rect x="8" y="8" width="10" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 15.5H5.2A1.2 1.2 0 0 1 4 14.3V5.2A1.2 1.2 0 0 1 5.2 4H14a1.2 1.2 0 0 1 1.2 1.2V6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const prettyFmt = new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const plots = new Map();
let boardGen = 0;
let alertsPage = 'list';
let addQuery = '';

function cardRate(v) {
  if (v == null || !(Math.abs(v) > EPS)) return null;
  return 1 / v;
}
function fmtDev(d) {
  if (d == null || Number.isNaN(d)) return '';
  const body = r(Math.abs(d));
  if (d > EPS) return `+${body}`;
  if (d < -EPS) return `−${body}`;
  return body;
}
function arrowOf(d) {
  if (d == null) return '';
  if (d > EPS) return '↑';
  if (d < -EPS) return '↓';
  return '→';
}
function prettyDay(day) {
  if (!day) return '';
  return prettyFmt.format(new Date(`${day}T12:00:00Z`));
}
function rateText(code, v) {
  if (v == null) return '–';
  const unit = code === baseCurrency ? baseCurrency : code;
  return `${r(v)} ${unit}`;
}
function invText(raw) {
  if (raw == null) return '–';
  return `${r(raw)} ${baseCurrency}`;
}
function readListOrder() {
  try {
    const raw = localStorage.getItem(LS_LIST);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(code => typeof code === 'string' && code) : null;
  } catch { return null; }
}
function writeListOrder(rows) {
  try { localStorage.setItem(LS_LIST, JSON.stringify(rows.map(c => c.code))); } catch { /* diese Sitzung */ }
}
function boardRows() {
  const base = currencyRecord(baseCurrency);
  const rest = visibleCurrencies().filter(c => c.code !== base.code);
  const pool = new Map([[base.code, base], ...rest.map(c => [c.code, c])]);
  const saved = readListOrder();
  const out = [];
  if (saved) {
    for (const code of saved) {
      if (!pool.has(code)) continue;
      out.push(pool.get(code));
      pool.delete(code);
    }
  }
  if (!out.some(c => c.code === base.code)) {
    out.unshift(base);
    pool.delete(base.code);
  }
  for (const c of rest) {
    if (pool.has(c.code)) { out.push(pool.get(c.code)); pool.delete(c.code); }
  }
  return out;
}
function alertsMasterOn() {
  try { return localStorage.getItem(LS_MASTER) !== '0'; } catch { return true; }
}
function setAlertsMaster(on) {
  try { localStorage.setItem(LS_MASTER, on ? '1' : '0'); } catch { /* diese Sitzung */ }
}
function alarmHint(code) {
  if (!alertState || alertState.date !== zurichToday()) return '';
  const sent = alertState.sent || {};
  const times = ['down', 'up'].map(dir => sent[`${code}:${dir}`] && sent[`${code}:${dir}`].time).filter(Boolean);
  if (!times.length) return '';
  times.sort();
  return `<span class="fired">${FIRED_BELL}<span class="fired-time">${esc(times[0])}</span></span>`;
}
function quoteOf(c) {
  if (c.code === baseCurrency) return { v: 1, raw: 1 };
  const liveRaw = shownLive(c);
  if (liveRaw != null) return { v: cardRate(liveRaw), raw: liveRaw, live: true };
  const today = zurichToday();
  for (let i = 0; i < 12; i++) {
    const day = addDays(today, -i);
    const slots = history.days[day]?.slots || {};
    const hours = Object.keys(slots).map(h => parseHour(h)).filter(h => h != null && val(c, day, h) != null).sort((a, b) => b - a);
    if (!hours.length) continue;
    const raw = shown(c, day, hours[0]);
    if (raw == null) continue;
    return { v: cardRate(raw), raw, day, hour: hours[0] };
  }
  return { v: null, raw: null };
}
function hourHit(code, hour) {
  if (code === baseCurrency) return { v: 1, raw: 1 };
  const today = zurichToday();
  for (let i = 0; i < 12; i++) {
    const day = addDays(today, -i);
    const raw = shown({ code }, day, hour);
    if (raw != null) return { v: cardRate(raw), raw, day };
  }
  return null;
}
function latestForecastDay() {
  const today = zurichToday();
  for (let i = 0; i < 12; i++) {
    const day = addDays(today, -i);
    const rec = history.days[day];
    if (rec && (rec.forecast || rec.forecast7)) return day;
  }
  return today;
}
function forecastBits(c) {
  if (c.code === baseCurrency) return null;
  const day = latestForecastDay();
  const dayFc = shownForecast(c, day, 'day');
  const weekFc = shownForecast(c, day, '7');
  const basisHour = dayFc.basis != null ? dayFc.basis : weekFc.basis;
  const basisRaw = basisHour != null ? shown(c, day, basisHour) : null;
  const basis = cardRate(basisRaw);
  const todayV = cardRate(dayFc.value);
  const weekV = cardRate(weekFc.value);
  return {
    todayV,
    weekV,
    devDay: todayV != null && basis != null ? todayV - basis : null,
    devWeek: weekV != null && basis != null ? weekV - basis : null,
  };
}
function referenceBits(c) {
  if (c.code === baseCurrency) return { v: 1, raw: 1 };
  const today = zurichToday();
  for (let i = 0; i < 12; i++) {
    const day = addDays(today, -i);
    const raw = shownEcb(c, day);
    if (raw != null) return { v: cardRate(raw), raw, day };
  }
  return null;
}
function rangeDays() {
  return CHART_RANGES.find(item => item.id === chartRange)?.days || 30;
}
function dayRaw(code, day) {
  if (code === baseCurrency) return null;
  const slots = history.days[day]?.slots || {};
  const hours = Object.keys(slots).map(h => parseHour(h)).filter(h => h != null && val({ code }, day, h) != null).sort((a, b) => b - a);
  if (hours.length) return val({ code }, day, hours[0]);
  const fixing = ecb({ code }, day);
  return fixing == null ? null : fixing;
}
function hourlyPoints(code, day) {
  const slots = history.days[day]?.slots || {};
  const hours = Object.keys(slots).map(h => parseHour(h)).filter(h => h != null && (code === baseCurrency ? dayRaw('EUR', day) != null || val({ code: 'EUR' }, day, h) != null : val({ code }, day, h) != null)).sort((a, b) => a - b);
  return hours.map(hr => {
    if (code === baseCurrency) return { day, hour: hr, raw: 1, v: 1, label: `${pad(hr)}:00` };
    const raw = val({ code }, day, hr);
    if (raw == null) return null;
    return { day, hour: hr, raw, v: cardRate(raw), label: `${pad(hr)}:00` };
  }).filter(Boolean);
}
function remotePoints(code) {
  if (code === baseCurrency || chartRange === '1T' || chartRange === '1W') return null;
  const own = cachedHistory(code, chartRange);
  if (!Array.isArray(own) || !own.length) return null;
  const today = zurichToday();
  const from = addDays(today, -(rangeDays() - 1));
  const basePts = baseCurrency === 'CHF' ? null : cachedHistory(baseCurrency, chartRange);
  if (baseCurrency !== 'CHF' && !Array.isArray(basePts)) return null;
  const dens = basePts ? new Map(basePts) : null;
  const out = [];
  for (const row of own) {
    const day = row[0];
    const rawChf = row[1];
    if (day < from || day > today || !(rawChf > 0)) continue;
    let perBase = rawChf;
    if (dens) {
      const den = dens.get(day);
      if (!(den > 0)) continue;
      perBase = rawChf / den;
    }
    const v = cardRate(perBase);
    if (v == null) continue;
    out.push({ day, raw: perBase, v, label: prettyDay(day) });
  }
  return out;
}
function chartPoints(code) {
  const today = zurichToday();
  if (chartRange === '1T' || chartRange === '1W') {
    const span = chartRange === '1T' ? 1 : 7;
    const from = addDays(today, -(span - 1));
    let pts = [];
    for (let day = from; day <= today; day = addDays(day, 1)) pts = pts.concat(hourlyPoints(code, day));
    if (!pts.length) {
      for (let i = 1; i < 12 && !pts.length; i++) pts = hourlyPoints(code, addDays(today, -i));
    }
    return pts;
  }
  const remote = remotePoints(code);
  const from = addDays(today, -(rangeDays() - 1));
  const local = [];
  for (let day = from; day <= today; day = addDays(day, 1)) {
    if (code === baseCurrency) {
      if (dayRaw('EUR', day) == null && dayRaw('USD', day) == null) continue;
      local.push({ day, raw: 1, v: 1, label: prettyDay(day) });
    } else {
      const raw = dayRaw(code, day);
      if (raw == null) continue;
      const v = cardRate(raw);
      if (v == null) continue;
      local.push({ day, raw, v, label: prettyDay(day) });
    }
  }
  if (remote && remote.length > local.length) return remote;
  return local;
}
function monotoneSamples(pts) {
  const n = pts.length;
  if (n <= 1) return pts.slice();
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    m[i] = dx[i] === 0 ? 0 : dy / dx[i];
  }
  const tang = new Array(n);
  tang[0] = m[0];
  tang[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tang[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-12) { tang[i] = 0; tang[i + 1] = 0; continue; }
    const a = tang[i] / m[i];
    const b = tang[i + 1] / m[i];
    const hypot = a * a + b * b;
    if (hypot > 9) {
      const tau = 3 / Math.sqrt(hypot);
      tang[i] = tau * a * m[i];
      tang[i + 1] = tau * b * m[i];
    }
  }
  const out = [];
  const steps = 12;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const h = dx[i];
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      const u2 = u * u;
      const u3 = u2 * u;
      const y = (2 * u3 - 3 * u2 + 1) * p0.y + (u3 - 2 * u2 + u) * h * tang[i] + (-2 * u3 + 3 * u2) * p1.y + (u3 - u2) * h * tang[i + 1];
      out.push({ x: p0.x + u * h, y });
    }
  }
  out.push(pts[n - 1]);
  return out;
}
function pathFrom(samples) {
  if (!samples.length) return '';
  let d = `M ${samples[0].x.toFixed(2)} ${samples[0].y.toFixed(2)}`;
  for (let i = 1; i < samples.length; i++) d += ` L ${samples[i].x.toFixed(2)} ${samples[i].y.toFixed(2)}`;
  return d;
}
function plotXY(points) {
  const vals = points.map(p => p.v);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (!(max - min > 1e-12)) { min -= 0.002; max += 0.002; }
  const padY = (max - min) * 0.16;
  min -= padY;
  max += padY;
  const left = 4;
  const right = 316;
  const yTop = 8;
  const height = 96;
  const width = right - left;
  return points.map((p, i) => ({
    ...p,
    x: points.length === 1 ? (left + right) / 2 : left + (i / (points.length - 1)) * width,
    y: yTop + (1 - (p.v - min) / (max - min)) * height,
  }));
}
function chartBlock(c, suffix) {
  const points = chartPoints(c.code);
  if (points.length < 1) return '<p class="ref-src">Keine Kurse in diesem Zeitraum.</p>';
  const plotted = plotXY(points);
  const id = `grad${suffix}${c.code}`;
  plots.set(`${suffix}${c.code}`, plotted);
  const first = plotted[0];
  const last = plotted[plotted.length - 1];
  const tone = last.v - first.v;
  const color = tone > EPS ? UP : tone < -EPS ? DOWN : FLAT;
  const samples = monotoneSamples(plotted);
  const line = pathFrom(samples);
  const area = `${line} L ${last.x.toFixed(2)} 108 L ${first.x.toFixed(2)} 108 Z`;
  const hi = Math.max(...points.map(p => p.v));
  const lo = Math.min(...points.map(p => p.v));
  const buttons = CHART_RANGES.map(item => `<button type="button" data-range="${item.id}" aria-pressed="${item.id === chartRange ? 'true' : 'false'}" aria-label="${esc(item.aria)}">${esc(item.label)}</button>`).join('');
  const dot = plotted.length > 1
    ? `<circle cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="6" fill="${color}" opacity="0.18"/><circle cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="2.5" fill="${color}"/>`
    : `<circle cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="2.5" fill="${color}"/>`;
  const baseline = plotted.length > 1
    ? `<line x1="4" x2="316" y1="${first.y.toFixed(2)}" y2="${first.y.toFixed(2)}" stroke="#8e8e93" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`
    : '';
  return `<div class="chart-block"><div class="chart-row"><div class="chart-frame" data-plot="${suffix}${c.code}" data-code="${esc(c.code)}"><svg class="plot" viewBox="0 0 320 112" role="img" aria-label="Grafik ${esc(ccyName(c))}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.17"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${baseline}<path d="${area}" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${dot}</svg><div class="scrub-rule" hidden></div><div class="scrub-bubble" hidden></div></div><div class="scale"><span>Hoch ${esc(r(hi))}</span><span>Tief ${esc(r(lo))}</span></div></div><div class="chart-dates"><span>${esc(prettyDay(first.day))}</span><span>${esc(prettyDay(last.day))}</span></div><div class="rangebar" role="toolbar" aria-label="Zeitraum">${buttons}</div></div>`;
}
function intervalBlock(c) {
  const rows = HOURS.map(hr => {
    const hit = hourHit(c.code, hr);
    const text = hit ? rateText(c.code, hit.v) : '–';
    return `<div class="slot"><span class="t">${pad(hr)}:00</span><span>${esc(text)}</span></div>`;
  }).join('');
  return `<div class="slots">${rows}</div>`;
}
function forecastBlock(c) {
  const bits = forecastBits(c);
  const dayVal = !bits || bits.todayV == null ? '–' : `${arrowOf(bits.devDay)} ${r(bits.todayV)}`.trim();
  const weekVal = !bits || bits.weekV == null ? '–' : `${arrowOf(bits.devWeek)} ${r(bits.weekV)}`.trim();
  const dayDev = bits ? fmtDev(bits.devDay) : '';
  const weekDev = bits ? fmtDev(bits.devWeek) : '';
  return `<div class="fc-line"><span class="fc-k">Prognose</span><span class="pair"><span class="tag">heute</span><span class="val">${esc(dayVal)}</span><span class="dev">${esc(dayDev)}</span></span><span class="fc-sep">·</span><span class="pair"><span class="tag">7 Tage</span><span class="val">${esc(weekVal)}</span><span class="dev">${esc(weekDev)}</span></span></div>`;
}
function referenceBlock(c) {
  const hit = referenceBits(c);
  const text = hit ? rateText(c.code, hit.v) : '–';
  return `<div class="ref-row"><span>EZB-Referenzkurs</span><span>${esc(text)}</span></div><div class="ref-src">Quelle EZB</div>`;
}
function cardHtml(c, opts) {
  const preview = !!(opts && opts.preview);
  const rows = preview ? [c] : boardRows();
  const index = rows.findIndex(row => row.code === c.code);
  const q = quoteOf(c);
  const subCls = c.code === baseCurrency ? 'csub base-sub' : 'csub';
  let blocks = '';
  if (showChart) blocks += chartBlock(c, preview ? 'p' : 'm');
  if (showIntervals) blocks += intervalBlock(c);
  if (showForecast) blocks += forecastBlock(c);
  if (showReference) blocks += referenceBlock(c);
  let actions = '';
  if (!preview) {
    const upDis = index <= 0 ? ' disabled' : '';
    const dnDis = index < 0 || index >= rows.length - 1 ? ' disabled' : '';
    const del = c.code === baseCurrency ? '' : `<button type="button" class="row-btn row-del" data-del="${esc(c.code)}" aria-label="${esc(ccyName(c))} entfernen">${TRASH}</button>`;
    actions = `<div class="cactions"><button type="button" class="row-btn" data-move="up" data-code="${esc(c.code)}" aria-label="${esc(ccyName(c))} nach oben"${upDis}>${AR_UP}</button><button type="button" class="row-btn" data-move="down" data-code="${esc(c.code)}" aria-label="${esc(ccyName(c))} nach unten"${dnDis}>${AR_DN}</button>${del}</div>`;
  }
  return `<article class="ccard${c.code === baseCurrency ? ' is-base' : ''}" data-code="${esc(c.code)}"><div class="crow"><div class="cleft"><div class="cname"><span class="name">${esc(ccyName(c))}</span>${alarmHint(c.code)}</div><div class="${subCls}">${esc(c.code === baseCurrency ? `${baseCurrency} · Berichtswährung` : `${c.code} · ${currencySymbol(c.code)}`)}</div></div><div class="cright"><div class="crate">${esc(rateText(c.code, q.v))}</div><div class="cinv">${esc(invText(q.raw))}</div></div></div>${blocks ? `<div class="blocks">${blocks}</div>` : ''}${actions}</article>`;
}
function queueHistory(rows, gen) {
  if (!showChart || chartRange === '1T' || chartRange === '1W') return false;
  const codes = [];
  for (const c of rows) {
    if (c.code !== baseCurrency && cachedHistory(c.code, chartRange) == null) codes.push(c.code);
  }
  if (baseCurrency !== 'CHF' && cachedHistory(baseCurrency, chartRange) == null) codes.push(baseCurrency);
  if (!codes.length) return false;
  const range = chartRange;
  Promise.all(codes.map(code => ensureHistory(code, range))).then(() => {
    if (gen !== boardGen || chartRange !== range) return;
    render({ keepScroll: true });
  });
  return true;
}
function paintPreview() {
  const slot = document.getElementById('preview');
  if (!slot) return;
  const eur = currencyRecord('EUR');
  slot.innerHTML = cardHtml(eur, { preview: true });
}
function render(opts = {}) {
  const gen = ++boardGen;
  const board = document.getElementById('board');
  if (!board) return;
  const sc = document.getElementById('scroller');
  const kept = sc ? sc.scrollTop : 0;
  document.body.classList.add('v21');
  const grid = document.getElementById('grid');
  const compact = document.getElementById('compact');
  if (grid) { grid.hidden = true; grid.innerHTML = ''; }
  if (compact) { compact.hidden = true; compact.innerHTML = ''; }
  plots.clear();
  const rows = boardRows();
  const pending = queueHistory(rows, gen);
  const cards = rows.map(c => cardHtml(c)).join('');
  board.innerHTML = `<div class="cap"><span>Währung</span><button type="button" id="baseBtn" class="cap-base">Kurse zu ${esc(baseCurrency)}</button></div>${cards}<button type="button" class="add-ccy" aria-label="Währung hinzufügen">${PLUS_ICON}</button>`;
  board.dataset.charts = pending ? 'loading' : 'ready';
  if (opts && opts.keepScroll && sc) sc.scrollTop = kept;
  const updated = document.getElementById('updated');
  if (updated) updated.textContent = history.updated ? `Erfasst: ${timeFmt.format(new Date(history.updated))}` : '';
  if (document.getElementById('viewDlg')?.open) paintPreview();
}
function sheetHead(title, extra) {
  return `<div class="grabber"></div><div class="sheet-titlebar"><h2>${title}</h2><div class="sheet-tools">${extra || ''}<button type="button" class="sheet-x${extra ? ' nudge' : ''}" data-close aria-label="Schliessen">${SHEET_X}</button></div></div>`;
}
function bindSwipe(dlg) {
  if (!dlg || dlg.dataset.swipe) return;
  dlg.dataset.swipe = '1';
  let y0 = null;
  dlg.addEventListener('pointerdown', e => {
    if (e.target.closest('button, input, a, select, textarea')) return;
    if (!e.target.closest('.grabber, .sheet-titlebar')) return;
    y0 = e.clientY;
  });
  dlg.addEventListener('pointerup', e => {
    if (y0 == null) return;
    const dy = e.clientY - y0;
    y0 = null;
    if (dy > 72 && dlg.scrollTop <= 0) dlg.close();
  });
  dlg.addEventListener('pointercancel', () => { y0 = null; });
}
function checkRow(opt, label, on, extra) {
  const locked = opt === 'current';
  const checked = locked || on;
  return `<button type="button" class="check${locked ? ' is-locked' : ''}" role="checkbox" data-opt="${opt}" aria-checked="${checked ? 'true' : 'false'}"${locked ? ' disabled aria-disabled="true"' : ''}><span class="box">${checked ? CHECK_MARK : ''}</span><span>${label}${extra || ''}</span></button>`;
}
function renderView() {
  const dlg = $('viewDlg');
  dlg.classList.add('sheet');
  dlg.innerHTML = `${sheetHead('Ansicht')}<div class="checks">${checkRow('current', 'Nur aktuelle Kurse anzeigen', true)}${checkRow('chart', 'Grafik anzeigen', showChart)}${checkRow('intervals', 'Intervalle anzeigen', showIntervals)}${checkRow('forecast', 'Prognose', showForecast, ' <small>heute und 7 Tage</small>')}${checkRow('reference', 'Referenzkurse anzeigen', showReference)}</div><p class="disclaimer">${DISCLAIMER}</p><p class="vorschau-label">Vorschau</p><div class="thumb" id="preview"></div>`;
  paintPreview();
  bindSwipe(dlg);
}
function setOpt(key, on) {
  if (key === 'chart') showChart = on;
  else if (key === 'intervals') showIntervals = on;
  else if (key === 'forecast') showForecast = on;
  else if (key === 'reference') showReference = on;
  else return;
  writeViewOptions();
  const btn = document.querySelector(`#viewDlg [data-opt="${key}"]`);
  if (btn) {
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.querySelector('.box').innerHTML = on ? CHECK_MARK : '';
  }
  render({ keepScroll: true });
}
function alarmCodes() {
  return boardRows().map(c => c.code).filter(code => code !== baseCurrency);
}
function alarmDraft() {
  try {
    const data = JSON.parse(localStorage.getItem('wu.alertDraft') || 'null');
    return data && typeof data === 'object' ? data : null;
  } catch { return null; }
}
function alarmEntry(code) {
  const saved = alarmDraft()?.[code] || alertCfg?.currencies?.[code];
  if (saved) return { enabled: !!saved.enabled, down: saved.down > 0 ? saved.down : 0.5, up: saved.up > 0 ? saved.up : 0.25 };
  return { enabled: false, down: 0.5, up: 0.25 };
}
function alertCards() {
  return alarmCodes().map(code => {
    const entry = alarmEntry(code);
    const on = alertsMasterOn() && entry.enabled;
    return `<section class="alcard" data-code="${esc(code)}"><div class="alfield"><h3>${esc(code)}/${esc(baseCurrency)}</h3><button type="button" class="switch" role="switch" aria-checked="${entry.enabled ? 'true' : 'false'}" aria-label="${esc(code)} Alarm" ${alertsMasterOn() ? '' : 'disabled'}></button></div><label class="alfield"><span>Fällt um mehr als</span><span><input type="number" step="0.01" min="0.01" max="20" inputmode="decimal" data-k="down" value="${Number(entry.down).toFixed(2)}"> %</span></label><label class="alfield"><span>Steigt um mehr als</span><span><input type="number" step="0.01" min="0.01" max="20" inputmode="decimal" data-k="up" value="${Number(entry.up).toFixed(2)}"> %</span></label></section>`;
  }).join('');
}
function renderAlerts() {
  const dlg = $('alerts');
  dlg.classList.add('sheet');
  if (alertsPage === 'setup') { renderSetup(); return; }
  const master = alertsMasterOn();
  dlg.innerHTML = `${sheetHead('FX-Alarme', `<button type="button" class="switch" id="alMaster" role="switch" aria-checked="${master ? 'true' : 'false'}" aria-label="Alle Alarme"></button>`)}<p class="alert-intro">${ALERT_INTRO}</p><div class="pair-row"><button type="button" class="pair-btn" id="alSetup">Währungsalarme einrichten</button><button type="button" class="pair-btn" id="alTest">Test-Push senden</button></div>${alertCards()}<p id="alMsg" class="msg" hidden></p><div class="sheet-save"><button type="button" class="primary" id="alSave">Speichern</button></div>`;
  bindSwipe(dlg);
  $('alMaster').onclick = () => {
    const next = $('alMaster').getAttribute('aria-checked') !== 'true';
    setAlertsMaster(next);
    renderAlerts();
  };
  dlg.querySelectorAll('.alcard .switch').forEach(sw => {
    sw.onclick = () => {
      if (!alertsMasterOn()) return;
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    };
  });
  $('alSetup').onclick = () => { alertsPage = 'setup'; renderSetup(); };
  $('alTest').onclick = () => { sendTest(); };
  $('alSave').onclick = () => { saveAlertSheet(); };
}
function renderSetup() {
  const dlg = $('alerts');
  const { topic } = ensureAlertIdentity();
  dlg.innerHTML = `<div class="grabber"></div><button type="button" class="back-link" id="setupBack" aria-label="Zurück"><svg viewBox="0 0 12 20" width="8" height="14" aria-hidden="true"><path d="M9.2 2.2 3 10l6.2 7.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> FX-Alarme</button><button type="button" class="sheet-x" data-close aria-label="Schliessen" style="position:absolute;top:8px;right:14px">${SHEET_X}</button><h2 class="setup-title">So installieren Sie die Währungsalarme:</h2><div class="setup-step"><p>1. Laden Sie die ntfy-App auf Ihr iPhone.</p><a class="store-btn" href="${APP_STORE}" target="_blank" rel="noopener">Im App Store laden</a><a id="play" class="android-slot" href="${PLAY_STORE}" hidden>Android</a></div><div class="setup-step"><p>2. Starten Sie die ntfy-App und geben Sie folgenden Code ein:</p><div class="topic-row"><span class="topic-pill" id="topicPill">${esc(topic)}</span><button type="button" class="copy-btn" id="copyTopic" aria-label="Code kopieren">${COPY_ICON}</button></div><div class="ntfy-diagram" aria-hidden="true"><div class="ntfy-bar"><span class="ntfy-plus">+</span><span>ntfy</span></div><div class="ntfy-field"><span>Thema</span><span>wae-…</span></div></div></div><div class="setup-step"><p>3. Tippen Sie unten auf „Test-Push“, um die Alarmeinstellung zu testen.</p><button type="button" class="pair-btn" id="setupTest">Test-Push senden</button></div><p id="alMsg" class="msg" hidden></p>`;
  bindSwipe(dlg);
  $('setupBack').onclick = () => { alertsPage = 'list'; renderAlerts(); };
  $('copyTopic').onclick = async () => {
    try {
      await navigator.clipboard.writeText(topic);
      alertMsg('Code kopiert.', true);
    } catch { alertMsg('Kopieren nicht möglich.'); }
  };
  $('setupTest').onclick = () => { sendTest(); };
}
function readAlertCards() {
  const master = alertsMasterOn();
  const vals = {};
  for (const card of $('alerts').querySelectorAll('.alcard')) {
    const code = card.dataset.code;
    const want = card.querySelector('.switch').getAttribute('aria-checked') === 'true';
    const down = parseFloat(String(card.querySelector('[data-k="down"]').value).replace(',', '.'));
    const up = parseFloat(String(card.querySelector('[data-k="up"]').value).replace(',', '.'));
    if (!(down > 0 && down <= 20) || !(up > 0 && up <= 20)) return { error: `Ungültige Schwelle bei ${code} (0.01–20 %).` };
    vals[code] = { enabled: !!(master && want), down: Math.round(down * 100) / 100, up: Math.round(up * 100) / 100 };
  }
  return { vals };
}
async function saveAlertSheet() {
  const form = readAlertCards();
  if (form.error) { alertMsg(form.error); return; }
  const btn = $('alSave');
  if (btn) btn.disabled = true;
  alertMsg('Speichere …', true);
  try {
    try { localStorage.setItem('wu.alertDraft', JSON.stringify(form.vals)); } catch { /* diese Sitzung */ }
    const serverVals = {};
    for (const code of ['USD', 'EUR']) if (form.vals[code]) serverVals[code] = form.vals[code];
    if (Object.keys(serverVals).length) await applyAlertForm(serverVals);
    renderAlerts();
    alertMsg('Gespeichert.', true);
  } catch (e) {
    if (btn) btn.disabled = false;
    alertMsg(`Speichern fehlgeschlagen: ${e.message}`);
  }
}
async function sendTest() {
  const onList = alertsPage !== 'setup' && $('alerts').querySelector('.alcard');
  if (onList) {
    const form = readAlertCards();
    if (form.error) { alertMsg(form.error); return; }
    try { await applyAlertForm(form.vals); } catch (e) { alertMsg(`Test-Push fehlgeschlagen: ${e.message}`); return; }
  }
  alertMsg('Sende Test-Push …', true);
  try {
    const { id } = ensureAlertIdentity();
    const res = await fetch(`api/alerts/${id}/test`, { method: 'POST', cache: 'no-store' });
    if (!res.ok) throw new Error(await alertError(res));
    alertMsg('Test-Push gesendet.', true);
  } catch (e) {
    alertMsg(`Test-Push fehlgeschlagen: ${e.message}`);
  }
}
async function openAlerts() {
  const dlg = $('alerts');
  dlg.classList.add('sheet');
  alertsPage = 'list';
  dlg.innerHTML = '<p class="note">Lade …</p>';
  if (!dlg.open) dlg.showModal();
  bindSwipe(dlg);
  await loadAlerts();
  renderAlerts();
  render({ keepScroll: true });
}
function renderTimes() {
  const dlg = $('times');
  dlg.classList.add('sheet');
  const unset = !timesUserSet;
  const state = {
    start: unset ? 7 : schedule.start,
    end: unset ? 17 : schedule.end,
    step: unset ? null : schedule.intervalHours,
  };
  const draw = () => {
    const hours = state.step == null ? HOURS.slice() : expandSchedule(state.start, state.end, state.step);
    const pills = hours.map(hr => `<span class="pill">${pad(hr)}:00</span>`).join('');
    const seg = INTERVALS.map(n => `<button type="button" class="segbtn" data-step="${n}" aria-pressed="${n === state.step ? 'true' : 'false'}">${n} h</button>`).join('');
    dlg.innerHTML = `${sheetHead('Erfassungszeiten')}<p class="tm-note">Gilt nur für die Anzeige auf diesem Gerät.</p><div class="tm"><div class="tm-row"><label for="tmStart">Von</label><select id="tmStart" class="tm-time">${timeOptions(state.start)}</select></div><div class="tm-row"><label for="tmEnd">Bis</label><select id="tmEnd" class="tm-time">${timeOptions(state.end)}</select></div><div class="tm-row tm-interval"><span id="tmIntLabel">Intervall</span><div class="seg" role="group" aria-labelledby="tmIntLabel">${seg}</div></div></div><div class="tm-preview"><div class="pills">${pills}</div><p class="tm-count">${hours.length ? measurementCaption(hours.length) : 'Beginn muss vor dem Ende liegen.'}</p></div><p id="tmMsg" class="msg" hidden></p><div class="sheet-save"><button type="button" class="primary" id="tmSave">Speichern</button></div>`;
    $('tmStart').onchange = () => { state.start = Number($('tmStart').value); draw(); };
    $('tmEnd').onchange = () => { state.end = Number($('tmEnd').value); draw(); };
    dlg.querySelectorAll('.segbtn').forEach(btn => {
      btn.onclick = () => { state.step = Number(btn.dataset.step); draw(); };
    });
    $('tmSave').onclick = () => saveTimes(state);
  };
  draw();
  bindSwipe(dlg);
}
function saveTimes(state) {
  if (state.step == null) {
    const data = { version: 2, hours: HOURS.map(hr => pad(hr)) };
    try { localStorage.setItem(LS_VIEW, JSON.stringify(data)); } catch { /* diese Sitzung */ }
    applyTimesConfig(data);
  } else {
    const pattern = expandSchedule(state.start, state.end, state.step);
    if (!pattern.length) { tmMsg('Beginn muss vor dem Ende liegen.'); return; }
    try { writeView(state); } catch { /* Anzeige gilt für diese Sitzung */ }
    applyTimesConfig({ version: 2, start: pad(state.start), end: pad(state.end), intervalHours: state.step });
  }
  render({ keepScroll: true });
  renderTimes();
  tmMsg('Gespeichert.', true);
}
async function openTimes() {
  const dlg = $('times');
  dlg.classList.add('sheet');
  if (!dlg.open) dlg.showModal();
  renderTimes();
}
function addable() {
  const shown = new Set(boardRows().map(c => c.code));
  const codes = new Set([...Object.keys(PAIRS), ...hiddenSet()]);
  const out = [];
  for (const code of codes) {
    const norm = normalizeCurrency(code);
    if (!norm || shown.has(norm)) continue;
    out.push(currencyRecord(norm));
  }
  out.sort((a, b) => ccyName(a).localeCompare(ccyName(b), 'de'));
  return out;
}
function renderAdd() {
  const dlg = $('addDlg');
  dlg.classList.add('sheet');
  const q = addQuery.trim().toLowerCase();
  const items = addable().filter(c => `${ccyName(c)} ${c.code}`.toLowerCase().includes(q));
  const rows = items.length
    ? items.map(c => `<button type="button" class="add-row" data-add="${esc(c.code)}"><span class="flag">${flagSvg(c.code)}</span><span><span class="name">${esc(ccyName(c))}</span><span class="csub">${esc(c.code)} · ${esc(currencySymbol(c.code))}</span></span></button>`).join('')
    : '<p class="add-empty">Keine passende Währung.</p>';
  dlg.innerHTML = `${sheetHead('Währung')}<input class="add-search" id="addSearch" type="search" placeholder="Suchen" value="${esc(addQuery)}" autocomplete="off">${rows}`;
  const input = $('addSearch');
  input.oninput = () => { addQuery = input.value; renderAdd(); };
  input.focus();
  const pos = addQuery.length;
  try { input.setSelectionRange(pos, pos); } catch { /* Typ ohne Auswahl */ }
  bindSwipe(dlg);
}
function addCurrency(code) {
  const hidden = new Set(hiddenSet());
  hidden.delete(code);
  persistHidden(hidden);
  ensureCurrency(code);
  const rows = boardRows().filter(c => c.code !== code);
  rows.push(currencyRecord(code));
  writeListOrder(rows);
  persistOrder(rows.filter(c => c.code !== baseCurrency));
  if (!live[code]) loadLive();
  render({ keepScroll: true });
}
function moveRow(code, dir) {
  const rows = boardRows();
  const i = rows.findIndex(c => c.code === code);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;
  const next = rows.slice();
  const [item] = next.splice(i, 1);
  next.splice(j, 0, item);
  writeListOrder(next);
  persistOrder(next.filter(c => c.code !== baseCurrency));
  announce(`${ccyName(item)}, Position ${j + 1} von ${next.length}`);
  render({ keepScroll: true });
}
function deleteRow(code) {
  if (code === baseCurrency) return;
  const next = boardRows().filter(c => c.code !== code);
  writeListOrder(next);
  hideCurrency(code);
}
function bindScrub() {
  let gesture = null;
  const hide = frame => {
    if (!frame) return;
    const rule = frame.querySelector('.scrub-rule');
    const bubble = frame.querySelector('.scrub-bubble');
    if (rule) rule.hidden = true;
    if (bubble) bubble.hidden = true;
  };
  const show = (frame, clientX) => {
    const pts = plots.get(frame.dataset.plot);
    const svg = frame.querySelector('.plot');
    if (!pts || pts.length < 2 || !svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = ((clientX - rect.left) / rect.width) * 320;
    let best = pts[0];
    let dist = Math.abs(best.x - x);
    for (const p of pts) {
      const d = Math.abs(p.x - x);
      if (d < dist) { best = p; dist = d; }
    }
    const rule = frame.querySelector('.scrub-rule');
    const bubble = frame.querySelector('.scrub-bubble');
    const localX = (best.x / 320) * rect.width;
    rule.hidden = false;
    rule.style.left = `${localX}px`;
    const when = best.hour != null ? `${prettyDay(best.day)} ${pad(best.hour)}:00` : (best.label || prettyDay(best.day));
    bubble.hidden = false;
    bubble.innerHTML = `<b>${esc(rateText(frame.dataset.code, best.v))}</b><span>${esc(when)}</span><span>${esc(invText(best.raw))}</span>`;
    const bw = bubble.offsetWidth || 110;
    let left = localX + 8;
    if (left + bw > rect.width - 4) left = Math.max(4, localX - bw - 8);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${Math.min(rect.height - 36, Math.max(4, (best.y / 112) * rect.height))}px`;
  };
  document.addEventListener('pointerdown', e => {
    const frame = e.target.closest?.('.chart-frame');
    if (!frame) return;
    gesture = { id: e.pointerId, frame };
    show(frame, e.clientX);
  });
  document.addEventListener('pointermove', e => {
    if (gesture && gesture.id === e.pointerId) { show(gesture.frame, e.clientX); return; }
    if (e.pointerType !== 'mouse' || gesture) return;
    const frame = e.target.closest?.('.chart-frame');
    document.querySelectorAll('.chart-frame').forEach(other => { if (other !== frame) hide(other); });
    if (frame) show(frame, e.clientX);
  });
  const end = e => {
    if (!gesture || (e && gesture.id !== e.pointerId && e.type !== 'pointerleave')) return;
    if (e && e.pointerType === 'mouse') return;
    hide(gesture.frame);
    gesture = null;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}
function onDocClick(e) {
  const closer = e.target.closest('[data-close]');
  if (closer) { closer.closest('dialog')?.close(); return; }
  const opt = e.target.closest('#viewDlg [data-opt]');
  if (opt && !opt.disabled && opt.dataset.opt !== 'current') {
    setOpt(opt.dataset.opt, opt.getAttribute('aria-checked') !== 'true');
    return;
  }
  const range = e.target.closest('[data-range]');
  if (range && range.dataset.range !== chartRange) {
    chartRange = range.dataset.range;
    writeViewOptions();
    render({ keepScroll: true });
    return;
  }
  const add = e.target.closest('[data-add]');
  if (add) {
    addCurrency(add.dataset.add);
    $('addDlg').close();
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) { deleteRow(del.dataset.del); return; }
  const move = e.target.closest('[data-move]');
  if (move && !move.disabled) { moveRow(move.dataset.code, move.dataset.move); return; }
  if (e.target.closest('.add-ccy')) {
    addQuery = '';
    renderAdd();
    $('addDlg').showModal();
    return;
  }
  if (e.target.closest('#baseBtn')) {
    renderBase();
    $('baseDlg').showModal();
  }
}

if (typeof document !== 'undefined') {
  document.body.classList.add('v21');
  bindScrub();
  document.addEventListener('click', onDocClick);
  $('viewBtn').addEventListener('click', () => { renderView(); $('viewDlg').showModal(); });
  $('timesBtn').addEventListener('click', () => { openTimes(); });
  $('alertsBtn').addEventListener('click', () => { openAlerts(); });
  $('viewDlg').addEventListener('close', () => { /* Ansicht bleibt live gespeichert */ });
  $('alerts').addEventListener('close', () => { alertsPage = 'list'; });
  render();
  if (typeof runtimePromise !== 'undefined' && runtimePromise) {
    runtimePromise.then(() => loadAlerts()).then(() => render({ keepScroll: true })).catch(() => {});
  }
}
