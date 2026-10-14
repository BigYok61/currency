// Python json.dumps(..., indent=2, sort_keys=True, ensure_ascii=False) plus a trailing newline.
// Integer-valued fields stay integers (version, intervalHours, hours, forecast basis).
// Every other number is a float, so 1 becomes 1.0 like Python's json encoder.

const INT_KEYS = new Set(['version', 'intervalHours']);
const INT_MAP_KEYS = new Set(['forecastBasis', 'forecast7Basis']);
const INT_LIST_KEYS = new Set(['hours']);

/** math.fsum: exact sum of doubles, then one correct rounding. Matches CPython sum() of floats. */
export function fsum(values) {
  let total = 0n;
  let minExp = 0;
  let seen = false;
  const parts = [];
  for (const v of values) {
    if (!Number.isFinite(v) || v === 0) continue;
    const neg = v < 0;
    const { mantissa, exp } = splitAbs(Math.abs(v));
    parts.push({ mantissa: neg ? -mantissa : mantissa, exp });
    if (!seen || exp < minExp) minExp = exp;
    seen = true;
  }
  if (!seen) return 0;
  for (const p of parts) total += p.mantissa * (2n ** BigInt(p.exp - minExp));
  return scaledBigToDouble(total, minExp);
}

function scaledBigToDouble(num, exp) {
  if (num === 0n) return 0;
  const neg = num < 0n;
  let n = neg ? -num : num;
  let e = exp;
  const bits = n.toString(2).length;
  if (bits > 53) {
    const shift = BigInt(bits - 53);
    const rest = n & ((1n << shift) - 1n);
    const half = 1n << (shift - 1n);
    n >>= shift;
    e += bits - 53;
    if (rest > half || (rest === half && (n & 1n) === 1n)) n += 1n;
    if (n >> 53n) { n >>= 1n; e += 1; }
  }
  const value = (neg ? -1 : 1) * Number(n) * 2 ** e;
  return Object.is(value, -0) ? 0 : value;
}

function splitAbs(n) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);
  if (exponent === 0) return { mantissa: frac, exp: -1022 - 52 };
  return { mantissa: frac | (1n << 52n), exp: exponent - 1023 - 52 };
}

function divRoundHalfEven(num, den) {
  const q = num / den;
  const r = num % den;
  const twice = r * 2n;
  if (twice > den) return q + 1n;
  if (twice < den) return q;
  return q % 2n === 0n ? q : q + 1n;
}

/** Python round(n, digits): half-even on the exact decimal value of the double. */
function roundDecimal(n, digits) {
  if (!Number.isFinite(n)) throw new Error('nicht-endliche Zahl');
  const neg = n < 0;
  const abs = Math.abs(n);
  if (abs === 0 || digits < 0) {
    const text = (digits > 0 ? '0.' + '0'.repeat(digits) : '0');
    return { value: 0, text };
  }
  const { mantissa, exp } = splitAbs(abs);
  const d = BigInt(digits);
  let num = mantissa * (5n ** d);
  let den = 1n;
  const shift = exp + digits;
  if (shift >= 0) num *= 2n ** BigInt(shift);
  else den = 2n ** BigInt(-shift);
  const q = divRoundHalfEven(num, den);
  let s = q.toString();
  if (digits > 0 && s.length <= digits) s = s.padStart(digits + 1, '0');
  const whole = digits > 0 ? s.slice(0, s.length - digits) : s;
  const frac = digits > 0 ? s.slice(s.length - digits) : '';
  const text = (neg && q !== 0n ? '-' : '') + whole + (digits > 0 ? '.' + frac : '');
  const value = Number(text);
  return { value: Object.is(value, -0) ? 0 : value, text };
}

export function roundHalfEven(n, digits) {
  if (!Number.isFinite(n)) return n;
  return roundDecimal(n, digits).value;
}

export function formatFixed(n, digits) {
  return roundDecimal(n, digits).text;
}

function padExponent(exp) {
  return exp.replace(/e([+-]?)(\d+)$/i, (_, sign, digits) => {
    const sgn = sign === '-' ? '-' : '+';
    return 'e' + sgn + digits.padStart(2, '0');
  });
}

/** Spelling of a Python float under json.dumps. */
export function formatPyFloat(n) {
  if (Object.is(n, -0)) return '-0.0';
  if (n === 0) return '0.0';
  const abs = Math.abs(n);
  if (abs < 1e-4) {
    // Python json uses scientific notation from 1e-4 downward, with a two-digit exponent.
    const fixed = abs.toExponential();
    const m = fixed.match(/^([0-9.]+)e([+-]?)(\d+)$/i);
    if (!m) return (n < 0 ? '-' : '') + padExponent(fixed);
    const sgn = m[2] === '-' ? '-' : '+';
    return (n < 0 ? '-' : '') + m[1] + 'e' + sgn + m[3].padStart(2, '0');
  }
  const s = JSON.stringify(n);
  if (/^-?\d+$/.test(s)) return s + '.0';
  if (/e/i.test(s)) return padExponent(s);
  return s;
}

function quote(s) {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c < 0x20) out += '\\u' + c.toString(16).padStart(4, '0');
    else out += ch;
  }
  return out + '"';
}

function indent(text) {
  return text.split('\n').map(line => '  ' + line).join('\n');
}

function stringify(value, key) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('nicht-endliche Zahl');
    if (INT_KEYS.has(key) || INT_MAP_KEYS.has(key) || INT_LIST_KEYS.has(key)) {
      if (!Number.isInteger(value)) throw new Error(`Ganzzahl erwartet bei ${key}`);
      return String(value);
    }
    return formatPyFloat(value);
  }
  if (typeof value === 'string') return quote(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const childKey = INT_LIST_KEYS.has(key) ? key : null;
    const inner = value.map(v => stringify(v, childKey));
    return '[\n' + inner.map(indent).join(',\n') + '\n]';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    if (!keys.length) return '{}';
    const intChildren = INT_MAP_KEYS.has(key);
    const lines = keys.map(k => quote(k) + ': ' + stringify(value[k], intChildren ? key : k));
    return '{\n' + lines.map(indent).join(',\n') + '\n}';
  }
  throw new Error('nicht serialisierbar');
}

export function canonicalJson(value) {
  return stringify(value, null) + '\n';
}
