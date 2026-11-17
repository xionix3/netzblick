import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { num, kwh, kw, watt, euro, pct, signedPct, dow, dateLong, time } from '../../src/format.js';

test('Zahlen in österreichischer Schreibweise mit passender Genauigkeit', () => {
  assert.equal(num(13633.882), '13.634');
  assert.equal(num(808.503), '808,5');
  assert.equal(num(49.196), '49,2');
  assert.equal(num(3.483), '3,48');
  assert.equal(num(0.162, 3), '0,162');
  assert.equal(num(null), '–');
  assert.equal(num(NaN), '–');
});

test('Einheiten', () => {
  assert.equal(kwh(12.345), '12,3 kWh');
  assert.equal(kw(13.932), '13,9 kW');
  assert.equal(kw(6.972), '6,97 kW');
  assert.equal(watt(0.246), '246 W');
  assert.equal(euro(91.734), '91,73 €');
  assert.equal(pct(0.371), '37 %');
});

test('Vorzeichen bei Veränderungen', () => {
  assert.equal(signedPct(0.12), '+12 %');
  assert.equal(signedPct(-0.4), '−40 %');
  assert.equal(signedPct(0), '±0 %');
});

test('Wochentag Montag = 0 und Datumstexte', () => {
  assert.equal(dow(new Date('2026-11-16T12:00:00')), 0);
  assert.equal(dow(new Date('2026-11-22T12:00:00')), 6);
  assert.equal(dateLong(new Date('2026-11-03T17:30:00')), 'Di, 3. Nov 2026');
  assert.equal(time(new Date('2026-11-03T07:05:00')), '07:05');
});
