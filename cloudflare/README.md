# Cloudflare Worker «waehrungen»

Parallel zu GitHub Actions und GitHub Pages. Die Schritte stehen auch im Repository-README unter «Cloudflare (parallel zu GitHub Pages)». Kurzfassung, auszuführen in diesem Verzeichnis. Node 22 oder neuer (`npx wrangler` 4.x). `database_id` und `APP_URL` stehen in `wrangler.toml`.

Es gibt kein App-Passwort und kein gemeinsames ntfy-Thema. Die Erfassungszeiten sind eine Anzeige auf dem Gerät. FX-Alarme legt jede Person selbst an.

```bash
export CLOUDFLARE_API_TOKEN='…'
export CLOUDFLARE_ACCOUNT_ID='7990e79f1ae37e88673013377e1e75f0'

npx wrangler d1 migrations apply waehrungen --remote
node import.mjs
node prepare-assets.mjs
npx wrangler deploy
```

`node import.mjs` noch einmal auszuführen ersetzt die gemeinsamen JSON-Dokumente durch die Dateien im Repo. Persönliche Alarme bleiben in der Tabelle `subscriptions`, ausser das Schema wird neu angelegt.
