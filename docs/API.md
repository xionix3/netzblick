# Portal-APIs von Netz Burgenland

Netzblick nutzt zwei Schnittstellen: das **Smart-Meter-Portal** (Messwerte, ab hier) und das **Kundenportal** (Anlagen, Verträge, Abrechnung, [weiter unten](#kundenportal)).

Diese Beschreibung wurde aus dem Web-Portal ermittelt (Stand November 2026) und mit einem echten Konto geprüft.
Die Schnittstelle ist **inoffiziell und undokumentiert** und kann sich ohne Vorwarnung ändern.

- **Portal:** https://smartmeter.netzburgenland.at/enview/enView.Portal/ (Software „IDSpecto enVIEW“ von VIVAVIS, Angular)
- **API-Basis:** `https://smartmeter.netzburgenland.at/enVIEW/enVIEW.Portal.Api/`. Steht im Portal unter `assets/config.json` (`apiUrl`).
- **CORS:** Die API beantwortet nur Anfragen vom Portal selbst. Eine App braucht nativen HTTP-Zugriff (Netzblick: CapacitorHttp).

## Anmeldung

```http
POST api/account/login
Content-Type: application/json

{"usernameOrEMail": "…", "password": "…", "rememberMe": false}
```

Erfolg (HTTP 200):

```json
{
  "success": true,
  "message": null,
  "mustChangePassword": false,
  "data": {
    "linkedAccounts": [
      {
        "identifier": "100001",
        "displayName": "Max Muster",
        "token": "Bearer eyJ…",
        "operModesAtMeterPts": [ … ]
      }
    ],
    "cognitoToken": { "idToken": "…", "refreshToken": "…", "expireIn": 3600 }
  }
}
```

- Das Portal verwendet `linkedAccounts[0]` als aktives Konto.
- Das **`token`** (`Bearer <JWT>`, etwa 60 Minuten gültig) geht bei allen weiteren Aufrufen unverändert in den Header `Authorization`.
- Netzblick meldet sich nach Ablauf (HTTP 401/403) einmal automatisch neu an.

Falsches Passwort (HTTP 400). `message` ist ein JSON-String:

```json
{"data": null, "success": false, "mustChangePassword": false,
 "message": "{\"status\":401,\"errorCode\":\"ErrCodeUserPasswordInvalid\",\"message\":\"failed email/password invalid\",\"messages\":null}"}
```

## Zählpunkte und Register

`operModesAtMeterPts[]` enthält je Zählpunkt:

| Feld | Beispiel / Bedeutung |
|---|---|
| `meteringPointIdentifier` | `AT0090000000000000000000000000001` (33 Zeichen) |
| `category` | `Consumption` (Verbrauch) oder `Balance` (Bilanz-Ansicht, wiederholt dieselben Zählpunkte) |
| `address` | `{street, houseNumber, postalCode, city}` |
| `valueIdentifiers[]` | Register, siehe unten |

| Register (`identifier`) | Intervall | Inhalt |
|---|---|---|
| `1-0:1.8.0*H15` | 900 s | Bezug je Viertelstunde, ab Juni 2023 |
| `1-0:1.8.1*H24` | 86400 s | Bezug Tarif 1 je Tag, seit Einbau |
| `1-0:1.8.2*H24` | 86400 s | Bezug Tarif 2 je Tag. Beim Eintarifzähler leer (`[]`) |
| `1-0:2.8.x` | | Einspeisung (bei PV-Anlagen, analog) |

Jedes Register hat `type` (`MeterReadingSequence`), `startTimestamp`, `endTimestamp`, `measuringIntervalSeconds`, `isActiveEnergy` und `cumulative`.
Geprüft: Die Summe von 1.8.0 entspricht 1.8.1 + 1.8.2.

## Messreihen

```http
GET api/{type}/values/normal
    ?meteringPointIdentifier=AT009…
    &valueIdentifier=1-0:1.8.0*H15
    &from=2026-10-31T23:00:00Z
    &to=2026-11-30T23:00:00Z
    &name=Verbrauch
    &timeParameter=original
Authorization: Bearer eyJ…
```

| Parameter | Werte |
|---|---|
| `timeParameter` | `original` (Rohwerte), `daily`, `monthly`, `yearly`. Der Server summiert selbst. Andere Werte → HTTP 400. |
| `from` / `to` | ISO-Zeitpunkt, siehe unten |
| `name` | Beschriftung, beliebig |

**Zeitformat:**
- Am robustesten in UTC mit `Z`, einfach URL-kodiert (`2026-11-14T23%3A00%3A00Z`).
- Ein reines Datum (`2026-11-15`) funktioniert ebenfalls.
- Mit Offset `+01:00` muss doppelt kodiert werden (so macht es das Portal). Einfach kodiert wird `+` zum Leerzeichen und der Server antwortet mit HTTP 500.

Antwort:

```json
[{
  "name": "Verbrauch",
  "valueIdentifier": "1-0:1.8.0*H15",
  "isEmpty": false,
  "isBasePrice": false,
  "deviceExceptionStatus": null,
  "data": [
    {"startTimestamp": "2026-11-15T00:00:00+01:00", "endTimestamp": "2026-11-15T00:15:00+01:00",
     "value": 0.162, "reading": 88936.562, "status": "W",
     "powerValue": null, "price": null, "emission": null, "readingStatus": null}
  ]
}]
```

- `value` ist die Energie im Intervall in kWh, `reading` der Zählerstand am Intervallende.
- **Status:** `W` wahrer Wert, `E` Ersatzwert, `V` vorläufig, `F` fehlend (auch für Zeitpunkte in der Zukunft), `G` gestört, `M` manuell.
- **Umfang:** Ein Monat in Viertelstunden (≈ 2.980 Werte) kommt in einem Aufruf, typischerweise in unter einer Sekunde.
- **Verzögerung:** Werte kommen etwa einen Tag später.

## Weitere Aufrufe

| Aufruf | Antwort |
|---|---|
| `GET api/maxPower/{type}?meteringPointIdentifier&valueIdentifier&name&from&to` | `{value (kW), startTimestamp, endTimestamp, status}`, höchste Viertelstunde im Zeitraum |
| `GET api/overview/SelectedOverview?category=Consumption` | `{month, year}` mit Wert, Referenz und Prognose (Startseite des Portals) |
| `GET api/tariff?meteringPointIdentifier&valueIdentifier` | selbst hinterlegter Tarif (`basePrice`, `levels[]`) |
| `POST api/account/refreshCognitoToken?refreshToken=…` | erneuert das Cognito-Token |
| `POST api/account/getUserAccounts`, `api/account/logout` | Kontoverwaltung |
| `GET api/info/version` | Versionsnummer des Portals |

## Kundenportal

- **Portal:** https://portal.netzburgenland.at/ (eigene Web-App)
- **API-Basis:** `https://api.portal.netzburgenland.at`. Pfade unter `/papi/` sind öffentlich, unter `/api/` braucht es eine Anmeldung.
- **Anmeldung:** AWS Cognito, Benutzerpool `eu-central-1_JLqXhCtsi`. **Derselbe Pool und derselbe App-Client wie beim Smart-Meter-Portal**: Das `cognitoToken.idToken` aus dessen Login (siehe oben) funktioniert hier direkt. Netzblick braucht deshalb normalerweise nur eine Anmeldung.
- **Header:** `Authorization: <idToken>`, **ohne** „Bearer“. Gültig etwa 60 Minuten; Netzblick holt nach HTTP 401 einmal ein frisches Token (über die Smart-Meter-Anmeldung oder die eigenen Zugangsdaten).
- **Kundennummer:** steht im Token als Claim `custom:customerNr` und wird in vielen Pfaden gebraucht.

Eigene Anmeldung, falls jemand im Kundenportal ein anderes Konto hat:

```http
POST /papi/auth/signin
Content-Type: application/json

{"email": "…", "password": "…"}
```

Antwort: `{"idToken": "…", "accessToken": "…", "refreshToken": "…", "expireIn": 3600}`.

### Lesende Aufrufe

| Aufruf | Inhalt (Auszug) |
|---|---|
| `GET /api/profile` | `customerNr`, `firstName`, `lastName`, `titlePrefix`, `address{strasse, hausnum1, plz, ort}`, `contact{email, electronicCorrespondence}` |
| `GET /api/profile/customer-nr/{nr}/pods` | je Zählpunkt `extUI` (= Zählpunktnummer), `premiseAddress`, `utilityType`, `granularityCustomer` (`QH` = Viertelstunden), `electricityFeeder` |
| `GET /api/profile/customer-nr/{nr}/pods-data?start=0&limit=50` | `contractDateFrom`, `details` („Lieferanten-ID/Name“), `net{serialNr, deviceType (IME = Smart Meter), gridUsageLevel, loadProfileType, lastBillingPeriod}`, `approvals.active[].energyCommunity{share, factor, type, direction}`, `participationHistory[]` |
| `GET /api/profile/customer-nr/{nr}/consumption-premise` | `premises[]{contractAccount, utilities[]{utilityType, years[]{year, totalDiff}, periods[]{zeitraum, diff}}}`: abgerechnete Verbräuche in kWh |
| `GET /api/contracts?customerNr={nr}` | Vertragskonten: `nr`, `description`, `isActive`, `electricity`, `invoiceServiceProvider`, `extInvoicingServProv`, `eBilling` |
| `GET /api/contracts/{konto}/bills` | Rechnungen `billNr`, `dateFrom`, `dateTo`, `amount`, `amountCurr` |
| `GET /api/contracts/{konto}/part-payment-plan?customerNr={nr}` | `installment[]` und `advancePayment[]` mit `dueDate`, `amount`, `amountOpen`, `settlementDate` |
| `GET /api/profile/link/customers` | verknüpfte Kundennummern |

- `lastBillingPeriod` ist Text, z. B. „Oktober 2025 bis September 2026“. Netzblick liest daraus Beginn und Ende.
- Rechnet ein **externer Lieferant** ab, antworten `bills` und `part-payment-plan` mit Fehler `ErrCodeExternalServiceProvider`. Das ist kein Defekt; Netzblick zeigt dann einen Hinweis.
- Das Postfach (`/api/inbox…`) antwortete beim Test mit HTTP 500, ein Endpunkt für Börsenpreise war nicht verfügbar. Beides nutzt Netzblick nicht.
- Netzblick ruft **nur lesende** Endpunkte auf. Schreibende Aufrufe des Portals (Profil ändern, Zählerstand melden, Verknüpfungen) werden nicht verwendet.

### Zusammenspiel beider Portale

| Smart-Meter-Portal | Kundenportal | Nutzen in Netzblick |
|---|---|---|
| Zählpunktnummer (`meteringPointIdentifier`) | `extUI` | Verknüpfung beider Datenquellen |
| Viertelstunden- und Tageswerte | `lastBillingPeriod` | laufendes Abrechnungsjahr, Hochrechnung, Zeitraum „seit der letzten Abrechnung“ |
| gemessene Jahressumme | `consumption-premise` | gemessen gegen abgerechnet |
| Hochrechnung × eigener Strompreis | Teilbeträge | Nachzahlung oder Guthaben (Schätzung) |
| Adresse aus dem Zählpunkt | Zählernummer, Lieferant, Netzebene | Details in Zählpunktwahl und „Anlagen“ |

## Umsetzung in Netzblick

- `src/api.js`: Anmeldung, Messreihen, Spitzenleistung, Fehlerbehandlung, automatische Neuanmeldung
- `src/kundenportal.js`: Kundenportal-Client, Token-Auswertung, Normalisierung der Antworten
- `src/billing.js`: laufendes Abrechnungsjahr aus beiden Quellen
- `src/model.js`: Auswahl des feinsten passenden Registers, Tarif-Summen, Zwischenspeicher
- `test/unit/fixtures.mjs`: Antwortbeispiele im Originalformat (anonymisiert)
