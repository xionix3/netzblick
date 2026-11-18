// Kostenmodell Strom: Energie (Lieferant, brutto eingegeben) + Netz Burgenland + Steuern und Abgaben + USt
import { GRID, METERING, SNAP_WINDOW, LEVIES, VAT } from './netzdaten.js';

const DAY = 86400000;

/** Werte eines Jahres; außerhalb der Tabelle das nächstliegende Jahr (approx = true) */
export function forYear(table, year) {
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const y = Math.min(Math.max(year, years[0]), years[years.length - 1]);
  return { year: y, data: table[y], approx: y !== year };
}

/** Liegt der Zeitpunkt im Sommer-Niedertarif (1.4.–30.9., 10–16 Uhr)? */
export function inSnapWindow(t) {
  const m = t.getMonth();
  const h = t.getHours();
  return m >= SNAP_WINDOW.fromMonth && m <= SNAP_WINDOW.toMonth && h >= SNAP_WINDOW.fromHour && h < SNAP_WINDOW.toHour;
}

/** Tarifklasse aus dem Kundenportal: U = unterbrechbar, sonst Haushalt ohne Leistungsmessung */
export const tariffClassOf = (pod) => (pod && String(pod.tariffClass || '').toUpperCase() === 'U' ? 'u' : 'nm');

/** Tage je Kalenderjahr im Zeitraum [from, to) */
export function daysByYear(from, to) {
  const out = new Map();
  let t = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = to.getTime();
  while (t.getTime() < end) {
    const y = t.getFullYear();
    const next = new Date(y + 1, 0, 1);
    const stop = Math.min(next.getTime(), end);
    out.set(y, (out.get(y) || 0) + Math.round((stop - t.getTime()) / DAY));
    t = next;
  }
  return out;
}
const daysInYear = (y) => (new Date(y + 1, 0, 1) - new Date(y, 0, 1)) / DAY;

/**
 * Kosten eines Zählpunkts.
 * @param points  Messwerte [{t, v}] in kWh
 * @param o.fine        Viertelstundenwerte (nur dann ist der Sommer-Niedertarif genau)
 * @param o.from, o.to  Zeitraum für Fixkosten; ohne from/to keine Fixkosten (z. B. bei Filtern)
 * @param o.tariffClass 'nm' | 'u'
 * @param o.household   Haushalt (Lastprofil H0): ermäßigte Elektrizitätsabgabe 2026
 * @param o.supplier    {ap: Cent/kWh brutto, gp: Euro/Monat brutto} oder null
 * @param o.meterType   'three' (Drehstrom) | 'single' (Wechselstrom)
 */
export function meterCost(points, o = {}) {
  const cls = o.tariffClass === 'u' ? 'u' : 'nm';
  const household = o.household !== false;
  const r = {
    kwh: 0, snapKwh: 0, snapSaving: 0,
    grid: { usage: 0, loss: 0, base: 0, metering: 0 },
    levies: { eAbgabe: 0, pauschale: 0, beitrag: 0 },
    supplier: o.supplier && isFinite(o.supplier.ap) ? { energy: 0, base: 0 } : null,
    approx: false, snapUnknown: false, years: new Set(), fixedNet: 0,
  };
  for (const p of points) {
    if (p.v == null || !(p.v > 0)) continue;
    const y = p.t.getFullYear();
    const g = forYear(GRID, y);
    const l = forYear(LEVIES, y);
    r.approx = r.approx || g.approx || l.approx;
    r.years.add(g.year);
    const tariff = g.data[cls];
    let ap = tariff.ap;
    if (tariff.snap != null) {
      if (o.fine && inSnapWindow(p.t)) {
        ap = tariff.snap;
        r.snapKwh += p.v;
        r.snapSaving += (p.v * (tariff.ap - tariff.snap)) / 100;
      } else if (!o.fine && p.t.getMonth() >= SNAP_WINDOW.fromMonth && p.t.getMonth() <= SNAP_WINDOW.toMonth) {
        r.snapUnknown = true;
      }
    }
    r.kwh += p.v;
    r.grid.usage += (p.v * ap) / 100;
    r.grid.loss += (p.v * tariff.loss) / 100;
    r.levies.eAbgabe += (p.v * (household ? l.data.eAbgabe.household : l.data.eAbgabe.other)) / 100;
    const b = l.data.beitrag[cls];
    r.levies.beitrag += (p.v * (b.ap + b.loss)) / 100;
    if (r.supplier) r.supplier.energy += (p.v * o.supplier.ap) / 100;
  }
  if (o.from && o.to && o.to > o.from) {
    for (const [y, days] of daysByYear(o.from, o.to)) {
      const share = days / daysInYear(y);
      const g = forYear(GRID, y);
      const l = forYear(LEVIES, y);
      r.approx = r.approx || g.approx || l.approx;
      const base = g.data[cls].lp * share;
      const metering = (METERING[o.meterType === 'single' ? 'single' : 'three'] * 12) * share;
      const pauschale = l.data.pauschale * share;
      const beitragYear = l.data.beitrag[cls].year * share;
      r.grid.base += base;
      r.grid.metering += metering;
      r.levies.pauschale += pauschale;
      r.levies.beitrag += beitragYear;
      r.fixedNet += base + metering + pauschale + beitragYear;
      if (r.supplier) r.supplier.base += ((o.supplier.gp || 0) * 12) * share;
    }
  }
  return finish(r);
}

function finish(r) {
  r.grid.total = r.grid.usage + r.grid.loss + r.grid.base + r.grid.metering;
  r.levies.total = r.levies.eAbgabe + r.levies.pauschale + r.levies.beitrag;
  r.vat = (r.grid.total + r.levies.total) * VAT;
  r.gridGross = r.grid.total * (1 + VAT);
  r.leviesGross = r.levies.total * (1 + VAT);
  r.snapSaving *= 1 + VAT;
  if (r.supplier) r.supplier.total = r.supplier.energy + r.supplier.base;
  r.withoutSupplier = r.gridGross + r.leviesGross;
  // Fixanteil (zeitabhängig) und mengenabhängiger Anteil, für Hochrechnungen
  r.fixedGross = r.fixedNet * (1 + VAT) + (r.supplier ? r.supplier.base : 0);
  r.total = r.supplier ? r.supplier.total + r.withoutSupplier : null;
  return r;
}

/** Kosten mehrerer Zählpunkte addieren */
export function sumCosts(list) {
  const r = {
    kwh: 0, snapKwh: 0, snapSaving: 0,
    grid: { usage: 0, loss: 0, base: 0, metering: 0 },
    levies: { eAbgabe: 0, pauschale: 0, beitrag: 0 },
    supplier: list.length && list.every((x) => x.supplier) ? { energy: 0, base: 0 } : null,
    approx: false, snapUnknown: false, years: new Set(), fixedNet: 0,
  };
  for (const x of list) {
    r.fixedNet += x.fixedNet;
    r.kwh += x.kwh; r.snapKwh += x.snapKwh; r.snapSaving += x.snapSaving / (1 + VAT);
    for (const k of Object.keys(r.grid)) r.grid[k] += x.grid[k];
    for (const k of Object.keys(r.levies)) r.levies[k] += x.levies[k];
    if (r.supplier) { r.supplier.energy += x.supplier.energy; r.supplier.base += x.supplier.base; }
    r.approx = r.approx || x.approx;
    r.snapUnknown = r.snapUnknown || x.snapUnknown;
    x.years.forEach((y) => r.years.add(y));
  }
  return finish(r);
}

/** Jahreskosten für eine Verbrauchsmenge (Hochrechnung): Arbeitspreis ohne Sommer-Niedertarif */
export function yearCost(kwh, { year = new Date().getFullYear(), ...o } = {}) {
  const mid = new Date(year, 6, 1, 0, 0); // Juli 00:00 liegt außerhalb des Niedertarif-Fensters
  return meterCost([{ t: mid, v: kwh }], { ...o, fine: true, from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1) });
}

/** Lieferantenpreise eines Zählpunkts: eigene Werte, sonst die für alle */
export function supplierFor(settings, id) {
  const s = settings.supplier || {};
  const all = s.all || {};
  const own = (s.meters && s.meters[id]) || {};
  const ap = own.ap != null ? own.ap : all.ap;
  const gp = own.gp != null ? own.gp : all.gp;
  return ap != null && isFinite(ap) ? { ap, gp: gp != null && isFinite(gp) ? gp : 0 } : null;
}

/** Kosten auf einen längeren Zeitraum hochrechnen: Menge skaliert, Fixkosten nach Tagen */
export function projectCost(c, { kwh, days, coveredDays }) {
  const base = c.total != null ? c.total : c.withoutSupplier;
  if (base == null || !c.kwh || !coveredDays) return null;
  const variable = base - c.fixedGross;
  return variable * (kwh / c.kwh) + c.fixedGross * (days / coveredDays);
}
