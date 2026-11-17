import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingYearStatus, consumptionFor } from '../../src/billing.js';
import { addDays } from '../../src/time.js';

/** Tageswerte: Winter (Okt–Mär) 20 kWh, Sommer 10 kWh */
const daily = (from, to, until) => {
  const out = [];
  for (let d = from; d < to; d = addDays(d, 1)) {
    const m = d.getMonth();
    out.push({ t: d, v: d < until ? (m >= 9 || m <= 2 ? 20 : 10) : null, s: d < until ? 'W' : 'F' });
  }
  return out;
};
const storeWith = (until, { noPrev = false } = {}) => ({
  load: async (mp, flow, from, to) => ({ points: noPrev && from < new Date(2025, 9, 1) ? [] : daily(from, to, until), fine: false }),
});
const last = { from: new Date(2024, 9, 1), to: new Date(2025, 9, 1) };

test('Abrechnungsjahr: Summe und Hochrechnung mit dem Verlauf des Vorjahres', async () => {
  const now = new Date(2025, 11, 1); // 1. Dezember
  const st = await billingYearStatus(storeWith(new Date(2025, 10, 30)), {}, last, now);
  assert.equal(st.covered, 60);
  assert.equal(st.sum, 60 * 20);
  assert.equal(st.method, 'vorjahr');
  // Vorjahr: 182 Wintertage × 20 + 183 Sommertage × 10; im Herbst nur Wintertage → Hochrechnung = ganzes Vorjahr
  assert.equal(Math.round(st.projection), Math.round(st.prevTotal));
});

test('Abrechnungsjahr: ohne Vorjahr gleichmäßig weitergerechnet, unter 14 Tagen keine Hochrechnung', async () => {
  const st = await billingYearStatus(storeWith(new Date(2025, 10, 30), { noPrev: true }), {}, last, new Date(2025, 11, 1));
  assert.equal(st.method, 'linear');
  assert.equal(Math.round(st.projection), 20 * 365);
  const early = await billingYearStatus(storeWith(new Date(2025, 9, 6)), {}, last, new Date(2025, 9, 7));
  assert.equal(early.projection, null);
  assert.equal(early.covered, 5);
  assert.equal(await billingYearStatus(storeWith(new Date()), {}, last, new Date(2025, 8, 1)), null);
});

test('Abrechnung: Vertragskonto passend zum Zählpunkt finden', () => {
  const kp = { consumption: [
    { contractAccount: '1', description: 'Musterweg 12, 7000 Eisenstadt', periods: [{ label: 'A' }] },
    { contractAccount: '2', description: 'Musterweg 12a, 7000 Eisenstadt', periods: [{ label: 'A' }] },
  ] };
  assert.equal(consumptionFor(kp, { address: 'Musterweg 12a, 7000 Eisenstadt', lastBillingPeriod: 'A' }).contractAccount, '2');
  assert.equal(consumptionFor(kp, { address: 'Musterweg 12, 7000 Eisenstadt' }).contractAccount, '1');
  assert.equal(consumptionFor({ consumption: [kp.consumption[0]] }, { address: 'ganz woanders' }).contractAccount, '1');
  assert.equal(consumptionFor(kp, null), null);
});
