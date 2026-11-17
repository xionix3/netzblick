import { fakeHttp } from './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PortalApi, ApiError, API_BASE, isoUtc } from '../../src/api.js';
import { LOGIN_OK, LOGIN_INVALID, ACCOUNT, MP1, seriesResponse, MAX_POWER } from './fixtures.mjs';

test('Anmeldung schickt das erwartete JSON und übernimmt die Konten', async () => {
  const http = fakeHttp([['api/account/login', () => ({ status: 200, data: LOGIN_OK })]]);
  const api = new PortalApi(http);
  const accounts = await api.login('  max@example.at ', ' geheim ');
  assert.equal(accounts.length, 1);
  assert.equal(api.tokenFor(ACCOUNT.identifier), 'Bearer test-token-1');
  const req = http.calls[0];
  assert.equal(req.method, 'POST');
  assert.equal(req.url, API_BASE + 'api/account/login');
  assert.equal(req.headers['Content-Type'], 'application/json');
  assert.deepEqual(req.data, { usernameOrEMail: 'max@example.at', password: 'geheim', rememberMe: false });
});

test('Falsches Passwort → verständlicher Fehler', async () => {
  const api = new PortalApi(fakeHttp([['api/account/login', () => ({ status: 400, data: LOGIN_INVALID })]]));
  await assert.rejects(api.login('a', 'b'), (e) => e instanceof ApiError && e.code === 'INVALID_CREDENTIALS' && /Passwort/.test(e.message));
});

test('Passwortwechsel verlangt, Serverfehler, keine Verbindung, keine Zählpunkte', async () => {
  const mk = (res) => new PortalApi(fakeHttp([['api/account/login', () => res]]));
  await assert.rejects(mk({ status: 400, data: { ...LOGIN_INVALID, mustChangePassword: true } }).login('a', 'b'), { code: 'MUST_CHANGE_PASSWORD' });
  await assert.rejects(mk({ status: 502, data: '' }).login('a', 'b'), { code: 'SERVER' });
  await assert.rejects(mk({ status: 200, data: { success: true, data: { linkedAccounts: [] } } }).login('a', 'b'), { code: 'NO_METER' });
  const offline = new PortalApi(async () => { throw new Error('offline'); });
  await assert.rejects(offline.login('a', 'b'), { code: 'NETWORK' });
});

test('Messreihe: URL mit einfach kodierten UTC-Zeiten, Token im Header, Werte geparst', async () => {
  const http = fakeHttp([
    ['api/account/login', () => ({ status: 200, data: LOGIN_OK })],
    [/^api\/MeterReadingSequence\/values\/normal$/, () => ({
      status: 200,
      data: seriesResponse('1-0:1.8.0*H15', [
        { start: '2026-11-15T00:00:00+01:00', end: '2026-11-15T00:15:00+01:00', value: 0.162, reading: 88936.562 },
        { start: '2026-11-15T00:15:00+01:00', end: '2026-11-15T00:30:00+01:00', value: null, status: 'F' },
      ]),
    })],
  ]);
  const api = new PortalApi(http);
  await api.login('a', 'b');
  const pts = await api.series({
    accountId: ACCOUNT.identifier, meterPointId: MP1, valueId: '1-0:1.8.0*H15', type: 'MeterReadingSequence',
    from: new Date('2026-11-15T00:00:00'), to: new Date('2026-11-16T00:00:00'), timeParameter: 'original',
  });
  const req = http.calls[1];
  assert.equal(req.headers.Authorization, 'Bearer test-token-1');
  const url = new URL(req.url);
  assert.equal(url.searchParams.get('from'), '2026-11-14T23:00:00Z');
  assert.equal(url.searchParams.get('to'), '2026-11-15T23:00:00Z');
  assert.match(req.url, /from=2026-11-14T23%3A00%3A00Z/, 'Doppelpunkte einfach kodiert, kein „+“ in der URL');
  assert.equal(url.searchParams.get('valueIdentifier'), '1-0:1.8.0*H15');
  assert.equal(url.searchParams.get('timeParameter'), 'original');
  assert.equal(pts.length, 2);
  assert.equal(pts[0].v, 0.162);
  assert.equal(pts[0].r, 88936.562);
  assert.equal(pts[0].s, 'W');
  assert.equal(pts[0].t.getTime(), new Date('2026-11-14T23:00:00Z').getTime());
  assert.equal(pts[1].v, null);
  assert.equal(pts[1].s, 'F');
});

test('Leere Antwort (z. B. Tarif 2 beim Eintarifzähler) ergibt leere Liste', async () => {
  const api = new PortalApi(fakeHttp([[/values\/normal$/, () => ({ status: 200, data: [] })]]));
  api.useAccounts([ACCOUNT]);
  const pts = await api.series({ meterPointId: MP1, valueId: '1-0:1.8.2*H24', from: new Date(), to: new Date(), timeParameter: 'daily' });
  assert.deepEqual(pts, []);
});

test('Abgelaufenes Token: einmal neu anmelden und wiederholen, danach Fehler', async () => {
  let valueCalls = 0;
  const http = fakeHttp([
    ['api/account/login', () => ({ status: 200, data: LOGIN_OK })],
    [/values\/normal$/, () => (++valueCalls === 1 ? { status: 401, data: '' } : { status: 200, data: [] })],
  ]);
  const api = new PortalApi(http);
  await api.login('a', 'b');
  await api.series({ meterPointId: MP1, valueId: 'x', from: new Date(), to: new Date(), timeParameter: 'daily' });
  assert.equal(http.calls.filter((c) => c.url.endsWith('api/account/login')).length, 2, 'automatisch neu angemeldet');
  assert.equal(valueCalls, 2);

  const always401 = new PortalApi(fakeHttp([
    ['api/account/login', () => ({ status: 200, data: LOGIN_OK })],
    [/values\/normal$/, () => ({ status: 401, data: '' })],
  ]));
  await always401.login('a', 'b');
  await assert.rejects(always401.series({ meterPointId: MP1, valueId: 'x', from: new Date(), to: new Date(), timeParameter: 'daily' }), { code: 'AUTH_EXPIRED' });
});

test('Ohne gespeicherte Zugangsdaten führt 401 direkt zu AUTH_EXPIRED', async () => {
  const api = new PortalApi(fakeHttp([[/values\/normal$/, () => ({ status: 401, data: '' })]]));
  api.useAccounts([ACCOUNT]);
  await assert.rejects(api.series({ meterPointId: MP1, valueId: 'x', from: new Date(), to: new Date(), timeParameter: 'daily' }), { code: 'AUTH_EXPIRED' });
});

test('JSON als Text (native HTTP-Schicht) wird trotzdem gelesen', async () => {
  const api = new PortalApi(fakeHttp([[/^api\/maxPower\//, () => ({ status: 200, data: JSON.stringify(MAX_POWER) })]]));
  api.useAccounts([ACCOUNT]);
  const r = await api.maxPower({ meterPointId: MP1, valueId: '1-0:1.8.0*H15', from: new Date(), to: new Date() });
  assert.equal(r.kw, 13.932000000029802);
  assert.equal(r.t.toISOString(), '2026-11-03T16:30:00.000Z');
});

test('isoUtc entfernt Millisekunden', () => {
  assert.equal(isoUtc(new Date('2026-11-01T00:00:00+01:00')), '2026-10-31T23:00:00Z');
});
