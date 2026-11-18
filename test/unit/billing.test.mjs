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

test('Abrechnungsjahr: nach einer Zwischenabrechnung zählt trotzdem das ganze Vorjahr', async () => {
  const short = { from: new Date(2025, 9, 1), to: new Date(2025, 10, 1) }; // „Oktober 2025 bis Oktober 2025“
  const st = await billingYearStatus(storeWith(new Date(2025, 11, 31)), {}, short, new Date(2026, 0, 1));
  assert.equal(st.curStart.getTime(), new Date(2025, 10, 1).getTime());
  assert.equal(st.lastDays, 31);
  assert.equal(st.lastSum, 31 * 20);
  assert.equal(st.method, 'vorjahr');
  const year = daily(new Date(2024, 10, 1), new Date(2025, 10, 1), new Date(2030, 0, 1)).reduce((a, p) => a + p.v, 0);
  assert.equal(st.prevTotal, year); // 1.11.2024–31.10.2025, nicht nur der Oktober der Zwischenabrechnung
  assert.equal(year, 182 * 20 + 183 * 10);
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

/* ------------------------------------------------------------ Erinnerung */
import { reminderTime, reminderIcs } from '../../src/reminder.js';

test('Erinnerung: 30 Tage vorher um 9 Uhr, sonst morgen, nie nach dem Ende', () => {
  const now = new Date(2026, 10, 18, 12, 0);
  const a = reminderTime('2027-03-31', 30, now);
  assert.equal(a.at.getTime(), new Date(2027, 2, 1, 9, 0).getTime());
  const b = reminderTime('2026-12-01', 30, now); // 1.11. liegt zurück → morgen
  assert.equal(b.at.getTime(), new Date(2026, 10, 19, 9, 0).getTime());
  assert.equal(reminderTime('2026-11-01', 30, now), null);
  assert.equal(reminderTime('kaputt', 30, now), null);
});

test('Erinnerung: Kalenderdatei mit ganztägigem Termin und Alarm', () => {
  const ics = reminderIcs({ at: new Date(2027, 2, 1, 9), end: new Date(2027, 2, 31), title: 'Strom: Rabatt endet; bitte, wechseln', text: 'Vergleichen' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270301\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20270302\r\n/);
  assert.match(ics, /SUMMARY:Strom: Rabatt endet\; bitte\\, wechseln\r\n/);
  assert.match(ics, /BEGIN:VALARM[\s\S]*END:VALARM/);
});
