import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meterCost, sumCosts, yearCost, inSnapWindow, inWinapWindow, daysByYear, forYear, supplierFor, tariffClassOf, projectCost, powerCharge, peaksByMonth, monthsIn, billingKw } from '../../src/costs.js';
import { GRID, LEVIES, POWER_TARIFF } from '../../src/netzdaten.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('Kosten: Sommer-Niedertarif 1.4.–30.9., 10–16 Uhr', () => {
  assert.equal(inSnapWindow(new Date(2026, 3, 1, 10, 0)), true);
  assert.equal(inSnapWindow(new Date(2026, 8, 30, 15, 45)), true);
  assert.equal(inSnapWindow(new Date(2026, 6, 1, 16, 0)), false);
  assert.equal(inSnapWindow(new Date(2026, 6, 1, 9, 45)), false);
  assert.equal(inSnapWindow(new Date(2026, 2, 31, 12, 0)), false);
  assert.equal(inSnapWindow(new Date(2026, 9, 1, 12, 0)), false);
});

test('Kosten: Netznutzung für 3.500 kWh entspricht der Grafik von Netz Burgenland (rund 350 € netto)', () => {
  const c = yearCost(3500, { year: 2026 });
  near(c.grid.usage + c.grid.base, 3500 * 0.0846 + 54, 1e-9);
  assert.ok(Math.abs(c.grid.usage + c.grid.base - 350) < 1);
});

test('Kosten: Arbeitspreis, Niedertarif und Ersparnis je Viertelstunde', () => {
  const winter = meterCost([{ t: new Date(2026, 0, 15, 12, 0), v: 1 }], { fine: true });
  near(winter.grid.usage, 0.0846);
  assert.equal(winter.snapKwh, 0);
  const summer = meterCost([{ t: new Date(2026, 6, 15, 12, 0), v: 1 }], { fine: true });
  near(summer.grid.usage, 0.0677);
  assert.equal(summer.snapKwh, 1);
  near(summer.snapSaving, (0.0846 - 0.0677) * 1.2);
  // Tageswerte: Niedertarif nicht bestimmbar, darum voller Arbeitspreis und Hinweis
  const daily = meterCost([{ t: new Date(2026, 6, 15), v: 1 }], { fine: false });
  near(daily.grid.usage, 0.0846);
  assert.equal(daily.snapUnknown, true);
});

test('Kosten: Fixkosten eines ganzen Jahres, Abgaben und USt', () => {
  const c = meterCost([], { from: new Date(2026, 0, 1), to: new Date(2027, 0, 1) });
  near(c.grid.base, 54);
  near(c.grid.metering, 2.4 * 12);
  near(c.levies.pauschale, 19.02);
  near(c.levies.beitrag, 3.796);
  near(c.vat, (54 + 28.8 + 19.02 + 3.796) * 0.2);
  assert.equal(c.total, null); // ohne Lieferantenpreis keine Gesamtsumme
  near(c.withoutSupplier, (54 + 28.8 + 19.02 + 3.796) * 1.2);
});

test('Kosten: Lieferant brutto, Netz und Abgaben netto plus 20 % USt', () => {
  const c = meterCost([{ t: new Date(2026, 0, 15, 12), v: 100 }], {
    fine: true, from: new Date(2026, 0, 1), to: new Date(2026, 1, 1), supplier: { ap: 20, gp: 6 },
  });
  near(c.supplier.energy, 20);
  near(c.supplier.base, 6 * 12 * (31 / 365));
  near(c.levies.eAbgabe, 0.1); // 2026 Haushalt 0,1 ct/kWh
  near(c.levies.beitrag, 100 * (0.583 + 0.037) / 100 + 3.796 * (31 / 365));
  near(c.total, c.supplier.total + (c.grid.total + c.levies.total) * 1.2);
});

test('Kosten: unterbrechbarer Tarif, Nicht-Haushalt und Jahre außerhalb der Tabelle', () => {
  const u = meterCost([{ t: new Date(2026, 0, 15, 12), v: 10 }], { fine: true, tariffClass: 'u', from: new Date(2026, 0, 1), to: new Date(2027, 0, 1) });
  near(u.grid.usage, 10 * 0.053);
  near(u.grid.base, 0);
  near(u.levies.beitrag, 10 * (0.347 + 0.037) / 100);
  const other = meterCost([{ t: new Date(2026, 0, 15, 12), v: 100 }], { household: false });
  near(other.levies.eAbgabe, 0.82);
  const y2025 = meterCost([{ t: new Date(2025, 5, 1, 12), v: 100 }], { fine: true });
  near(y2025.grid.usage, 7.26); // 2025 ohne Niedertarif
  near(y2025.levies.eAbgabe, 1.5);
  const y2027 = meterCost([{ t: new Date(2027, 0, 15, 12), v: 1 }], { fine: true });
  assert.equal(y2027.approx, true);
  assert.equal(forYear(GRID, 2019).year, 2025);
});

test('Kosten: Tage je Jahr, Summen über Zählpunkte, Lieferantenpreise je Zählpunkt', () => {
  assert.deepEqual([...daysByYear(new Date(2025, 11, 30), new Date(2026, 0, 3))], [[2025, 2], [2026, 2]]);
  const a = meterCost([{ t: new Date(2026, 0, 15, 12), v: 10 }], { fine: true, supplier: { ap: 20, gp: 0 } });
  const b = meterCost([{ t: new Date(2026, 6, 15, 12), v: 10 }], { fine: true, supplier: { ap: 15, gp: 0 } });
  const s = sumCosts([a, b]);
  near(s.kwh, 20);
  near(s.total, a.total + b.total);
  near(s.snapSaving, b.snapSaving);
  assert.equal(sumCosts([a, meterCost([], {})]).supplier, null);
  const settings = { supplier: { all: { ap: 20, gp: 5 }, meters: { X: { ap: 15 } } } };
  assert.deepEqual(supplierFor(settings, 'X'), { ap: 15, gp: 5 });
  assert.deepEqual(supplierFor(settings, 'Y'), { ap: 20, gp: 5 });
  assert.equal(supplierFor({}, 'Y'), null);
  assert.equal(tariffClassOf({ tariffClass: 'U' }), 'u');
  assert.equal(tariffClassOf({ tariffClass: 'N' }), 'nm');
  assert.equal(tariffClassOf(null), 'nm');
});

test('Netzdaten: jedes Jahr vollständig und plausibel', () => {
  for (const [y, g] of Object.entries(GRID)) {
    for (const cls of ['nm', 'u']) {
      assert.ok(g[cls].ap > 0 && g[cls].ap < 20, `${y} ${cls} ap`);
      assert.ok(g[cls].snap == null || g[cls].snap < g[cls].ap, `${y} ${cls} snap`);
    }
    assert.ok(LEVIES[y] || g.draft, `Abgaben ${y} fehlen`);
    assert.ok(g.metering && g.metering.three >= 0 && g.metering.single >= 0, `${y} Messentgelt`);
    if (g.nm.lpKw) {
      assert.ok(g.nm.lpKw.low > 0 && g.nm.lpKw.high > g.nm.lpKw.low, `${y} Leistungspreis`);
      assert.equal(g.nm.lp, 0, `${y}: Leistungspreis ersetzt die Pauschale`);
    }
  }
  assert.equal(POWER_TARIFF.limitKw, 10);
});

test('Kosten: Hochrechnung skaliert Menge und Fixkosten getrennt', () => {
  const c = meterCost([{ t: new Date(2026, 0, 10, 12), v: 100 }], { fine: true, from: new Date(2026, 0, 1), to: new Date(2026, 0, 11), supplier: { ap: 20, gp: 10 } });
  near(c.fixedGross, ((54 + 28.8 + 19.02 + 3.796) * (10 / 365)) * 1.2 + 120 * (10 / 365));
  const p = projectCost(c, { kwh: 300, days: 31, coveredDays: 10 });
  near(p, (c.total - c.fixedGross) * 3 + c.fixedGross * 3.1);
});

/* ------------------------------------------------------------------ Leistungspreis ab 2027 */
const Q = 900000;
/** Viertelstunden eines Monats mit gleichmäßiger Last, optional eine Spitze */
function monthQuarters(y, m, baseKw, peak) {
  const out = [];
  for (let t = new Date(y, m, 1).getTime(); t < new Date(y, m + 1, 1).getTime(); t += Q) out.push({ t: new Date(t), v: baseKw / 4, s: 'W' });
  if (peak) out[peak.index].v = peak.kw / 4;
  return out;
}

test('Leistungspreis: bis 10 kW niedriger Satz, Anteil darüber höherer Satz', () => {
  const lp = GRID[2027].nm.lpKw;
  near(powerCharge(7.4, lp), 7.4 * 3.4);
  near(powerCharge(10, lp), 34);
  near(powerCharge(12, lp), 34 + 2 * 5.1);
  near(powerCharge(10.004, lp), 34); // auf zwei Kommastellen gerundet
  assert.equal(billingKw(3.14159), 3.14);
  assert.equal(powerCharge(0, lp), 0);
  assert.equal(powerCharge(12, null), 0);
});

test('Leistungspreis: höchste Viertelstunde je Monat', () => {
  const pts = [...monthQuarters(2027, 0, 1, { index: 100, kw: 6 }), ...monthQuarters(2027, 1, 1, { index: 5, kw: 11.5 })];
  const peaks = peaksByMonth(pts);
  near(peaks.get('2027-01').kw, 6);
  near(peaks.get('2027-02').kw, 11.5);
  assert.equal(peaks.get('2027-02').t.getTime(), pts.find((p) => p.v === 11.5 / 4).t.getTime());
  const ms = monthsIn(new Date(2027, 0, 21), new Date(2027, 2, 1));
  assert.deepEqual(ms.map((m) => [m.key, m.days]), [['2027-01', 11], ['2027-02', 28]]);
  near(ms[0].share, 11 / 31);
});

test('Kosten 2027: Leistungspreis statt Pauschale und Messentgelt, Monat für Monat', () => {
  const pts = monthQuarters(2027, 0, 0.5, { index: 2000, kw: 12 });
  const c = meterCost(pts, { fine: true, from: new Date(2027, 0, 1), to: new Date(2027, 1, 1) });
  near(c.grid.power, 34 + 2 * 5.1);
  assert.equal(c.grid.base, 0);
  assert.equal(c.grid.metering, 0);
  assert.equal(c.peakKw, 12);
  assert.equal(c.draft, true);
  const kwh = pts.reduce((a, p) => a + p.v, 0);
  near(c.grid.usage, (kwh * 6.6) / 100, 1e-9);
  // Teilmonat: anteilig nach Tagen
  const part = meterCost(pts.filter((p) => p.t < new Date(2027, 0, 11)), { fine: true, from: new Date(2027, 0, 1), to: new Date(2027, 0, 11) });
  near(part.grid.power, 0.5 * 3.4 * (10 / 31)); // Spitze erst am 21., bis dahin 0,5 kW
  // unterbrechbar: kein Leistungspreis
  const u = meterCost(pts, { fine: true, tariffClass: 'u', from: new Date(2027, 0, 1), to: new Date(2027, 1, 1) });
  assert.equal(u.grid.power, 0);
  assert.equal(u.peakUnknown, false);
});

test('Kosten 2027: ohne Viertelstundenwerte Spitzen von außen, sonst als unbekannt markiert', () => {
  const days = [{ t: new Date(2027, 2, 5), v: 12 }];
  const unknown = meterCost(days, { fine: false, from: new Date(2027, 2, 1), to: new Date(2027, 3, 1) });
  assert.equal(unknown.peakUnknown, true);
  assert.equal(unknown.grid.power, 0);
  const known = meterCost(days, { fine: false, from: new Date(2027, 2, 1), to: new Date(2027, 3, 1), peaks: new Map([['2027-03', 8.5]]) });
  near(known.grid.power, 8.5 * 3.4);
  assert.equal(known.peakUnknown, false);
  // 2026 kennt keinen Leistungspreis
  const old = meterCost([{ t: new Date(2026, 2, 5), v: 12 }], { fine: false, from: new Date(2026, 2, 1), to: new Date(2026, 3, 1) });
  assert.equal(old.grid.power, 0);
  assert.equal(old.peakUnknown, false);
  assert.ok(old.grid.metering > 0);
});

test('Kosten 2027: Winter-Niedertarif erst ab 1. Oktober 2027, 23–5 Uhr', () => {
  assert.equal(inWinapWindow(new Date(2027, 0, 10, 23, 30)), false);
  assert.equal(inWinapWindow(new Date(2027, 9, 1, 23, 0)), true);
  assert.equal(inWinapWindow(new Date(2027, 10, 2, 4, 45)), true);
  assert.equal(inWinapWindow(new Date(2027, 10, 2, 5, 0)), false);
  assert.equal(inWinapWindow(new Date(2028, 2, 31, 2, 0)), true);
  assert.equal(inWinapWindow(new Date(2028, 3, 1, 2, 0)), false);
  const night = meterCost([{ t: new Date(2027, 10, 2, 23, 15), v: 1 }], { fine: true });
  near(night.grid.usage, 0.0528);
  assert.equal(night.winapKwh, 1);
  near(night.winapSaving, (0.066 - 0.0528) * 1.2);
  const jan = meterCost([{ t: new Date(2027, 0, 2, 23, 15), v: 1 }], { fine: true });
  near(jan.grid.usage, 0.066);
});

test('Kosten 2027: Jahreshochrechnung mit gleicher Monatsspitze', () => {
  const c = yearCost(3500, { year: 2027, peakKw: 5 });
  near(c.grid.power, 12 * 5 * 3.4);
  near(c.grid.usage, 3500 * 0.066);
  assert.equal(c.grid.base + c.grid.metering, 0);
  assert.equal(c.snapUnknown, false);
  const none = yearCost(3500, { year: 2027 });
  assert.equal(none.peakUnknown, true);
  // sumCosts übernimmt Leistung und höchste Spitze
  const s = sumCosts([c, yearCost(1000, { year: 2027, peakKw: 11, tariffClass: 'nm' })]);
  near(s.grid.power, 12 * 5 * 3.4 + 12 * (34 + 5.1));
  assert.equal(s.peakKw, 11);
});

test('Seite Kosten: Monat für Monat ergibt dieselbe Jahressumme wie das ganze Jahr auf einmal', () => {
  const opts = { supplier: { ap: 14.9, gp: 3 }, household: true };
  for (const y of [2026, 2027]) {
    const months = Array.from({ length: 12 }, (_, m) => monthQuarters(y, m, 0.3 + (m % 4) * 0.2, { index: 1500 + m, kw: 4 + m }));
    const all = months.flat();
    const whole = meterCost(all, { fine: true, from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1), ...opts });
    const parts = sumCosts(months.map((pts, m) => meterCost(pts, { fine: true, from: new Date(y, m, 1), to: new Date(y, m + 1, 1), ...opts })));
    near(parts.total, whole.total, 1e-6);
    near(parts.snapSaving, whole.snapSaving, 1e-9);
    near(parts.grid.power, whole.grid.power, 1e-9);
    near(parts.supplier.base, 36, 1e-9); // 12 × 3 €
  }
});
