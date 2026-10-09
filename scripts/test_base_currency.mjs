// Ersteinrichtung der Berichtswährung aus der Locale.
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
  navigator: { languages: ['de-CH'] },
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
  + '\nglobalThis.__setBaseState = (next) => { history = next.history; baseCurrency = next.base; baseHint = next.hint ?? null; baseDaily = next.daily || {}; schedule = next.schedule || schedule; };\n'
  + 'globalThis.__resetInstall = () => { savedOrder = undefined; savedHidden = undefined; baseCurrency = \'CHF\'; EXTRA_CURRENCIES.length = 0; };\n'
  + 'globalThis.__installState = () => ({ base: baseCurrency, order: savedOrder ? [...savedOrder] : savedOrder, storedBase: localStorage.getItem(\'wu.baseCurrency\'), storedOrder: localStorage.getItem(\'wu.currencyOrder\') });\n';
vm.runInContext(source, context);

const {
  firstInstallChoice, normalizeCurrency, germanCurrencyName, swissSpelling, currencySymbol, regionGroup, initBase,
} = context;

function choice(languages) {
  const got = firstInstallChoice(languages);
  return { base: got.base, order: [...got.order] };
}

assert.equal(swissSpelling('Straße'), 'Strasse');
assert.equal(germanCurrencyName('CHF'), 'Schweizer Franken');
assert.equal(germanCurrencyName('USD'), 'US-Dollar');
assert.equal(germanCurrencyName('SEK'), 'Schwedische Krone');
assert.equal(germanCurrencyName('JPY'), 'Japanischer Yen');
assert.equal(germanCurrencyName('BRL'), 'Brasilianischer Real');
assert.equal(germanCurrencyName('CHF').includes('ß'), false);

assert.equal(currencySymbol('CHF'), 'CHF');
assert.equal(currencySymbol('USD'), '$');
assert.equal(currencySymbol('EUR'), '€');
assert.equal(currencySymbol('GBP'), '£');
assert.equal(currencySymbol('JPY'), '¥');
assert.equal(currencySymbol('INR'), '₹');
assert.equal(currencySymbol('KRW'), '₩');
assert.equal(currencySymbol('ILS'), '₪');
assert.equal(currencySymbol('TRY'), '₺');
assert.equal(currencySymbol('CAD'), 'C$');
assert.equal(currencySymbol('AUD'), 'A$');
assert.equal(currencySymbol('SEK'), 'kr');
assert.equal(currencySymbol('NOK'), 'kr');

assert.equal(normalizeCurrency('usd'), 'USD');
assert.equal(normalizeCurrency('XXX'), null);
assert.equal(normalizeCurrency('XTS'), null);
assert.equal(normalizeCurrency('XAU'), null);
assert.equal(normalizeCurrency('XOF'), null);
assert.equal(normalizeCurrency('ABC'), null);
assert.equal(normalizeCurrency('US'), null);

assert.equal(regionGroup('CH'), 'ch');
assert.equal(regionGroup('LI'), 'ch');
assert.equal(regionGroup('DE'), 'eu');
assert.equal(regionGroup('SE'), 'eu');
assert.equal(regionGroup('GB'), 'eu');
assert.equal(regionGroup('US'), 'am');
assert.equal(regionGroup('CA'), 'am');
assert.equal(regionGroup('BR'), 'am');
assert.equal(regionGroup('JP'), 'other');
assert.equal(regionGroup(null), 'other');

assert.deepEqual(choice(['de-CH']), { base: 'CHF', order: ['CHF', 'EUR', 'USD', 'GBP'] });
assert.deepEqual(choice(['de-LI']), { base: 'CHF', order: ['CHF', 'EUR', 'USD', 'GBP'] });
assert.deepEqual(choice(['de-DE', 'de']), { base: 'EUR', order: ['EUR', 'USD', 'GBP', 'CHF'] });
assert.deepEqual(choice(['sv-SE']), { base: 'SEK', order: ['SEK', 'EUR', 'USD', 'GBP', 'CHF'] });
assert.deepEqual(choice(['en-GB']), { base: 'GBP', order: ['GBP', 'EUR', 'USD', 'CHF'] });
assert.deepEqual(choice(['en-US']), { base: 'USD', order: ['USD', 'EUR', 'GBP', 'CHF'] });
assert.deepEqual(choice(['en-CA']), { base: 'CAD', order: ['CAD', 'USD', 'EUR', 'GBP', 'CHF'] });
assert.deepEqual(choice(['pt-BR']), { base: 'BRL', order: ['BRL', 'USD', 'EUR', 'GBP', 'CHF'] });
assert.deepEqual(choice(['ja-JP']), { base: 'JPY', order: ['JPY', 'USD', 'EUR', 'GBP', 'CHF'] });
assert.deepEqual(choice(['en-US-u-cu-xxx']), { base: 'USD', order: ['USD', 'EUR', 'GBP', 'CHF'] });
assert.deepEqual(choice(['de-DE-u-cu-xts']), { base: 'EUR', order: ['EUR', 'USD', 'GBP', 'CHF'] });
assert.deepEqual(choice(['ja-JP-u-cu-eur']), { base: 'EUR', order: ['EUR', 'USD', 'GBP', 'CHF'] });
assert.deepEqual(choice(['und']), { base: 'CHF', order: ['CHF', 'USD', 'EUR', 'GBP'] });
assert.deepEqual(choice(['xyz']), { base: 'CHF', order: ['CHF', 'USD', 'EUR', 'GBP'] });
assert.deepEqual(choice([]), { base: 'CHF', order: ['CHF', 'USD', 'EUR', 'GBP'] });
assert.equal(choice(['de-CH', 'de-DE']).base, 'CHF');
assert.equal(choice(['en', 'sv-SE']).base, 'SEK');

context.__resetInstall();
store.clear();
context.navigator.languages = ['sv-SE'];
initBase();
const seeded = context.__installState();
assert.equal(seeded.base, 'SEK');
assert.deepEqual([...(seeded.order || [])], ['EUR', 'USD', 'GBP', 'CHF']);
assert.equal(seeded.storedBase, 'SEK');
assert.equal(seeded.storedOrder, JSON.stringify(['EUR', 'USD', 'GBP', 'CHF']));

context.__resetInstall();
store.clear();
store.set('wu.baseCurrency', 'USD');
store.set('wu.currencyOrder', JSON.stringify(['GBP', 'EUR']));
context.navigator.languages = ['ja-JP'];
initBase();
const kept = context.__installState();
assert.equal(kept.base, 'USD');
assert.equal(kept.storedOrder, JSON.stringify(['GBP', 'EUR']));
assert.equal(kept.order ?? null, null);

const { shown, shownForecast } = context;
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
