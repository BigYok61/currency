# Währungsübersicht (Web)

Devisen-Mittelkurse USD, EUR, GBP in CHF – werktags 08/10/12/14/16/18 Uhr (Europe/Zurich),
Prognose Tagesende, Prognose 7 Tage (je mit Abweichung), EZB-Referenzkurs. Statische Seite + geplanter GitHub-Actions-Job.

- `scripts/capture.py` – Erfassung (nur Python-Standardbibliothek, keine Schlüssel). Idempotent, ergänzt nur.
- `data/rates.json` – dauerhafter Verlauf, gleiches Format wie die macOS-App (`History`/`DayRecord`).
- `.github/workflows/capture.yml` – stündlich :05 UTC (Mo–Fr), committet Daten, veröffentlicht GitHub Pages.
- `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest` – PWA (iPhone: Teilen › Zum Home-Bildschirm).

Daten-URL für die macOS-App: `https://<benutzer>.github.io/<repo>/data/rates.json`
(alternativ `https://raw.githubusercontent.com/<benutzer>/<repo>/main/data/rates.json`).

Einrichtung: öffentliches Repo anlegen, pushen, unter Settings › Pages › Source „GitHub Actions" wählen,
einmal „Run workflow" ausführen.

Lokal testen: `python3 scripts/capture.py && python3 -m http.server 8000`

Datenformat je Tag (`days["yyyy-MM-dd"]`): `slots` ("08"…"18" → Code → CHF), `ecb`, `forecast` (Prognose 16:00
desselben Tages), `forecast7` (Prognose für 16:00 eine Woche später, erstellt um 08:00 dieses Tages) und
`forecast7Target` (Zieldatum). Ist-Wert der 7-Tage-Prognose: Zieltag 16:00, sonst nächster vorhandener Zeitpunkt.
Das 7-Tage-Modell nutzt die 16:00-Kurse von biquote (ca. 7 Tage Verlauf) und ergänzt ältere Tage mit EZB-Referenzkursen.
