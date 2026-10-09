# Cloudflare Worker «waehrungen»

Parallel zu GitHub Actions und GitHub Pages. Die Schritte stehen auch im Repository-README unter «Cloudflare (parallel zu GitHub Pages)». Kurzfassung, auszuführen in diesem Verzeichnis. Node 22 oder neuer (`npx wrangler` 4.x). `database_id` und `APP_URL` stehen in `wrangler.toml`.

Es gibt kein App-Passwort und kein gemeinsames ntfy-Thema. Die Erfassungszeiten sind eine Anzeige auf dem Gerät. FX-Alarme legt jede Person selbst an.

Die Basiswährung liegt auf dem Gerät (`localStorage`). Schweiz bleibt Franken mit Euro, Dollar und Pfund. Eine andere Basis, die biquote.io als CHF-Paar führt, meldet das Gerät mit `POST /api/currencies` (`{ "codes": ["SEK"] }`). Der stündliche Cron erfasst diese Währungen zusätzlich, höchstens zwölf, nur wenn der Code bei der EZB (Frankfurter) und bei biquote.io existiert. Bis die Stunde gespeichert ist, rechnet die Seite mit dem EZB-Tageskurs. `GET /api/currencies` zeigt die Liste. Die eingebauten Kurse USD, EUR und GBP bleiben im JSON.

`GET /data/history/<CCY>.json?range=1M|1J|5J|10J` liefert den EZB-Tagesverlauf als CHF je 1 Einheit, ausgedünnt. Einmalig `node history-backfill.mjs` (lokal) oder `node history-backfill.mjs --remote`. Der Cron ergänzt werktags um 17 Uhr Zürich und samstags die letzten Wochen. GitHub Pages liest für die Grafik denselben Worker-Endpunkt.

```bash
export CLOUDFLARE_API_TOKEN='…'
export CLOUDFLARE_ACCOUNT_ID='7990e79f1ae37e88673013377e1e75f0'

npx wrangler d1 migrations apply waehrungen --remote
node import.mjs
node history-backfill.mjs --remote
node prepare-assets.mjs
npx wrangler deploy
```

`node import.mjs` noch einmal auszuführen ersetzt die gemeinsamen JSON-Dokumente durch die Dateien im Repo. Persönliche Alarme bleiben in der Tabelle `subscriptions`, ausser das Schema wird neu angelegt.
