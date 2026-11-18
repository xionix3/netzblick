# Datenschutzerklärung für Netzblick

Stand: 18. November 2026

Netzblick ist eine nicht-kommerzielle App von Patrick Schlögl (geister-it). Sie zeigt die Smart-Meter-Daten an, die Netz Burgenland in seinem Verbrauchsdatenportal bereitstellt, sowie Anlagen-, Vertrags- und Abrechnungsdaten aus dem Kundenportal von Netz Burgenland.
Diese Erklärung beschreibt, welche Daten die App verarbeitet und wohin sie fließen.

## Kurz gesagt

- Netzblick hat **keinen eigenen Server**. Der Entwickler erhält keinerlei Daten von dir.
- Die App verbindet sich mit den Portalen von Netz Burgenland, **smartmeter.netzburgenland.at** und **api.portal.netzburgenland.at**, und zwar verschlüsselt über HTTPS.
- Nur wenn du einen **dynamischen Stromtarif** einträgst, lädt die App zusätzlich die öffentlichen Börsenpreise von **api.energy-charts.info** (Fraunhofer ISE). Dabei wird nur der gewünschte Zeitraum abgefragt, keine Daten über dich.
- Vom Kundenportal werden Daten nur **gelesen**. Die App ändert dort nichts.
- Es gibt **keine Werbung, kein Tracking, keine Analyse- oder Absturzdienste** von Dritten.

## Welche Daten verarbeitet werden

| Daten | Zweck | Wo sie gespeichert werden |
|---|---|---|
| Benutzername bzw. E-Mail-Adresse und Passwort deines Portal-Zugangs | Anmeldung beim Portal von Netz Burgenland | Nur wenn „Angemeldet bleiben“ aktiv ist: auf deinem Gerät, verschlüsselt (AES-256-GCM, Schlüssel im Android Keystore) |
| Optional: eigene Zugangsdaten für das Kundenportal (nur wenn du sie eingibst) | Anmeldung beim Kundenportal, falls es ein anderes Konto ist | wie oben, verschlüsselt auf deinem Gerät |
| Sitzungs-Token beider Portale | Abruf deiner Daten nach der Anmeldung. Das Smart-Meter-Portal liefert bei der Anmeldung auch ein Token für das Kundenportal (gleiche Anmeldung von Netz Burgenland). | nur im Arbeitsspeicher, bis die App beendet wird |
| Zählpunkte, Adresse, Messwerte, Zählerstände | Anzeige, Diagramme, Auswertungen | Zwischenspeicher auf deinem Gerät für die Offline-Anzeige |
| Aus dem Kundenportal: Name, Kundennummer, E-Mail, Adresse, Zählernummer, Lieferant, Verträge, abgerechnete Verbräuche, Rechnungsbeträge, Teilbeträge | Anzeige auf den Seiten Anlagen, Abrechnung und Konto, Hochrechnung des Abrechnungsjahres | nur im Arbeitsspeicher, bis die App beendet wird |
| Einstellungen (Lieferant, Strompreis oder Aufschlag beim dynamischen Tarif, Namen der Zählpunkte, Darstellung) und das Datum für die Erinnerung | Berechnung der Kosten, Anzeige, Erinnerung | auf deinem Gerät |
| Börsenpreise EPEX Spot Österreich (öffentliche Marktdaten, nur bei dynamischem Tarif) | Kosten beim dynamischen Tarif, Preisanzeige für heute und morgen | Zwischenspeicher auf deinem Gerät |

Die Zugangsdaten werden nur an die Portale von Netz Burgenland übertragen, genauso wie bei der Anmeldung im Web-Portal.
Bei der Abfrage der Börsenpreise sieht der Betreiber von api.energy-charts.info (Fraunhofer-Institut für Solare Energiesysteme ISE) wie jeder Webserver deine IP-Adresse; Zugangsdaten, Zählpunkte oder Messwerte werden dorthin nicht übertragen.
Für die Verarbeitung deiner Daten auf den Servern von Netz Burgenland gilt deren Datenschutzerklärung.

## CSV-Export

Wenn du „CSV teilen“ verwendest, erzeugt die App eine Datei mit den angezeigten Messwerten. Du wählst selbst aus, an wen bzw. welche App du sie weitergibst.

## Löschen

- **Abmelden** (Menü oder Konto) löscht gespeicherte Zugangsdaten beider Portale und den Zwischenspeicher der Messwerte.
- **Zwischenspeicher leeren** (Konto) löscht nur die zwischengespeicherten Messwerte.
- **Deinstallieren** entfernt alle Daten der App vom Gerät.
- Android-Backups sind für Netzblick deaktiviert. Es landen also keine Daten der App in Cloud-Sicherungen.

## Berechtigungen

Netzblick benötigt die Berechtigung **Internet**, um die Portale zu erreichen. Für die Erinnerung an Rabatt- oder Bindungsende fragt die App einmal nach **Benachrichtigungen**; die Erinnerung wird nur auf deinem Gerät geplant. Damit sie einen Neustart übersteht, darf die App den Neustart des Geräts empfangen.

Netzpreise, Abgaben und Kontaktdaten von Netz Burgenland sind fest in der App hinterlegt; dafür werden keine Daten übertragen. Links zu Telefon, E-Mail, Karten oder Webseiten öffnen die jeweilige App auf deinem Gerät.

## Deine Rechte

Da die App selbst keine Daten an den Entwickler übermittelt, liegen dort keine Daten über dich vor.
Fragen zu den Daten im Portal (Auskunft, Berichtigung, Löschung) richtest du an Netz Burgenland.

## Verantwortlich und Kontakt

Patrick Schlögl (geister-it)

E-Mail: [patrick-schloegl@gmx.at](mailto:patrick-schloegl@gmx.at)
