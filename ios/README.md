# Währungen für iPhone

Erste native App, Version 1.0 (Build 1). SwiftUI, iOS 17 oder neuer. Dieselben Kursdaten wie die Web-App, über `https://waehrungen.bigyok61.workers.dev`.

Bundle-ID: `ch.computerworks.waehrungen`. Das Entwicklungsteam tragen Sie in Xcode selbst ein (Apple-Developer-Account `cwmessehw@computerworks.ch`). Die Projektdatei enthält keine Team-ID.

## Auf dem iPhone starten

1. Öffnen Sie `ios/Waehrungen.xcodeproj` in Xcode 15 oder neuer.
2. Schliessen Sie das iPhone per Kabel an und entsperren Sie es. Tippen Sie auf dem iPhone auf «Diesem Computer vertrauen», falls die Abfrage erscheint.
3. Wählen Sie in der Symbolleiste oben links das Schema **Waehrungen** und als Ziel Ihr iPhone (nicht einen Simulator, wenn Sie die App auf dem Gerät prüfen wollen).
4. Wählen Sie das Projekt **Waehrungen** in der linken Spalte, dann das Target **Waehrungen**, dann den Reiter **Signing & Capabilities**.
5. Aktivieren Sie **Automatically manage signing**.
6. Wählen Sie bei **Team** das Team des Accounts `cwmessehw@computerworks.ch`. Die Bundle-ID bleibt `ch.computerworks.waehrungen`.
7. Drücken Sie **Run** (Wiedergabe-Taste) oder `⌘R`. Xcode installiert die App und startet sie.

## Entwicklerprofil auf dem iPhone vertrauen

Beim ersten Start aus Xcode kann iOS die App blockieren, bis das Entwicklerzertifikat vertraut ist.

1. Öffnen Sie auf dem iPhone **Einstellungen**.
2. Gehen Sie zu **Allgemein**.
3. Gehen Sie zu **VPN und Geräteverwaltung** (auf älteren Systemen **Profile und Geräteverwaltung**).
4. Tippen Sie unter **Entwickler-App** auf den Eintrag des Accounts.
5. Tippen Sie auf **Vertrauen** und bestätigen Sie.
6. Öffnen Sie **Währungen** erneut auf dem Home-Bildschirm.

## Bedienung

Die Kopfzeile zeigt von links nach rechts Ansicht (Raster), Erfassungszeiten (Uhr), FX-Alarme (Glocke) und Aktualisieren. Die Liste lässt sich nach unten ziehen, um die Kurse neu zu laden. Eine Währung löschen Sie mit einem Wisch nach links. Die Reihenfolge ändern Sie mit einem langen Druck auf die drei Striche am rechten Rand. Das grüne Plus öffnet die Suche mit Flaggen.

Ohne eigene Erfassungszeiten zeigt die App 07:00, 12:00 und 17:00. Die Grafik startet mit 30 Tagen (Monat), bis Sie einen anderen Zeitraum wählen.
