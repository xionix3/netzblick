// Auswertungen der Börsenpreise für die Seite „Börsenpreis“
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHourly, dayStats, windows, profile, extremeHours, carpet, scaleAround } from '../../src/spotstats.js';
import { dayTitle, duration } from '../../src/spotpage.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
/** Viertelstunden eines Tages mit Preis f(stunde, viertel) */
const quarterDay = (d, f) => Array.from({ length: 96 }, (_, i) => ({ t: new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(i / 4), (i % 4) * 15), v: f(Math.floor(i / 4), i % 4), step: 900000 }));

test('Tageswerte: Schnitt, günstigste und teuerste Viertelstunde, negative Preise', () => {
  const pts = quarterDay(new Date(2026, 10, 18), (h, q) => (h === 13 && q === 2 ? -1.5 : h === 18 && q === 1 ? 30 : 10));
  const st = dayStats(pts);
  near(st.avg, (94 * 10 - 1.5 + 30) / 96);
  assert.equal(st.min.t.getHours(), 13);
  assert.equal(st.min.t.getMinutes(), 30);
  assert.equal(st.max.t.getMinutes(), 15);
  assert.equal(st.negative, 1);
  assert.equal(dayStats([{ t: new Date(), v: null, step: 900000 }]), null);
});

test('Zeitfenster: günstigste und teuerste Stunden am Stück, Lücken unterbrechen', () => {
  const pts = quarterDay(new Date(2026, 10, 18), (h) => (h >= 2 && h < 5 ? 5 : h >= 17 && h < 19 ? 25 : 12));
  const w2 = windows(pts, 2);
  assert.equal(w2.cheap.from.getHours(), 2);
  assert.equal(w2.cheap.to.getHours(), 4);
  near(w2.cheap.avg, 5);
  assert.equal(w2.dear.from.getHours(), 17);
  near(w2.dear.avg, 25);
  const w4 = windows(pts, 4);
  near(w4.cheap.avg, (12 * 5 + 4 * 12) / 16); // 2–5 Uhr günstig, eine Stunde normal
  // fehlender Wert mitten im günstigen Block: Fenster darüber zählen nicht
  pts[10].v = null; // 02:30
  const w1 = windows(pts, 1);
  assert.equal(w1.cheap.from.getHours(), 2);
  assert.equal(w1.cheap.from.getMinutes(), 45);
  // zu wenige Werte
  assert.deepEqual(windows(pts.slice(0, 3), 1), { cheap: null, dear: null });
});

test('Stundenmittel aus Viertelstunden', () => {
  const pts = quarterDay(new Date(2026, 10, 18), (h, q) => h * 10 + q);
  const hr = toHourly(pts);
  assert.equal(hr.length, 24);
  near(hr[5].v, 51.5);
  assert.equal(hr[5].step, 3600000);
  const already = toHourly(hr);
  assert.equal(already.length, 24);
});

test('Typischer Tagesverlauf: Werktage und Wochenende getrennt, günstigste Stunde', () => {
  const pts = [
    ...quarterDay(new Date(2026, 10, 16), (h) => (h === 13 ? 2 : h === 19 ? 30 : 10)), // Montag
    ...quarterDay(new Date(2026, 10, 21), () => 7), // Samstag
  ];
  const p = profile(pts);
  near(p.weekday[13], 2);
  near(p.weekend[13], 7);
  const ex = extremeHours(p.weekday);
  assert.equal(ex.cheap.hour, 13);
  assert.equal(ex.dear.hour, 19);
  assert.equal(profile(quarterDay(new Date(2026, 10, 16), () => 1)).weekend, null);
  assert.equal(extremeHours(null), null);
});

test('Teppich: Stundenmittel je Tag, Farbskala um den Durchschnitt', () => {
  const pts = [...quarterDay(new Date(2026, 10, 16), (h) => h), ...quarterDay(new Date(2026, 10, 17), () => 4)];
  const cp = carpet(pts, new Date(2026, 10, 16), new Date(2026, 10, 18));
  assert.equal(cp.days.length, 2);
  assert.equal(cp.cells.length, 48);
  assert.deepEqual(cp.cells.find((c) => c[0] === 0 && c[1] === 7), [0, 7, 7]);
  const sc = scaleAround([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
  near(sc.mid, 14.5);
  assert.ok(sc.hi > sc.mid && sc.lo < sc.mid);
  assert.ok(sc.hi - sc.mid === sc.mid - sc.lo);
  const flat = scaleAround([3, 3, 3], 0.5);
  assert.deepEqual([flat.lo, flat.hi], [2.5, 3.5]);
});

test('Börsenpreis-Seite: Tagesnamen und Dauer', () => {
  const now = new Date(2026, 10, 18, 15);
  assert.equal(dayTitle(new Date(2026, 10, 18), now), 'Heute, 18. November');
  assert.equal(dayTitle(new Date(2026, 10, 19), now), 'Morgen, 19. November');
  assert.equal(dayTitle(new Date(2026, 10, 17), now), 'Gestern, 17. November');
  assert.equal(dayTitle(new Date(2026, 10, 12), now), 'Donnerstag, 12. November');
  assert.equal(dayTitle(new Date(2025, 11, 31), now), 'Mittwoch, 31. Dezember 2025');
  assert.equal(duration(5.75), '5 h 45 min');
  assert.equal(duration(2), '2 h');
  assert.equal(duration(0.25), '15 min');
});
