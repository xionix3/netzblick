# Datenschutzerklärung für Netzblick

Stand: 17. November 2026

Netzblick ist eine nicht-kommerzielle App von Patrick Schlögl (geister-it). Sie zeigt die Smart-Meter-Daten an, die Netz Burgenland in seinem Verbrauchsdatenportal bereitstellt.
Diese Erklärung beschreibt, welche Daten die App verarbeitet und wohin sie fließen.

## Kurz gesagt

- Netzblick hat **keinen eigenen Server**. Der Entwickler erhält keinerlei Daten von dir.
- Die App verbindet sich ausschließlich mit **smartmeter.netzburgenland.at**, dem Portal von Netz Burgenland, und zwar verschlüsselt über HTTPS.
- Es gibt **keine Werbung, kein Tracking, keine Analyse- oder Absturzdienste** von Dritten.

## Welche Daten verarbeitet werden

| Daten | Zweck | Wo sie gespeichert werden |
|---|---|---|
| Benutzername bzw. E-Mail-Adresse und Passwort deines Portal-Zugangs | Anmeldung beim Portal von Netz Burgenland | Nur wenn „Angemeldet bleiben“ aktiv ist: auf deinem Gerät, verschlüsselt (AES-256-GCM, Schlüssel im Android Keystore) |
| Sitzungs-Token des Portals | Abruf deiner Daten nach der Anmeldung | nur im Arbeitsspeicher, bis die App beendet wird |
| Zählpunkte, Adresse, Messwerte, Zählerstände | Anzeige, Diagramme, Auswertungen | Zwischenspeicher auf deinem Gerät für die Offline-Anzeige |
| Einstellungen (Strompreis, Namen der Zählpunkte, Darstellung) | Berechnung der Kosten, Anzeige | auf deinem Gerät |

Die Zugangsdaten werden nur an das Portal von Netz Burgenland übertragen, genauso wie bei der Anmeldung im Web-Portal.
Für die Verarbeitung deiner Daten auf den Servern von Netz Burgenland gilt deren Datenschutzerklärung.

## CSV-Export

Wenn du „CSV teilen“ verwendest, erzeugt die App eine Datei mit den angezeigten Messwerten. Du wählst selbst aus, an wen bzw. welche App du sie weitergibst.

## Löschen

- **Abmelden** (Einstellungen) löscht gespeicherte Zugangsdaten und den Zwischenspeicher der Messwerte.
- **Deinstallieren** entfernt alle Daten der App vom Gerät.
- Android-Backups sind für Netzblick deaktiviert. Es landen also keine Daten der App in Cloud-Sicherungen.

## Berechtigungen

Netzblick benötigt nur die Berechtigung **Internet**, um das Portal zu erreichen.

## Deine Rechte

Da die App selbst keine Daten an den Entwickler übermittelt, liegen dort keine Daten über dich vor.
Fragen zu den Daten im Portal (Auskunft, Berichtigung, Löschung) richtest du an Netz Burgenland.

## Verantwortlich und Kontakt

Patrick Schlögl (geister-it)

E-Mail: [patrick-schloegl@gmx.at](mailto:patrick-schloegl@gmx.at)
