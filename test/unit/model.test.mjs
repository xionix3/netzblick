import { quarters, fakeHttp, MemoryStorage } from './setup.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  meterPointsFrom, meterLabel, firstDataDate, DataStore, mergeSum, aggregate, seriesOnAxis, bucketAxis, applyFilters, filtersActive,
  computeStats, likeForLikeCut, forecast, dailyProfile, carpet, weekdayAverages, monthsByYear, DEFAULT_FILTERS, loadView,
} from '../../src/model.js';
import { makePeriod, addDays } from '../../src/time.js';
import { cacheClear } from '../../src/cache.js';
import { PortalApi } from '../../src/api.js';
import { ACCOUNT, MP1, MP2, seriesResponse } from './fixtures.mjs';

const d = (s) => new Date(s + 'T00:00:00');

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  cacheClear();
});

/* ------------------------------------------------------------ Zählpunkte */

test('Zählpunkte: Bilanz-Duplikate werden ignoriert, Register richtig zugeordnet', () => {
  const mps = meterPointsFrom([ACCOUNT]);
  assert.equal(mps.length, 2);
  const [a] = mps;
  assert.equal(a.id, MP1);
  assert.equal(a.accountId, ACCOUNT.identifier);
  assert.deepEqual(Object.keys(a.flows), ['consumption']);
  assert.equal(a.flows.consumption.q15.id, '1-0:1.8.0*H15');
  assert.deepEqual(a.flows.consumption.daily.map((r) => r.id), ['1-0:1.8.1*H24', '1-0:1.8.2*H24']);
  assert.equal(meterLabel(a), MP1); // Standard: Zählpunktnummer wie im Smart-Meter-Portal
  assert.equal(meterLabel(a, {}, { compact: true }), `${MP1.slice(0, 6)}…${MP1.slice(-8)}`);
  assert.equal(meterLabel(a, { [MP1]: 'Haus' }), 'Haus');
  assert.equal(firstDataDate(mps, 'consumption').toISOString(), '2018-06-25T22:00:00.000Z');
});

test('Zählpunkte: nur Bilanz-Einträge vorhanden → werden trotzdem genutzt; Einspeisung (2.8.x) erkannt', () => {
  const onlyBalance = { ...ACCOUNT, operModesAtMeterPts: ACCOUNT.operModesAtMeterPts.filter((o) => o.category === 'Balance') };
  assert.equal(meterPointsFrom([onlyBalance]).length, 2);
  const withFeedin = structuredClone(ACCOUNT);
  withFeedin.operModesAtMeterPts[0].valueIdentifiers.push({ identifier: '1-0:2.8.0*H15', type: 'MeterReadingSequence', measuringIntervalSeconds: 900, isActiveEnergy: true, startTimestamp: '2024-01-01T00:00:00Z', endTimestamp: '2100-01-01T00:00:00Z' });
  const mp = meterPointsFrom([withFeedin])[0];
  assert.deepEqual(Object.keys(mp.flows).sort(), ['consumption', 'feedin']);
  assert.equal(mp.flows.feedin.q15.id, '1-0:2.8.0*H15');
});

/* ------------------------------------------------------------ Laden */

function storeWith(routes) {
  const http = fakeHttp(routes);
  const api = new PortalApi(http);
  api.useAccounts([ACCOUNT]);
  return { store: new DataStore(api), http };
}
const valueRoute = (fn) => [/values\/normal$/, (req) => {
  const u = new URL(req.url);
  return { status: 200, data: fn(u.searchParams.get('valueIdentifier'), u.searchParams.get('timeParameter'), u) };
}];

test('Laden: 15-min-Register, wenn es den Zeitraum abdeckt; Ergebnis wird zwischengespeichert', async () => {
  const { store, http } = storeWith([valueRoute((vid) => seriesResponse(vid, [{ start: '2026-11-15T00:00:00+01:00', end: '2026-11-15T00:15:00+01:00', value: 0.2 }]))]);
  const mp = meterPointsFrom([ACCOUNT])[0];
  const r1 = await store.load(mp, 'consumption', d('2026-11-15'), d('2026-11-16'), 'original');
  assert.equal(r1.source, '1-0:1.8.0*H15');
  assert.equal(r1.fine, true);
  await store.load(mp, 'consumption', d('2026-11-15'), d('2026-11-16'), 'original');
  assert.equal(http.calls.length, 1, 'zweiter Aufruf kommt aus dem Cache');
});

test('Laden: vor Beginn der 15-min-Daten werden Tarif 1 + Tarif 2 summiert', async () => {
  const { store, http } = storeWith([valueRoute((vid) => {
    if (vid.endsWith('1.8.2*H24')) return seriesResponse(vid, [{ start: '2023-01-01T00:00:00+01:00', end: '2023-01-02T00:00:00+01:00', value: 4 }]);
    return seriesResponse(vid, [{ start: '2023-01-01T00:00:00+01:00', end: '2023-01-02T00:00:00+01:00', value: 10, status: 'E' }]);
  })]);
  const mp = meterPointsFrom([ACCOUNT])[0];
  const r = await store.load(mp, 'consumption', d('2023-01-01'), d('2023-02-01'), 'original');
  assert.equal(r.fine, false);
  assert.equal(r.source, '1-0:1.8.1*H24+1-0:1.8.2*H24');
  assert.equal(r.points.length, 1);
  assert.equal(r.points[0].v, 14);
  assert.equal(r.points[0].s, 'E', 'schlechtester Status gewinnt');
  assert.ok(http.calls.every((c) => new URL(c.url).searchParams.get('timeParameter') === 'daily'));
});

test('Laden: bei Netzfehler werden ältere zwischengespeicherte Werte geliefert', async () => {
  let fail = false;
  const { store } = storeWith([valueRoute((vid) => {
    if (fail) throw new Error('offline');
    return seriesResponse(vid, [{ start: '2026-11-15T00:00:00+01:00', end: '2026-11-15T00:15:00+01:00', value: 0.3 }]);
  })]);
  const mp = meterPointsFrom([ACCOUNT])[0];
  const now = new Date();
  const from = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), -1);
  await store.load(mp, 'consumption', from, addDays(from, 1), 'original');
  fail = true;
  const r = await store.load(mp, 'consumption', from, addDays(from, 1), 'original', { force: true });
  assert.equal(r.points[0].v, 0.3);
  assert.equal(store.lastStale, true);
});

test('loadView: mehrere Zählpunkte, Vergleichszeitraum, Spitzenleistung vom Server bei Jahresansicht', async () => {
  const { store, http } = storeWith([
    valueRoute((vid) => seriesResponse(vid, [{ start: '2026-01-01T00:00:00+01:00', end: '2026-01-02T00:00:00+01:00', value: 5 }])),
    [/maxPower/, () => ({ status: 200, data: { value: 9.5, startTimestamp: '2026-03-01T10:00:00+00:00', status: 'W' } })],
  ]);
  const mps = meterPointsFrom([ACCOUNT]);
  const view = await loadView(store, { mps, flow: 'consumption', period: makePeriod('year', d('2026-06-01')), compareMode: 'yoy' });
  assert.equal(view.perMp.length, 2);
  assert.equal(view.res, 'daily');
  assert.equal(view.bucket, 'month');
  assert.equal(view.fine, false);
  assert.equal(view.comparePeriod.start.getFullYear(), 2025);
  assert.equal(view.perMp[0].peak.kw, 9.5);
  assert.ok(http.calls.some((c) => c.url.includes('maxPower')));
});

/* ------------------------------------------------------------ Aggregation */

test('mergeSum: summiert, behandelt fehlende Werte und sortiert', () => {
  const t1 = new Date('2026-11-01T00:00:00'), t2 = new Date('2026-11-02T00:00:00');
  const m = mergeSum([[{ t: t2, v: 1, s: 'W' }, { t: t1, v: null, s: 'F' }], [{ t: t1, v: 2, s: 'W' }, { t: t2, v: null, s: 'W' }]]);
  assert.deepEqual(m.map((p) => [p.t.getTime(), p.v]), [[t1.getTime(), 2], [t2.getTime(), 1]]);
  assert.equal(m[0].s, 'F');
});

test('aggregate: fehlende Zukunftswerte färben einen Tag nicht als Ersatzwert', () => {
  const pts = quarters(new Date('2026-11-16T00:00:00'), new Date('2026-11-17T00:00:00'), (t) => (t.getHours() < 8 ? 0.1 : null), (t) => (t.getHours() < 8 ? 'W' : 'F'));
  const day = aggregate(pts, 'day').get(new Date('2026-11-16T00:00:00').getTime());
  assert.equal(day.s, 'W');
  assert.equal(Math.round(day.v * 10) / 10, 3.2);
  const withE = [...pts];
  withE[3] = { ...withE[3], s: 'E' };
  assert.equal(aggregate(withE, 'day').get(new Date('2026-11-16T00:00:00').getTime()).s, 'E');
});

test('bucketAxis: Viertelstunden an Tagen mit Zeitumstellung', () => {
  assert.equal(bucketAxis(makePeriod('day', d('2026-10-25')), 'quarter').length, 100);
  assert.equal(bucketAxis(makePeriod('day', d('2026-03-29')), 'quarter').length, 92);
  assert.equal(bucketAxis(makePeriod('day', d('2026-11-15')), 'quarter').length, 96);
  assert.equal(bucketAxis(makePeriod('year', d('2026-01-01')), 'month').length, 12);
  const axis = bucketAxis(makePeriod('month', d('2026-02-01')), 'day');
  const s = seriesOnAxis([{ t: new Date('2026-02-03T12:00:00'), v: 2, s: 'W' }], axis, 'day');
  assert.equal(s.length, 28);
  assert.equal(s[2].v, 2);
  assert.equal(s[3].v, null);
});

/* ------------------------------------------------------------ Filter */

test('Filter: Wochentage und Tageszeit über Mitternacht (22–6 Uhr)', () => {
  const pts = quarters(new Date('2026-11-16T00:00:00'), new Date('2026-11-23T00:00:00'), () => 0.25); // Mo–So
  assert.equal(filtersActive(DEFAULT_FILTERS), false);
  const weekend = applyFilters(pts, { weekdays: [false, false, false, false, false, true, true], hours: [0, 24] }, true);
  assert.equal(weekend.length, 2 * 96);
  const nights = applyFilters(pts, { weekdays: [true, true, true, true, true, true, true], hours: [22, 6] }, true);
  assert.equal(nights.length, 7 * 8 * 4);
  assert.ok(nights.every((p) => p.t.getHours() >= 22 || p.t.getHours() < 6));
  // Tageswerte: Tageszeit-Filter wird ignoriert, Wochentag wirkt
  const daily = [{ t: new Date('2026-11-16T00:00:00'), v: 5, s: 'W' }, { t: new Date('2026-11-21T00:00:00'), v: 7, s: 'W' }];
  assert.equal(applyFilters(daily, { weekdays: [true, true, true, true, true, false, false], hours: [22, 6] }, false).length, 1);
});

/* ------------------------------------------------------------ Kennzahlen */

test('Kennzahlen aus Viertelstundenwerten', () => {
  // 2 Tage: Grundlast 0,2 kW, jeden Tag 18:00–19:00 4 kW
  const pts = quarters(new Date('2026-11-10T00:00:00'), new Date('2026-11-12T00:00:00'), (t) => (t.getHours() === 18 ? 1 : 0.05));
  const s = computeStats(pts, 'original');
  assert.equal(s.days, 2);
  assert.equal(Math.round(s.total * 100) / 100, 17.2); // 2 Tage × (92 × 0,05 + 4 × 1)
  assert.equal(s.peak.kw, 4);
  assert.equal(s.peak.t.getHours(), 18);
  assert.equal(Math.round(s.baseLoad * 1000), 200);
  // nachts (22–6 Uhr) nur Grundlast: 32 × 0,05 kWh von 8,6 kWh pro Tag
  assert.equal(Math.round(s.nightShare * 1000) / 1000, Math.round((1.6 / 8.6) * 1000) / 1000);
});

test('Kennzahlen: Zukunft zählt nicht als fehlend, Lücken davor schon; Tage bei Monatswerten', () => {
  const pts = quarters(new Date('2026-11-16T00:00:00'), new Date('2026-11-17T00:00:00'), (t) => (t.getHours() < 12 ? 0.1 : null), (t) => (t.getHours() < 12 ? 'W' : 'F'));
  pts[4] = { ...pts[4], v: null, s: 'F' }; // echte Lücke um 01:00
  const s = computeStats(pts, 'original');
  assert.deepEqual(s.status, { F: 1 });
  assert.equal(s.count, 47);
  const monthly = [{ t: new Date('2026-01-01T00:00:00'), v: 300, s: 'W' }, { t: new Date('2026-02-01T00:00:00'), v: 280, s: 'W' }];
  assert.equal(computeStats(monthly, 'monthly').days, 59);
  assert.equal(Math.round(computeStats(monthly, 'monthly').avgPerDay * 100) / 100, Math.round((580 / 59) * 100) / 100);
});

test('Vergleich „bis zum gleichen Zeitpunkt“ nur bei laufenden Zeiträumen', () => {
  const now = new Date();
  const cur = makePeriod('month', now);
  const prev = makePeriod('month', new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const yesterday = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), -1);
  const pts = [{ t: yesterday > cur.start ? yesterday : cur.start, v: 1, s: 'W' }];
  const cut = likeForLikeCut(cur, prev, pts, false);
  assert.ok(cut instanceof Date);
  const past = makePeriod('month', new Date(2025, 0, 1));
  assert.equal(likeForLikeCut(past, makePeriod('month', new Date(2024, 11, 1)), [{ t: new Date(2025, 0, 5), v: 1, s: 'W' }], false), null);
});

test('Hochrechnung erst ab genügend Daten', () => {
  const cur = makePeriod('month', new Date());
  assert.equal(forecast(cur, { avgPerDay: 10, days: 1 }), null);
  const days = Math.round((cur.end - cur.start) / 86400000);
  const fc = forecast(cur, { avgPerDay: 10, days: 3 });
  if (days > 3) assert.equal(fc, 10 * days);
  assert.equal(forecast(makePeriod('month', new Date(2020, 0, 1)), { avgPerDay: 10, days: 20 }), null);
});

/* ------------------------------------------------------------ Analysen */

test('Tagesverlauf trennt Werktage und Wochenende', () => {
  const pts = quarters(new Date('2026-11-16T00:00:00'), new Date('2026-11-23T00:00:00'), (t) => ((t.getDay() + 6) % 7 >= 5 ? 0.5 : 0.25));
  const p = dailyProfile(pts);
  assert.equal(p.weekday.length, 96);
  assert.equal(p.weekday[40], 1);
  assert.equal(p.weekend[40], 2);
});

test('Lastgang-Teppich: Stunde der Zeitumstellung wird gemittelt, Zukunftstage fehlen', () => {
  const period = makePeriod('week', d('2026-10-19'));
  const pts = quarters(period.start, new Date('2026-10-26T00:00:00'), () => 0.25); // bis Sonntag, 1 kW
  const cp = carpet(pts, period);
  assert.equal(cp.days.length, 7);
  const cellsDst = cp.cells.filter((c) => c[1] === 6 && c[0] === 2); // Sonntag 2 Uhr (doppelt)
  assert.equal(cellsDst.length, 1);
  assert.equal(cellsDst[0][2], 1, 'mittlere Leistung bleibt 1 kW, auch bei 8 Viertelstunden');
  const partial = carpet(pts.slice(0, 96 * 3), period);
  assert.equal(partial.days.length, 3);
});

test('Wochentage und Jahresvergleich', () => {
  const pts = quarters(new Date('2026-11-02T00:00:00'), new Date('2026-11-16T00:00:00'), (t) => ((t.getDay() + 6) % 7 === 0 ? 0.5 : 0.25));
  const w = weekdayAverages(pts);
  assert.equal(w[0], 48);
  assert.equal(w[3], 24);
  const monthly = [{ t: new Date(2025, 0, 1), v: 100, s: 'W' }, { t: new Date(2026, 0, 1), v: 90, s: 'W' }, { t: new Date(2026, 1, 1), v: 80, s: 'W' }];
  const y = monthsByYear(monthly);
  assert.deepEqual(y.map(([yr]) => yr), [2025, 2026]);
  assert.equal(y[1][1][1], 80);
});

test('Zwei Zählpunkte werden je Zeitpunkt addiert', () => {
  const a = quarters(new Date('2026-11-16T00:00:00'), new Date('2026-11-16T01:00:00'), () => 0.1);
  const b = quarters(new Date('2026-11-16T00:00:00'), new Date('2026-11-16T01:00:00'), () => 0.2);
  const m = mergeSum([a, b]);
  assert.equal(m.length, 4);
  assert.ok(m.every((p) => Math.abs(p.v - 0.3) < 1e-9));
  assert.ok(MP2);
});

/* ------------------------------------------------------------ Aufteilung und Auswahl */
import { splitByDayPart, splitByWeekpart, splitByMeter, normalizeSelection, compactId } from '../../src/model.js';

test('Aufteilung: Tageszeit, Werktag/Wochenende und Zählpunkte', () => {
  const pts = [
    { t: new Date(2026, 9, 5, 3, 0), v: 1 }, // Mo nachts
    { t: new Date(2026, 9, 5, 8, 15), v: 2 }, // Mo vormittags
    { t: new Date(2026, 9, 10, 13, 0), v: 3 }, // Sa nachmittags
    { t: new Date(2026, 9, 11, 20, 45), v: 4 }, // So abends
    { t: new Date(2026, 9, 11, 21, 0), v: null },
  ];
  assert.deepEqual(splitByDayPart(pts).map((x) => x.value), [1, 2, 3, 4]);
  assert.match(splitByDayPart(pts)[0].name, /0–6 Uhr/);
  assert.deepEqual(splitByWeekpart(pts).map((x) => [x.id, x.value]), [['weekday', 3], ['weekend', 7]]);
  assert.deepEqual(splitByDayPart([]), []);
  assert.deepEqual(splitByMeter([{ id: 'a', name: 'A', points: pts }, { id: 'b', name: 'B', points: [] }]).map((x) => [x.id, x.value]), [['a', 10]]);
});

test('Auswahl: gespeicherte Zählpunkte prüfen, Reihenfolge wie im Portal, nie leer', () => {
  const mps = [{ id: 'X' }, { id: 'Y' }, { id: 'Z' }];
  assert.deepEqual(normalizeSelection('all', mps), ['X', 'Y', 'Z']);
  assert.deepEqual(normalizeSelection(['Z', 'X'], mps), ['X', 'Z']);
  assert.deepEqual(normalizeSelection('Y', mps), ['Y']); // Version 1.0 speicherte eine einzelne ID
  assert.deepEqual(normalizeSelection(['weg'], mps), ['X', 'Y', 'Z']);
  assert.deepEqual(normalizeSelection(null, mps), ['X', 'Y', 'Z']);
  assert.equal(compactId('AT0090000000000000000000000012345'), 'AT0090…00012345');
  assert.equal(compactId('kurz'), 'kurz');
});
