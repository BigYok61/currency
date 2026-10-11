import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateAlerts, formatNum, formatPct, inactiveCutoff, nextHits, pickBase, priceInBase, testLines, validAlertId, validTopic } from '../src/alerts.js';
import { applyCapture, ecbUrl, historyJson, ohlcUrl, pruneDays, workerCapturePlan } from '../src/capture.js';
import { forecast7Days, forecastEndOfDay, resolveBasisHour } from '../src/forecast.js';
import { canonicalJson, formatPyFloat, roundHalfEven } from '../src/json.js';
import { loadTimes } from '../src/schedule.js';
import { addDays, isWeekday, slotUtcMs } from '../src/time.js';
import {
  downsample, ecbHistoryUrl, formatPoint, historyBody, mergePoints, parseEcbRates, selectRange, shouldRefreshHistory, toChfPoints, updateRecentHistory,
} from '../src/history.js';
import { handleHistory, normalizeAlerts, normalizeSubscription } from '../src/index.js';

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
    assert.equal(jsPushes.length, py.pushes.length, item.name);
    for (let i = 0; i < jsPushes.length; i++) {
      assert.deepEqual(jsPushes[i].tags, py.pushes[i].tags, item.name);
      assert.equal(jsPushes[i].priority, py.pushes[i].priority, item.name);
      const jsLine = jsPushes[i].message.split('\n');
      const pyLine = py.pushes[i].message.split('\n');
      assert.equal(jsLine[1], pyLine[1], item.name);
      assert.match(jsLine[0], /^1 (USD|EUR|GBP) = .+ CHF, /, item.name);
    }
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

test('worker capture stores every weekday hour and keeps the 06:00 forecast', async () => {
  const plan = workerCapturePlan();
  assert.deepEqual(plan.capture, Array.from({ length: 24 }, (_, hour) => hour));
  assert.equal(plan.start, 6);
  const ecb = { rates: {} };
  for (let day = '2026-09-01'; day <= '2026-10-09'; day = addDays(day, 1)) {
    if (!isWeekday(day)) continue;
    ecb.rates[day] = { CHF: 0.95, USD: 1.08, GBP: 0.86 };
  }
  const bars = {};
  for (const [symbol, base] of [['USDCHF', 0.83], ['EURCHF', 0.94], ['GBPCHF', 1.1]]) {
    const list = [];
    for (let day = '2026-09-20'; day <= '2026-10-09'; day = addDays(day, 1)) {
      for (let hour = 0; hour < 24; hour++) {
        const open = Math.round((base + hour * 0.0001) * 1e6) / 1e6;
        list.push({
          openTime: new Date(slotUtcMs(day, hour)).toISOString().replace('.000Z', 'Z'),
          open, high: open + 0.002, low: open - 0.001,
        });
      }
    }
    bars[symbol] = list;
  }
  const now = new Date('2026-10-09T10:05:00Z');
  const result = await applyCapture({ version: 1, days: {} }, null, now, async url => {
    if (url.includes('frankfurter')) return ecb;
    const symbol = url.split('/api/')[1].split('/')[0];
    return { bars: bars[symbol] };
  }, plan);
  const friday = result.history.days['2026-10-09'];
  assert.ok(friday.slots['00'].EUR > 0);
  assert.ok(friday.slots['23'].USD > 0);
  assert.equal(friday.forecastBasis.EUR, 6);
  assert.equal(result.history.days['2026-10-10'], undefined);
  const again = await applyCapture(structuredClone(result.history), null, now, async url => {
    if (url.includes('frankfurter')) return ecb;
    const symbol = url.split('/api/')[1].split('/')[0];
    return { bars: bars[symbol] };
  }, plan);
  assert.equal(again.changed, 0);
});

test('each alert subscription keeps its own state', () => {
  const now = new Date('2026-10-09T10:05:00Z');
  const bars = { USD: dayBars(now, [6]), EUR: dayBars(now, [6]) };
  const usdBase = bars.USD[0].open;
  const eurBase = bars.EUR[0].open;
  const quotes = { USD: quoteAt(usdBase * 0.99, 30, now), EUR: quoteAt(eurBase * 1.001, 30, now) };
  const strict = { currencies: { USD: { enabled: true, down: 0.5, up: 0.25 }, EUR: { enabled: true, down: 0.5, up: 0.25 } } };
  const loose = { currencies: { USD: { enabled: true, down: 2, up: 2 }, EUR: { enabled: false, down: 0.5, up: 0.25 } } };
  const a = evaluateAlerts({ now, times: { start: '06' }, cfg: strict, state: null, quotes, bars });
  const b = evaluateAlerts({ now, times: { start: '08' }, cfg: loose, state: { date: '2026-10-09', sent: {} }, quotes, bars });
  assert.equal(a.pushes.length, 1);
  assert.equal(a.pushes[0].code, 'USD');
  assert.equal(b.pushes.length, 0);
  assert.equal(a.applyPush([0]).state.sent['USD:down'] != null, true);
  assert.deepEqual(b.applyPush([]).state.sent, {});
});

test('alert ids, topics, and the 90-day cutoff', () => {
  const id = 'a'.repeat(64);
  const topic = `wae-${'b'.repeat(32)}`;
  assert.equal(validAlertId(id), true);
  assert.equal(validAlertId(id.slice(0, 32)), false);
  assert.equal(validTopic(topic), true);
  assert.equal(validTopic('wae-short'), false);
  const now = Date.parse('2026-10-09T10:00:00Z');
  assert.equal(inactiveCutoff(now), now - 90 * 24 * 60 * 60 * 1000);
  assert.equal(nextHits(4, now + 1000, now), 5);
  assert.equal(nextHits(4, now, now), 1);
  const body = normalizeSubscription({
    topic,
    start: '08',
    currencies: { USD: { enabled: true, down: 0.5, up: 0.25 }, EUR: { enabled: false, down: '0.40', up: 1 } },
  });
  assert.equal(body.start, 8);
  assert.equal(body.topic, topic);
  assert.equal(body.base, 'CHF');
  assert.equal(body.timeZone, 'Europe/Zurich');
  assert.equal(body.currencies.EUR.down, 0.4);
  const sek = normalizeSubscription({
    topic,
    start: 7,
    base: 'SEK',
    timeZone: 'America/New_York',
    currencies: body.currencies,
  });
  assert.equal(sek.base, 'SEK');
  assert.equal(sek.timeZone, 'America/New_York');
  assert.equal(normalizeSubscription({ topic, start: 7, base: 'BRL', currencies: body.currencies }).base, 'BRL');
  assert.equal(normalizeSubscription({ topic, start: 7, base: 'XXX', currencies: body.currencies }), null);
  assert.equal(normalizeSubscription({ topic, start: 7, timeZone: 'Not/AZone', currencies: body.currencies }), null);
  assert.equal(normalizeSubscription({ topic: 'nope', start: 6, currencies: body.currencies }), null);
  assert.equal(normalizeAlerts({ currencies: {} }), null);
  assert.equal(normalizeAlerts({ currencies: { USD: { enabled: true, down: 0.5, up: 0.25 } } }), null);
  const withJpy = normalizeAlerts({
    currencies: {
      USD: { enabled: true, down: 0.5, up: 0.25 },
      EUR: { enabled: true, down: 0.5, up: 0.25 },
      JPY: { enabled: true, down: 1, up: 1 },
    },
  });
  assert.equal(withJpy.currencies.JPY.down, 1);
  assert.equal(normalizeAlerts({
    currencies: {
      USD: { enabled: true, down: 0.5, up: 0.25 },
      EUR: { enabled: true, down: 0.5, up: 0.25 },
      XXX: { enabled: true, down: 1, up: 1 },
    },
  }), null);
  assert.equal(normalizeAlerts({
    currencies: {
      USD: { enabled: true, down: 0.5, up: 0.25 },
      EUR: { enabled: true, down: 0.5, up: 0.25 },
      CNY: { enabled: true, down: 1, up: 1 },
    },
  }), null);
});

test('alerts price one lot in the reporting currency and read the start hour in that time zone', () => {
  assert.equal(priceInBase(0.005, 1, 'JPY'), 0.5);
  assert.equal(priceInBase(0.93, null, 'EUR'), 0.93);
  const now = new Date('2026-10-09T10:05:00Z');
  const open = new Date(slotUtcMs('2026-10-09', 6)).toISOString().replace('.000Z', 'Z');
  const bars = {
    EUR: [{ openTime: open, open: 0.92 }],
    SEK: [{ openTime: open, open: 0.08 }],
    USD: [{ openTime: open, open: 0.83 }],
  };
  const quotes = {
    EUR: quoteAt(0.93, 30, now),
    SEK: quoteAt(0.08, 30, now),
    USD: quoteAt(0.83, 30, now),
  };
  const decision = evaluateAlerts({
    now,
    times: { start: 6 },
    cfg: {
      base: 'SEK',
      timeZone: 'Europe/Zurich',
      currencies: {
        USD: { enabled: false, down: 0.5, up: 0.25 },
        EUR: { enabled: true, down: 0.5, up: 0.25 },
      },
    },
    state: null,
    quotes,
    bars,
  });
  assert.equal(decision.pushes.length, 1);
  assert.equal(decision.pushes[0].title, 'Währungsübersicht: EUR steigt');
  assert.match(decision.pushes[0].message, /^1 EUR = \d+\.\d{4} SEK, \+\d+\.\d{2} % seit 06:00\nSchwelle \+0\.25 %$/);
  const nyNow = new Date('2026-10-09T15:00:00Z');
  const nyBars = [
    { openTime: '2026-10-09T05:00:00Z', open: 0.91 },
    { openTime: '2026-10-09T11:00:00Z', open: 0.93 },
  ];
  assert.equal(pickBase(nyBars, nyNow, 7, 'America/New_York').rate, 0.93);
  assert.equal(pickBase(nyBars, nyNow, 7, 'America/New_York').label, '07:00');
  assert.equal(pickBase(nyBars, nyNow, 7).rate, 0.91);
  const late = new Date('2026-10-09T21:30:00Z');
  const lateBars = { USD: dayBars(late, [6]), EUR: dayBars(late, [6]) };
  const lateQuotes = {
    USD: quoteAt(lateBars.USD[0].open, 30, late),
    EUR: quoteAt(lateBars.EUR[0].open, 30, late),
  };
  const currencies = {
    USD: { enabled: true, down: 0.5, up: 0.25 },
    EUR: { enabled: true, down: 0.5, up: 0.25 },
  };
  assert.equal(evaluateAlerts({
    now: late, times: { start: 6 }, cfg: { timeZone: 'Europe/Zurich', currencies }, state: null, quotes: lateQuotes, bars: lateBars,
  }).skipped, true);
  assert.equal(evaluateAlerts({
    now: late, times: { start: 6 }, cfg: { timeZone: 'America/New_York', currencies }, state: null, quotes: lateQuotes, bars: lateBars,
  }).skipped, false);
});

test('capture covers the shared picker and stores JPY as CHF per 1 yen', async () => {
  const { currenciesFor, mergeCurrencyRequests, inBase, captureList, isAlertCode } = await import('../src/currencies.js');
  const list = currenciesFor(['SEK', 'CNY', 'usd', 'EUR', 'nope']);
  assert.deepEqual(list.map(c => c.code), captureList().map(c => c.code));
  assert.equal(list.find(c => c.code === 'SEK').symbol, 'CHFSEK');
  assert.equal(list.find(c => c.code === 'SEK').inv, true);
  assert.equal(list.find(c => c.code === 'JPY').unit, 1);
  assert.equal(list.find(c => c.code === 'CAD').symbol, 'CADCHF');
  assert.equal(list.find(c => c.code === 'CNY').symbol, null);
  assert.equal(mergeCurrencyRequests(['SEK'], { codes: ['JPY', 'CNY', 'sek', 'nope'] }).join(','), 'SEK,JPY,CNY');
  assert.equal(mergeCurrencyRequests([], { codes: 'SEK' }), null);
  assert.equal(isAlertCode('JPY'), true);
  assert.equal(isAlertCode('CNY'), false);
  assert.ok(Math.abs(inBase(0.94, 1 / 12) - 11.28) < 1e-9);

  const now = new Date('2026-10-09T06:05:00Z');
  const jpy = await applyCapture({ version: 1, days: {} }, null, now, async url => {
    if (url.includes('frankfurter')) return { rates: { '2026-10-09': { CHF: 1, JPY: 190 } } };
    return { bars: [{ openTime: '2026-10-09T06:00:00Z', open: 190, high: 191, low: 189 }] };
  }, { start: 6, grid: [8], capture: [8] }, [{ code: 'JPY', symbol: 'CHFJPY', inv: true, unit: 1 }]);
  const stored = roundHalfEven(1 / 190, 6);
  assert.equal(jpy.history.days['2026-10-09'].slots['08'].JPY, stored);
  assert.equal(jpy.history.days['2026-10-09'].ecb.JPY, stored);
  assert.notEqual(stored, roundHalfEven(100 / 190, 6));
  assert.equal(jpy.fatal, false);

  const ecbOnly = await applyCapture({ version: 1, days: {} }, null, now, async url => {
    if (url.includes('frankfurter')) return { rates: { '2026-10-09': { CHF: 0.93, USD: 1.08, CNY: 7.6 } } };
    throw new Error('down');
  }, { start: 6, grid: [8], capture: [8] }, [
    { code: 'USD', symbol: 'USDCHF', inv: false, unit: 1 },
    { code: 'CNY', symbol: null, inv: false, unit: 1 },
  ]);
  assert.equal(ecbOnly.fatal, false);
  assert.equal(ecbOnly.history.days['2026-10-09'].ecb.CNY, roundHalfEven(0.93 / 7.6, 6));
  assert.equal(ecbOnly.history.days['2026-10-09'].slots['08'], undefined);

  const windowed = { version: 1, days: { '2026-08-01': { slots: {} }, '2026-10-09': { slots: {} } } };
  pruneDays(windowed, '2026-10-09', 45);
  assert.equal(windowed.days['2026-08-01'], undefined);
  assert.ok(windowed.days['2026-10-09']);
});

test('forecast helpers stay null without enough history', () => {
  assert.equal(forecastEndOfDay([], '2026-10-09', 6), null);
  assert.equal(forecast7Days([], { '2026-10-08': 1 }, '2026-10-09', 6), null);
  assert.equal(testLines(new Date('2026-10-09T10:00:00Z'), { start: '06' }, { USD: {}, EUR: {} }, { USD: [], EUR: [] }).includes('TEST'), true);
});

const ECB_CSV = [
  'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE',
  'EXR.D.CHF.EUR.SP00.A,D,CHF,EUR,SP00,A,2026-10-01,0.9437',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-01,1.1298',
  'EXR.D.CHF.EUR.SP00.A,D,CHF,EUR,SP00,A,2026-10-02,0.9279',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-02,1.1225',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-03,1.1000',
].join('\n');

test('ECB history becomes CHF per unit and serves a downsampled range', async () => {
  const rates = parseEcbRates(ECB_CSV);
  assert.equal(rates.CHF['2026-10-01'], 0.9437);
  assert.equal(rates.USD['2026-10-03'], 1.1);
  const points = toChfPoints(rates);
  assert.equal(points.EUR.length, 2);
  assert.deepEqual(points.EUR[0], ['2026-10-01', 0.9437]);
  assert.equal(points.USD.length, 2);
  assert.equal(points.USD[0][0], '2026-10-01');
  assert.equal(points.USD[0][1], roundHalfEven(0.9437 / 1.1298, 6));
  assert.equal(points.USD[0][1], 0.835281);
  const merged = mergePoints(points.USD, [['2026-10-02', 0.82], ['2026-09-30', 0.84]]);
  assert.deepEqual(merged.map(row => row[0]), ['2026-09-30', '2026-10-01', '2026-10-02']);
  assert.equal(merged[2][1], 0.82);
  const dense = Array.from({ length: 10 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, i + 1]);
  const thin = downsample(dense, 4);
  assert.equal(thin[0][1], 1);
  assert.equal(thin[thin.length - 1][1], 10);
  assert.ok(thin.length <= 4);
  const month = selectRange(points.USD, '1M', '2026-10-09');
  assert.deepEqual(month.map(row => row[0]), ['2026-10-01', '2026-10-02']);
  assert.equal(selectRange(points.USD, '1T', '2026-10-09'), null);
  assert.equal(formatPoint(0.835281), '0.835281');
  assert.match(historyBody('USD', points.USD), /^\{\"version\":1,\"code\":\"USD\",\"points\":\[/);
  assert.match(ecbHistoryUrl('2015-01-01'), /detail=dataonly/);
  assert.equal(shouldRefreshHistory('*/15 5-21 * * MON-FRI', new Date('2026-10-09T15:05:00Z')), false);
  assert.equal(shouldRefreshHistory('5 6 * * SAT', new Date('2026-10-10T04:05:00Z')), true);
  assert.equal(shouldRefreshHistory('5 * * * MON-FRI', new Date('2026-10-09T15:05:00Z')), true);
  assert.equal(shouldRefreshHistory('5 * * * MON-FRI', new Date('2026-10-09T14:05:00Z')), false);
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const block = toml.match(/crons = \[([\s\S]*?)\]/);
  assert.ok(block);
  assert.deepEqual([...block[1].matchAll(/"([^"]+)"/g)].map(m => m[1]), [
    '5 * * * MON-FRI',
    '5 6 * * SAT',
    '*/15 5-21 * * MON-FRI',
  ]);

  const map = new Map();
  const env = {
    DB: {
      prepare(sql) {
        const select = /^\s*SELECT/i.test(sql);
        const insert = /^\s*INSERT/i.test(sql);
        return {
          bind(...args) {
            return {
              async first() {
                if (!select) return null;
                const body = map.get(args[0]);
                return body == null ? null : { body };
              },
              async run() { if (insert) map.set(args[0], args[1]); },
            };
          },
        };
      },
    },
  };
  const fetchImpl = async () => ({ ok: true, async text() { return ECB_CSV; } });
  await updateRecentHistory(env, fetchImpl, new Date('2026-10-09T15:05:00Z'));
  assert.match(map.get('history-USD'), /2026-10-01/);
  const res = await handleHistory(env, 'USD', '10J', new Date('2026-10-09T15:05:00Z'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const payload = JSON.parse(await res.text());
  assert.equal(payload.unit, 'CHF');
  assert.equal(payload.points[0][1], 0.835281);
  const missing = await handleHistory(env, 'CHF', '1M', new Date('2026-10-09T15:05:00Z'));
  assert.equal(missing.status, 404);
  const bad = await handleHistory(env, 'USD', '1T', new Date('2026-10-09T15:05:00Z'));
  assert.equal(bad.status, 400);
});
