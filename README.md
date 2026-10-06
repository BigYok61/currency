# Währungen

Devisen-Mittelkurse USD, EUR, GBP in CHF – werktags 08/10/12/14/16/18 Uhr (Europe/Zurich),
Prognose Tagesende, Prognose 7 Tage (je mit Abweichung), Zeile «Aktuell» (Live-Kurs), EZB-Referenzkurs, FX-Push-Alarme (ntfy).
Statische Seite + geplante GitHub-Actions-Jobs. Web-App: https://bigyok61.github.io/waehrungsuebersicht/

- `scripts/capture.py` – Erfassung (nur Python-Standardbibliothek, keine Schlüssel). Idempotent, ergänzt nur.
- `data/rates.json` – dauerhafter Verlauf, gleiches Format wie die macOS-App (`History`/`DayRecord`).
- `.github/workflows/capture.yml` – stündlich :05 UTC (Mo–Fr), committet Daten, veröffentlicht GitHub Pages.
- `scripts/fx_alerts.py` + `.github/workflows/fx-alerts.yml` – FX-Push-Alarme via ntfy (alle 15 Min., siehe unten).
- `data/fx-alerts.json` – Schwellen der FX-Alarme (bearbeitbar), `data/fx-alert-state.json` – heute bereits gesendete Alarme.
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

## Zeile «Aktuell» (Live-Kurs)
Unter den Zeitpunkten 08–18 Uhr steht je Währung die Zeile **«Aktuell HH:MM»**: der Mittelkurs von biquote.io
(gleiche Quelle wie die Zeitpunkte), abgerufen beim Öffnen der App bzw. mit ↻ (zusätzlich alle 10 Minuten und beim
Zurückkehren in die App). HH:MM = Abrufzeit (Schweizer Zeit); der Tooltip zeigt die Veränderung seit 08:00 (absolut und in %)
und die Zeit des Kurses. Der Wert erscheint nur in der Spalte von heute, wird nie gespeichert und füllt den 18:00-Zeitpunkt
nicht. Am Wochenende gibt es keine Spalte für heute; dann steht der letzte Kurs neben dem Währungsnamen.
Im CSV-Export erscheint die Zeile «Aktuell HH:MM (Live, nicht gespeichert)» mit dem Wert in der Spalte von heute.

## FX-Push-Alarme (ntfy)
Der Workflow **«FX-Push-Alarme (ntfy)»** (`.github/workflows/fx-alerts.yml`) läuft werktags alle 15 Minuten; das Skript prüft
nur Mo–Fr 07:00–22:00 Uhr Schweizer Zeit (Wochenende wird übersprungen). Gemeldet wird, wenn USD/CHF bzw. EUR/CHF gegenüber
dem Kurs von **08:00** (vor 08:00: Tageseröffnung) um **mehr als** die Schwelle fällt oder steigt, z. B.
`USD/CHF −0.52 % seit 08:00 (0.8231 → 0.8188)`. Je Währung und Richtung höchstens **eine Meldung pro Tag**
(Status in `data/fx-alert-state.json`, am nächsten Tag wieder scharf). Veraltete Kurse (älter als 20 Min.) lösen nichts aus.

Empfang: ntfy-App → gleiches Topic wie die Aktienübersicht. Das Topic ist als Repository-Secret `NTFY_TOPIC` hinterlegt
(nie im Repository, das Repo ist öffentlich; ein Secret lässt sich nicht auslesen, nur neu setzen:
`gh secret set NTFY_TOPIC -R BigYok61/waehrungsuebersicht`).
Test-Push: `gh workflow run fx-alerts.yml -R BigYok61/waehrungsuebersicht -f test=true` (Meldung «TEST: …»).

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
3. **Direkt auf GitHub:** https://github.com/BigYok61/waehrungsuebersicht/edit/main/data/fx-alerts.json →
   Werte ändern → «Commit changes…». Ohne Token, nur mit dem GitHub-Login.

### GitHub-Token (einmalig, wie bei der Aktienübersicht)
github.com → Profilbild → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** →
**Generate new token**: Name «Währungen», Ablaufdatum wählen, Repository access **Only select repositories** →
**BigYok61/waehrungsuebersicht** (ein bestehender Aktienübersicht-Token kann alternativ um dieses Repository erweitert werden),
Permissions → Repository permissions → **Contents: Read and write**, alles andere «No access» → **Generate token**, kopieren.
Web-App: 🔔 → Token einfügen → «Token speichern» (bleibt nur in diesem Browser, wird nur an api.github.com gesendet;
«Token entfernen» löscht ihn). Mac-App: Einstellungen → FX-Alarme → Token (Schlüsselbund).
Ohne Token sind die Schwellen in den Apps nur lesbar.
