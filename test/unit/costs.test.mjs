import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meterCost, sumCosts, yearCost, inSnapWindow, daysByYear, forYear, supplierFor, tariffClassOf, projectCost } from '../../src/costs.js';
import { GRID, LEVIES } from '../../src/netzdaten.js';

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
    assert.ok(LEVIES[y], `Abgaben ${y} fehlen`);
  }
});

test('Kosten: Hochrechnung skaliert Menge und Fixkosten getrennt', () => {
  const c = meterCost([{ t: new Date(2026, 0, 10, 12), v: 100 }], { fine: true, from: new Date(2026, 0, 1), to: new Date(2026, 0, 11), supplier: { ap: 20, gp: 10 } });
  near(c.fixedGross, ((54 + 28.8 + 19.02 + 3.796) * (10 / 365)) * 1.2 + 120 * (10 / 365));
  const p = projectCost(c, { kwh: 300, days: 31, coveredDays: 10 });
  near(p, (c.total - c.fixedGross) * 3 + c.fixedGross * 3.1);
});
