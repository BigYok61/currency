// Raster aus capture-times.json. Gleiche Regeln wie scripts/capture.py (Version 2, sonst Version 1).
export const INTERVALS = [1, 2, 3, 4, 8, 12, 24];
export const DEFAULT_SCHEDULE = [6, 20, 2];
export const DEFAULT_HOURS = [6, 8, 10, 12, 14, 16, 18, 20];
export const CLOSE_HOUR = 16;

export function parseHour(item) {
  if (typeof item === 'boolean') return null;
  if (typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 23) return item;
  if (typeof item === 'string' && /^\d{1,2}$/.test(item.trim())) {
    const n = Number(item.trim());
    if (n >= 0 && n <= 23) return n;
  }
  return null;
}

export function parseStep(item) {
  if (typeof item === 'boolean') return null;
  if (typeof item === 'number' && INTERVALS.includes(item)) return item;
  if (typeof item === 'string' && /^\d{1,2}$/.test(item.trim())) {
    const n = Number(item.trim());
    if (INTERVALS.includes(n)) return n;
  }
  return null;
}

export function expandSchedule(start, end, step) {
  if (start == null || end == null || step == null || !(start >= 0 && start < end && end <= 23)) return null;
  if (!INTERVALS.includes(step)) return null;
  const out = [];
  for (let h = start; h <= end; h += step) out.push(h);
  return out;
}

export function hoursFromList(raw) {
  if (!Array.isArray(raw)) return null;
  const parsed = [];
  for (const item of raw) {
    const n = parseHour(item);
    if (n != null) parsed.push(n);
  }
  return parsed.length ? parsed : null;
}

/** @returns {{ start: number, grid: number[], capture: number[] }} */
export function loadTimes(data) {
  let start = null;
  let grid = null;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const expanded = expandSchedule(parseHour(data.start), parseHour(data.end), parseStep(data.intervalHours));
    if (expanded) {
      start = parseHour(data.start);
      grid = expanded;
    } else {
      const listed = hoursFromList(data.hours);
      if (listed) {
        grid = [...new Set(listed)].sort((a, b) => a - b);
        start = grid[0];
      }
    }
  }
  if (!grid) {
    start = DEFAULT_SCHEDULE[0];
    grid = DEFAULT_HOURS.slice();
  }
  const capture = [...new Set([...grid, CLOSE_HOUR, start])].sort((a, b) => a - b);
  return { start, grid, capture };
}

export function basisHour(data) {
  try {
    const raw = data && typeof data === 'object' ? data.start : null;
    const n = parseHour(raw);
    if (n != null) return n;
  } catch { /* Standard */ }
  return 6;
}
