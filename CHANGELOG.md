# Änderungen

Alle nennenswerten Änderungen an Netzblick. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionsnummern nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

## [1.1.1] – 2026-11-18

### Behoben
- Auf Handys mit hoher Statusleiste war die Kopfzeile mit Menü, Zählpunktwahl und Neu-laden-Knopf verdeckt. Dadurch waren Menü, Mehrfachauswahl und die Seiten zum Kundenportal nicht erreichbar.
- Standard-Versionsnummer im Android-Projekt war ungültig; der Build in Android Studio und in der CI brach ab.

### Neu
- Einmaliger Hinweis „Neu in Netzblick 1.1“ mit den wichtigsten Neuerungen und einem Knopf zum Menü.

### Geändert
- `proguard-android-optimize.txt` statt `proguard-android.txt` (Hinweis von Android Studio).
- npm 12: esbuild darf sein Installationsskript ausführen (`allowScripts`).

## [1.1.0] – 2026-11-17

### Neu
- **Kundenportal von Netz Burgenland eingebunden.** Beide Portale nutzen dieselbe Anmeldung, darum reicht normalerweise der Smart-Meter-Zugang. Wer im Kundenportal ein anderes Konto hat, trägt es bei der Anmeldung oder unter „Konto“ ein.
- **Seite „Anlagen“:** Zählpunktnummer (kopierbar), Adresse, Zählernummer, Gerät, Zählerstand, Messwerte seit, Netzebene, Lastprofil, Lieferant, Vertragsbeginn, letzte Abrechnung, Energiegemeinschaft.
- **Seite „Abrechnung“:** laufendes Abrechnungsjahr aus den Smart-Meter-Werten mit Hochrechnung (nach dem Verlauf des Vorjahres), Vergleich gemessen gegen abgerechnet, Kosten gegen Teilbeträge, abgerechnete Jahresverbräuche, Rechnungen und Teilbeträge. Externe Rechnungssteller werden erkannt.
- **Seite „Konto“** mit dem Status beider Portale, Wahl des Zugangs zum Kundenportal und Abmelden; **Seite „Info“** mit Marke, Version, Kontakt, Datenschutz und Lizenzen.
- **Menü:** auf dem Handy als Schublade (Knopf oder Wischen vom linken Rand), auf dem Tablet fest am Rand.
- **Mehrfachauswahl der Zählpunkte:** in der Diagrammlegende ein- und ausblenden, im Filter und in der Zählpunktwahl („nur dieser“). Farben bleiben je Zählpunkt gleich.
- **Diagrammart umschaltbar:** Balken, Linien (Zählpunkte einzeln), Fläche (gestapelt) und Kreis mit Aufteilung nach Zählpunkt, Tageszeit oder Werktag/Wochenende samt Tabelle. Die Wahl wird je Auflösung gemerkt.
- Eigener Zeitraum „Seit der letzten Abrechnung“.
- Tablet- und Querformat-Layout: Summe und Kennzahlen neben dem Diagramm, Analysen zweispaltig.
- Animiertes Markenzeichen beim Start, im Menü und auf der Info-Seite.

### Geändert
- Zählpunkte heißen ohne eigenen Namen jetzt nach ihrer Zählpunktnummer (wie im Smart-Meter-Portal), in engen Stellen gekürzt (AT0090…12345678).
- Einstellungen und Abmelden sind ins Menü gewandert.

## [1.0.0] – 2026-11-17

Erste Version.

### Neu
- Anmeldung mit dem Zugang zum Verbrauchsdatenportal von Netz Burgenland, optional verschlüsselt gespeichert (Android Keystore), automatische Neuanmeldung nach Ablauf der Sitzung.
- Zeiträume Tag, Woche, Monat, Jahr, Gesamt und eigener Zeitraum; Blättern per Pfeil oder Wischen.
- Vergleich mit Vorperiode oder Vorjahr („bis zum gleichen Zeitpunkt“), Hochrechnung und Kostenschätzung.
- Diagramme: Leistungskurve (15 min), Tages-, Monats- und Jahresbalken; Lastgang-Teppich, typischer Tagesverlauf, Wochentage, Jahreskalender, Jahre im Vergleich.
- Kennzahlen: Ø pro Tag, Spitzenleistung, Grundlast, Nachtanteil, Ø Leistung, Kosten pro Tag.
- Filter nach Wochentagen und Tageszeit.
- Mehrere Zählpunkte einzeln oder gestapelt, eigene Namen.
- Zählerstand als Rollenzählwerk.
- Wertetabelle und CSV-Export.
- Kennzeichnung von Ersatz-, vorläufigen und fehlenden Werten.
- Offline-Anzeige zuletzt geladener Werte, Dunkelmodus, Demo-Modus.

[Unveröffentlicht]: https://github.com/xionix3/netzblick/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/xionix3/netzblick/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/xionix3/netzblick/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/xionix3/netzblick/releases/tag/v1.0.0
