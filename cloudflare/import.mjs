// Einmalig: data/*.json aus dem Repo nach D1 schreiben (voller Verlauf).
// Erneutes Ausführen ersetzt die vier Dokumente durch die Dateien im Repo.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const local = process.argv.includes('--local');
const files = [
  ['rates', 'data/rates.json'],
  ['capture-times', 'data/capture-times.json'],
  ['fx-alerts', 'data/fx-alerts.json'],
  ['fx-alert-state', 'data/fx-alert-state.json'],
];

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

// Ein einziges INSERT. Remote `wrangler d1 execute --file` lädt die Datei über die
// D1-Import-API, die selbst eine Transaktion öffnet und SQL-BEGIN/COMMIT ablehnt
// («use state.storage.transaction() instead of BEGIN TRANSACTION»). Lokal führt
// wrangler die Datei als db.batch() aus, ebenfalls ohne explizites BEGIN.
const rows = [];
for (const [key, rel] of files) {
  const body = readFileSync(join(root, rel), 'utf8');
  JSON.parse(body);
  rows.push(`  (${sqlString(key)}, ${sqlString(body)})`);
}
const sql = `INSERT INTO documents (key, body) VALUES\n${rows.join(',\n')}\nON CONFLICT(key) DO UPDATE SET body = excluded.body;\n`;

const dir = mkdtempSync(join(tmpdir(), 'waehrungen-import-'));
const file = join(dir, 'import.sql');
writeFileSync(file, sql);
const args = ['wrangler', 'd1', 'execute', 'waehrungen', local ? '--local' : '--remote', `--file=${file}`];
const result = spawnSync('npx', args, { cwd: here, stdio: 'inherit', env: process.env });
rmSync(dir, { recursive: true, force: true });
if (result.status !== 0) process.exit(result.status || 1);
console.log(local ? 'Lokale D1-Dokumente ersetzt.' : 'Remote-D1-Dokumente ersetzt.');
