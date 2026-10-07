// Lesereihenfolge der Erfassungszeiten und dasselbe Stundenraster wie capture.py.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const store = new Map();
const context = vm.createContext({
  localStorage: {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
  },
  console,
  structuredClone,
  TextEncoder,
  TextDecoder,
  atob,
  btoa,
  URL,
  Blob,
  setInterval: () => 0,
  fetch: async () => { throw new Error('fetch should not run in this test'); },
});
const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  + '\nglobalThis.__setTimesState = (next) => { history = next.history; schedule = next.schedule; };\n';
vm.runInContext(source, context);

const { expandSchedule, normalizeHours, pickTimes, rememberTimes, rememberedTimes, parseStep } = context;
const expand = (start, end, step) => [...expandSchedule(start, end, step)];
const hours = (start, end, step) => [...normalizeHours(expandSchedule(start, end, step))];

assert.deepEqual(expand(6, 20, 1), Array.from({ length: 15 }, (_, i) => 6 + i));
assert.deepEqual(expand(6, 20, 2), [6, 8, 10, 12, 14, 16, 18, 20]);
assert.deepEqual(expand(6, 21, 3), [6, 9, 12, 15, 18, 21]);
assert.deepEqual(hours(6, 21, 3), [6, 9, 12, 15, 18, 21]);
assert.deepEqual(expand(6, 20, 4), [6, 10, 14, 18]);
assert.deepEqual(hours(6, 20, 4), [6, 10, 14, 18]);
assert.deepEqual(hours(6, 20, 8), [6, 14]);
assert.deepEqual(hours(6, 20, 12), [6, 18]);
assert.deepEqual(hours(6, 20, 24), [6]);
assert.deepEqual(hours(8, 20, 24), [8]);
assert.deepEqual(expand(6, 20, 5), []);
assert.deepEqual(expand(20, 6, 2), []);
assert.equal(parseStep('24'), 24);
assert.equal(parseStep(true), null);

const fresh = { version: 2, start: '06', end: '21', intervalHours: 3 };
const stale = { version: 2, start: '06', end: '20', intervalHours: 2 };

assert.equal(pickTimes({ api: fresh, raw: stale, pages: stale, saved: stale }), fresh);
assert.equal(pickTimes({ api: null, raw: fresh, pages: stale, saved: null }), fresh);
assert.equal(pickTimes({ api: null, raw: stale, pages: stale, saved: fresh }), fresh);
assert.equal(pickTimes({ api: null, raw: null, pages: stale, saved: fresh }), fresh);
assert.equal(pickTimes({ api: null, raw: null, pages: stale, saved: null }), stale);
assert.equal(pickTimes({ api: { version: 2 }, raw: fresh, pages: stale, saved: null }), fresh);
assert.equal(pickTimes({ api: null, raw: fresh, pages: stale, saved: { ...fresh } }).intervalHours, 3);

rememberTimes(fresh);
assert.equal(rememberedTimes().intervalHours, 3);
store.set('wu.captureTimes', JSON.stringify({ savedAt: Date.now() - 11 * 60 * 1000, data: fresh }));
assert.equal(rememberedTimes(), null);
store.set('wu.captureTimes', JSON.stringify({ savedAt: Date.now() - 9 * 60 * 1000, data: fresh }));
assert.equal(rememberedTimes().end, '21');

const { changeBasis, forecastBasisHour } = context;
const day = { slots: { '09': { EUR: 1.1 }, '12': { EUR: 1.2 }, '16': { EUR: 1.3 } }, forecast: { EUR: 1.4 } };
context.__setTimesState({ schedule: { start: 6, end: 21, intervalHours: 3 }, history: { days: { '2026-10-07': day } } });
assert.equal(changeBasis({ code: 'EUR' }, '2026-10-07'), 9);
day.slots['06'] = { EUR: 1.0 };
assert.equal(changeBasis({ code: 'EUR' }, '2026-10-07'), 6);
assert.equal(forecastBasisHour({ code: 'EUR' }, '2026-10-07', 'day'), 8);
day.forecastBasis = { EUR: 6 };
assert.equal(forecastBasisHour({ code: 'EUR' }, '2026-10-07', 'day'), 6);

console.log('times read + interval ok');
