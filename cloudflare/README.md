# Cloudflare Worker «waehrungen»

Parallel zu GitHub Actions und GitHub Pages. Die Schritte stehen auch im Repository-README unter «Cloudflare (parallel zu GitHub Pages)». Kurzfassung, auszuführen in diesem Verzeichnis. Node 22 oder neuer (`npx wrangler` 4.x). `database_id` und `APP_URL` stehen bereits in `wrangler.toml`.

```bash
export CLOUDFLARE_API_TOKEN='…'
export CLOUDFLARE_ACCOUNT_ID='7990e79f1ae37e88673013377e1e75f0'

npx wrangler d1 migrations apply waehrungen --remote
node import.mjs
printf '%s' 'HIER-APP-PASSWORT' | npx wrangler secret put APP_PASSWORD
node prepare-assets.mjs
npx wrangler deploy
```

`NTFY_TOPIC` erst setzen, wenn der GitHub-Workflow für die FX-Alarme aus ist:

```bash
printf '%s' 'TOPIC-WIE-IM-GITHUB-SECRET' | npx wrangler secret put NTFY_TOPIC
```

`node import.mjs` noch einmal auszuführen ersetzt den Worker-Speicher durch die JSON-Dateien im Repo.
