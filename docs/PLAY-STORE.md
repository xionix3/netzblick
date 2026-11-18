# Netzblick im Google Play Store

Checkliste, vorbereitete Texte und Grafiken für die Veröffentlichung. Stand der Anforderungen: November 2026.
Die Regeln ändern sich regelmäßig, deshalb vor dem Einreichen kurz in der Play Console prüfen.

## Vorher klären

- [ ] **Einverständnis von Netz Burgenland.** Netzblick nutzt die inoffizielle Schnittstelle des Portals. Vor einer öffentlichen Veröffentlichung kurz nachfragen, ob das in Ordnung ist. Das schützt vor Sperren und vor Beschwerden bei Google.
- [ ] **Kein Eindruck einer offiziellen App.** Kein Logo von Netz Burgenland, „inoffiziell“ in der Beschreibung. Ist schon berücksichtigt.
- [ ] **Release-Schlüssel** eingerichtet ([RELEASE.md](RELEASE.md)). Er dient als Upload-Schlüssel für Play.

## Kontotyp: privat oder Firma (geister-it)

Diese Entscheidung lässt sich später **nicht ändern**. Ein privates Konto kann nicht in ein Firmenkonto umgewandelt werden und umgekehrt.

| | Privates Konto | Organisationskonto (geister-it) |
|---|---|---|
| Voraussetzung | Ausweis | eingetragenes Unternehmen, **D-U-N-S-Nummer** (kostenlos, Vergabe dauert bis zu 30 Tage), Firmen-Website und -Dokumente |
| Geschlossener Test vor dem Start | **12 Tester, 14 Tage** | entfällt |
| Im Store angezeigt als | dein Name | Firmenname |

Mit 12 Testern ist das private Konto der schnellste Weg. Das Organisationskonto lohnt sich, wenn noch weitere Apps unter geister-it erscheinen sollen.

## Ablauf

1. **Entwicklerkonto** in der [Play Console](https://play.google.com/console) anlegen: einmalig 25 US-Dollar, Identitätsprüfung mit Ausweis (bzw. D-U-N-S beim Firmenkonto).
2. **App anlegen:** Name, Standardsprache Deutsch (de-AT), App (nicht Spiel), kostenlos.
3. **App-Inhalte ausfüllen** (siehe unten): Datenschutzerklärung, App-Zugriff, Werbung, Einstufung, Zielgruppe, Datensicherheit.
4. **Store-Eintrag:** Texte und Grafiken unten.
5. **Geschlossener Test:** Bei privaten Entwicklerkonten, die nach dem 13. 11. 2023 angelegt wurden, müssen mindestens **12 Testerinnen und Tester 14 Tage lang ununterbrochen** im geschlossenen Test angemeldet sein. Erst danach lässt sich der Produktionszugang beantragen.
   - `netzblick-X.Y.Z.aab` aus dem GitHub-Release hochladen.
   - Unter *Testen → Geschlossener Test → Tester* eine **E-Mail-Liste** mit den Google-Konten der Tester anlegen.
   - Länder: Österreich (und ggf. Deutschland) auswählen. Feedback-Kontakt: patrick-schloegl@gmx.at.
   - Release zur Prüfung einreichen (dauert meist einige Stunden bis einen Tag).
   - Danach den **Opt-in-Link** kopieren und mit der Anleitung [TESTER.md](TESTER.md) verschicken.
   - Die Tester sollten die App in dieser Zeit wirklich verwenden, zumindest alle paar Tage kurz öffnen.
6. **Produktionszugang beantragen.** Danach Release in „Produktion“ hochladen. Die Prüfung dauert meist einige Tage.

## Technische Anforderungen

| Anforderung | Stand im Projekt |
|---|---|
| Ziel-API: neue Apps und Updates müssen seit 31. 8. 2026 **Android 16 (API 36)** ansprechen | ✅ `targetSdkVersion = 36` |
| Format **Android App Bundle (AAB)** | ✅ wird bei jedem Release gebaut |
| Play App Signing | ✅ in der Console aktivieren (Standard), Release-Schlüssel als Upload-Schlüssel |
| Versionsnummer steigt mit jedem Upload | ✅ `versionCode` wird aus dem Tag berechnet (v1.2.3 → 10203) |
| Berechtigungen | ✅ Internet, Benachrichtigungen (Erinnerung, wird zur Laufzeit erfragt), Neustart-Empfang (geplante Erinnerung behalten). Keine exakten Alarme. |

## App-Inhalte (Play Console → Richtlinien → App-Inhalte)

### Datenschutzerklärung
Benötigt wird eine **öffentlich erreichbare URL**. Der Text steht fertig in [DATENSCHUTZ.md](../DATENSCHUTZ.md).
Solange das Repository privat ist, ist die Datei nicht öffentlich. Möglichkeiten:
- Repository öffentlich machen und den Link auf `DATENSCHUTZ.md` verwenden
- GitHub Pages (für private Repositories nur mit bezahltem Plan)
- den Text auf der Website von geister-it oder in einem öffentlichen Gist ablegen

### App-Zugriff
Die App braucht ein Konto beim Portal von Netz Burgenland. Für die Prüfer gibt es den Demo-Modus. Vorschlag für das Formular:

> Für die volle Funktion ist ein Kundenkonto bei Netz Burgenland (Österreich) nötig, das für das Smart-Meter-Portal und das Kundenportal gilt. Ohne Konto lassen sich alle Funktionen mit Beispieldaten prüfen, auch die Seiten Anlagen, Abrechnung und Konto: Auf der Anmeldeseite auf „Demo mit Beispieldaten ansehen“ tippen.

### Werbung
Keine Werbung.

### Einstufung (IARC-Fragebogen)
Kategorie „Dienstprogramm/Produktivität“. Keine Gewalt, keine sexuellen Inhalte, keine Nutzerkommunikation, keine Käufe, kein Glücksspiel. Ergebnis üblicherweise: freigegeben ab 3 Jahren / PEGI 3.

### Zielgruppe
Erwachsene (18+). Die App richtet sich an Inhaber eines Netzanschlusses.

### Datensicherheit
Fakten für das Formular (die Zuordnung zu Googles Kategorien vor dem Absenden mit der Hilfe zum Datensicherheitsabschnitt abgleichen):

| Frage | Fakten zu Netzblick |
|---|---|
| Welche Daten verlassen das Gerät? | Benutzername/E-Mail und Passwort, Sitzungs-Token und die Datenabrufe, und zwar ausschließlich an `smartmeter.netzburgenland.at` und `api.portal.netzburgenland.at` (beide Netz Burgenland) zur Anmeldung und zum Laden der eigenen Daten |
| Welche Daten lädt die App? | Messwerte, Zählerstände, Zählpunkte; aus dem Kundenportal Name, Kundennummer, E-Mail, Adresse, Zählernummer, Lieferant, Verträge, abgerechnete Verbräuche, Rechnungs- und Teilbeträge. Nur Anzeige, keine Weitergabe; Kundenportal-Daten nur im Arbeitsspeicher |
| Erhält der Entwickler Daten? | Nein, es gibt keinen eigenen Server |
| Werden Daten an Dritte weitergegeben, verkauft, für Werbung oder Analyse genutzt? | Nein |
| Verschlüsselung bei der Übertragung | Ja, ausschließlich HTTPS |
| Kann man Daten löschen? | Ja: „Abmelden“ löscht Zugangsdaten und Zwischenspeicher, Deinstallieren löscht alles |
| Lokale Speicherung | Zugangsdaten verschlüsselt (Android Keystore), Messwerte als Zwischenspeicher, Backups deaktiviert |

### Weitere Erklärungen
- **Behörden-App:** nein. **Finanzfunktionen:** keine. **Gesundheit:** nein. **Nachrichten-App:** nein.

## Store-Eintrag

| Feld | Text | Länge |
|---|---|---|
| App-Name (max. 30) | `Netzblick: Stromverbrauch` | 25 |
| Kurzbeschreibung (max. 80) | `Deine Smart-Meter-Werte von Netz Burgenland: Diagramme, Filter und Vergleiche` | 77 |

**Vollständige Beschreibung** (rund 2.000 von 4.000 Zeichen):

```text
Netzblick zeigt die Werte deines Smart Meters aus dem Verbrauchsdatenportal von Netz Burgenland – übersichtlich, schnell und zum Filtern. Dazu kommen deine Anlagen und Abrechnungen aus dem Kundenportal, mit derselben Anmeldung.

Melde dich mit deinem gewohnten Portal-Zugang an und sieh sofort:
• deinen Verbrauch für Tag, Woche, Monat, Jahr oder einen eigenen Zeitraum
• den Vergleich zur Vorperiode oder zum Vorjahr – fair bis zum gleichen Zeitpunkt
• eine Hochrechnung und die Kosten: Energie deines Lieferanten, Netzkosten von Netz Burgenland und Abgaben
• eine Erinnerung, bevor Neukundenrabatt oder Vertragsbindung enden
• deine Energiegemeinschaften mit Teilnahmefaktor
• Störungsdienst und Kontakt zum direkten Anrufen
• die Leistungskurve in 15-Minuten-Schritten, auch für einen ganzen Monat, mit 10-kW-Linie
• deine Monatsspitzen und was du mit dem Leistungspreis ab 2027 fürs Netz zahlst
• wann am Tag Strom gebraucht wird (Lastgang), den typischen Tagesverlauf und den Verbrauch je Wochentag
• Spitzenleistung, Grundlast und Nachtanteil
• deinen aktuellen Zählerstand
• wie viel du seit der letzten Jahresabrechnung verbraucht hast, worauf es hinausläuft und ob die Teilbeträge reichen
• Zählernummer, Lieferant, Netzebene, Energiegemeinschaft und abgerechnete Jahresverbräuche

Filter nach Wochentagen und Uhrzeit zeigen zum Beispiel, was nachts oder am Wochenende verbraucht wird. Mehrere Zählpunkte lassen sich beliebig kombinieren und benennen. Diagramme als Balken, Linien, Fläche oder Kreis. Optimiert für Handy und Tablet, im Hoch- und Querformat. Alle Werte gibt es auch als Tabelle und als CSV-Export.

Datenschutz: Netzblick verbindet sich ausschließlich mit den Portalen von Netz Burgenland und liest dort nur. Kein eigener Server, keine Werbung, kein Tracking. Zugangsdaten werden auf Wunsch verschlüsselt auf dem Gerät gespeichert.

Ohne Konto ausprobieren: Auf der Anmeldeseite „Demo mit Beispieldaten ansehen“ tippen.

Hinweis: Netzblick ist eine inoffizielle App und steht in keiner Verbindung zu Netz Burgenland. Für die Nutzung ist ein Zugang zu den Portalen von Netz Burgenland nötig.
```

**Kategorie:** Tools. **Tags:** Energie, Strom, Smart Meter.

### Grafiken (liegen in [`docs/store/`](store/))

| Datei | Verwendung | Format |
|---|---|---|
| `icon-512.png` | App-Symbol | 512 × 512 PNG |
| `feature-graphic.png` | Vorstellungsgrafik | 1024 × 500 PNG |
| `phone-1.png` … `phone-6.png` | Screenshots Smartphone | 1080 × 1920 (9:16), Demo-Daten |
| `tablet-1.png`, `tablet-2.png` | Screenshots Tablet 7 und 10 Zoll (dieselben Bilder für beide) | 1920 × 1080 (16:9), Demo-Daten |

Neu erzeugen nach Änderungen an der Oberfläche: `npm run build`, dann `node scripts/store-assets.mjs`.
