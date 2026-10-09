import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateAlerts, formatNum, formatPct, testLines } from '../src/alerts.js';
import { applyCapture, ecbUrl, historyJson, ohlcUrl } from '../src/capture.js';
import { forecast7Days, forecastEndOfDay, resolveBasisHour } from '../src/forecast.js';
import { canonicalJson, formatPyFloat, roundHalfEven } from '../src/json.js';
import { loadTimes } from '../src/schedule.js';
import { addDays, isWeekday, slotUtcMs } from '../src/time.js';
import { normalizeAlerts, normalizeTimes } from '../src/index.js';

const ROOT = new URL('../../', import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);

function oracle(cmd, payload) {
  const res = spawnSync('python3', ['cloudflare/test/oracle.py', cmd], {
    cwd: ROOT_PATH,
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`oracle ${cmd} failed\n${res.stderr}\n${res.stdout}`);
  }
  return JSON.parse(res.stdout);
}

function readRepo(name) {
  return readFileSync(new URL(name, ROOT), 'utf8');
}

test('canonical JSON matches Python for the stored documents', () => {
  for (const name of ['data/rates.json', 'data/fx-alerts.json', 'data/fx-alert-state.json']) {
    const raw = readRepo(name);
    const text = oracle('dumps', JSON.parse(raw)).text;
    assert.equal(text, raw, name);
    assert.equal(canonicalJson(JSON.parse(raw)), raw, name);
  }
});

test('float spelling and half-even rounding match Python', () => {
  const values = [0, 1, -1, 0.5, 1.5, 2.5, -1.5, -2.5, 0.25, 0.830755, 1.10813, 1.0000005, 1.2345675, 0.0000005, 1e-5, 1.23e-6];
  const py = oracle('round', { values });
  py.forEach((row, i) => {
    const v = values[i];
    assert.equal(roundHalfEven(v, 6), row.r6, `r6 ${v}`);
    assert.equal(roundHalfEven(v, 4), row.r4, `r4 ${v}`);
    assert.equal(roundHalfEven(v, 3), row.r3, `r3 ${v}`);
    assert.equal(roundHalfEven(v, 2), row.r2, `r2 ${v}`);
    if (row.j6.includes('.') || row.j6.includes('e') || row.j6.includes('E')) {
      assert.equal(formatPyFloat(roundHalfEven(v, 6)), row.j6, `json ${v}`);
    }
    assert.equal(formatNum(v), row.num, `num ${v}`);
    assert.equal(formatPct(v), row.pct, `pct ${v}`);
  });
});

test('Zurich slots match Python, including winter and summer time', () => {
  const items = [
    { day: '2026-01-15', hour: 0 },
    { day: '2026-01-15', hour: 6 },
    { day: '2026-01-15', hour: 16 },
    { day: '2026-07-15', hour: 6 },
    { day: '2026-10-01', hour: 0 },
    { day: '2026-10-09', hour: 6 },
    { day: '2026-03-29', hour: 6 },
    { day: '2026-10-25', hour: 6 },
    { day: '2026-10-25', hour: 22 },
  ];
  const py = oracle('slot', { items });
  items.forEach((item, i) => {
    const iso = new Date(slotUtcMs(item.day, item.hour)).toISOString().replace('.000Z', 'Z');
    assert.equal(iso, py[i], `${item.day} ${item.hour}`);
  });
});

test('capture schedule matches Python, including the legacy hours list', () => {
  const cases = [
    { version: 2, start: '06', end: '21', intervalHours: 3 },
    { version: 2, start: '06', end: '20', intervalHours: 4 },
    { version: 2, start: '06', end: '20', intervalHours: 8 },
    { version: 2, start: '06', end: '20', intervalHours: 12 },
    { version: 2, start: '06', end: '20', intervalHours: 24 },
    { version: 2, start: '08', end: '20', intervalHours: 24 },
    { version: 2, start: '06', end: '20', intervalHours: 5, hours: [9] },
    { version: 1, hours: [8, 6, 10, 6] },
    null,
    { version: 2, start: '20', end: '06', intervalHours: 2 },
  ];
  for (const data of cases) {
    const py = oracle('times', { data });
    const js = loadTimes(data);
    assert.deepEqual(js, py, JSON.stringify(data));
  }
});

test('basis hour matches Python', () => {
  const cases = [
    { day: '2026-10-07', start: 6, grid: [6, 9, 12, 15, 18, 21], hours: [6, 8, 9] },
    { day: '2026-10-07', start: 6, grid: [6, 9, 12, 15, 18, 21], hours: [9, 16] },
    { day: '2026-10-07', start: 6, grid: [6, 9, 12, 15, 18, 21], hours: [8, 16] },
    { day: '2026-10-07', start: 6, grid: [6, 9, 12, 15, 18, 21], hours: [16] },
  ];
  for (const item of cases) {
    const candles = item.hours.map(hour => ({ t: slotUtcMs(item.day, hour), o: hour, h: hour, l: hour }));
    assert.equal(resolveBasisHour(candles, item.day, item.start, item.grid), oracle('basis', item));
  }
});

test('a capture run matches scripts/capture.py, and a second run adds nothing', async () => {
  const times = { version: 2, start: '06', end: '20', intervalHours: 2 };
  const history = {
    version: 1,
    days: {
      '2026-10-01': {
        slots: { '08': { USD: 0.111111 } },
        ecb: { USD: 0.222222 },
      },
    },
  };
  const ecb = { rates: {} };
  for (let day = '2026-09-01'; day <= '2026-10-09'; day = addDays(day, 1)) {
    if (!isWeekday(day)) continue;
    ecb.rates[day] = { CHF: 0.95, USD: 1.08, GBP: 0.86 };
  }
  const bars = {};
  for (const [symbol, base] of [['USDCHF', 0.83], ['EURCHF', 0.94], ['GBPCHF', 1.1]]) {
    const list = [];
    for (let day = '2026-09-15'; day <= '2026-10-09'; day = addDays(day, 1)) {
      for (let hour = 0; hour < 24; hour++) {
        const open = Math.round((base + hour * 0.0001 + (day.endsWith('9') ? 0.001 : 0)) * 1e6) / 1e6;
        list.push({
          openTime: new Date(slotUtcMs(day, hour)).toISOString().replace('.000Z', 'Z'),
          open,
          high: open + 0.002,
          low: open - 0.001,
        });
      }
    }
    list.push({
      openTime: '2026-10-08T07:30:00Z',
      open: base,
      high: base,
      low: base,
    });
    bars[symbol] = list;
  }
  const now = new Date('2026-10-09T10:05:00Z');
  const fixture = JSON.parse(JSON.stringify({ now: '2026-10-09T10:05:00Z', history, times, ecb, bars }));
  const py = oracle('capture', fixture);
  const seen = [];
  const first = await applyCapture(structuredClone(fixture.history), fixture.times, now, async url => {
    seen.push(url);
    if (url.includes('frankfurter')) return fixture.ecb;
    const symbol = url.split('/api/')[1].split('/')[0];
    return { bars: fixture.bars[symbol] };
  });
  assert.deepEqual(seen, py.urls);
  assert.equal(historyJson(first.history), py.body);
  assert.equal(first.history.days['2026-10-01'].slots['08'].USD, 0.111111);
  assert.equal(first.history.days['2026-10-01'].ecb.USD, 0.222222);
  assert.equal(first.history.days['2026-10-01'].slots['09'], undefined);
  assert.ok(first.history.days['2026-10-09'].slots['06'].EUR > 0);
  assert.equal(first.fatal, false);
  assert.equal(py.exit, 0);

  const again = await applyCapture(structuredClone(first.history), fixture.times, now, async url => {
    if (url.includes('frankfurter')) return fixture.ecb;
    const symbol = url.split('/api/')[1].split('/')[0];
    return { bars: fixture.bars[symbol] };
  });
  assert.equal(again.changed, 0);
  assert.equal(historyJson(again.history), py.body);

  const day = '2026-10-08';
  const candles = fixture.bars.EURCHF.map(b => ({
    t: Date.parse(b.openTime),
    o: b.open,
    h: Math.max(b.high, b.low),
    l: Math.min(b.high, b.low),
  })).sort((a, b) => a.t - b.t);
  const direct = forecastEndOfDay(candles, day, 6);
  assert.equal(roundHalfEven(direct, 6), first.history.days[day].forecast.EUR);
});

test('total capture failure is fatal and does not invent rates', async () => {
  const history = { version: 1, days: {} };
  const result = await applyCapture(history, null, new Date('2026-10-09T10:05:00Z'), async () => {
    throw new Error('down');
  });
  assert.equal(result.fatal, true);
  assert.equal(result.errors.length, 4);
  assert.deepEqual(result.history.days, {});
  assert.equal(ecbUrl('2026-10-09'), 'https://api.frankfurter.dev/v1/2026-08-11..?base=EUR&symbols=CHF,GBP,USD');
  assert.equal(ohlcUrl('USDCHF', 24).includes('limit=24'), true);
});

function quoteAt(mid, ageSeconds, now) {
  return {
    mid,
    bid: mid - 0.0001,
    ask: mid + 0.0001,
    lastQuoteAt: new Date(now.getTime() - ageSeconds * 1000).toISOString().replace('.000Z', 'Z'),
    marketState: 'open',
  };
}

function dayBars(now, hours) {
  const zurich = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return hours.map(hour => ({
    openTime: new Date(slotUtcMs(zurich, hour)).toISOString().replace('.000Z', 'Z'),
    open: 0.8 + hour / 1000,
    high: 0.81,
    low: 0.79,
  }));
}

test('FX alerts match scripts/fx_alerts.py', () => {
  const times = { version: 2, start: '06', end: '20', intervalHours: 2 };
  const cfg = {
    version: 1,
    currencies: {
      USD: { enabled: true, down: 0.5, up: 0.25 },
      EUR: { enabled: true, down: 0.5, up: 0.25 },
      GBP: { enabled: false, down: 0.5, up: 0.25 },
    },
  };
  const now = new Date('2026-10-09T10:05:00Z');
  const bars = {
    USDCHF: dayBars(now, [0, 6, 8]),
    EURCHF: dayBars(now, [0, 6, 8]),
    GBPCHF: dayBars(now, [0, 6, 8]),
  };
  const baseUsd = bars.USDCHF.find(b => b.openTime.endsWith('T04:00:00Z') || true);
  // 06:00 Zurich in October is 04:00 UTC.
  const usdBase = bars.USDCHF.find(b => new Date(b.openTime).getTime() === slotUtcMs('2026-10-09', 6)).open;
  const eurBase = bars.EURCHF.find(b => new Date(b.openTime).getTime() === slotUtcMs('2026-10-09', 6)).open;
  const quotes = {
    USDCHF: quoteAt(usdBase * 0.99, 30, now),
    EURCHF: quoteAt(eurBase * 1.004, 30, now),
    GBPCHF: quoteAt(1, 30, now),
  };
  void baseUsd;
  const cases = [
    { name: 'move', now: '2026-10-09T10:05:00Z', state: { date: '2026-10-09', sent: {} }, quotes, bars },
    { name: 'already', now: '2026-10-09T10:05:00Z', state: { date: '2026-10-09', sent: { 'USD:down': { time: '09:00', pct: -0.6, base: usdBase, rate: usdBase } } }, quotes, bars },
    { name: 'stale', now: '2026-10-09T10:05:00Z', state: null, quotes: { ...quotes, USDCHF: quoteAt(usdBase * 0.99, 1300, now) }, bars },
    { name: 'weekend', now: '2026-10-10T10:05:00Z', state: null, quotes, bars },
    { name: 'early', now: '2026-10-09T04:00:00Z', state: null, quotes, bars },
    { name: 'late', now: '2026-10-09T20:30:00Z', state: null, quotes, bars },
    {
      name: 'opening',
      now: '2026-10-09T03:30:00Z',
      state: null,
      quotes,
      bars: { USDCHF: dayBars(now, [0]), EURCHF: dayBars(now, [0]), GBPCHF: dayBars(now, [0]) },
      force: true,
    },
  ];
  for (const item of cases) {
    const payload = { now: item.now, times, cfg, state: item.state, quotes: item.quotes, bars: item.bars, force: !!item.force };
    const py = oracle('alerts', payload);
    const when = new Date(item.now);
    const decision = evaluateAlerts({
      now: when,
      times,
      cfg,
      state: item.state,
      force: !!item.force,
      quotes: { USD: item.quotes.USDCHF, EUR: item.quotes.EURCHF, GBP: item.quotes.GBPCHF },
      bars: { USD: item.bars.USDCHF, EUR: item.bars.EURCHF, GBP: item.bars.GBPCHF },
    });
    const applied = decision.skipped ? null : decision.applyPush(decision.pushes.map((_, i) => i));
    const jsPushes = (decision.pushes || []).map(p => ({ title: p.title, message: p.message, tags: p.tags, priority: p.priority }));
    assert.deepEqual(jsPushes, py.pushes, item.name);
    if (item.name === 'opening') {
      assert.ok(decision.logs.some(line => line.includes('Tageseröffnung')), decision.logs.join('\n'));
    }
    if (decision.skipped) {
      assert.equal(py.state, item.state == null ? null : py.state);
      assert.equal(applied, null, item.name);
    } else if (applied.write) {
      assert.equal(canonicalJson(applied.state), py.state, item.name);
    } else {
      assert.equal(py.state === null, false);
    }
  }
});

test('settings normalise the documents the app saves', () => {
  assert.deepEqual(normalizeTimes({ version: 2, start: '06', end: '22', intervalHours: 2 }), {
    version: 2, start: '06', end: '22', intervalHours: 2,
  });
  assert.equal(normalizeTimes({ version: 2, start: '20', end: '06', intervalHours: 2 }), null);
  assert.equal(normalizeTimes({ version: 2, start: '06', end: '20', intervalHours: 5 }), null);
  const alerts = normalizeAlerts({
    version: 1,
    currencies: { USD: { enabled: true, down: 0.5, up: 0.25 }, EUR: { enabled: false, down: '0.40', up: 1 } },
  });
  assert.equal(alerts.currencies.EUR.enabled, false);
  assert.equal(alerts.currencies.EUR.down, 0.4);
  assert.equal(normalizeAlerts({ currencies: {} }), null);
});

test('forecast helpers stay null without enough history', () => {
  assert.equal(forecastEndOfDay([], '2026-10-09', 6), null);
  assert.equal(forecast7Days([], { '2026-10-08': 1 }, '2026-10-09', 6), null);
  assert.equal(testLines(new Date('2026-10-09T10:00:00Z'), { start: '06' }, { USD: {}, EUR: {} }, { USD: [], EUR: [] }).includes('TEST'), true);
});
