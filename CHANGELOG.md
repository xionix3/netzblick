# Änderungen

Alle nennenswerten Änderungen an Netzblick. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionsnummern nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

## [1.8.5] – 2026-11-24

### Neu
- Desktop-Programm: „Kaffee spendieren“ in der Seitenleiste und unter Info (über GitHub Sponsors). In der Android-App gibt es das nicht, weil Google Play Links zu Zahlungen außerhalb von Play nicht erlaubt.

### Geändert
- Android: Der Hinweis auf das Desktop-Programm nennt keine GitHub-Adresse mehr.
- Info im Desktop-Programm: Datenschutz-Hinweis nennt den Schlüsselbund des Computers statt des Android-Schlüsselspeichers.

## [1.8.4] – 2026-11-24

### Neu
- Desktop-Programm: Das Fenster „Neue Version“ zeigt jetzt auch, was sich geändert hat. Diese Version ist zugleich die erste, die sich über „Jetzt aktualisieren“ von 1.8.3 aus selbst installiert.

## [1.8.3] – 2026-11-24

### Neu
- **Updates im Desktop-Programm sind aktiv.** Bei einer neuen Version zeigt Netzblick „Jetzt aktualisieren“, lädt sie, prüft die Signatur (eigener Schlüssel von geister-it), installiert und startet neu. Windows, macOS und Linux (AppImage). Diese Version selbst musst du noch einmal von Hand installieren.

## [1.8.2] – 2026-11-24

### Neu
- **Desktop-Programm aktualisiert sich selbst** (sobald der Update-Schlüssel eingerichtet ist): Bei einer neuen Version lädt Netzblick sie auf Knopfdruck, prüft die Signatur, installiert und startet neu. Unter Info gibt es „Nach neuer Version suchen“. Ohne Schlüssel und beim .deb-Paket bleibt es beim Link zur Download-Seite.

### Geändert
- Strompreis: Das Feld „Lieferant“ ist wieder mit dem Lieferanten aus dem Kundenportal vorbelegt (seit 1.5.0 stand er nur als Hinweis darunter).
- Strompreis: „Stromanschluss“ statt „Zähler“, mit Erklärung, was Drehstrom und Wechselstrom bedeuten und wie viel das Messentgelt ausmacht.

## [1.8.1] – 2026-11-24

### Neu
- **Zoomen in den Diagrammen.** Verbrauch, Leistung und Börsenpreis haben bei vielen Werten einen Regler unter dem Diagramm (auch am Handy). Mit Maus oder Touchpad zusätzlich Strg + Mausrad bzw. zwei Finger spreizen, Umschalt + Mausrad zum Verschieben, Doppelklick setzt zurück. Die Achsenbeschriftung passt sich dem Ausschnitt an (Tage, Stunden).
- Desktop-Programm: Strg + Plus/Minus/0 vergrößert, verkleinert oder setzt die ganze Ansicht zurück.

### Geändert
- Große Bildschirme: Die Kennzahlen stehen als Leiste unter Summe und Diagramm, das Diagramm ist so hoch wie die Summe daneben. Keine leere Fläche mehr unter dem Diagramm, und auf sehr breiten Bildschirmen nutzt die Ansicht mehr Breite.
- Desktop-Programm: Das Fenster passt beim ersten Start zum Bildschirm (auf kleinen Bildschirmen maximiert) und bekommt gleich den Fokus, damit Mausrad und Tastatur sofort scrollen.

## [1.8.0] – 2026-11-23

### Neu
- **Netzblick für Windows, macOS und Linux.** Dieselbe Oberfläche und dieselben Funktionen wie die App, als eigenes Programm. Die Anfragen gehen wie am Handy direkt vom Computer an Netz Burgenland, ohne Server dazwischen. Zugangsdaten liegen bei „Angemeldet bleiben“ im Schlüsselbund des Systems. Exporte speichert das Programm über den gewohnten Speichern-Dialog, Links öffnen im Browser.
- Downloads im Release: Installer für Windows, DMG für macOS (Apple Silicon und Intel), AppImage und DEB-Paket für Linux. Die Dateien entstehen auf GitHub aus dem öffentlichen Quellcode, mit Herkunftsnachweis (Attestation) und Prüfsummen. Anleitung zur Warnmeldung beim ersten Start im README.
- Das Programm sieht einmal am Tag auf GitHub nach einer neuen Version und weist darauf hin.

### Geändert
- Datenschutzerklärung um das Desktop-Programm ergänzt.

## [1.7.2] – 2026-11-20

### Geändert
- **Amtliche Quellen und Hinweis**, gefordert von Google Play für Behördeninformationen: Die Seiten „Info“ und „Kosten“ verlinken die Originalquellen der Netzentgelte (Systemnutzungsentgelte-Verordnung im RIS, E-Control), der Abgaben (Bundesministerium für Finanzen, Bundesministerium für Wirtschaft, Energie und Tourismus) und der Börsenpreise (SMARD.de der Bundesnetzagentur). Dazu der Hinweis, dass Netzblick keine Behörde vertritt, auch auf der Anmeldeseite und bei den Börsenpreisen.
- Die Seite „Info“ nennt statt des Namens nur noch geister-it.

## [1.7.1] – 2026-11-18

### Geändert
- **Paketname jetzt `at.xionix.netzblick`** (vorher `at.netzblick.app`), passend zur App in der Play Console. Wer Netzblick als APK von GitHub installiert hat, bekommt damit eine neue App: die alte bitte deinstallieren und sich in der neuen einmal neu anmelden.

## [1.7.0] – 2026-11-18

### Neu
- **Startbildschirm** mit dem Logo von geister-it. Auch die Seite „Info“ zeigt das Logo und verlinkt www.geister-it.at.
- **Börsenpreis:** Der Tag lässt sich zwischen Viertelstunden und Stunden umschalten. Die Wahl bleibt gespeichert; die günstigsten und teuersten Zeiten folgen dem Raster. Bei einem Stundentarif zeigt „Dein Preis“ immer Stunden.
- README: Knopf „Kaffee spendieren“ über GitHub Sponsors, dazu der Sponsor-Knopf auf der Seite des Repositorys. In der App gibt es bewusst keinen Spendenlink (Zahlungsrichtlinie von Google Play).

## [1.6.1] – 2026-11-18

### Geändert
- Seite „Info“: Datenschutz-Abschnitt nennt jetzt auch die Börsenpreise (Energy-Charts) und verlinkt die vollständige Datenschutzerklärung.

## [1.6.0] – 2026-11-18

### Neu
- **Seite „Börsenpreis“** im Menü mit den Day-Ahead-Preisen EPEX Spot Österreich:
  - jeder Tag seit Oktober 2018, heute und ab etwa 13 Uhr auch morgen; Säulen je Viertelstunde, blau günstiger und rot teurer als der Tagesschnitt
  - Durchschnitt, günstigste und teuerste Viertelstunde, Preis jetzt, negative Preise
  - die günstigsten und teuersten 1, 2, 3 und 4 Stunden am Stück, heute ab jetzt
  - **Wo ist es günstiger?** Tagesschnitt in Österreich und den Nachbarländern Deutschland, Schweiz, Tschechien, Ungarn, Slowenien und Norditalien, als Diagramm und Tabelle
  - **Wann ist es meist günstig?** Teppich mit jedem Tag Stunde für Stunde und typischer Tagesverlauf für Werktage und Wochenende, über 7 Tage bis 12 Monate
  - mit dynamischem Tarif wahlweise dein Endpreis mit Aufschlag und USt
- Seite „Strompreis“: Schaltfläche „Alle Börsenpreise“.

### Geändert
- Bremst der Dienst für Börsenpreise, wartet Netzblick die angegebene Zeit und versucht es dann erneut, statt 15 Minuten zu pausieren.

## [1.5.0] – 2026-11-18

### Neu
- **Dynamischer Stromtarif:** Auf der Seite „Strompreis“ zwischen Fixpreis und dynamisch wählen. Dynamisch: Börsenpreis EPEX Spot Österreich plus Aufschlag in Cent und/oder Prozent (wie bei den Anbietern auf den Betrag des Börsenpreises), Grundgebühr, Preis je Viertelstunde oder Stunde. Vorlagen für aWATTar HOURLY, smartENERGY smartCONTROL, VERBUND V-Strom Spot und oekostrom oekoSpot+; alle Werte änderbar.
- Die Börsenpreise holt Netzblick von Energy-Charts (Fraunhofer ISE, Daten Bundesnetzagentur/SMARD, CC BY 4.0): seit Oktober 2025 in Viertelstunden, davor in Stunden. Fehlende Monate kommen in einer einzigen Abfrage und bleiben im Gerät gespeichert.
- **Dein Strompreis heute und morgen:** Energiepreis jetzt, Tagesschnitt, günstigste zwei Stunden heute und morgen, Diagramm.
- Alle Kosten (Übersicht, Seite „Kosten“, Jahreskosten, Abrechnung) rechnen den dynamischen Tarif mit; in der Aufstellung stehen der mittlere Börsenpreis und der mittlere Energiepreis.
- Grundgebühr auf Wunsch nur einmal für die Adresse statt je Zählpunkt (z. B. aWATTar).

### Behoben
- Das Feld „Lieferant“ ist nicht mehr mit dem Lieferanten aus dem Kundenportal vorbelegt (z. B. VERBUND). Der dort gemeldete Lieferant steht nur noch als Hinweis darunter.

## [1.4.0] – 2026-11-18

### Neu
- **Seite „Kosten“** im Menü, für die letzten 12 Monate oder ein Kalenderjahr:
  - Summe mit Anteilen von Energie, Netz und Abgaben; Kosten je kWh, pro Monat und pro Tag; was der Niedertarif gespart hat
  - Diagramm Monat für Monat, gestapelt nach Energie, Netz Burgenland, Steuern und Abgaben
  - Kosten je Zählpunkt mit eigenem Netztarif (z. B. unterbrechbare Wärmepumpe)
  - vollständige Aufstellung und Tabelle aller Monate, als CSV teilbar (jeder Zählpunkt einzeln)
  - gerechnet Monat für Monat aus Viertelstundenwerten, die Niedertarife also genau
- Übersicht: Schaltfläche „Alle Kosten“ in der Kostenaufstellung.

### Geändert
- Kostenaufstellung von Übersicht und Seite „Kosten“ aus einem gemeinsamen Baustein (`src/costview.js`).

## [1.3.1] – 2026-11-18

### Geändert
- **Leistung als eigenes Diagramm** direkt unter dem Verbrauch, immer sichtbar. Der Umschalter kWh/kW entfällt. Tag, Woche und Monat zeigen die Viertelstunden in kW, Jahr und Gesamt die höchste Viertelstunde je Monat. Die 10-kW-Linie schaltest du oben rechts im Diagramm ein und aus.

### Behoben
- Kommen die Daten aus dem Kundenportal erst nach der ersten Anzeige, rechnet die Übersicht jetzt sofort neu. Vorher galt für einen unterbrechbaren Zählpunkt (z. B. Wärmepumpe) bis zum nächsten Zeitraumwechsel der Haushaltstarif.

## [1.3.0] – 2026-11-18

### Neu
- **Leistungsansicht:** Über dem Diagramm zwischen „kWh“ und „kW“ umschalten. In kW zeigt Netzblick die mittlere Leistung jeder Viertelstunde, auch für einen ganzen Monat; in Jahr und Gesamt die höchste Viertelstunde je Monat. Die höchste Spitze ist markiert.
- **10-kW-Linie** zum Ein- und Ausblenden: Ab 2027 wird für den Anteil der Monatsspitze über 10 kW ein höherer Leistungspreis fällig. Unter dem Diagramm steht je Zählpunkt die höchste Viertelstunde und wie oft sie über 10 kW lag.
- **Seite „Leistung“:** Monatsspitzen der letzten 13 Monate je Zählpunkt, Monate über 10 kW, Spitze im laufenden Monat, Leistungspreis pro Jahr, Netzkosten 2026 gegen ab 2027, Rechenweg, Tipps und Quellen.
- **Kosten ab 2027** nach dem Entwurf der Tarifverordnung (E-Control, 29.10.2026), Netzbereich Burgenland: Leistungspreis 3,40 € je kW und Monat bis 10 kW, 5,10 € darüber (netto), Arbeitspreis 6,60 ct, Niedertarif 5,28 ct, Winter-Niedertarif ab 1.10.2027 (23–5 Uhr). Pauschale und Messentgelt entfallen. Unterbrechbare Zählpunkte ohne Leistungspreis.

### Geändert
- Spitzenleistung bei mehreren Zählpunkten: der höchste einzelne Zählpunkt, weil der Leistungspreis je Zählpunkt gilt.
- Demo-Daten mit gelegentlichem Laden des E-Autos mit 11 kW.

## [1.2.0] – 2026-11-18

### Neu
- **Strompreis und Kosten:** Arbeitspreis und Grundpreis des Lieferanten eintragen (auch je Zählpunkt, z. B. für eine Wärmepumpe). Netzkosten rechnet Netzblick selbst nach dem Preisblatt von Netz Burgenland 2025/2026, samt Sommer-Niedertarif (1.4.–30.9., 10–16 Uhr) aus den Viertelstundenwerten, Pauschale und Messentgelt. Dazu Elektrizitätsabgabe, Erneuerbaren-Förderpauschale und -Förderbeitrag sowie 20 % USt.
- **Kostenaufstellung** in der Übersicht: Energie, Netz Burgenland, Steuern und Abgaben mit Anteilsbalken; Kosten pro Tag und Hochrechnung auf den Zeitraum.
- **Was dich ein Jahr kostet:** aus den Messwerten der letzten 12 Monate mit den aktuellen Preisen.
- **Erinnerung an Rabatt- oder Bindungsende:** Benachrichtigung am Handy, Hinweis in der Übersicht, Kalendereintrag (.ics), Link zum Tarifkalkulator der E-Control.
- **Seite „Energiegemeinschaft“:** alle Teilnahmen aus dem Kundenportal mit Art der Gemeinschaft, Gemeinschafts-ID, Marktpartner, Richtung, Aufteilung (dynamisch/statisch), Status, Teilnahmefaktor je Zählpunkt und Verlauf.
- **Seite „Störung“:** Störungsdienst und Stromnotruf direkt anrufen, Hinweise vor dem Anruf, Störungskarte, Online-Meldung.
- **Seite „Kontakt“:** Kundentelefon, E-Mail, Kontaktformular, Servicezentren mit Karte, Themen-Links.
- Netztarif je Zählpunkt aus dem Kundenportal (Haushalt oder unterbrechbar) fließt in die Kosten ein.

### Geändert
- Abrechnungsjahr: Hochrechnung immer mit den 12 Monaten davor; Zwischenabrechnungen (z. B. „Oktober 2026 bis Oktober 2026“) werden erkannt.
- Der bisherige Gesamtpreis in den Einstellungen gilt weiter, bis ein Lieferantenpreis eingetragen ist.
- Menü in Gruppen: Verbrauch, Strompreis, Abrechnung · Anlagen, Energiegemeinschaft · Störung, Kontakt · Konto, Einstellungen, Info.
- `npm run build` und `npm run sync` installieren fehlende Pakete selbst (z. B. nach einem `git pull` mit neuer Abhängigkeit).
- `aktualisieren.cmd`: unter Windows mit einem Doppelklick auf den neuesten Stand.
- Releases entstehen automatisch, sobald eine neue Version in `package.json` auf `main` ankommt (Tag weiterhin möglich).
- Projektbeschreibung neu, auf Deutsch (README.md) und Englisch (README.en.md), mit eigenen Bildern (`scripts/readme-images.mjs`).

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

[Unveröffentlicht]: https://github.com/xionix3/netzblick/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/xionix3/netzblick/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/xionix3/netzblick/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/xionix3/netzblick/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/xionix3/netzblick/releases/tag/v1.0.0
