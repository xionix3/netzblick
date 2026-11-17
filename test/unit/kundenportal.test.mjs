import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KundenportalApi, KP_BASE, tokenClaims, extractTokens, normalizePods, normalizeConsumption, normalizeContracts, normalizeBills,
  normalizePartPayments, parseBillingPeriod,
} from '../../src/kundenportal.js';
import { demoHttp, DEMO_JWT } from '../../src/demo.js';
import { PortalApi } from '../../src/api.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => `${b64({ alg: 'none' })}.${b64(claims)}.sig`;

/** Aufgezeichnete Antworten, Anfragen werden mitgeschrieben */
function recorder(routes) {
  const calls = [];
  const http = async (req) => {
    calls.push(req);
    const path = req.url.replace(KP_BASE, '').split('?')[0];
    const r = typeof routes[path] === 'function' ? routes[path](req, calls) : routes[path];
    return r || { status: 404, data: { message: 'nicht gefunden' } };
  };
  return { http, calls };
}

test('Kundenportal: Kundennummer aus dem Token, auch mit Umlauten im Namen', () => {
  const t = jwt({ 'custom:customerNr': '1234567', name: 'Jürgen Größ' });
  assert.equal(tokenClaims(t)['custom:customerNr'], '1234567');
  assert.equal(tokenClaims('Bearer ' + t).name, 'Jürgen Größ');
  assert.equal(tokenClaims('kaputt'), null);
});

test('Kundenportal: Tokens in verschiedenen Verpackungen finden', () => {
  assert.equal(extractTokens({ idToken: 'a' }).idToken, 'a');
  assert.equal(extractTokens({ data: { idToken: 'b' } }).idToken, 'b');
  assert.equal(extractTokens({ cognitoToken: { idToken: 'c', refreshToken: 'x' } }).idToken, 'c');
  assert.equal(extractTokens({ data: { tokens: { idToken: 'd' } } }).idToken, 'd');
  assert.equal(extractTokens({ message: 'nix' }), null);
});

test('Kundenportal: Authorization ohne „Bearer“, nach 401 einmal frisches Token holen', async () => {
  const t1 = jwt({ 'custom:customerNr': '42' });
  const t2 = jwt({ 'custom:customerNr': '42', n: 2 });
  const { http, calls } = recorder({
    '/api/profile': (req) => (req.headers.Authorization === t2 ? { status: 200, data: { customerNr: '42', firstName: 'A', lastName: 'B' } } : { status: 401, data: { message: 'Unauthorized' } }),
  });
  const kp = new KundenportalApi(http);
  kp.setToken(t1);
  let refreshed = 0;
  kp.tokenProvider = async () => { refreshed++; return t2; };
  const p = await kp.profile();
  assert.equal(p.customerNr, '42');
  assert.equal(refreshed, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers.Authorization, t1);
  assert.ok(!/^Bearer/.test(calls[1].headers.Authorization));
});

test('Kundenportal: eigene Anmeldung, falsches Passwort und Zusatzschritt', async () => {
  const good = jwt({ 'custom:customerNr': '7' });
  const { http } = recorder({
    '/papi/auth/signin': (req) => {
      if (req.data.password === 'falsch') return { status: 401, data: { errorCode: 'NotAuthorizedException', message: 'Incorrect username or password.' } };
      if (req.data.password === 'neu') return { status: 200, data: { challengeName: 'NEW_PASSWORD_REQUIRED', session: 'x' } };
      return { status: 200, data: { idToken: good, accessToken: 'a', refreshToken: 'r', expireIn: 3600 } };
    },
  });
  const kp = new KundenportalApi(http);
  await assert.rejects(kp.login('a@b.at', 'falsch'), { code: 'INVALID_CREDENTIALS' });
  await assert.rejects(kp.login('a@b.at', 'neu'), { code: 'KP_CHALLENGE' });
  assert.equal(await kp.login(' a@b.at ', 'richtig'), '7');
  assert.equal(kp.source, 'eigene');
});

test('Kundenportal: externer Rechnungssteller ist kein Fehler', async () => {
  const { http } = recorder({
    '/api/contracts/1/bills': { status: 400, data: { errorCode: 'ErrCodeExternalServiceProvider', message: 'extern' } },
    '/api/contracts/1/part-payment-plan': { status: 400, data: { errorCode: 'ErrCodeExternalServiceProvider' } },
    '/api/contracts/2/bills': { status: 500, data: { message: 'Serverfehler' } },
  });
  const kp = new KundenportalApi(http);
  kp.setToken(jwt({ 'custom:customerNr': '9' }));
  assert.deepEqual(await kp.bills('1'), { bills: [], external: true });
  assert.equal((await kp.partPayments('1')).external, true);
  await assert.rejects(kp.bills('2'), { message: 'Serverfehler' });
});

test('Kundenportal: Zählpunkte zusammenführen (Adresse, Zähler, Energiegemeinschaft)', () => {
  const pods = normalizePods(
    [{ extUI: 'AT1', premiseAddress: 'Weg 1, 7000 Ort', utilityType: 'electricity', granularityCustomer: 'QH' }],
    [{ extUI: 'AT1', contractDateFrom: '2020-01-01', details: 'AT0001/Strom AG', net: { serialNr: 'Z1', deviceType: 'IME', gridUsageLevel: '7', loadProfileType: 'H0', lastBillingPeriod: 'Jänner 2025 bis Dezember 2025' }, approvals: { active: [{ dataType: 'EnergyCommunity', energyCommunity: { share: '25', factor: '1' } }] }, participationHistory: [{ dateFrom: '2024-05-01' }, { dateFrom: '2023-02-01' }] },
      { extUI: 'AT2', net: {} }],
  );
  assert.equal(pods.length, 2);
  const [a, b] = pods;
  assert.equal(a.address, 'Weg 1, 7000 Ort');
  assert.equal(a.supplier, 'Strom AG');
  assert.equal(a.meterNr, 'Z1');
  assert.equal(a.gridLevel, 7);
  assert.match(a.deviceType, /Smart Meter/);
  assert.equal(a.granularity, 'Viertelstundenwerte');
  assert.equal(a.energyCommunity.share, 25);
  assert.equal(a.energyCommunity.since.toISOString().slice(0, 10), '2023-02-01');
  assert.equal(b.energyCommunity, null);
});

test('Kundenportal: Verbräuche, Verträge, Rechnungen und Teilbeträge normalisieren', () => {
  const contracts = normalizeContracts([{ nr: '5', description: 'Weg 1', isActive: true, electricity: true, extInvoicingServProv: false }, { nr: '6', isActive: false }]);
  assert.deepEqual(contracts.map((c) => [c.nr, c.active, c.kinds.join()]), [['5', true, 'Strom'], ['6', false, '']]);
  const cons = normalizeConsumption({ premises: [{ contractAccount: '5', utilities: [{ utilityType: 'electricity', years: [{ year: '2025', totalDiff: '3100' }, { year: '2024', totalDiff: '3300.5' }], periods: [{ zeitraum: 'X', diff: '3100' }] }, { utilityType: 'gas', years: [] }] }] }, contracts);
  assert.equal(cons.length, 1);
  assert.deepEqual(cons[0].years, [{ year: 2024, kwh: 3300.5 }, { year: 2025, kwh: 3100 }]);
  assert.equal(cons[0].description, 'Weg 1');
  const bills = normalizeBills([{ billNr: '1', dateTo: '2024-12-31', amount: '10.5' }, { billNr: '2', dateTo: '2025-12-31', amount: 20 }]);
  assert.deepEqual(bills.map((b) => b.nr), ['2', '1']);
  assert.equal(bills[1].amount, 10.5);
  const pp = normalizePartPayments({ installment: [{ dueDate: '2026-02-15', amount: '85', amountOpen: '85' }, { dueDate: '2026-01-15', amount: '85', amountOpen: '0' }] });
  assert.deepEqual(pp.installments.map((x) => x.open), [0, 85]);
});

test('Kundenportal: Abrechnungszeitraum aus dem Text lesen', () => {
  const p = parseBillingPeriod('Oktober 2025 bis September 2026');
  assert.equal(p.from.getTime(), new Date(2025, 9, 1).getTime());
  assert.equal(p.to.getTime(), new Date(2026, 9, 1).getTime());
  assert.equal(parseBillingPeriod('Januar 2025 bis Dezember 2025').from.getMonth(), 0);
  assert.equal(parseBillingPeriod('irgendwas'), null);
  assert.equal(parseBillingPeriod(''), null);
});

test('Kundenportal: Demo mit Anmeldung des Smart-Meter-Portals (ein Login für beide)', async () => {
  const sm = new PortalApi(demoHttp);
  await sm.login('demo', 'demo');
  const kp = new KundenportalApi(demoHttp);
  assert.ok(kp.setToken(extractTokens({ cognitoToken: sm.cognito }).idToken));
  assert.equal(kp.customerNr, tokenClaims(DEMO_JWT)['custom:customerNr']);
  const all = await kp.loadAll();
  assert.equal(all.errors.length, 0);
  assert.equal(all.pods.length, 2);
  assert.ok(all.pods.every((p) => p.meterNr && p.lastBillingPeriod));
  assert.equal(all.consumption.length, 2);
  assert.ok(all.consumption.every((c) => c.years.length >= 3));
  const ext = all.billing.find((b) => b.bills.external);
  const own = all.billing.find((b) => !b.bills.external);
  assert.ok(ext && own);
  assert.equal(own.partPayments.installments.length, 12);
  assert.equal(all.profile.customerNr, kp.customerNr);
});
