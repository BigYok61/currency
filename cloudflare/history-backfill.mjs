// Einmaliger EZB-Tagesverlauf ab 2015-01-01 nach D1 (history-USD, history-EUR, …).
// Lokal:  node history-backfill.mjs
// Remote: node history-backfill.mjs --remote
// Der Samstags-Cron und werktags 17 Uhr Zürich ziehen danach die letzten Wochen nach.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { ecbHistoryUrl, historyBody, HISTORY_CODES, toChfPoints, parseEcbRates } from './src/history.js';

const START = '2015-01-01';
const here = dirname(fileURLToPath(import.meta.url));
const remote = process.argv.includes('--remote');

function findLocalDb(dir) {
  const hits = [];
  let entries = [];
  try { entries = readdirSync(dir); } catch { return hits; }
  for (const name of entries) {
    const path = join(dir, name);
    let st;
    try { st = statSync(path); } catch { continue; }
    if (st.isDirectory()) hits.push(...findLocalDb(path));
    else if (name.endsWith('.sqlite')) hits.push(path);
  }
  return hits;
}

function sqlLiteral(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

const res = await fetch(ecbHistoryUrl(START), {
  headers: { Accept: 'text/csv', 'User-Agent': 'Waehrungsuebersicht/1.0 (+cloudflare)' },
});
if (!res.ok) {
  console.error(`ECB ${res.status}`);
  process.exit(1);
}
const points = toChfPoints(parseEcbRates(await res.text()));
const statements = [];
for (const code of HISTORY_CODES) {
  const series = points[code] || [];
  if (!series.length) {
    console.error(`keine Punkte für ${code}`);
    process.exit(1);
  }
  const body = historyBody(code, series);
  console.log(`${code} ${series.length} Tage, ${series[0][0]} … ${series[series.length - 1][0]}, ${body.length} Bytes`);
  statements.push(
    `INSERT INTO documents (key, body) VALUES (${sqlLiteral(`history-${code}`)}, ${sqlLiteral(body)}) ON CONFLICT(key) DO UPDATE SET body = excluded.body;`,
  );
}

if (remote) {
  const file = join(here, '.history-backfill.sql');
  writeFileSync(file, statements.join('\n') + '\n');
  const run = spawnSync('npx', ['wrangler', 'd1', 'execute', 'waehrungen', '--remote', `--file=${file}`], {
    cwd: here, stdio: 'inherit',
  });
  process.exit(run.status ?? 1);
}

const candidates = findLocalDb(join(here, '.wrangler')).filter(path => {
  try {
    const db = new DatabaseSync(path, { readOnly: true });
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents'").get();
    db.close();
    return !!row;
  } catch {
    return false;
  }
});
if (!candidates.length) {
  console.error('Lokale D1 nicht gefunden. Zuerst: npx wrangler d1 migrations apply waehrungen --local');
  process.exit(1);
}
for (const dbPath of candidates) {
  const db = new DatabaseSync(dbPath);
  const insert = db.prepare('INSERT INTO documents (key, body) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body');
  db.exec('BEGIN');
  try {
    for (const code of HISTORY_CODES) insert.run(`history-${code}`, historyBody(code, points[code]));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.close();
  console.log(`geschrieben nach ${dbPath}`);
}
