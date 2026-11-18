// Darstellung einer Kostenrechnung (aus costs.js): Anteile, Aufstellung, Hinweise.
// Gemeinsam für die Übersicht (Verbrauch) und die Seite „Kosten“.
import { h } from './ui.js';
import { euro, num, kw } from './format.js';
import { STAND, POWER_TARIFF, VAT } from './netzdaten.js';

/** Summe brutto: Energie (falls Lieferantenpreis) + Netz + Steuern und Abgaben */
export const costTotal = (c) => (c.supplier ? c.supplier.total : 0) + c.gridGross + c.leviesGross;

/** Drei Blöcke für Balken, Legende und Diagramme (brutto) */
export function costParts(c, T) {
  return [
    c.supplier ? { id: 'energy', name: 'Energie (Lieferant)', value: c.supplier.total, color: T.s[0] } : null,
    { id: 'grid', name: 'Netz Burgenland', value: c.gridGross, color: T.s[1] },
    { id: 'levies', name: 'Steuern und Abgaben', value: c.leviesGross, color: T.s[2] },
  ].filter(Boolean);
}

/**
 * Aufstellung als Tabelle.
 * apSub: Untertitel zum Arbeitspreis (z. B. „3.500 kWh × 14,90 ct“), sonst die Menge
 * meters: Anzahl Zählpunkte (für „höchster Monat“ beim Leistungspreis)
 */
export function costTable(c, T, { apSub = null, meters = 1 } = {}) {
  const vat = 1 + VAT;
  const row = (label, value, sub, cls) => h('tr', { class: cls || '' }, h('td', {}, label, sub ? h('small', { text: sub }) : null), h('td', { class: 'num', text: value == null ? '–' : euro(value) }));
  const head = (label, value, color) => h('tr', { class: 'cost-group' }, h('th', { scope: 'row' }, h('span', { class: 'lg-key', style: `background:${color}` }), ' ', label), h('td', { class: 'num', text: value == null ? '–' : euro(value) }));
  const rows = [];
  if (c.supplier) {
    rows.push(head('Energie (Lieferant)', c.supplier.total, T.s[0]));
    rows.push(row('Arbeitspreis', c.supplier.energy, apSub || `${num(c.kwh, 0)} kWh`));
    if (c.supplier.base) rows.push(row('Grundpreis', c.supplier.base, null));
  }
  rows.push(head('Netz Burgenland', c.gridGross, T.s[1]));
  const lowParts = [];
  if (c.snapKwh > 0) lowParts.push(`${num(c.snapKwh, 0)} kWh im Sommer-Niedertarif`);
  if (c.winapKwh > 0) lowParts.push(`${num(c.winapKwh, 0)} kWh im Winter-Niedertarif`);
  rows.push(row('Netznutzung (Arbeit)', c.grid.usage * vat, lowParts.length ? `davon ${lowParts.join(' und ')}, ${euro(c.snapSaving + c.winapSaving)} günstiger` : null));
  if (c.grid.power) rows.push(row('Netznutzung (Leistung)', c.grid.power * vat, c.peakKw != null ? `höchste Viertelstunde ${kw(c.peakKw)}${c.powerMonths.length > meters ? ' (höchster Monat)' : ''}` : null));
  if (c.grid.base) rows.push(row('Netznutzung (Pauschale)', c.grid.base * vat, null));
  if (c.grid.metering) rows.push(row('Messentgelt', c.grid.metering * vat, null));
  if (c.grid.loss) rows.push(row('Netzverlust', c.grid.loss * vat, null));
  rows.push(head('Steuern und Abgaben', c.leviesGross, T.s[2]));
  rows.push(row('Elektrizitätsabgabe', c.levies.eAbgabe * vat, null));
  if (c.levies.pauschale) rows.push(row('Erneuerbaren-Förderpauschale', c.levies.pauschale * vat, null));
  rows.push(row('Erneuerbaren-Förderbeitrag', c.levies.beitrag * vat, null));
  rows.push(h('tr', { class: 'cost-total' }, h('th', { scope: 'row', text: c.supplier ? 'Summe' : 'Summe ohne Energie' }), h('td', { class: 'num', text: euro(costTotal(c)) })));
  return h('table', { class: 'tbl tbl--costs' }, h('tbody', {}, ...rows));
}

/** Hinweise zur Rechnung */
export function costNotes(c, { filtered = false, community = false } = {}) {
  const years = [...c.years].sort().join(', ');
  const notes = [`Alle Beträge inklusive 20 % USt (${euro(c.vat)} auf Netz und Abgaben). Netzpreise laut Preisblatt von Netz Burgenland ${years}, Stand ${STAND}.`];
  if (filtered) notes.push('Mit Filter nur die mengenabhängigen Kosten, ohne Pauschalen.');
  if (c.snapUnknown) notes.push('Den Sommer-Niedertarif (April bis September, 10–16 Uhr) kann Netzblick nur mit Viertelstundenwerten rechnen; wo sie fehlen, gilt der normale Arbeitspreis.');
  if (c.winapUnknown) notes.push('Den Winter-Niedertarif (ab Oktober 2027, 23–5 Uhr) rechnet Netzblick nur mit Viertelstundenwerten.');
  if (c.draft) notes.push(`Netzpreise 2027 mit Leistungspreis laut ${POWER_TARIFF.status}; die endgültigen Werte kommen Mitte Dezember 2026.`);
  if (c.peakUnknown) notes.push('Für einen Monat fehlt die höchste Viertelstunde, dieser Leistungspreis ist nicht enthalten.');
  if (c.approx) notes.push('Für Zeiträume ohne eigenes Preisblatt verwendet Netzblick die nächstgelegenen bekannten Preise.');
  if (community) notes.push('Strom aus deiner Energiegemeinschaft rechnet die Gemeinschaft ab. Die Portale liefern den Anteil nicht, darum zählt hier aller Strom als Netzbezug.');
  return notes;
}
