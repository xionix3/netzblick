# Netzblick

Inoffizielle Android-App für das Verbrauchsdatenportal von Netz Burgenland
(smartmeter.netzburgenland.at). Nach der Anmeldung mit den Portal-Zugangsdaten
zeigt sie die Smart-Meter-Daten übersichtlich und filterbar an.

## Was die App kann

- **Zeiträume:** Tag, Woche, Monat, Jahr, Gesamt und eigener Zeitraum. Wechsel per Pfeil, Wischen oder Tippen auf das Datum.
- **Zählerstand** als Rollenzählwerk (aktueller Stand 1.8.0 aus dem Portal).
- **Summe mit Vergleich** zur Vorperiode oder zum Vorjahr, bei laufenden Zeiträumen „bis zum gleichen Zeitpunkt“.
- **Hochrechnung** für laufende Wochen, Monate und Jahre.
- **Kosten**: Arbeitspreis und Fixkosten selbst eintragen.
- **Hauptdiagramm:**
  - Tag und Woche als Leistungskurve (kW, 15 min)
  - Monat als Tagesbalken, Jahr als Monatsbalken, Gesamt als Jahresbalken
  - Vergleichszeitraum als graue Linie
- **Mehrere Zählpunkte:** einzeln oder „Alle“ (gestapelt). Eigene Namen sind möglich.
- **Kennzahlen:** Ø pro Tag, Spitzenleistung (mit Zeitpunkt), Grundlast, Nachtanteil, Ø Leistung, Kosten pro Tag.
- **Analysen:**
  - Lastgang-Teppich (Tage × Stunden)
  - typischer Tagesverlauf (Werktag vs. Wochenende)
  - Verbrauch nach Wochentag
  - Jahreskalender
  - Jahre im Vergleich
- **Filter:** Wochentage (z. B. nur Werktage) und Tageszeit (z. B. nur 22–6 Uhr). Sie wirken auf alle Zahlen und Diagramme.
- **Wertetabelle** und **CSV-Export** (Teilen-Dialog, Excel-tauglich mit `;` und Dezimalkomma).
- **Ersatzwerte** und vorläufige Werte werden gekennzeichnet.
- **Offline:** Zuletzt geladene Werte bleiben verfügbar.
- **Dunkelmodus**, Demo-Modus mit Beispieldaten.
- **Angemeldet bleiben:** Zugangsdaten werden mit AES-GCM verschlüsselt. Der Schlüssel liegt im Android Keystore. Die Daten gehen nur an smartmeter.netzburgenland.at.

## APK bauen

### Variante A: Android Studio

1. [Node.js 22](https://nodejs.org) und [Android Studio](https://developer.android.com/studio) installieren.
2. Im Projektordner:
   ```bash
   npm install
   npm run sync        # baut die Oberfläche und kopiert sie ins Android-Projekt
   ```
3. In Android Studio den Ordner `android/` öffnen, Handy per USB anschließen (Entwickleroptionen → USB-Debugging) und auf **Run** tippen.
   Oder: *Build → Build App Bundle(s) / APK(s) → Build APK(s)*. Die APK liegt dann unter `android/app/build/outputs/apk/debug/`.

### Variante B: ohne Android Studio über GitHub

1. Den Ordner als (privates) Repository auf GitHub hochladen.
2. Unter **Actions** läuft automatisch „APK bauen“ (ca. 5 Minuten).
3. Im fertigen Lauf unter **Artifacts** `netzblick-apk` herunterladen, entpacken und `app-debug.apk` aufs Handy kopieren.
4. Installieren. Android fragt einmalig, ob Apps aus dieser Quelle erlaubt sind.

### Variante C: Kommandozeile (Android SDK vorhanden)

```bash
npm install
npm run apk
```

Alle Varianten signieren mit dem Schlüssel `android/app/debug.keystore` aus dem Projekt. So lassen sich neue Versionen über die alte installieren, egal wo gebaut wurde.

## Entwicklung

- `src/` – App-Logik (JavaScript, gebündelt mit esbuild nach `www/app.js`)
  - `api.js` – Client für die Portal-API
  - `model.js` – Laden, Zwischenspeichern, Aggregieren, Kennzahlen
  - `charts.js` – Diagramme (ECharts)
  - `main.js` – Oberfläche
  - `demo.js` – Demo-Daten im Format der echten API
- `www-src/` – HTML und CSS
- `android/` – Capacitor-Android-Projekt. Eigenes Plugin: `SecureStorePlugin.java`.
- Im Browser testen: `npm run build`, dann `www/` mit einem lokalen Webserver öffnen und `?demo=1` anhängen.
  Die echte Anmeldung funktioniert nur in der App, weil der Browser die Portal-API wegen CORS blockiert. Die App umgeht das mit nativem HTTP.

## Portal-API (ermittelt aus dem Web-Portal, Stand November 2026)

Basis: `https://smartmeter.netzburgenland.at/enVIEW/enVIEW.Portal.Api/`
(Software: IDSpecto enVIEW von VIVAVIS). Inoffiziell und undokumentiert, kann sich jederzeit ändern.

| Zweck | Aufruf |
|---|---|
| Anmelden | `POST api/account/login` mit JSON `{"usernameOrEMail","password","rememberMe":false}` |
| Messreihe | `GET api/{type}/values/normal?meteringPointIdentifier=…&valueIdentifier=…&from=…&to=…&name=…&timeParameter=…` |
| Spitzenleistung | `GET api/maxPower/{type}?meteringPointIdentifier=…&valueIdentifier=…&name=…&from=…&to=…` |
| Übersicht | `GET api/overview/SelectedOverview?category=Consumption` |
| Version | `GET api/info/version` |

- **Antwort der Anmeldung:** `{success, data:{linkedAccounts:[…], cognitoToken}, message, mustChangePassword}`.
  - Jedes Konto in `linkedAccounts` hat ein `token` (`"Bearer …"`, ca. 60 min gültig) und `operModesAtMeterPts` (Zählpunkte mit Adresse und Registern).
  - Bei falschem Passwort kommt HTTP 400 mit `errorCode: ErrCodeUserPasswordInvalid` im JSON-String `message`.
- **Authentifizierung:** Header `Authorization: <token>`.
- **Register (`valueIdentifiers`):**
  - `1-0:1.8.0*H15`: Bezug in 15 Minuten, ab Juni 2023
  - `1-0:1.8.1*H24` und `1-0:1.8.2*H24`: Tageswerte Tarif 1/2, ab 2018
  - `type` ist `MeterReadingSequence`
  - Die Kategorie `Balance` wiederholt dieselben Zählpunkte für die Bilanz-Ansicht.
- **`from`/`to`:** ISO-Zeitpunkt. Am robustesten in UTC (`2026-11-14T23:00:00Z`), einfach URL-kodiert.
  Mit Offset (`+01:00`) muss doppelt kodiert werden, sonst wird `+` zu einem Leerzeichen und der Server antwortet mit 500.
- **`timeParameter`:** `original` (Rohwerte), `daily`, `monthly`, `yearly`. Der Server summiert selbst.
- **Messwert:** `{startTimestamp, endTimestamp, value (kWh), reading (Zählerstand), status}`.
  Status: W = wahrer Wert, E = Ersatzwert, V = vorläufig, F = fehlend, G = gestört, M = manuell.
- **Spitzenleistung:** `maxPower` liefert `{value (kW), startTimestamp, status}`.
- Werte kommen etwa einen Tag verzögert.

## Hinweis

Netzblick ist ein privates Projekt und steht in keiner Verbindung zu Netz Burgenland oder VIVAVIS.
