# Cloudflare Worker «waehrungen»

Parallel zu GitHub Actions und GitHub Pages. Die Schritte stehen auch im Repository-README unter «Cloudflare (parallel zu GitHub Pages)». Kurzfassung, auszuführen in diesem Verzeichnis. Node 22 oder neuer (`npx wrangler` 4.x). `database_id` und `APP_URL` stehen in `wrangler.toml`.

Es gibt kein App-Passwort und kein gemeinsames ntfy-Thema. Die Erfassungszeiten sind eine Anzeige auf dem Gerät. FX-Alarme legt jede Person selbst an.

Die Basiswährung liegt auf dem Gerät (`localStorage`). Schweiz bleibt Franken mit Euro, Dollar und Pfund. Eine andere Basis, die biquote.io als CHF-Paar führt, meldet das Gerät mit `POST /api/currencies` (`{ "codes": ["SEK"] }`). Der stündliche Cron erfasst diese Währungen zusätzlich, höchstens zwölf, nur wenn der Code bei der EZB (Frankfurter) und bei biquote.io existiert. Bis die Stunde gespeichert ist, rechnet die Seite mit dem EZB-Tageskurs. `GET /api/currencies` zeigt die Liste. Die eingebauten Kurse USD, EUR und GBP bleiben im JSON.

```bash
export CLOUDFLARE_API_TOKEN='…'
export CLOUDFLARE_ACCOUNT_ID='7990e79f1ae37e88673013377e1e75f0'

npx wrangler d1 migrations apply waehrungen --remote
node import.mjs
node prepare-assets.mjs
npx wrangler deploy
```

`node import.mjs` noch einmal auszuführen ersetzt die gemeinsamen JSON-Dokumente durch die Dateien im Repo. Persönliche Alarme bleiben in der Tabelle `subscriptions`, ausser das Schema wird neu angelegt.
