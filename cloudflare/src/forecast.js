// Prognosen, 1:1 zu scripts/capture.py (dort Port von main.swift).
import { fsum } from './json.js';
import { CLOSE_HOUR, LEGACY_BASIS_HOUR, addDays, isWeekday, slotUtcMs } from './time.js';

export function resolveBasisHour(candles, day, start, gridHours) {
  const present = new Set(candles.map(c => c.t));
  const has = hour => hour != null && present.has(slotUtcMs(day, hour));
  if (has(start)) return start;
  for (const hour of [...gridHours].filter(h => h < CLOSE_HOUR).sort((a, b) => a - b)) {
    if (has(hour)) return hour;
  }
  if (has(LEGACY_BASIS_HOUR)) return LEGACY_BASIS_HOUR;
  return null;
}

export function forecastTargetDay(day) {
  return addDays(day, 7);
}

export function forecastEndOfDay(candles, day, basisHour) {
  const tBasis = slotUtcMs(day, basisHour);
  const cs = candles.filter(c => c.t <= tBasis);
  const byTime = new Map();
  for (const c of cs) if (!byTime.has(c.t)) byTime.set(c.t, c);
  if (!byTime.has(tBasis)) return null;
  const spot = byTime.get(tBasis).o;
  const prevDays = [];
  let d = day;
  for (let i = 0; i < 14; i++) {
    if (prevDays.length >= 6) break;
    d = addDays(d, -1);
    if (isWeekday(d) && byTime.has(slotUtcMs(d, CLOSE_HOUR))) prevDays.push(d);
  }
  if (prevDays.length < 2) return null;
  const closes = prevDays.map(p => byTime.get(slotUtcMs(p, CLOSE_HOUR)).o);
  const prevClose = closes[0];
  const trend = (closes[0] - closes[closes.length - 1]) / (closes.length - 1);
  const overnight = spot - prevClose;
  const ranges = [];
  for (const p of prevDays.slice(0, 5)) {
    const frm = slotUtcMs(p, basisHour);
    const to = slotUtcMs(p, CLOSE_HOUR);
    const dc = cs.filter(c => c.t >= frm && c.t < to);
    if (dc.length) ranges.push(Math.max(...dc.map(c => c.h)) - Math.min(...dc.map(c => c.l)));
  }
  const avgRange = ranges.length ? fsum(ranges) / ranges.length : Math.abs(spot) * 0.005;
  let change = 0.5 * trend - 0.3 * overnight;
  const limit = 0.5 * avgRange;
  change = Math.min(Math.max(change, -limit), limit);
  return spot + change;
}

export function forecast7Days(candles, ecbSeries, day, basisHour) {
  const tBasis = slotUtcMs(day, basisHour);
  const byTime = new Map();
  for (const c of candles) {
    if (c.t <= tBasis && !byTime.has(c.t)) byTime.set(c.t, c);
  }
  if (!byTime.has(tBasis)) return null;
  const spot = byTime.get(tBasis).o;
  const closes = [];
  let d = day;
  for (let i = 0; i < 40; i++) {
    if (closes.length >= 20) break;
    d = addDays(d, -1);
    if (!isWeekday(d)) continue;
    const c16 = byTime.get(slotUtcMs(d, CLOSE_HOUR));
    if (c16) closes.push(c16.o);
    else if (Object.prototype.hasOwnProperty.call(ecbSeries, d)) closes.push(ecbSeries[d]);
  }
  if (closes.length < 2) return null;
  const rets = [];
  for (let i = 0; i < closes.length - 1; i++) rets.push(Math.log(closes[i] / closes[i + 1]));
  const head = rets.slice(0, 10);
  const m = fsum(head) / head.length;
  const horizon = 5;
  const trend = spot * 0.3 * horizon * m;
  const revert = closes.length >= 5 ? 0.15 * (fsum(closes) / closes.length - spot) : 0;
  let sd;
  if (rets.length >= 3) {
    const mean = fsum(rets) / rets.length;
    sd = Math.sqrt(fsum(rets.map(r => (r - mean) ** 2)) / (rets.length - 1));
  } else sd = 0.005;
  const limit = sd * Math.sqrt(horizon) * spot;
  const change = Math.min(Math.max(trend + revert, -limit), limit);
  return spot + change;
}
