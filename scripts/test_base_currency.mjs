// Ersteinrichtung der Basiswährung aus Sprache und Zeitzone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
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
  fetch: async () => { throw new Error('fetch should not run'); },
});
const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  + '\nglobalThis.__setBaseState = (next) => { history = next.history; baseCurrency = next.base; baseHint = next.hint ?? null; baseDaily = next.daily || {}; schedule = next.schedule || schedule; };\n';
vm.runInContext(source, context);

const { firstInstallChoice, detectRegion, shown, shownForecast } = context;

function choice(languages, timeZone) {
  const got = firstInstallChoice(languages, timeZone);
  return { base: got.base, order: got.order ? [...got.order] : null };
}
assert.equal(detectRegion(['de-CH', 'de'], 'Europe/Berlin'), 'CH');
assert.deepEqual(choice(['de-CH'], 'Europe/Berlin'), { base: 'CHF', order: null });
assert.deepEqual(choice(['de-DE', 'de'], 'Europe/Zurich'), { base: 'EUR', order: ['CHF', 'USD', 'GBP'] });
assert.deepEqual(choice(['sv-SE'], 'Europe/Stockholm'), { base: 'SEK', order: ['CHF', 'EUR', 'USD', 'GBP'] });
assert.equal(firstInstallChoice(['de'], 'Europe/Zurich').base, 'CHF');
assert.equal(firstInstallChoice(['de'], 'Europe/Berlin').base, 'EUR');
// Zeitzone schlägt eine Sprache ohne Region. Sprache allein gilt nur ohne Zeitzonen-Hinweis.
assert.equal(firstInstallChoice(['sv'], 'Pacific/Auckland').base, 'NZD');
assert.equal(firstInstallChoice(['sv'], 'Pacific/Honolulu').base, 'SEK');
assert.equal(firstInstallChoice(['en-US'], 'Europe/Zurich').base, 'USD');
assert.equal(firstInstallChoice(['zh-CN'], 'Asia/Shanghai').base, 'CHF');

const day = {
  slots: { '06': { EUR: 0.94, USD: 0.80, GBP: 1.07 }, '16': { EUR: 0.95, USD: 0.81 } },
  forecast: { EUR: 0.96, USD: 0.82 },
  forecastBasis: { EUR: 6, USD: 6 },
};
context.__setBaseState({
  base: 'CHF',
  history: { days: { '2026-10-09': day } },
  schedule: { start: 6, end: 20, intervalHours: 2 },
});
assert.equal(shown({ code: 'EUR' }, '2026-10-09', 6), 0.94);
assert.equal(shown({ code: 'CHF' }, '2026-10-09', 6), null);
assert.equal(shownForecast({ code: 'EUR' }, '2026-10-09', 'day').value, 0.96);

context.__setBaseState({
  base: 'EUR',
  history: { days: { '2026-10-09': day } },
  schedule: { start: 6, end: 20, intervalHours: 2 },
});
assert.ok(Math.abs(shown({ code: 'USD' }, '2026-10-09', 6) - (0.80 / 0.94)) < 1e-12);
assert.ok(Math.abs(shown({ code: 'CHF' }, '2026-10-09', 6) - (1 / 0.94)) < 1e-12);
assert.ok(Math.abs(shownForecast({ code: 'USD' }, '2026-10-09', 'day').value - (0.82 / 0.96)) < 1e-12);

context.__setBaseState({
  base: 'SEK',
  hint: 1 / 12,
  daily: { '2026-10-09': 1 / 12 },
  history: { days: { '2026-10-09': day } },
  schedule: { start: 6, end: 20, intervalHours: 2 },
});
assert.ok(Math.abs(shown({ code: 'EUR' }, '2026-10-09', 6) - (0.94 * 12)) < 1e-12);

console.log('base currency choice ok');
