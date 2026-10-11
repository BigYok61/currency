// Währungen der Auswahl in der iOS-App und in der Web-App, dieselbe Liste.
// XXXCHF: Kurs ist bereits CHF je 1 Fremdwährung. CHFXXX: Kurs ist Fremdwährung je 1 CHF, also Kehrwert.
// Gespeichert wird immer CHF je 1 Einheit. Die Anzeige rechnet JPY und HUF auf 100 Einheiten um.
// CNY, HKD und INR hat biquote.io nicht; dafür gibt es den EZB-Referenzkurs.

export const PICKER_CODES = [
  'EUR', 'USD', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'HUF', 'TRY', 'SGD',
  'MXN', 'ZAR', 'CNY', 'HKD', 'INR',
];

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
const PICKER = new Set(PICKER_CODES);
const BUILTIN = new Set(['USD', 'EUR', 'GBP']);

/** Anzeige-Los. Gespeichert bleibt CHF je 1 Einheit. */
export function quoteLot(code) {
  return code === 'JPY' || code === 'KRW' || code === 'HUF' || code === 'IDR' || code === 'ISK' ? 100 : 1;
}

export function isEcbCode(code) {
  return ECB.has(code);
}

export function isAlertCode(code) {
  return !!(BICOTE_PAIRS[code] && BICOTE_PAIRS[code].symbol);
}

export function isCapturable(code) {
  return PICKER.has(code);
}

/** Jede Währung der gemeinsamen Auswahlliste. Ohne biquote-Paar nur der EZB-Referenzkurs. */
export function captureList() {
  return PICKER_CODES.map(code => {
    const pair = BICOTE_PAIRS[code];
    if (pair) return { code, symbol: pair.symbol, inv: pair.inv, unit: 1 };
    return { code, symbol: null, inv: false, unit: 1 };
  });
}

/** CHF je 1 Einheit der Basis. null, wenn einer der beiden Kurse fehlt. */
export function inBase(chfAmount, baseChfPerUnit) {
  if (chfAmount == null || baseChfPerUnit == null || baseChfPerUnit === 0) return null;
  return chfAmount / baseChfPerUnit;
}

/** Immer die ganze Auswahlliste. Die Erfassung hängt nicht mehr von einzelnen Gerätewünschen ab. */
export function currenciesFor(_requested) {
  return captureList();
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
    if (seen.has(code) || !PICKER.has(code) || BUILTIN.has(code)) return;
    seen.add(code);
    out.push(code);
  };
  for (const code of existing || []) if (typeof code === 'string') push(code.trim().toUpperCase());
  for (const code of body.codes) if (typeof code === 'string') push(code.trim().toUpperCase());
  return out;
}
