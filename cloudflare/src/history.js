// Tägliche EZB-Referenzkurse (SDMX) als CHF je 1 Einheit.
// EUR ist die EZB-Reihe CHF. Übrige Währungen: CHF je EUR geteilt durch Fremdwährung je EUR.
import { roundHalfEven } from './json.js';
import { addDays, zurichDateString, zurichParts } from './time.js';
import { readJson, writeRaw } from './storage.js';

export const HISTORY_CODES = [
  'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'NZD', 'SEK', 'JPY', 'NOK', 'DKK', 'PLN', 'HUF', 'TRY', 'SGD', 'MXN', 'ZAR',
];

/** Fremdwährung je 1 EUR, plus CHF als Umrechnung. EUR selbst steht nicht in der SDMX-Reihe. */
const SDMX_CODES = ['USD', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'JPY', 'NOK', 'DKK', 'PLN', 'HUF', 'TRY', 'SGD', 'MXN', 'ZAR'];

const CODE_SET = new Set(HISTORY_CODES);

/** Kalendertage inklusive heute, und Obergrenze der ausgelieferten Punkte. */
export const RANGES = {
  '1M': { days: 31, max: 40 },
  '1J': { days: 360, max: 180 },
  '5J': { days: 365 * 5 + 2, max: 220 },
  '10J': { days: 365 * 10 + 3, max: 260 },
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isHistoryCode(code) {
  return CODE_SET.has(code);
}

export function historyKey(code) {
  return `history-${code}`;
}

export function ecbHistoryUrl(start, codes = SDMX_CODES) {
  const key = `D.${codes.join('+')}.EUR.SP00.A`;
  const params = new URLSearchParams({ startPeriod: start, format: 'csvdata', detail: 'dataonly' });
  return `https://data-api.ecb.europa.eu/service/data/EXR/${key}?${params}`;
}

export function splitCsv(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** CSV der EZB (detail=dataonly) → { USD: { 'YYYY-MM-DD': fremdJeEur } }. */
export function parseEcbRates(csv) {
  const lines = String(csv).replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return {};
  const header = splitCsv(lines[0]);
  const iCur = header.indexOf('CURRENCY');
  const iTime = header.indexOf('TIME_PERIOD');
  const iVal = header.indexOf('OBS_VALUE');
  if (iCur < 0 || iTime < 0 || iVal < 0) throw new Error('ECB-CSV ohne CURRENCY, TIME_PERIOD, OBS_VALUE');
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsv(lines[i]);
    const cur = cols[iCur];
    const day = cols[iTime];
    const n = Number(cols[iVal]);
    if (!cur || !DAY.test(day || '') || !(n > 0)) continue;
    if (!out[cur]) out[cur] = {};
    out[cur][day] = n;
  }
  return out;
}

/** Fremdwährung je EUR → aufsteigende Punkte [Tag, CHF je 1 Einheit]. Tage ohne CHF entfallen. */
export function toChfPoints(rates) {
  const chf = rates.CHF || {};
  const days = Object.keys(chf).filter(day => chf[day] > 0).sort();
  const out = { EUR: days.map(day => [day, roundHalfEven(chf[day], 6)]) };
  for (const code of HISTORY_CODES) {
    if (code === 'EUR') continue;
    const series = rates[code];
    if (!series) continue;
    const points = [];
    for (const day of days) {
      const foreign = series[day];
      if (!(foreign > 0)) continue;
      points.push([day, roundHalfEven(chf[day] / foreign, 6)]);
    }
    out[code] = points;
  }
  return out;
}

/** Bestehende Punkte mit neuen überschreiben (gleicher Tag). Ergebnis nach Datum sortiert. */
export function mergePoints(existing, incoming) {
  const map = new Map();
  for (const row of existing || []) remember(map, row);
  for (const row of incoming || []) remember(map, row);
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function remember(map, row) {
  if (!row || !DAY.test(row[0]) || !Number.isFinite(row[1])) return;
  map.set(row[0], row[1]);
}

/** Gleichmässig ausdünnen, ersten und letzten Punkt behalten. */
export function downsample(points, max) {
  if (points.length <= max) return points.slice();
  if (max < 2) return [points[points.length - 1]];
  const last = points.length - 1;
  const out = [];
  let prev = -1;
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * last) / (max - 1));
    if (idx === prev) continue;
    out.push(points[idx]);
    prev = idx;
  }
  return out;
}

/** Punkte im Fenster bis today, dann ausgedünnt. null bei unbekanntem Zeitraum. */
export function selectRange(points, range, today) {
  const spec = RANGES[range];
  if (!spec || !DAY.test(today || '')) return null;
  const from = addDays(today, -(spec.days - 1));
  const filtered = [];
  for (const row of points || []) {
    if (!row || !DAY.test(row[0]) || row[0] < from || row[0] > today) continue;
    if (!Number.isFinite(row[1])) continue;
    filtered.push([row[0], row[1]]);
  }
  return downsample(filtered, spec.max);
}

export function formatPoint(v) {
  if (!Number.isFinite(v)) return null;
  const neg = v < 0;
  const text = Math.abs(v).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return (neg ? '-' : '') + (text || '0');
}

export function historyBody(code, points) {
  return `{"version":1,"code":"${code}","points":[${pointList(points)}]}`;
}

export function historyResponseBody(code, range, points) {
  return `{"version":1,"code":"${code}","range":"${range}","unit":"CHF","points":[${pointList(points)}]}`;
}

function pointList(points) {
  const bits = [];
  for (const row of points || []) {
    if (!row || !DAY.test(row[0])) continue;
    const text = formatPoint(row[1]);
    if (text == null) continue;
    bits.push(`["${row[0]}",${text}]`);
  }
  return bits.join(',');
}

/** Werktags um 17 Uhr Zürich (5 * * * MON-FRI) und am Samstag (5 6 * * SAT). Der 15-Minuten-Cron bleibt aussen vor. */
export function shouldRefreshHistory(cron, date = new Date()) {
  const text = String(cron || '');
  if (text.startsWith('*/15')) return false;
  if (text.startsWith('5 6')) return true;
  return zurichParts(date).hour === 17;
}

const UA = 'Waehrungsuebersicht/1.0 (+cloudflare)';

/** Letzte Wochen der EZB nachziehen. Ein Fehler wirft; der Aufrufer fängt ihn. */
export async function updateRecentHistory(env, fetchImpl = fetch, now = new Date()) {
  const today = zurichDateString(now);
  const start = addDays(today, -21);
  const res = await fetchImpl(ecbHistoryUrl(start), { headers: { Accept: 'text/csv', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`ECB ${res.status}`);
  const points = toChfPoints(parseEcbRates(await res.text()));
  for (const code of HISTORY_CODES) {
    const incoming = points[code] || [];
    if (!incoming.length) continue;
    const existing = await readJson(env, historyKey(code));
    const merged = mergePoints(existing && existing.points, incoming);
    await writeRaw(env, historyKey(code), historyBody(code, merged));
  }
  return points;
}

export function readHistoryDocument(raw) {
  if (raw == null || raw === '') return null;
  const doc = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!doc || !Array.isArray(doc.points)) return null;
  return doc;
}
