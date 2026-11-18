// Kostenmodell Strom: Energie (Lieferant, brutto eingegeben) + Netz Burgenland + Steuern und Abgaben + USt
import { GRID, SNAP_WINDOW, WINAP_WINDOW, POWER_TARIFF, LEVIES, VAT } from './netzdaten.js';

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

/** Liegt der Zeitpunkt im Winter-Niedertarif (1.10.–31.3., 23–5 Uhr, ab 1.10.2027)? */
export function inWinapWindow(t) {
  if (t < WINAP_WINDOW.since) return false;
  const m = t.getMonth();
  const h = t.getHours();
  return (m >= WINAP_WINDOW.fromMonth || m <= WINAP_WINDOW.toMonth) && (h >= WINAP_WINDOW.fromHour || h < WINAP_WINDOW.toHour);
}

/* ------------------------------------------------------------------ Leistungspreis */
export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Verrechnungsleistung: kW auf zwei Kommastellen gerundet */
export const billingKw = (kw) => Math.round(kw * 100) / 100;

/** Leistungspreis eines Monats in Euro netto: Anteil bis zur Grenze zum niedrigen, darüber zum höheren Satz */
export function powerCharge(kw, lpKw, limit = POWER_TARIFF.limitKw) {
  if (!lpKw || kw == null || !(kw > 0)) return 0;
  const p = billingKw(kw);
  return Math.min(p, limit) * lpKw.low + Math.max(p - limit, 0) * lpKw.high;
}

/** Höchste Viertelstunde je Monat aus Viertelstundenwerten (kWh) → Map 'JJJJ-MM' → {kw, t} */
export function peaksByMonth(points) {
  const out = new Map();
  for (const p of points) {
    if (p.v == null) continue;
    const kw = p.v * 4;
    const k = monthKey(p.t);
    const e = out.get(k);
    if (!e || kw > e.kw) out.set(k, { kw, t: p.t });
  }
  return out;
}

/** Monate, die [from, to) berühren: [{key, start, end, days, share}] */
export function monthsIn(from, to) {
  const out = [];
  let m = new Date(from.getFullYear(), from.getMonth(), 1);
  while (m < to) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const a = from > m ? from : m;
    const b = to < next ? to : next;
    const days = Math.round((b - a) / DAY);
    const all = Math.round((next - m) / DAY);
    if (days > 0) out.push({ key: monthKey(m), start: m, end: next, days, share: days / all });
    m = next;
  }
  return out;
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
 * @param o.peaks       Map 'JJJJ-MM' → kW (höchste Viertelstunde), für den Leistungspreis ohne Viertelstundenwerte
 * @param o.finePeaks   false: Spitzen nicht aus den Punkten ableiten (z. B. eine Jahresmenge als ein Punkt)
 */
export function meterCost(points, o = {}) {
  const cls = o.tariffClass === 'u' ? 'u' : 'nm';
  const household = o.household !== false;
  const r = emptyCost(o.supplier && isFinite(o.supplier.ap));
  const finePeaks = new Map();
  for (const p of points) {
    if (p.v == null) continue;
    const y = p.t.getFullYear();
    const g = forYear(GRID, y);
    const tariff = g.data[cls];
    if (o.fine && o.finePeaks !== false && tariff.lpKw) {
      const k = monthKey(p.t);
      const kw = p.v * 4;
      if (!finePeaks.has(k) || kw > finePeaks.get(k)) finePeaks.set(k, kw);
    }
    if (!(p.v > 0)) continue;
    const l = forYear(LEVIES, y);
    r.approx = r.approx || g.approx || l.approx;
    r.draft = r.draft || !!g.data.draft;
    r.years.add(g.year);
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
    if (tariff.winap != null && ap === tariff.ap && p.t >= WINAP_WINDOW.since) {
      if (o.fine && inWinapWindow(p.t)) {
        ap = tariff.winap;
        r.winapKwh += p.v;
        r.winapSaving += (p.v * (tariff.ap - tariff.winap)) / 100;
      } else if (!o.fine && (p.t.getMonth() >= WINAP_WINDOW.fromMonth || p.t.getMonth() <= WINAP_WINDOW.toMonth)) {
        r.winapUnknown = true;
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
      r.draft = r.draft || !!g.data.draft;
      const base = g.data[cls].lp * share;
      const metering = (g.data.metering[o.meterType === 'single' ? 'single' : 'three'] * 12) * share;
      const pauschale = l.data.pauschale * share;
      const beitragYear = l.data.beitrag[cls].year * share;
      r.grid.base += base;
      r.grid.metering += metering;
      r.levies.pauschale += pauschale;
      r.levies.beitrag += beitragYear;
      r.fixedNet += base + metering + pauschale + beitragYear;
      if (r.supplier) r.supplier.base += ((o.supplier.gp || 0) * 12) * share;
    }
    // Leistungspreis: je Monat die höchste Viertelstunde, anteilig nach Tagen im Zeitraum
    for (const m of monthsIn(o.from, o.to)) {
      const g = forYear(GRID, m.start.getFullYear());
      const lpKw = g.data[cls].lpKw;
      if (!lpKw || m.start < POWER_TARIFF.since) continue;
      const kw = finePeaks.has(m.key) ? finePeaks.get(m.key) : o.peaks && o.peaks.get(m.key) != null ? o.peaks.get(m.key) : null;
      if (kw == null) { r.peakUnknown = true; continue; }
      const charge = powerCharge(kw, lpKw) * m.share;
      r.grid.power += charge;
      r.fixedNet += charge;
      r.powerMonths.push({ key: m.key, kw: billingKw(kw), charge, share: m.share });
      if (r.peakKw == null || kw > r.peakKw) r.peakKw = billingKw(kw);
    }
  }
  return finish(r);
}

function emptyCost(withSupplier) {
  return {
    kwh: 0, snapKwh: 0, snapSaving: 0, winapKwh: 0, winapSaving: 0,
    grid: { usage: 0, loss: 0, base: 0, metering: 0, power: 0 },
    levies: { eAbgabe: 0, pauschale: 0, beitrag: 0 },
    supplier: withSupplier ? { energy: 0, base: 0 } : null,
    approx: false, draft: false, snapUnknown: false, winapUnknown: false, peakUnknown: false,
    peakKw: null, powerMonths: [], years: new Set(), fixedNet: 0,
  };
}

function finish(r) {
  r.grid.total = r.grid.usage + r.grid.loss + r.grid.base + r.grid.metering + r.grid.power;
  r.levies.total = r.levies.eAbgabe + r.levies.pauschale + r.levies.beitrag;
  r.vat = (r.grid.total + r.levies.total) * VAT;
  r.gridGross = r.grid.total * (1 + VAT);
  r.leviesGross = r.levies.total * (1 + VAT);
  r.snapSaving *= 1 + VAT;
  r.winapSaving *= 1 + VAT;
  if (r.supplier) r.supplier.total = r.supplier.energy + r.supplier.base;
  r.withoutSupplier = r.gridGross + r.leviesGross;
  // Fixanteil (zeitabhängig) und mengenabhängiger Anteil, für Hochrechnungen
  r.fixedGross = r.fixedNet * (1 + VAT) + (r.supplier ? r.supplier.base : 0);
  r.total = r.supplier ? r.supplier.total + r.withoutSupplier : null;
  return r;
}

/** Kosten mehrerer Zählpunkte addieren */
export function sumCosts(list) {
  const r = emptyCost(list.length > 0 && list.every((x) => x.supplier));
  for (const x of list) {
    r.fixedNet += x.fixedNet;
    r.kwh += x.kwh; r.snapKwh += x.snapKwh; r.snapSaving += x.snapSaving / (1 + VAT);
    r.winapKwh += x.winapKwh; r.winapSaving += x.winapSaving / (1 + VAT);
    for (const k of Object.keys(r.grid)) r.grid[k] += x.grid[k];
    for (const k of Object.keys(r.levies)) r.levies[k] += x.levies[k];
    if (r.supplier) { r.supplier.energy += x.supplier.energy; r.supplier.base += x.supplier.base; }
    r.approx = r.approx || x.approx;
    r.snapUnknown = r.snapUnknown || x.snapUnknown;
    r.winapUnknown = r.winapUnknown || x.winapUnknown;
    r.peakUnknown = r.peakUnknown || x.peakUnknown;
    r.draft = r.draft || x.draft;
    if (x.peakKw != null && (r.peakKw == null || x.peakKw > r.peakKw)) r.peakKw = x.peakKw;
    r.powerMonths.push(...x.powerMonths);
    x.years.forEach((y) => r.years.add(y));
  }
  return finish(r);
}

/**
 * Jahreskosten für eine Verbrauchsmenge (Hochrechnung): Arbeitspreis ohne Niedertarife.
 * peakKw: höchste Viertelstunde je Monat (eine Zahl für alle Monate oder Map 'MM' → kW), für den Leistungspreis
 */
export function yearCost(kwh, { year = new Date().getFullYear(), peakKw = null, ...o } = {}) {
  const mid = new Date(year, 6, 1, 0, 0); // Juli 00:00 liegt außerhalb der Niedertarif-Fenster
  let peaks = null;
  if (peakKw != null) {
    peaks = new Map();
    for (let m = 0; m < 12; m++) {
      const v = typeof peakKw === 'number' ? peakKw : peakKw.get(String(m + 1).padStart(2, '0'));
      if (v != null) peaks.set(monthKey(new Date(year, m, 1)), v);
    }
  }
  return meterCost([{ t: mid, v: kwh }], { ...o, fine: true, finePeaks: false, peaks, from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1) });
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
