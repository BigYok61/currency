// Zusätzliche Währungen, die biquote.io als CHF-Paar führt (geprüft 2026-10-09).
// XXXCHF: Kurs ist bereits CHF je 1 Fremdwährung. CHFXXX: Kurs ist Fremdwährung je 1 CHF, also Kehrwert.
// Die EZB-Liste (Frankfurter) ist die ISO-4217-Teilmenge, die als Referenz existiert.

export const EXTRA_CAP = 12;

export const ECB_CODES = [
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR',
  'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY',
  'USD', 'ZAR',
];

/** Nur Paare, die biquote.io wirklich beantwortet. CHF ist die Notierung, kein Paar. */
export const BICOTE_PAIRS = {
  USD: { symbol: 'USDCHF', inv: false },
  EUR: { symbol: 'EURCHF', inv: false },
  GBP: { symbol: 'GBPCHF', inv: false },
  AUD: { symbol: 'AUDCHF', inv: false },
  CAD: { symbol: 'CADCHF', inv: false },
  NZD: { symbol: 'NZDCHF', inv: false },
  SEK: { symbol: 'CHFSEK', inv: true },
  JPY: { symbol: 'CHFJPY', inv: true },
  NOK: { symbol: 'CHFNOK', inv: true },
  DKK: { symbol: 'CHFDKK', inv: true },
  PLN: { symbol: 'CHFPLN', inv: true },
  HUF: { symbol: 'CHFHUF', inv: true },
  TRY: { symbol: 'CHFTRY', inv: true },
  SGD: { symbol: 'CHFSGD', inv: true },
  MXN: { symbol: 'CHFMXN', inv: true },
  ZAR: { symbol: 'CHFZAR', inv: true },
};

const ECB = new Set(ECB_CODES);
const BUILTIN = new Set(['USD', 'EUR', 'GBP']);
const BUILTIN_LIST = [
  { code: 'USD', symbol: 'USDCHF', inv: false, unit: 1 },
  { code: 'EUR', symbol: 'EURCHF', inv: false, unit: 1 },
  { code: 'GBP', symbol: 'GBPCHF', inv: false, unit: 1 },
];

export function isEcbCode(code) {
  return ECB.has(code);
}

export function isCapturable(code) {
  return !!BICOTE_PAIRS[code] && code !== 'CHF';
}

/** CHF je 1 Einheit der Basis. null, wenn einer der beiden Kurse fehlt. */
export function inBase(chfAmount, baseChfPerUnit) {
  if (chfAmount == null || baseChfPerUnit == null || baseChfPerUnit === 0) return null;
  return chfAmount / baseChfPerUnit;
}

/**
 * Eingebaute drei plus angeforderte Codes, die ISO/EZB und biquote bestehen.
 * Höchstens EXTRA_CAP zusätzliche.
 */
export function currenciesFor(requested) {
  const out = BUILTIN_LIST.map(c => ({ ...c }));
  const seen = new Set(out.map(c => c.code));
  let extra = 0;
  for (const code of requested || []) {
    if (extra >= EXTRA_CAP) break;
    if (typeof code !== 'string' || seen.has(code)) continue;
    const pair = BICOTE_PAIRS[code];
    if (!pair || !ECB.has(code) || BUILTIN.has(code)) continue;
    seen.add(code);
    out.push({ code, symbol: pair.symbol, inv: pair.inv, unit: 1 });
    extra += 1;
  }
  return out;
}

/**
 * Bestehende Liste mit neu gewünschten Codes vereinigen.
 * Ungültige Codes fallen weg. null, wenn der Rumpf keine Liste ist.
 */
export function mergeCurrencyRequests(existing, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.codes)) return null;
  const out = [];
  const seen = new Set();
  const push = code => {
    if (out.length >= EXTRA_CAP || seen.has(code)) return;
    if (!isCapturable(code) || !ECB.has(code) || BUILTIN.has(code)) return;
    seen.add(code);
    out.push(code);
  };
  for (const code of existing || []) if (typeof code === 'string') push(code.trim().toUpperCase());
  for (const code of body.codes) if (typeof code === 'string') push(code.trim().toUpperCase());
  return out;
}
