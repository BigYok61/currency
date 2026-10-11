// Europe/Zurich calendar helpers. Capture hours are daytime, so they never fall in the DST gap.
export const ZURICH = 'Europe/Zurich';
export const START_DAY = '2026-10-01';
export const CLOSE_HOUR = 16;
export const LEGACY_BASIS_HOUR = 8;
export const ECB_LOOKBACK_DAYS = 45;

const formatters = new Map();

function formatter(timeZone) {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function validTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  try {
    formatter(timeZone.trim());
    return true;
  } catch {
    return false;
  }
}

export function zoneParts(date, timeZone = ZURICH) {
  const parts = {};
  for (const p of formatter(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  let year = Number(parts.year);
  let month = Number(parts.month);
  let day = Number(parts.day);
  let hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  // Some engines report midnight as 24:00 on the previous calendar day.
  if (hour === 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return { year, month, day, hour, minute, second };
}

export function zurichParts(date) {
  return zoneParts(date, ZURICH);
}

export function dateString(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function zurichDateString(date) {
  const p = zurichParts(date);
  return dateString(p.year, p.month, p.day);
}

export function zurichHourMinute(date) {
  return zoneHourMinute(date, ZURICH);
}

export function zoneDateString(date, timeZone = ZURICH) {
  const p = zoneParts(date, timeZone);
  return dateString(p.year, p.month, p.day);
}

export function zoneHourMinute(date, timeZone = ZURICH) {
  const p = zoneParts(date, timeZone);
  return { hour: p.hour, minute: p.minute, label: `${pad(p.hour)}:${pad(p.minute)}` };
}

function zoneOffsetMs(date, timeZone) {
  const p = zoneParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function offsetMs(date) {
  return zoneOffsetMs(date, ZURICH);
}

/** UTC epoch ms of a wall time in an IANA zone. A non-hour offset is exact, not floored. */
export function zoneWallUtcMs(dayStr, hour, minute, timeZone = ZURICH) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute || 0, 0);
  const off1 = zoneOffsetMs(new Date(guess), timeZone);
  let utc = guess - off1;
  const off2 = zoneOffsetMs(new Date(utc), timeZone);
  if (off2 !== off1) utc = guess - off2;
  return utc;
}

/** UTC epoch ms of a Zurich wall time on a calendar day (yyyy-mm-dd, hour 0–23). */
export function slotUtcMs(dayStr, hour) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  const off1 = offsetMs(new Date(guess));
  let utc = guess - off1;
  const off2 = offsetMs(new Date(utc));
  if (off2 !== off1) utc = guess - off2;
  return utc;
}

export function parseInstant(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`ungültige Zeit ${iso}`);
  return ms;
}

export function isWeekday(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd !== 0 && wd !== 6;
}

export function addDays(dayStr, n) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function weekdays(from, to) {
  const out = [];
  let d = from;
  while (d <= to) {
    if (isWeekday(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export function formatUtcStamp(date) {
  return date.toISOString().slice(0, 19) + 'Z';
}
