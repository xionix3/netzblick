import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makePeriod, shiftPeriod, comparePeriod, periodTitle, periodShortName, resolutionFor, chartBucketFor, isoWeek, daysBetween, addDays,
} from '../../src/time.js';

const d = (s) => new Date(s + 'T00:00:00');
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

test('Woche beginnt am Montag und dauert 7 Kalendertage', () => {
  const p = makePeriod('week', d('2026-11-18')); // Mittwoch
  assert.equal(iso(p.start), '2026-11-16');
  assert.equal(iso(p.end), '2026-11-23');
  assert.equal(p.start.getDay(), 1);
});

test('Woche mit Zeitumstellung (25.10.2026) hat trotzdem 7 Tage', () => {
  const p = makePeriod('week', d('2026-10-25'));
  assert.equal(iso(p.start), '2026-10-19');
  assert.equal(daysBetween(p.start, p.end), 7);
  // absolute Dauer ist 7 Tage + 1 Stunde (Winterzeit)
  assert.equal(p.end - p.start, 7 * 86400000 + 3600000);
});

test('Monat, Jahr und eigener Zeitraum', () => {
  const m = makePeriod('month', d('2026-02-14'));
  assert.equal(iso(m.start), '2026-02-01');
  assert.equal(iso(m.end), '2026-03-01');
  const y = makePeriod('year', d('2026-07-01'));
  assert.equal(iso(y.start), '2026-01-01');
  assert.equal(iso(y.end), '2027-01-01');
  const c = makePeriod('custom', d('2026-11-10'), { from: d('2026-11-10'), to: d('2026-11-01') }); // vertauscht
  assert.equal(iso(c.start), '2026-11-01');
  assert.equal(iso(c.end), '2026-11-11'); // Ende exklusiv
});

test('Gesamt beginnt am 1. Jänner des ersten Datenjahres', () => {
  const t = makePeriod('total', d('2026-11-17'), { firstDate: d('2018-06-26') });
  assert.equal(iso(t.start), '2018-01-01');
  assert.equal(t.end.getFullYear(), new Date().getFullYear() + 1);
});

test('Verschieben über den Jahreswechsel', () => {
  const p = shiftPeriod(makePeriod('month', d('2026-01-15')), -1);
  assert.equal(iso(p.start), '2025-12-01');
  const n = shiftPeriod(makePeriod('day', d('2026-12-31')), 1);
  assert.equal(iso(n.start), '2027-01-01');
  const c = shiftPeriod(makePeriod('custom', d('2026-11-01'), { from: d('2026-11-01'), to: d('2026-11-10') }), -1);
  assert.equal(iso(c.start), '2026-10-22');
  assert.equal(iso(addDays(c.end, -1)), '2026-10-31');
});

test('Vergleichszeiträume: Vorperiode und Vorjahr', () => {
  const m = makePeriod('month', d('2026-03-10'));
  assert.equal(iso(comparePeriod(m, 'prev').start), '2026-02-01');
  assert.equal(iso(comparePeriod(m, 'yoy').start), '2025-03-01');
  const w = makePeriod('week', d('2026-11-18'));
  const wy = comparePeriod(w, 'yoy');
  assert.equal(wy.start.getDay(), 1, 'Vorjahreswoche beginnt ebenfalls am Montag');
  assert.equal(daysBetween(wy.start, w.start), 364);
  assert.equal(comparePeriod(m, 'none'), null);
  assert.equal(comparePeriod(makePeriod('total', d('2026-01-01')), 'prev'), null);
});

test('ISO-Kalenderwochen (abgeglichen mit Python isocalendar)', () => {
  assert.equal(isoWeek(d('2026-01-01')), 1);
  assert.equal(isoWeek(d('2026-11-16')), 47);
  assert.equal(isoWeek(d('2026-12-31')), 53);
  assert.equal(isoWeek(d('2027-01-01')), 53);
  assert.equal(isoWeek(d('2026-10-25')), 43);
});

test('Titel und Kurznamen', () => {
  assert.equal(periodTitle(makePeriod('month', d('2026-11-01'))), 'November 2026');
  assert.equal(periodTitle(makePeriod('month', d('2026-01-01'))), 'Jänner 2026');
  assert.equal(periodTitle(makePeriod('week', d('2026-11-16'))), 'KW 47, 16.–22. Nov');
  assert.equal(periodTitle(makePeriod('week', d('2026-11-30'))), 'KW 49, 30. Nov – 6. Dez');
  assert.equal(periodTitle(makePeriod('day', d('2026-11-15'))), 'So, 15. Nov 2026');
  assert.equal(periodShortName(makePeriod('month', d('2026-10-01'))), 'Oktober 2026');
});

test('Auflösung und Diagramm-Einteilung je Zeitraum', () => {
  const day = makePeriod('day', d('2026-11-15'));
  assert.equal(resolutionFor(day), 'original');
  assert.equal(chartBucketFor(day, 'original'), 'quarter');
  const month = makePeriod('month', d('2026-11-15'));
  assert.equal(chartBucketFor(month, resolutionFor(month)), 'day');
  const year = makePeriod('year', d('2026-11-15'));
  assert.equal(resolutionFor(year), 'daily');
  assert.equal(chartBucketFor(year, 'daily'), 'month');
  assert.equal(resolutionFor(makePeriod('total', d('2026-01-01'))), 'monthly');
  const long = makePeriod('custom', d('2026-01-01'), { from: d('2026-01-01'), to: d('2026-06-30') });
  assert.equal(resolutionFor(long), 'daily');
  assert.equal(chartBucketFor(long, 'daily'), 'month');
  const short = makePeriod('custom', d('2026-11-01'), { from: d('2026-11-01'), to: d('2026-11-30') });
  assert.equal(resolutionFor(short), 'original');
});
