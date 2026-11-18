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
 *  Klassen: nm = nicht gemessene Leistung (Haushalt), u = unterbrechbar (z. B. Wärmepumpe)
 */
export const GRID = {
  2025: {
    nm: { lp: 48.0, ap: 7.26, snap: null, loss: 0 },
    u: { lp: 0, ap: 4.49, snap: null, loss: 0 },
  },
  2026: {
    nm: { lp: 54.0, ap: 8.46, snap: 6.77, loss: 0 },
    u: { lp: 0, ap: 5.3, snap: 4.24, loss: 0 },
  },
};

/** Entgelt für Messleistungen je Kalendermonat (netto) */
export const METERING = { three: 2.4, single: 1.0 }; // Drehstromzählung / Wechselstromzählung

/** Sommer-Niedertarif: April bis September, 10 bis 16 Uhr */
export const SNAP_WINDOW = { fromMonth: 3, toMonth: 8, fromHour: 10, toHour: 16 };

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

export const PRICE_SOURCES = [
  { label: 'Preisblatt Strom der Netz Burgenland (Downloadcenter)', url: 'https://netzburgenland.at/downloadcenter/' },
  { label: 'Netzpreis erklärt (Netz Burgenland)', url: 'https://netzburgenland.at/strom/netzpreis/' },
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
