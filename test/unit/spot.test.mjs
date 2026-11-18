// Börsenpreise und dynamischer Tarif
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpotStore, parseSpot, dynamicPrice, SPOT_URL, ZONES } from '../../src/spot.js';
import { meterCost, supplierFor, sumCosts, yearCost, anyDynamic } from '../../src/costs.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

/** Antwort wie von Energy-Charts: Tage [from, to] inklusive, Preis in EUR/MWh = f(t) */
function fakeResponse(from, to, step, f) {
  const t = [], p = [];
  for (let ms = from.getTime(); ms < to.getTime() + 86400000; ms += step) { t.push(ms / 1000); p.push(f(new Date(ms))); }
  return { unix_seconds: t, price: p, unit: 'EUR / MWh', license_info: 'CC BY 4.0' };
}
function fakeHttp(step = 900000, f = (d) => 100 + d.getHours()) {
  const calls = [];
  const http = async ({ url }) => {
    calls.push(url);
    const q = new URL(url).searchParams;
    const [ys, ms, ds] = q.get('start').split('-').map(Number);
    const [ye, me, de] = q.get('end').split('-').map(Number);
    return { status: 200, data: fakeResponse(new Date(ys, ms - 1, ds), new Date(ye, me - 1, de), step, f) };
  };
  return { http, calls };
}

test('Börsenpreise: Umrechnung EUR/MWh → Cent/kWh, Monate getrennt, Lücken', () => {
  const data = fakeResponse(new Date(2026, 9, 31), new Date(2026, 10, 1), 900000, (d) => (d.getDate() === 1 && d.getHours() === 3 ? null : 123.456));
  const m = parseSpot(data);
  assert.deepEqual(Object.keys(m), ['2026-10', '2026-11']);
  assert.equal(m['2026-10'].step, 900000);
  assert.equal(m['2026-10'].p.length, 96);
  near(m['2026-10'].p[0], 12.346, 1e-9);
  assert.equal(m['2026-11'].p[12], null);
  const hourly = parseSpot(fakeResponse(new Date(2025, 2, 1), new Date(2025, 2, 1), 3600000, () => 80));
  assert.equal(hourly['2025-03'].step, 3600000);
  assert.equal(hourly['2025-03'].p.length, 24);
});

test('Börsenpreise: eine Abfrage für alle fehlenden Monate, dann aus dem Speicher', async () => {
  localStorage.clear();
  const { http, calls } = fakeHttp();
  const now = new Date(2026, 10, 18, 15);
  const s = new SpotStore(http, { now: () => now });
  await s.ensure(new Date(2026, 8, 1), new Date(2026, 10, 19));
  assert.equal(calls.length, 1);
  assert.match(calls[0], new RegExp(`^${SPOT_URL.replace(/\./g, '\\.')}\\?bzn=AT&start=2026-09-01&end=2026-11-19$`));
  near(s.at(new Date(2026, 9, 5, 7, 20)), 10.7); // 107 EUR/MWh = 10,7 ct/kWh
  near(s.at(new Date(2026, 9, 5, 7, 20), 60), 10.7);
  near(s.dayAvg(new Date(2026, 9, 5)), (100 + 11.5) / 10);
  assert.equal(s.at(new Date(2026, 10, 20)), null); // übermorgen gibt es noch nicht
  // zweiter Aufruf: alles da, keine Abfrage; neuer Store liest aus dem Gerätespeicher
  await s.ensure(new Date(2026, 8, 1), new Date(2026, 10, 19));
  const s2 = new SpotStore(http, { now: () => now });
  await s2.ensure(new Date(2026, 8, 1), new Date(2026, 10, 1));
  assert.equal(calls.length, 1);
  near(s2.at(new Date(2026, 8, 30, 23, 45)), 12.3);
  // vor Oktober 2018 gibt es keine Preiszone AT: keine Abfrage
  await s2.ensure(new Date(2017, 0, 1), new Date(2018, 0, 1));
  assert.equal(calls.length, 1);
});

test('Börsenpreise: Dienst ausgelastet → Fehler, kein sofortiger erneuter Versuch', async () => {
  localStorage.clear();
  let n = 0;
  const http = async () => { n++; return { status: 429, data: 'Too Many Requests' }; };
  const s = new SpotStore(http, { now: () => new Date(2026, 10, 18, 15) });
  await assert.rejects(s.ensure(new Date(2026, 5, 1), new Date(2026, 6, 1)), /ausgelastet/);
  await s.ensure(new Date(2026, 5, 1), new Date(2026, 6, 1));
  assert.equal(n, 1);
});

test('Dynamischer Preis: Börse + Prozent auf den Betrag + Cent, mit USt', () => {
  // aWATTar HOURLY: EPEX + 1,5 ct netto → 10 ct Börse: (10 + 1,5) × 1,2 = 13,8
  near(dynamicPrice(10, { ct: 1.8, pct: 0 }), 13.8);
  // VERBUND Spot: EPEX + |EPEX| × 4 % + 1,30 ct netto; Beispiel aus dem Produktblatt: 9,971 → 11,67 netto / 14,00 brutto
  near(dynamicPrice(9.971, { ct: 1.3 * 1.2, pct: 4 }), 14.0, 0.01);
  // negativer Börsenpreis: Prozentaufschlag bleibt ein Aufschlag
  near(dynamicPrice(-3.902, { ct: 1.56, pct: 4 }), (-3.902 + 3.902 * 0.04) * 1.2 + 1.56);
});

test('Kosten mit dynamischem Tarif: je Viertelstunde, Stundenmittel, Tagesmittel, fehlende Preise', () => {
  const settings = { supplier: { all: { kind: 'dynamic', provider: 'awattar', ct: 1.8, pct: 0, gp: 5.75, interval: 15 }, meters: { WP: { ap: 20 } } } };
  const sup = supplierFor(settings, 'HAUS');
  assert.deepEqual(sup, { kind: 'dynamic', provider: 'awattar', ct: 1.8, pct: 0, gp: 5.75, interval: 15 });
  assert.equal(supplierFor(settings, 'WP').kind, 'fixed');
  assert.equal(anyDynamic(settings, ['WP']), false);
  assert.equal(anyDynamic(settings, ['WP', 'HAUS']), true);
  const spotAt = (t, iv) => (iv === 'day' ? 8 : t.getMinutes() === 0 ? 10 : t.getMinutes() === 15 ? 20 : null);
  const pts = [
    { t: new Date(2026, 10, 2, 3, 0), v: 1 },
    { t: new Date(2026, 10, 2, 3, 15), v: 2 },
    { t: new Date(2026, 10, 2, 3, 30), v: 0.5 }, // kein Preis
  ];
  const c = meterCost(pts, { fine: true, supplier: sup, spotAt });
  near(c.supplier.energy, (1 * (10 * 1.2 + 1.8) + 2 * (20 * 1.2 + 1.8)) / 100);
  assert.equal(c.supplier.missingKwh, 0.5);
  assert.equal(c.supplier.spotKwh, 3);
  near(c.supplier.spotSum / c.supplier.spotKwh, (10 + 40) / 3);
  assert.equal(c.supplier.dynamic, true);
  // Tageswerte: Tagesmittel, als Näherung markiert
  const d = meterCost([{ t: new Date(2026, 10, 2), v: 10 }], { fine: false, supplier: sup, spotAt });
  near(d.supplier.energy, (10 * (8 * 1.2 + 1.8)) / 100);
  assert.equal(d.supplier.spotApprox, true);
  // Hochrechnung mit festem Mittelwert, Grundgebühr 12 × 5,75
  const y = yearCost(3500, { year: 2026, supplier: sup, spotFlat: 9 });
  near(y.supplier.energy, (3500 * (9 * 1.2 + 1.8)) / 100);
  near(y.supplier.base, 12 * 5.75);
  const s = sumCosts([c, d]);
  assert.equal(s.supplier.dynamic, true);
  assert.equal(s.supplier.missingKwh, 0.5);
  assert.equal(s.supplier.spotApprox, true);
});

test('Börsenpreise: Stundenmittel aus vier Viertelstunden', async () => {
  localStorage.clear();
  const { http } = fakeHttp(900000, (d) => 100 + d.getMinutes()); // 0, 15, 30, 45 → Mittel 122,5 EUR/MWh
  const s = new SpotStore(http, { now: () => new Date(2026, 10, 18, 15) });
  await s.ensure(new Date(2026, 10, 1), new Date(2026, 10, 2));
  near(s.at(new Date(2026, 10, 1, 9, 30)), 13);
  near(s.at(new Date(2026, 10, 1, 9, 30), 60), 12.25);
  near(s.avg(new Date(2026, 10, 1), new Date(2026, 10, 2)), 12.25);
  assert.equal(s.series(new Date(2026, 10, 1, 9), new Date(2026, 10, 1, 10)).length, 4);
});

test('Börsenpreise: Wartezeit des Dienstes (Retry-After) wird übernommen', async () => {
  localStorage.clear();
  let n = 0;
  const ok = fakeHttp();
  const http = async (req) => { n++; return n === 1 ? { status: 429, data: '', headers: { 'retry-after': '1' } } : ok.http(req); };
  const s = new SpotStore(http, { now: () => new Date(2026, 10, 18, 15) });
  const err = await s.ensure(new Date(2026, 5, 1), new Date(2026, 6, 1)).catch((e) => e);
  assert.equal(err.busy, true);
  assert.equal(err.retryAfter, 1);
  await s.ensure(new Date(2026, 5, 1), new Date(2026, 6, 1));
  assert.equal(n, 1, 'vor Ablauf der Wartezeit nicht erneut fragen');
  await new Promise((r) => setTimeout(r, 1100));
  await s.ensure(new Date(2026, 5, 1), new Date(2026, 6, 1));
  assert.equal(n, 2);
  assert.ok(s.at(new Date(2026, 5, 3, 12)) != null);
});

test('Börsenpreise Nachbarländer: eigene Preiszone, eigener Speicher, nur wenige Monate', async () => {
  localStorage.clear();
  assert.deepEqual(ZONES.map((z) => z.id), ['AT', 'DE-LU', 'CH', 'CZ', 'HU', 'SI', 'IT-North']);
  const { http, calls } = fakeHttp(900000, () => 50);
  const now = () => new Date(2026, 10, 18, 15);
  const at = new SpotStore(http, { now });
  const de = new SpotStore(http, { now, bzn: 'DE-LU' });
  await de.ensure(new Date(2026, 10, 18), new Date(2026, 10, 19));
  assert.match(calls[0], /bzn=DE-LU&start=2026-11-01&end=2026-11-19$/);
  near(de.at(new Date(2026, 10, 18, 9)), 5);
  assert.equal(at.at(new Date(2026, 10, 18, 9)), null, 'Österreich bleibt getrennt');
  assert.ok(localStorage.getItem('nb.spot.DE-LU.2026-11'));
  assert.equal(localStorage.getItem('nb.spot.2026-11'), null);
  // höchstens drei Monate je Nachbarland
  for (const m of [7, 8, 9]) await de.ensure(new Date(2026, m, 5), new Date(2026, m, 6));
  assert.deepEqual(JSON.parse(localStorage.getItem('nb.spot.DE-LU.index')), ['2026-08', '2026-09', '2026-10']);
  assert.equal(localStorage.getItem('nb.spot.DE-LU.2026-11'), null);
});
