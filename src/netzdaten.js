// Feste Daten von Netz Burgenland (nur Strom), Stand 18.11.2026.
// Bei neuen Preisblättern hier ergänzen; die Tests prüfen Aufbau und Plausibilität.

export const STAND = '18.11.2026';

/* ------------------------------------------------------------------ Netzentgelte
 * Quelle: Preisblatt der Netz Burgenland GmbH, Bereich Strom, gültig ab 01.01.2025 bzw. 01.01.2026
 * (SNE-V 2018, Novelle 2025/2026), Netzebene 7. Alle Werte netto, zzgl. 20 % USt.
 *  lp    Netznutzung Leistungspreis als Pauschale in Euro pro Jahr (nicht gemessene Leistung)
 *  ap    Netznutzung Arbeitspreis in Cent/kWh
 *  snap  Sommer-Nieder-Arbeitspreis in Cent/kWh (1.4.–30.9., 10–16 Uhr), ab 2026
 *  loss  Netzverlustentgelt in Cent/kWh
 *  metering  Messentgelt in Euro je Monat (Drehstrom / Wechselstrom)
 *  Klassen: nm = nicht gemessene Leistung (Haushalt), u = unterbrechbar (z. B. Wärmepumpe)
 *
 * Ab 2027 Leistungspreis statt Pauschale (siehe POWER_TARIFF):
 *  lpKw    Euro je kW und Monat: low für den Anteil bis 10 kW, high für den Anteil darüber
 *  winap   Winter-Niedertarif in Cent/kWh (1.10.–31.3., 23–5 Uhr), ab 1.10.2027
 *  Quelle 2027: Begutachtungsentwurf der SNE-T-V 2027 der E-Control vom 29.10.2026,
 *  § 5 Abs. 1 Z 6 lit. a, Bereich Burgenland; Messentgelt entfällt (Erläuterungen).
 *  Netz Burgenland stellt laut eigener Ankündigung ab Jänner 2027 um. Die endgültige Verordnung
 *  erscheint Mitte Dezember 2026; dann hier die Werte prüfen und draft entfernen.
 */
export const GRID = {
  2025: {
    nm: { lp: 48.0, ap: 7.26, snap: null, loss: 0 },
    u: { lp: 0, ap: 4.49, snap: null, loss: 0 },
    metering: { three: 2.4, single: 1.0 },
  },
  2026: {
    nm: { lp: 54.0, ap: 8.46, snap: 6.77, loss: 0 },
    u: { lp: 0, ap: 5.3, snap: 4.24, loss: 0 },
    metering: { three: 2.4, single: 1.0 },
  },
  2027: {
    draft: true,
    nm: { lp: 0, ap: 6.6, snap: 5.28, winap: 5.28, loss: 0, lpKw: { low: 3.4, high: 5.1 } },
    u: { lp: 0, ap: 6.1, snap: 4.88, winap: 4.88, loss: 0, lpKw: null },
    metering: { three: 0, single: 0 },
  },
};

/** Entgelt für Messleistungen je Kalendermonat (netto), bis 2026 */
export const METERING = GRID[2026].metering; // Drehstromzählung / Wechselstromzählung

/** Sommer-Niedertarif: April bis September, 10 bis 16 Uhr */
export const SNAP_WINDOW = { fromMonth: 3, toMonth: 8, fromHour: 10, toHour: 16 };
/** Winter-Niedertarif: Oktober bis März, 23 bis 5 Uhr, erstmals ab 1. Oktober 2027 */
export const WINAP_WINDOW = { fromMonth: 9, toMonth: 2, fromHour: 23, toHour: 5, since: new Date(2027, 9, 1) };

/* ------------------------------------------------------------------ Leistungspreis ab 2027
 * Verrechnet wird je Zählpunkt und Monat die höchste Viertelstunde (kWh × 4 = kW), auf zwei
 * Kommastellen gerundet. Der Anteil bis 10 kW kostet lpKw.low, der Anteil darüber lpKw.high.
 * Quellen: SNE-T-V 2027 (Begutachtungsentwurf, § 2 Z 4 und § 5), FAQ der E-Control zur neuen Tarifstruktur,
 * Presseartikel „Leistungstarif 2027“ von Netz Burgenland.
 */
export const POWER_TARIFF = {
  since: new Date(2027, 0, 1),
  limitKw: 10,
  status: 'Entwurf der E-Control vom 29.10.2026',
  sources: [
    { label: 'Leistungstarif 2027 (Netz Burgenland)', url: 'https://netzburgenland.at/unternehmen/presse-artikel-leistungstarif2027/' },
    { label: 'Fragen und Antworten zur neuen Tarifstruktur (E-Control)', url: 'https://www.e-control.at/konsumenten/faq-neue-tarifstruktur' },
    { label: 'Entwurf SNE-T-V 2027 (E-Control, PDF)', url: 'https://www.e-control.at/documents/d/guest/snt-v-2027-begutachtungsentwurf-pdf' },
  ],
};

/* ------------------------------------------------------------------ Steuern und Abgaben (bundesweit)
 *  eAbgabe   Elektrizitätsabgabe in Cent/kWh. 2026 für Haushalte 0,1 ct (Lastprofil H0), sonst 0,82 ct.
 *            Quelle: Elektrizitätsabgabegesetz idF BGBl. I Nr. 95/2025
 *  pauschale Erneuerbaren-Förderpauschale in Euro pro Zählpunkt und Jahr, Netzebene 7
 *            Quelle: Erneuerbaren-Förderpauschale-Verordnung 2025 (BGBl. II Nr. 416/2024), gilt 2025–2027
 *  beitrag   Erneuerbaren-Förderbeitrag, Netzebene 7: Euro pro Zählpunkt und Jahr, Cent/kWh Arbeit, Cent/kWh Netzverlust
 *            Quellen: Erneuerbaren-Förderbeitragsverordnung 2025 (BGBl. II Nr. 419/2024) und 2026 (BGBl. II Nr. 301/2025)
 */
export const LEVIES = {
  2025: {
    eAbgabe: { household: 1.5, other: 1.5 },
    pauschale: 19.02,
    beitrag: { nm: { year: 4.695, ap: 0.737, loss: 0.059 }, u: { year: 0, ap: 0.435, loss: 0.059 } },
  },
  2026: {
    eAbgabe: { household: 0.1, other: 0.82 },
    pauschale: 19.02,
    beitrag: { nm: { year: 3.796, ap: 0.583, loss: 0.037 }, u: { year: 0, ap: 0.347, loss: 0.037 } },
  },
};

export const VAT = 0.2;

/**
 * Amtliche Quellen für Netzentgelte, Abgaben und Marktdaten. Google Play verlangt bei Behördeninformationen
 * Links zu den Originalquellen und einen Hinweis, dass die App keine Behörde vertritt (in App und Beschreibung).
 */
export const OFFICIAL_SOURCES = [
  { label: 'Netzentgelte: Systemnutzungsentgelte-Verordnung 2018 der E-Control (Rechtsinformationssystem des Bundes)', url: 'https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20010107' },
  { label: 'Neue Tarifstruktur und Leistungspreis ab 2027 (E-Control)', url: 'https://www.e-control.at/konsumenten/faq-neue-tarifstruktur' },
  { label: 'Elektrizitätsabgabe (Bundesministerium für Finanzen)', url: 'https://www.bmf.gv.at/themen/steuern/steuern-von-a-bis-z/elektrizitaetsabgabe.html' },
  { label: 'Erneuerbaren-Förderbeitrag (Bundesministerium für Wirtschaft, Energie und Tourismus)', url: 'https://www.bmwet.gv.at/Services/Publikationen/publikationen-energie/erneuerbaren-foerderbeitragsverordnung.html' },
  { label: 'Börsenpreise: SMARD.de (Bundesnetzagentur)', url: 'https://www.smard.de/home' },
  { label: 'Netzpreise und Preisblatt von Netz Burgenland', url: 'https://netzburgenland.at/strom/netzpreis/' },
];
export const GOV_DISCLAIMER = 'Netzblick ist eine private App von geister-it. Sie vertritt keine Behörde oder staatliche Stelle, auch nicht die E-Control, und steht in keiner Verbindung zu Netz Burgenland. Alle Werte ohne Gewähr; maßgeblich sind die verlinkten Originalquellen und deine Rechnung.';

export const PRICE_SOURCES = [
  { label: 'Preisblatt Strom der Netz Burgenland (Downloadcenter)', url: 'https://netzburgenland.at/downloadcenter/' },
  { label: 'Netzpreis erklärt (Netz Burgenland)', url: 'https://netzburgenland.at/strom/netzpreis/' },
  OFFICIAL_SOURCES[0], OFFICIAL_SOURCES[2], OFFICIAL_SOURCES[3],
  { label: 'Tarifkalkulator der E-Control', url: 'https://www.e-control.at/tarifkalkulator' },
];
export const TARIFF_CALCULATOR = 'https://www.e-control.at/tarifkalkulator';

/* ------------------------------------------------------------------ Störung und Kontakt
 * Quellen: netzburgenland.at/service/stoerungs-und-pannendienst/ und netzburgenland.at/kontakt/
 */
export const OUTAGE = {
  hotline: { label: 'Störungsdienst', number: '0800 888 9009', tel: '+438008889009', note: 'rund um die Uhr, 7 Tage die Woche, 365 Tage im Jahr' },
  emergency: { label: 'Stromnotruf', number: '02682 66626', tel: '+43268266626', note: 'im Notfall' },
  map: 'https://analytics.netzburgenland.at/stoerungsinfo',
  report: 'https://netzburgenland.at/service/stoerungs-und-pannendienst/',
  safety: 'https://netzburgenland.at/strom/sicherheitshinweise/',
  source: 'https://netzburgenland.at/service/stoerungs-und-pannendienst/',
};

/** Vollständige Datenschutzerklärung (öffentlicher Gist, Inhalt wie DATENSCHUTZ.md) */
export const PRIVACY_URL = 'https://gist.github.com/xionix3/f85c9898dc518f80e8a40bceea5199b2';

export const CONTACT = {
  company: 'Netz Burgenland GmbH',
  address: 'Kasernenstraße 9, 7000 Eisenstadt',
  phone: { label: 'Kundentelefon', number: '0800 888 9001', tel: '+438008889001', hours: 'Mo–Do 8–16 Uhr, Fr 8–12 Uhr' },
  email: 'info@netzburgenland.at',
  form: 'https://netzburgenland.at/kontaktformular/',
  centers: {
    hours: 'Mo–Fr 8–12 Uhr',
    phone: { number: '05 7790', tel: '+4357790' },
    list: [
      { name: 'Eisenstadt', address: 'Kasernenstraße 9, 7000 Eisenstadt' },
      { name: 'Neusiedl am See', address: 'Wiener Straße 76, 7100 Neusiedl am See' },
      { name: 'Oberpullendorf', address: 'Wiener Straße 11, 7350 Oberpullendorf' },
      { name: 'Oberwart', address: 'Graf Erdödystraße 8, 7400 Oberwart' },
      { name: 'Güssing', address: 'Wiener Straße 47, 7540 Güssing' },
    ],
  },
  topics: [
    { label: 'Smart Meter: Fragen und Antworten', url: 'https://netzburgenland.at/smart-meter/fragen-und-antworten' },
    { label: 'Zählerstand melden', url: 'https://netzburgenland.at/service/zaehlerstand-melden' },
    { label: 'Stromanschluss', url: 'https://netzburgenland.at/strom/stromanschluss' },
    { label: 'Stromeinspeisung (Photovoltaik)', url: 'https://netzburgenland.at/strom/photovoltaik' },
    { label: 'Bürgerenergie und Energiegemeinschaften', url: 'https://netzburgenland.at/service/buergerenergie' },
    { label: 'Netz Kundenportal', url: 'https://portal.netzburgenland.at/' },
    { label: 'Smart-Meter-Portal', url: 'https://smartmeter.netzburgenland.at/' },
  ],
  source: 'https://netzburgenland.at/kontakt/',
};

/* ------------------------------------------------------------------ Energiegemeinschaften */
export const EC_TYPES = {
  CC: 'Bürgerenergiegemeinschaft',
  RC_R: 'Erneuerbare-Energie-Gemeinschaft (regional)',
  RC_L: 'Erneuerbare-Energie-Gemeinschaft (lokal)',
  RC: 'Erneuerbare-Energie-Gemeinschaft',
  GC: 'Gemeinschaftliche Erzeugungsanlage',
};
export const ecTypeLabel = (t) => EC_TYPES[t] || EC_TYPES[String(t || '').split('_')[0]] || (t ? `Gemeinschaft (${t})` : 'Gemeinschaft');

/* ------------------------------------------------------------------ Dynamische Tarife (Vorlagen)
 * Energiepreis brutto = (Börsenpreis EPEX Spot AT + |Börsenpreis| × pct %) × 1,2 + ct
 * ct: Aufschlag in Cent/kWh brutto, gp: Grundgebühr in Euro/Monat brutto, interval: Preisraster in Minuten.
 * Werte laut Preisblättern und Tarifseiten der Anbieter (Stand siehe stand); die App zeigt sie nur als Vorlage,
 * alle Felder sind änderbar. Bei Änderungen der Anbieter hier anpassen.
 */
export const DYNAMIC_PROVIDERS = [
  {
    id: 'awattar', name: 'aWATTar HOURLY', ct: 1.8, pct: 0, gp: 4.58, interval: 60, gpOnce: true,
    info: 'Börsenpreis als Stundenmittel + 1,50 ct netto',
    stand: 'November 2026', url: 'https://www.awattar.at/tariffs/hourly',
  },
  {
    id: 'smartenergy', name: 'smartENERGY smartCONTROL', ct: 1.44, pct: 0, gp: 2.99, interval: 60,
    info: 'Börsenpreis stündlich + Abwicklungsgebühr 1,20 ct netto',
    stand: 'Preisblatt ab Februar 2024', url: 'https://www.smartenergy.at/smartcontrol',
  },
  {
    id: 'verbund', name: 'VERBUND V-Strom Spot', ct: 1.56, pct: 4, gp: null, interval: 15,
    info: 'Börsenpreis + 4 % des Betrags + 1,30 ct netto; Grundpreis laut deinem Vertrag',
    stand: 'Produktblatt 2025', url: 'https://www.verbund.com/de-at/privatkunden/strom',
  },
  {
    id: 'oekostrom', name: 'oekostrom oekoSpot+', ct: 1.8, pct: 0, gp: 2.16, interval: 60,
    info: 'Börsenpreis stündlich + Abwicklungsgebühr 1,50 ct netto',
    stand: 'Produktblatt Oktober 2024', url: 'https://oekostrom.at/spot-preis/',
  },
  { id: 'other', name: 'Anderer Anbieter', ct: null, pct: 0, gp: null, interval: 15, info: 'Werte aus deinem Preisblatt eintragen' },
];
