# Währungen

Devisen-Mittelkurse USD, EUR, GBP in CHF – werktags zu konfigurierbaren Stunden (Standard 06/08/10/12/14/16/18/20, Europe/Zurich),
Prognose Tagesende, Prognose 7 Tage (je mit Abweichung), Zeile «Aktuell» (Live-Kurs), EZB-Referenzkurs, FX-Push-Alarme (ntfy).
Statische Seite + geplante GitHub-Actions-Jobs. Web-App: https://bigyok61.github.io/currency/

- `scripts/capture.py` – Erfassung (nur Python-Standardbibliothek, keine Schlüssel). Idempotent, ergänzt nur. Liest `data/capture-times.json`.
- `data/rates.json` – dauerhafter Verlauf, gleiches Format wie die macOS-App (`History`/`DayRecord`).
- `data/capture-times.json` – welche vollen Stunden erfasst und angezeigt werden (bearbeitbar).
- `.github/workflows/capture.yml` – stündlich :05 UTC (Mo–Fr), committet Daten, veröffentlicht GitHub Pages.
- `scripts/fx_alerts.py` + `.github/workflows/fx-alerts.yml` – FX-Push-Alarme via ntfy (alle 15 Min., siehe unten).
- `data/fx-alerts.json` – Schwellen der FX-Alarme (bearbeitbar), `data/fx-alert-state.json` – heute bereits gesendete Alarme.
- `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest` – PWA (iPhone: Teilen › Zum Home-Bildschirm).

Daten-URL für die macOS-App: `https://bigyok61.github.io/currency/data/rates.json`
(alternativ `https://raw.githubusercontent.com/BigYok61/currency/main/data/rates.json`).

Einrichtung: öffentliches Repo anlegen, pushen, unter Settings › Pages › Source „GitHub Actions" wählen,
einmal „Run workflow" ausführen.

Lokal testen: `python3 scripts/capture.py && python3 -m http.server 8000`

Datenformat je Tag (`days["yyyy-MM-dd"]`): `slots` (Stunde `"00"`…`"23"` → Code → CHF; bisherige Schlüssel `"08"`…`"18"` bleiben, `"06"` und `"20"` kommen dazu), `ecb`, `forecast` (Prognose 16:00
desselben Tages), `forecast7` (Prognose für 16:00 eine Woche später, erstellt zur Startstunde dieses Tages) und
`forecastBasis` / `forecast7Basis` (Stunde, mit der die Prognose gerechnet wurde; fehlt das Feld, war es 08:00) und
`forecast7Target` (Zieldatum). Ist-Wert der 7-Tage-Prognose: Zieltag 16:00, sonst nächster vorhandener Zeitpunkt.
Das 7-Tage-Modell nutzt die 16:00-Kurse von biquote (ca. 7 Tage Verlauf) und ergänzt ältere Tage mit EZB-Referenzkursen.
Die macOS-App liest dieselben `slots`; unbekannte Schlüssel wie `"06"` und `"20"` sind zusätzliche Einträge und ändern das Format nicht.

## Erfassungszeiten
Standard in `data/capture-times.json`: 06:00–20:00 alle 2 Stunden (Europe/Zurich), also 06, 08, 10, 12, 14, 16, 18, 20.
```json
{ "version": 2, "start": "06", "end": "20", "intervalHours": 2 }
```
`start` und `end` sind ganze Stunden `"00"`…`"23"` (oder Zahlen), `start` liegt vor `end`. `intervalHours` ist 1, 2, 3, 4, 8, 12 oder 24.
Die Messungen sind `start + n × Intervall`, solange sie ≤ `end` sind (06–20 alle 3 Stunden endet bei 18:00; 24 Stunden ergibt eine Messung am Startzeitpunkt).
Halbe Stunden gibt es nicht: biquote liefert Stundenkerzen, der Job läuft stündlich.
Die Tabelle zeigt nur die Stunden des Rasters. **16:00 wird immer erfasst** (Zeile «Tagesendkurs»), auch wenn 16 nicht auf dem Raster liegt; als Uhrzeit-Zeile erscheint 16:00 nur dann. Die Prognose Tagesende, die Prognose 7 Tage, die Veränderungspfeile und die FX-Alarme beziehen sich auf die **Startstunde**. Fehlt sie an einem Tag, gilt die erste erfasste Stunde dieses Tages, bei älteren Tagen 08:00. Der Tooltip nennt die tatsächlich verwendete Stunde.
Eine ältere Datei der Form `{ "version": 1, "hours": [6, 8, 10] }` bleibt gültig. Stehen Von/Bis/Intervall und `hours` zusammen in der Datei, gilt das Raster.

Der Cron bleibt stündlich (`5 * * * 1-5` plus Samstag 06:05 UTC): jede Zürcher Stunde, inklusive 06:00 und 20:00,
fällt in CET (UTC+1) und CEST (UTC+2) auf einen dieser Läufe. Welche Stunden gespeichert werden, filtert das Skript.
Fehlende Werte der letzten ca. 7 Tage trägt der biquote-Verlauf nach. Die Tabelle zeigt neue Stunden sofort, der Kurs erst nach dem Lauf («–» bis dahin).

Ein Commit von `data/capture-times.json` oder `data/fx-alerts.json` auf `main` startet denselben Job sofort (Erfassung inklusive Nachtrag, danach GitHub Pages). Die neue Datei wartet damit nicht auf den nächsten Stundenlauf. Commits von `data/rates.json` und `data/fx-alert-state.json` lösen den Job nicht aus: die Workflows schreiben diese Dateien selbst. Pushes mit `GITHUB_TOKEN` starten ohnehin keine Workflows.

Drei Wege:
1. **Web-App:** Uhr-Symbol oben rechts → Von, Bis und Intervall. Die Vorschau darunter folgt sofort, auch ohne Token. «Speichern» schreibt die Datei, sobald der GitHub-Token hinterlegt ist (gleiche Eingabe wie bei den FX-Alarmen, 🔔). Ohne Token steht unter der Vorschau «Zum Speichern mit GitHub verbinden»; das öffnet die Token-Eingabe der FX-Alarme.
2. **Direkt auf GitHub:** https://github.com/BigYok61/currency/edit/main/data/capture-times.json →
   `start`, `end`, `intervalHours` ändern → «Commit changes…». Ohne Token, nur mit dem GitHub-Login.
3. Dieselbe Datei im Repository committen. `capture.py` schreibt sie nicht um.

## Zeile «Aktuell» (Live-Kurs)
Unter den erfassten Zeitpunkten steht je Währung die Zeile **«Aktuell HH:MM»**: der Mittelkurs von biquote.io
(gleiche Quelle wie die Zeitpunkte), abgerufen beim Öffnen der App bzw. mit ↻ (zusätzlich alle 10 Minuten und beim
Zurückkehren in die App). HH:MM = Abrufzeit (Schweizer Zeit); der Tooltip zeigt die Veränderung seit der Startstunde (absolut und in %)
und die Zeit des Kurses. Der Wert erscheint nur in der Spalte von heute, wird nie gespeichert und füllt keinen
erfassten Zeitpunkt. Am Wochenende gibt es keine Spalte für heute; dann steht der letzte Kurs neben dem Währungsnamen.
Im CSV-Export erscheint die Zeile «Aktuell HH:MM (Live, nicht gespeichert)» mit dem Wert in der Spalte von heute.

## FX-Push-Alarme (ntfy)
Der Workflow **«FX-Push-Alarme (ntfy)»** (`.github/workflows/fx-alerts.yml`) läuft werktags alle 15 Minuten; das Skript prüft
nur Mo–Fr 07:00–22:00 Uhr Schweizer Zeit (Wochenende wird übersprungen). Gemeldet wird, wenn USD/CHF bzw. EUR/CHF gegenüber
dem Kurs der **Startstunde** aus `data/capture-times.json` (vor dieser Stunde: Tageseröffnung; fehlt die Startkerze, die erste Kerze des Tages, sonst 08:00) um **mehr als** die Schwelle fällt oder steigt, z. B.
`USD/CHF −0.52 % seit 06:00 (0.8231 → 0.8188)`. Je Währung und Richtung höchstens **eine Meldung pro Tag**
(Status in `data/fx-alert-state.json`, am nächsten Tag wieder scharf). Veraltete Kurse (älter als 20 Min.) lösen nichts aus.

Empfang: ntfy-App → gleiches Topic wie die Aktienübersicht. Das Topic ist als Repository-Secret `NTFY_TOPIC` hinterlegt
(nie im Repository, das Repo ist öffentlich; ein Secret lässt sich nicht auslesen, nur neu setzen:
`gh secret set NTFY_TOPIC -R BigYok61/currency`).
Test-Push: `gh workflow run fx-alerts.yml -R BigYok61/currency -f test=true` (Meldung «TEST: …»).

### Schwellen ändern
Datei `data/fx-alerts.json` (Standard: fällt um mehr als 0.5 %, steigt um mehr als 0.25 %):
```json
{ "version": 1, "currencies": {
    "USD": { "enabled": true, "down": 0.5, "up": 0.25 },
    "EUR": { "enabled": true, "down": 0.5, "up": 0.25 } } }
```
`down`/`up` in Prozent (positiv), `enabled: false` schaltet eine Währung aus. Optional auch `"GBP"` (GBP/CHF).
Änderungen gelten ab dem nächsten Lauf. Drei Wege:
1. **Web-App:** 🔔 oben rechts → Schwellen/Aktiv ändern → «Speichern» (braucht den GitHub-Token, siehe unten).
2. **Mac-App (ab 1.4):** Einstellungen (⌘,) → «FX-Alarme» (Token im Schlüsselbund).
3. **Direkt auf GitHub:** https://github.com/BigYok61/currency/edit/main/data/fx-alerts.json →
   Werte ändern → «Commit changes…». Ohne Token, nur mit dem GitHub-Login.

### GitHub-Token (einmalig, wie bei der Aktienübersicht)
github.com → Profilbild → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** →
**Generate new token**: Name «Währungen», Ablaufdatum wählen, Repository access **Only select repositories** →
**BigYok61/currency** (ein bestehender Aktienübersicht-Token kann alternativ um dieses Repository erweitert werden),
Permissions → Repository permissions → **Contents: Read and write**, alles andere «No access» → **Generate token**, kopieren.
Web-App: 🔔 → Token einfügen → «Token speichern» (bleibt nur in diesem Browser, wird nur an api.github.com gesendet;
«Token entfernen» löscht ihn). Mac-App: Einstellungen → FX-Alarme → Token (Schlüsselbund).
Ohne Token sind die Schwellen in den Apps nur lesbar.
