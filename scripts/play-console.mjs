// Alles für die Play Console zum Kopieren: erzeugt docs/PLAY-CONSOLE.md und .preview/play-console.html
//   node scripts/play-console.mjs
// Inhalt nur hier pflegen. Grundlage und Hintergründe: docs/PLAY-STORE.md
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const AAB = `netzblick-${version}.aab`;
const CODE = version.split('.').map(Number).reduce((a, x, i) => a + x * [10000, 100, 1][i], 0); // versionCode wie im Build
const RELEASE = `https://github.com/xionix3/netzblick/releases/tag/v${version}`;
const PRIVACY = 'https://gist.github.com/xionix3/f85c9898dc518f80e8a40bceea5199b2';
const MAIL = 'patrick-schloegl@gmx.at';

const DESCRIPTION = `Netzblick zeigt die Werte deines Smart Meters aus dem Verbrauchsdatenportal von Netz Burgenland – übersichtlich, schnell und zum Filtern. Dazu kommen deine Anlagen und Abrechnungen aus dem Kundenportal, mit derselben Anmeldung.

Melde dich mit deinem gewohnten Portal-Zugang an und sieh sofort:
• deinen Verbrauch für Tag, Woche, Monat, Jahr oder einen eigenen Zeitraum
• den Vergleich zur Vorperiode oder zum Vorjahr – fair bis zum gleichen Zeitpunkt
• eine Hochrechnung und die Kosten: Energie deines Lieferanten, Netzkosten von Netz Burgenland und Abgaben
• alle Kosten Monat für Monat und je Zählpunkt, für die letzten 12 Monate oder ein ganzes Jahr
• die Leistung in Viertelstunden mit 10-kW-Linie, deine Monatsspitzen und was der Leistungspreis ab 2027 kostet
• die Börsenpreise (Day-Ahead) für heute und morgen, je Viertelstunde oder Stunde: wann Strom am günstigsten und am teuersten ist, auch im Vergleich mit den Nachbarländern
• dynamische Stromtarife: Börsenpreis plus Aufschlag, mit Vorlagen für bekannte Anbieter
• eine Erinnerung, bevor Neukundenrabatt oder Vertragsbindung enden
• wann am Tag Strom gebraucht wird (Lastgang), den typischen Tagesverlauf und den Verbrauch je Wochentag
• Spitzenleistung, Grundlast, Nachtanteil und deinen aktuellen Zählerstand
• wie viel du seit der letzten Jahresabrechnung verbraucht hast, worauf es hinausläuft und ob die Teilbeträge reichen
• Zählernummer, Lieferant, Netzebene, Energiegemeinschaften mit Teilnahmefaktor und abgerechnete Jahresverbräuche
• Störungsdienst und Kontakt zum direkten Anrufen

Filter nach Wochentagen und Uhrzeit zeigen zum Beispiel, was nachts oder am Wochenende verbraucht wird. Mehrere Zählpunkte lassen sich beliebig kombinieren und benennen. Diagramme als Balken, Linien, Fläche oder Kreis. Optimiert für Handy und Tablet, im Hoch- und Querformat, hell und dunkel. Alle Werte gibt es auch als Tabelle und als CSV-Export.

Datenschutz: Netzblick verbindet sich mit den Portalen von Netz Burgenland und liest dort nur. Für die Börsenpreise kommen öffentliche Marktdaten von Energy-Charts dazu. Kein eigener Server, keine Werbung, kein Tracking. Zugangsdaten werden auf Wunsch verschlüsselt auf dem Gerät gespeichert.

Ohne Konto ausprobieren: Auf der Anmeldeseite „Demo mit Beispieldaten ansehen“ tippen.

Hinweis: Netzblick ist eine inoffizielle App von geister-it und steht in keiner Verbindung zu Netz Burgenland. Für die eigenen Werte ist ein Zugang zu den Portalen von Netz Burgenland mit Smart Meter nötig.`;

/*
 * Ein Schritt: {id, title, where, items}
 * Items: {copy: Label, value, limit?}  Text zum Kopieren
 *        {pick: Label, value}          in der Console auswählen
 *        {file: Label, value}          Datei hochladen
 *        {note: Text}                  Hinweis
 */
const STEPS = [
  {
    id: 'vorbereiten', title: 'Dateien bereitlegen',
    where: 'auf deinem Rechner',
    items: [
      { note: `Lade aus dem GitHub-Release ${version} die Datei ${AAB} herunter: ${RELEASE}` },
      { note: 'Die Grafiken liegen im Repository unter docs/store/ (auf GitHub: Datei öffnen, dann „Download raw file“).' },
      { file: 'App-Bundle', value: AAB },
      { pick: 'Paketname im App-Bundle', value: 'at.xionix.netzblick (ab Version 1.7.1, passend zu deiner Play Console)' },
      { file: 'App-Symbol (512 × 512)', value: 'docs/store/icon-512.png' },
      { file: 'Vorstellungsgrafik (1024 × 500)', value: 'docs/store/feature-graphic.png' },
      { file: 'Screenshots Smartphone (8 Stück)', value: 'docs/store/phone-1.png … phone-8.png' },
      { file: 'Screenshots Tablet 7 und 10 Zoll', value: 'docs/store/tablet-1.png, tablet-2.png' },
    ],
  },
  {
    id: 'app-erstellen', title: 'App erstellen',
    where: 'Play Console → Alle Apps → App erstellen',
    items: [
      { copy: 'App-Name', value: 'Netzblick: Stromverbrauch', limit: 30 },
      { pick: 'Standardsprache', value: 'Deutsch (Österreich) – de-AT' },
      { pick: 'App oder Spiel', value: 'App' },
      { pick: 'Kostenlos oder kostenpflichtig', value: 'Kostenlos (lässt sich später nicht mehr ändern)' },
      { pick: 'Erklärungen', value: 'Richtlinien für Entwickler und US-Exportgesetze bestätigen' },
    ],
  },
  {
    id: 'datenschutz', title: 'Datenschutzerklärung',
    where: 'Dashboard → App einrichten → Datenschutzerklärung',
    items: [
      { copy: 'URL der Datenschutzerklärung', value: PRIVACY },
    ],
  },
  {
    id: 'app-zugriff', title: 'App-Zugriff',
    where: 'Dashboard → App einrichten → App-Zugriff',
    items: [
      { pick: 'Auswahl', value: 'Alle oder einige Funktionen sind eingeschränkt → Anleitung hinzufügen' },
      { copy: 'Name der Anleitung', value: 'Demo mode, no account needed' },
      { note: 'Benutzername und Passwort leer lassen. Den Text unten in „Weitere Informationen“ eintragen. Er ist auf Englisch, weil ihn Prüferinnen und Prüfer aus aller Welt lesen.' },
      { copy: 'Weitere Informationen', value: 'Netzblick shows data from a customer account at Netz Burgenland, an electricity grid operator in Austria. No account is needed for the review: on the sign-in screen tap "Demo mit Beispieldaten ansehen" (view demo with sample data). Demo mode shows every feature and every page with made-up sample data, including consumption, power, costs, exchange prices, installations, billing and account. Real credentials cannot be shared because they belong to a private household\'s electricity connection.' },
    ],
  },
  {
    id: 'werbung', title: 'Anzeigen',
    where: 'Dashboard → App einrichten → Anzeigen',
    items: [{ pick: 'Enthält deine App Werbung?', value: 'Nein, meine App enthält keine Werbung' }],
  },
  {
    id: 'einstufung', title: 'Einstufung des Inhalts',
    where: 'Dashboard → App einrichten → Einstufung des Inhalts → Fragebogen starten',
    items: [
      { copy: 'E-Mail-Adresse (für die IARC)', value: MAIL },
      { pick: 'Kategorie', value: 'die Kategorie für Dienstprogramme, Produktivität, Kommunikation und Sonstiges (kein Spiel)' },
      { pick: 'Alle Fragen zu Gewalt, Angst, Sexualität, Sprache, Drogen, Glücksspiel und Humor', value: 'Nein' },
      { pick: 'Können Nutzer miteinander interagieren oder Inhalte austauschen?', value: 'Nein' },
      { pick: 'Teilt die App den aktuellen Standort?', value: 'Nein' },
      { pick: 'Können digitale Waren gekauft werden?', value: 'Nein' },
      { pick: 'Uneingeschränkter Internetzugang (z. B. ein eingebauter Browser)?', value: 'Nein. Links öffnen den Browser des Geräts.' },
      { note: 'Fragen, die hier nicht stehen, ebenfalls mit Nein beantworten. Erwartetes Ergebnis: ab 3 Jahren (PEGI 3, USK 0).' },
    ],
  },
  {
    id: 'zielgruppe', title: 'Zielgruppe und Inhalte',
    where: 'Dashboard → App einrichten → Zielgruppe',
    items: [
      { pick: 'Altersgruppen', value: 'nur „18 und älter“' },
      { pick: 'Könnte die App Kinder ansprechen? (falls gefragt)', value: 'Nein' },
    ],
  },
  {
    id: 'datensicherheit', title: 'Datensicherheit',
    where: 'Dashboard → App einrichten → Datensicherheit',
    items: [
      { note: 'Google zählt alles als „erhoben“, was die App vom Gerät wegschickt, auch an fremde Server. Netzblick schickt E-Mail-Adresse oder Benutzername und Passwort an Netz Burgenland, deshalb „Ja“. Messwerte lädt die App nur herunter, sie gelten nicht als erhoben.' },
      { pick: 'Erhebt oder teilt deine App erforderliche Nutzerdatentypen?', value: 'Ja' },
      { pick: 'Werden alle erhobenen Nutzerdaten bei der Übertragung verschlüsselt?', value: 'Ja' },
      { pick: 'Welche Arten der Kontoerstellung unterstützt deine App?', value: 'Keine Kontoerstellung. Man meldet sich mit einem bestehenden Konto von Netz Burgenland an, die App legt keine Konten an.' },
      { pick: 'Können Nutzer die Löschung ihrer Daten beantragen? (falls gefragt)', value: 'Ja. „Abmelden“ löscht Zugangsdaten und Zwischenspeicher, Deinstallieren alles. Falls ein Link verlangt wird: die URL der Datenschutzerklärung.' },
      { pick: 'Datentypen', value: 'Persönliche Infos → E-Mail-Adresse und Nutzer-IDs. Sonst nichts.' },
      { pick: 'Je Datentyp: erhoben / geteilt', value: 'Erhoben: Ja. Geteilt: Nein (die Anmeldung bei Netz Burgenland löst der Nutzer selbst aus).' },
      { pick: 'Je Datentyp: wird vorübergehend verarbeitet?', value: 'Nein' },
      { pick: 'Je Datentyp: erforderlich oder optional?', value: 'Erforderlich' },
      { pick: 'Je Datentyp: Zwecke', value: 'App-Funktionen und Kontoverwaltung' },
    ],
  },
  {
    id: 'erklaerungen', title: 'Weitere Erklärungen',
    where: 'Dashboard → App einrichten (jeweils eigener Punkt)',
    items: [
      { pick: 'Werbe-ID', value: 'Nein, die App verwendet keine Werbe-ID' },
      { pick: 'Behörden-Apps', value: 'Nein' },
      { pick: 'Finanzfunktionen', value: 'Meine App bietet keine Finanzfunktionen' },
      { pick: 'Gesundheit', value: 'Meine App hat keine Gesundheitsfunktionen' },
      { pick: 'Nachrichten-App (falls gefragt)', value: 'Nein' },
    ],
  },
  {
    id: 'kategorie', title: 'Kategorie und Kontaktdaten',
    where: 'Dashboard → App einrichten → App-Kategorie und Kontaktdaten',
    items: [
      { pick: 'App oder Spiel / Kategorie', value: 'App / Tools' },
      { copy: 'E-Mail-Adresse (öffentlich sichtbar)', value: MAIL },
      { copy: 'Website (optional)', value: 'https://www.geister-it.at' },
      { note: 'Telefonnummer leer lassen.' },
    ],
  },
  {
    id: 'store-eintrag', title: 'Store-Eintrag',
    where: 'Dashboard → App einrichten → Store-Eintrag einrichten',
    items: [
      { copy: 'App-Name', value: 'Netzblick: Stromverbrauch', limit: 30 },
      { copy: 'Kurzbeschreibung', value: 'Smart-Meter-Werte von Netz Burgenland: Verbrauch, Kosten, Leistung, Börsenpreis', limit: 80 },
      { copy: 'Vollständige Beschreibung', value: DESCRIPTION, limit: 4000 },
      { file: 'App-Symbol', value: 'docs/store/icon-512.png' },
      { file: 'Vorstellungsgrafik', value: 'docs/store/feature-graphic.png' },
      { file: 'Smartphone-Screenshots', value: 'phone-1.png bis phone-8.png, in dieser Reihenfolge' },
      { file: 'Tablet 7 Zoll und 10 Zoll', value: 'tablet-1.png und tablet-2.png (für beide dieselben)' },
    ],
  },
  {
    id: 'test-einrichten', title: 'Geschlossenen Test einrichten',
    where: 'Testen und veröffentlichen → Tests → Geschlossene Tests → Track verwalten (Alpha)',
    items: [
      { pick: 'Länder und Regionen', value: 'Österreich und Deutschland' },
      { note: 'Tab „Tester“ → E-Mail-Liste erstellen. Adressen der Google-Konten deiner Tester durch Kommas getrennt eintragen. Danach das Häkchen bei der Liste setzen und speichern, sonst finden die Tester die App nicht.' },
      { copy: 'Name der E-Mail-Liste', value: 'Netzblick Tester' },
      { copy: 'Feedback-URL oder E-Mail-Adresse', value: MAIL },
    ],
  },
  {
    id: 'test-release', title: 'Test-Release hochladen',
    where: 'Geschlossener Test (Alpha) → Neuen Release erstellen',
    items: [
      { pick: 'App-Signatur (beim ersten Mal)', value: 'Play App Signing annehmen (von Google erstellter Schlüssel)' },
      { file: 'App-Bundle', value: AAB },
      { note: `Den Release-Namen schlägt die Console selbst vor: ${CODE} (${version}). So lassen.` },
      { copy: 'Versionshinweise', value: `<de-AT>
Erste Testversion von Netzblick. Neu: Seite „Börsenpreis“ mit den Day-Ahead-Preisen für heute und morgen, je Viertelstunde oder Stunde, und dem Vergleich mit den Nachbarländern. Rückmeldungen bitte an ${MAIL}.
</de-AT>`, limit: 500 },
      { note: 'Weiter → Speichern → „Release überprüfen“ → Änderungen in der Veröffentlichungsübersicht zur Überprüfung senden. Die erste Prüfung dauert meist ein paar Tage.' },
    ],
  },
  {
    id: 'tester-einladen', title: 'Tester einladen',
    where: 'nach der Freigabe: Geschlossener Test → Tester → Link kopieren',
    items: [
      { note: 'Vorher von jeder Person die Adresse ihres Google-Kontos holen (Nachricht 1). Nach der Freigabe den Link kopieren und Nachricht 2 schicken; [LINK] ersetzen. Nimm 15 Leute oder mehr, falls jemand abspringt.' },
      { copy: 'Nachricht 1: Adresse erfragen', value: 'Hallo! Ich bringe meine App Netzblick in den Google Play Store. Dafür müssen mindestens 12 Personen sie 14 Tage lang testen. Hilfst du mit? Es kostet nichts und dauert zwei Minuten. Schick mir bitte die E-Mail-Adresse deines Google-Kontos, mit dem du im Play Store angemeldet bist (Play Store öffnen, rechts oben auf dein Profilbild tippen). Danke!' },
      { copy: 'Nachricht 2, Betreff', value: 'Netzblick testen: dein Link' },
      { copy: 'Nachricht 2, Text', value: `Hallo,

danke, dass du Netzblick testest! So geht's:

1. Öffne diesen Link am Android-Handy, mit dem Google-Konto, dessen Adresse du mir geschickt hast:
[LINK]
2. Tippe auf „Tester werden“ und danach auf „Bei Google Play herunterladen“.
3. Installiere Netzblick und lass die App 14 Tage lang installiert. Öffne sie ab und zu, zum Beispiel alle paar Tage kurz. Bitte nicht auf „Test beenden“ tippen.

Ohne Konto bei Netz Burgenland tippst du in der App auf „Demo mit Beispieldaten ansehen“. Hast du einen Smart Meter von Netz Burgenland, kannst du dich auch mit deinem Portal-Zugang anmelden.

Wenn du Netzblick schon einmal als APK installiert hast, deinstalliere es bitte vorher.
Meldet der Play Store „nicht gefunden“: ein paar Minuten warten oder im Play Store auf das richtige Google-Konto wechseln.

Fehler, Ideen oder Fragen gerne an mich: ${MAIL}

Danke!
Patrick` },
    ],
  },
  {
    id: 'netz-burgenland', title: 'Netz Burgenland fragen (empfohlen)',
    where: 'per E-Mail an info@netzburgenland.at, vor der öffentlichen Veröffentlichung',
    items: [
      { copy: 'Empfänger', value: 'info@netzburgenland.at' },
      { copy: 'Betreff', value: 'Private App „Netzblick“ für das Smart-Meter-Portal: Ihr Einverständnis' },
      { copy: 'Text', value: `Sehr geehrte Damen und Herren,

ich habe als Privatperson die kostenlose Android-App „Netzblick“ entwickelt. Sie zeigt die Werte aus Ihrem Smart-Meter-Portal und Ihrem Kundenportal übersichtlicher auf dem Handy an: Verbrauch, Kosten, Leistungsspitzen für den Leistungspreis ab 2027 und die Abrechnung.

Die App meldet sich mit dem Zugang der Kundin oder des Kunden an, genau wie das Web-Portal, und liest die Daten nur. Sie hat keinen eigenen Server, keine Werbung und kein Tracking. In der App und im Store steht deutlich, dass es keine offizielle App von Netz Burgenland ist.

Ich möchte die App im Google Play Store veröffentlichen und frage vorher, ob Sie damit einverstanden sind. Gerne halte ich mich an Ihre Vorgaben, etwa zur Häufigkeit der Abfragen, und stelle Ihnen die App vorab zur Ansicht bereit.

Mit freundlichen Grüßen
Patrick Schlögl
geister-it
${MAIL}` },
    ],
  },
  {
    id: 'produktion', title: 'Nach 14 Tagen: Produktion beantragen',
    where: 'Dashboard → Zugriff auf Produktion beantragen',
    items: [
      { note: 'Voraussetzung: mindestens 12 Tester waren die letzten 14 Tage ohne Unterbrechung dabei. Die Texte sind Entwürfe. Teile in [eckigen Klammern] nach dem Test ausfüllen.' },
      { pick: 'Wie leicht war es, Tester zu finden?', value: 'ehrlich nach deiner Erfahrung wählen' },
      { copy: 'Wie haben sich die Tester beteiligt?', value: '[Anzahl] Personen aus Familie, Freundes- und Bekanntenkreis haben Netzblick 14 Tage lang genutzt, ein Teil mit dem eigenen Zugang zu Netz Burgenland, der Rest im Demo-Modus. Am meisten genutzt wurden Verbrauch, Kosten und Börsenpreise. [Ergänzen: was auffiel]' },
      { copy: 'Zusammenfassung des Feedbacks', value: 'Rückmeldungen kamen per E-Mail, Messenger und über das private Feedback im Play Store. Genannt wurden vor allem: [Punkte ergänzen].' },
      { copy: 'Für wen ist die App gedacht?', value: 'Für Haushalte und Betriebe mit Smart Meter im Netzgebiet von Netz Burgenland (Burgenland, Österreich), die ihren Stromverbrauch, ihre Kosten und ab 2027 ihre Leistungsspitzen im Blick behalten wollen, und für Kundinnen und Kunden mit dynamischem Stromtarif.' },
      { copy: 'Welchen Nutzen bietet die App?', value: 'Das Web-Portal von Netz Burgenland zeigt die Viertelstundenwerte nur umständlich. Netzblick zeigt sie übersichtlich auf dem Handy, mit Filtern und Vergleichen. Die App rechnet die Kosten aus Netzpreisen, Abgaben und dem eigenen Tarif, zeigt die Leistungsspitzen für den neuen Leistungspreis ab 2027, die Börsenpreise mit den günstigsten Zeiten und den Stand der Jahresabrechnung. Ohne Werbung und ohne eigenen Server.' },
      { pick: 'Erwartete Installationen im ersten Jahr', value: 'eine der kleinsten Stufen, die App ist nur für das Burgenland gedacht' },
      { copy: 'Was hast du nach dem Test geändert?', value: '[Ergänzen, z. B.: Fehler behoben, Texte verständlicher gemacht, Wünsche der Tester umgesetzt.] Jede Änderung wird vor dem Upload mit automatischen Tests geprüft.' },
      { copy: 'Woran erkennst du, dass die App bereit ist?', value: 'Alle Tester konnten die App installieren und nutzen. Die Absturz- und ANR-Berichte in der Play Console sind unauffällig, die Rückmeldungen sind eingearbeitet, und bei jeder Version laufen automatische Unit- und Oberflächentests.' },
      { note: 'Nach der Freigabe: Produktion → Neuen Release erstellen → dasselbe oder ein neueres App-Bundle hochladen, Land Österreich, Versionshinweise wie beim Test.' },
    ],
  },
];

/* ---------------------------------------------------------------- Prüfungen */
for (const s of STEPS) for (const it of s.items) {
  if (it.copy && it.limit && [...it.value].length > it.limit) throw new Error(`${s.title} / ${it.copy}: ${[...it.value].length} > ${it.limit} Zeichen`);
}
const len = (v) => [...v].length;

/* ---------------------------------------------------------------- Markdown */
const fence = (v) => '```text\n' + v + '\n```';
let md = `# Play Console ausfüllen, zum Kopieren

Erzeugt mit \`node scripts/play-console.mjs\` für Version ${version}. Hintergründe und Begründungen stehen in [PLAY-STORE.md](PLAY-STORE.md).
Auf GitHub hat jeder Kasten rechts oben einen Knopf zum Kopieren.

`;
STEPS.forEach((s, i) => {
  md += `## ${i + 1}. ${s.title}\n\n*Wo:* ${s.where}\n\n`;
  for (const it of s.items) {
    if (it.note) md += `${it.note}\n\n`;
    else if (it.pick) md += `- **${it.pick}:** ${it.value}\n\n`;
    else if (it.file) md += `- 📎 **${it.file}:** \`${it.value}\`\n\n`;
    else if (it.copy) md += `**${it.copy}**${it.limit ? ` (${len(it.value)} von ${it.limit} Zeichen)` : ''}\n\n${fence(it.value)}\n\n`;
  }
});
writeFileSync(resolve(root, 'docs/PLAY-CONSOLE.md'), md.replace(/\n{3,}/g, '\n\n'));

/* ---------------------------------------------------------------- HTML-Seite */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s)]+/g, (u) => `<a href="${u}">${u}</a>`);
let n = 0;
const itemHtml = (it) => {
  if (it.note) return `<p class="note">${linkify(it.note)}</p>`;
  if (it.pick) return `<div class="row pick"><span class="lbl">${esc(it.pick)}</span><span class="val">${esc(it.value)}</span></div>`;
  if (it.file) return `<div class="row file"><span class="lbl">${esc(it.file)}</span><code class="val">${esc(it.value)}</code></div>`;
  const id = `c${++n}`;
  const count = it.limit ? `<span class="count">${len(it.value)} / ${it.limit} Zeichen</span>` : '';
  const long = it.value.length > 160 ? ' long' : '';
  return `<div class="copy${long}"><div class="copy-head"><span class="lbl">${esc(it.copy)}</span>${count}<button type="button" class="btn" data-copy="${id}">Kopieren</button></div><pre id="${id}" class="text" tabindex="0">${esc(it.value)}</pre></div>`;
};
const total = STEPS.length;
const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Netzblick in die Play Console</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Semi+Condensed:wght@600&display=swap" rel="stylesheet" />
<style>
:root {
  /* Farben und Schrift wie in der App Netzblick; eine Spalte zum Abarbeiten, links die Schritte */
  --paper: #edf1f4; --surface: #ffffff; --ink: #142231; --ink-2: #4b5967; --muted: #6b7885;
  --line: #dfe5ea; --accent: #2a78d6; --done: #0b7d4b; --code: #f4f7f9;
  --font-ui: 'Barlow', system-ui, sans-serif; --font-num: 'Barlow Semi Condensed', 'Barlow', system-ui, sans-serif;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --paper: #0e151c; --surface: #151e27; --ink: #e6ecf1; --ink-2: #a9b4bf; --muted: #8593a0; --line: #26323d; --accent: #6da7ec; --done: #3ccf8e; --code: #101820; color-scheme: dark; }
}
:root[data-theme="dark"] { --paper: #0e151c; --surface: #151e27; --ink: #e6ecf1; --ink-2: #a9b4bf; --muted: #8593a0; --line: #26323d; --accent: #6da7ec; --done: #3ccf8e; --code: #101820; color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--paper); color: var(--ink); font: 400 16px/1.5 var(--font-ui); }
a { color: var(--accent); overflow-wrap: anywhere; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 24px 16px 64px; display: grid; gap: 24px; }
header { display: grid; gap: 10px; }
h1 { font: 600 34px/1.1 var(--font-num); margin: 0; text-wrap: balance; }
.lead { color: var(--ink-2); margin: 0; max-width: 66ch; }
.progress { display: flex; align-items: center; gap: 12px; font-variant-numeric: tabular-nums; color: var(--ink-2); font-size: 15px; }
.bar { flex: 0 1 280px; height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; }
.bar > i { display: block; height: 100%; width: 0; background: var(--done); transition: width .25s ease; }
.layout { display: grid; gap: 24px; }
nav ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; counter-reset: s; }
nav a { display: flex; gap: 10px; align-items: baseline; padding: 6px 10px; border-radius: 8px; color: var(--ink-2); text-decoration: none; font-size: 15px; }
nav a::before { counter-increment: s; content: counter(s); font: 600 14px/1 var(--font-num); min-width: 1.4em; color: var(--muted); }
nav a:hover { background: var(--surface); color: var(--ink); }
nav a.is-done { color: var(--muted); text-decoration: line-through; }
nav a.is-done::before { content: '✓'; color: var(--done); }
main { display: grid; gap: 16px; min-width: 0; }
section.step { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px 18px 16px; display: grid; gap: 12px; scroll-margin-top: 12px; }
section.step.is-done { border-color: color-mix(in srgb, var(--done) 45%, var(--line)); }
.step-head { display: flex; align-items: flex-start; gap: 12px; }
.num { font: 600 15px/28px var(--font-num); width: 28px; height: 28px; text-align: center; border-radius: 50%; background: var(--paper); color: var(--ink-2); flex: 0 0 auto; }
.is-done .num { background: var(--done); color: var(--surface); }
.step-title { flex: 1; min-width: 0; }
h2 { font: 600 21px/1.25 var(--font-ui); margin: 0; text-wrap: balance; }
.where { color: var(--muted); font-size: 14px; margin: 2px 0 0; }
.check { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--ink-2); cursor: pointer; white-space: nowrap; padding-top: 2px; }
.check input { width: 18px; height: 18px; accent-color: var(--done); }
.note { margin: 0; color: var(--ink-2); max-width: 70ch; }
.row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; padding: 8px 0; border-top: 1px solid var(--line); }
.row .lbl { font-size: 14px; color: var(--muted); }
.row .val { font-weight: 500; }
.row code { font: 500 14px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ink); overflow-wrap: anywhere; }
.copy { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.copy-head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px; background: var(--paper); }
.copy-head .lbl { flex: 1; font-weight: 600; font-size: 15px; min-width: 0; }
.count { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.btn { font: 600 14px/1 var(--font-ui); padding: 9px 14px; border-radius: 8px; border: 0; background: var(--accent); color: #fff; cursor: pointer; min-width: 96px; }
.btn:hover { filter: brightness(1.08); }
.btn.ok { background: var(--done); }
.btn:focus-visible, .check input:focus-visible, nav a:focus-visible, .text:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.text { margin: 0; padding: 12px; font: 400 15px/1.5 var(--font-ui); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--code); color: var(--ink); }
.copy.long .text { max-height: 220px; overflow: auto; }
footer { color: var(--muted); font-size: 14px; }
@media (min-width: 900px) {
  .layout { grid-template-columns: 240px minmax(0, 1fr); align-items: start; }
  nav { position: sticky; top: 16px; }
  .row { grid-template-columns: 260px minmax(0, 1fr); gap: 16px; }
}
@media (prefers-reduced-motion: reduce) { .bar > i { transition: none; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Netzblick in die Play Console</h1>
    <p class="lead">Alle Eingaben für Version ${esc(version)}, in der Reihenfolge der Play Console. Blaue Knöpfe kopieren den Text, Haken merken sich, was erledigt ist.</p>
    <div class="progress"><span class="bar"><i id="bar"></i></span><span id="progressText">0 von ${total} Schritten erledigt</span></div>
  </header>
  <div class="layout">
    <nav aria-label="Schritte"><ol>${STEPS.map((s) => `<li><a href="#${s.id}" data-nav="${s.id}">${esc(s.title)}</a></li>`).join('')}</ol></nav>
    <main>
${STEPS.map((s, i) => `      <section class="step" id="${s.id}">
        <div class="step-head"><span class="num">${i + 1}</span><div class="step-title"><h2>${esc(s.title)}</h2><p class="where">${esc(s.where)}</p></div>
          <label class="check"><input type="checkbox" id="done-${s.id}" data-done="${s.id}" /> Erledigt</label></div>
        ${s.items.map(itemHtml).join('\n        ')}
      </section>`).join('\n')}
      <footer>Datenschutzerklärung: <a href="${PRIVACY}">${PRIVACY}</a> · App-Bundle und Grafiken: <a href="${RELEASE}">${RELEASE}</a></footer>
    </main>
  </div>
</div>
<script>
(function () {
  var KEY = 'netzblick-play-console';
  var done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { done = {}; }
  var boxes = document.querySelectorAll('[data-done]');
  function sync() {
    var n = 0;
    boxes.forEach(function (b) {
      var id = b.getAttribute('data-done');
      b.checked = !!done[id];
      if (done[id]) n++;
      document.getElementById(id).classList.toggle('is-done', !!done[id]);
      var a = document.querySelector('[data-nav="' + id + '"]');
      if (a) a.classList.toggle('is-done', !!done[id]);
    });
    document.getElementById('bar').style.width = (n / boxes.length * 100) + '%';
    document.getElementById('progressText').textContent = n + ' von ' + boxes.length + ' Schritten erledigt';
  }
  boxes.forEach(function (b) {
    b.addEventListener('change', function () {
      done[b.getAttribute('data-done')] = b.checked;
      try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) {}
      sync();
    });
  });
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pre = document.getElementById(btn.getAttribute('data-copy'));
      var text = pre.textContent;
      var ok = function () { btn.textContent = 'Kopiert'; btn.classList.add('ok'); setTimeout(function () { btn.textContent = 'Kopieren'; btn.classList.remove('ok'); }, 1600); };
      var fallback = function () {
        var r = document.createRange(); r.selectNodeContents(pre);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        btn.textContent = 'Markiert: Strg+C';
        setTimeout(function () { btn.textContent = 'Kopieren'; }, 2500);
      };
      try { navigator.clipboard.writeText(text).then(ok, fallback); } catch (e) { fallback(); }
    });
  });
  sync();
})();
</script>
</body>
</html>
`;
mkdirSync(resolve(root, '.preview'), { recursive: true });
writeFileSync(resolve(root, '.preview/play-console.html'), html);
console.log(`docs/PLAY-CONSOLE.md und .preview/play-console.html (Version ${version}, ${total} Schritte)`);
