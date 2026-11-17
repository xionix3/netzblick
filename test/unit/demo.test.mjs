import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoHttp } from '../../src/demo.js';
import { PortalApi, API_BASE } from '../../src/api.js';
import { DataStore, meterPointsFrom, loadView, computeStats } from '../../src/model.js';
import { makePeriod } from '../../src/time.js';

// Der Demo-Modus muss dasselbe Format liefern wie das echte Portal,
// damit die Vorschau und der Review-Zugang für Google aussagekräftig sind.

test('Demo: Anmeldung, falsches Passwort und Zählpunkte', async () => {
  const api = new PortalApi(demoHttp);
  await assert.rejects(api.login('demo', 'falsch'), { code: 'INVALID_CREDENTIALS' });
  const acc = await api.login('demo', 'demo');
  const mps = meterPointsFrom(acc);
  assert.equal(mps.length, 2);
  assert.ok(mps.every((m) => m.flows.consumption.q15 && m.flows.consumption.daily.length === 2));
});

test('Demo: Tagessummen passen zu den Viertelstundenwerten, Tarif 2 ist leer', async () => {
  const api = new PortalApi(demoHttp);
  const [acc] = await api.login('demo', 'demo');
  const mp = meterPointsFrom([acc])[0];
  const from = new Date(2026, 9, 1), to = new Date(2026, 9, 8);
  const q = await api.series({ accountId: acc.identifier, meterPointId: mp.id, valueId: '1-0:1.8.0*H15', from, to, timeParameter: 'original' });
  const dly = await api.series({ accountId: acc.identifier, meterPointId: mp.id, valueId: '1-0:1.8.1*H24', from, to, timeParameter: 'daily' });
  const t2 = await api.series({ accountId: acc.identifier, meterPointId: mp.id, valueId: '1-0:1.8.2*H24', from, to, timeParameter: 'daily' });
  assert.equal(q.length, 7 * 96);
  assert.equal(dly.length, 7);
  assert.deepEqual(t2, []);
  const sumQ = q.reduce((a, p) => a + p.v, 0), sumD = dly.reduce((a, p) => a + p.v, 0);
  assert.ok(Math.abs(sumQ - sumD) < 1e-6);
  assert.ok(q.every((p, i) => i === 0 || p.r >= q[i - 1].r), 'Zählerstand steigt monoton');
});

test('Demo: kompletter Ladevorgang einer Monatsansicht über die echte Datenschicht', async () => {
  const api = new PortalApi(demoHttp);
  const acc = await api.login('demo', 'demo');
  const store = new DataStore(api);
  const view = await loadView(store, { mps: meterPointsFrom(acc), flow: 'consumption', period: makePeriod('month', new Date(2026, 9, 1)), compareMode: 'prev' });
  assert.equal(view.fine, true);
  assert.equal(view.bucket, 'day');
  for (const x of view.perMp) {
    assert.equal(x.cur.points.length, 31 * 96 + 4, 'Oktober mit Zeitumstellung');
    const s = computeStats(x.cur.points, 'original');
    assert.ok(s.total > 0 && s.peak.kw > s.baseLoad);
  }
});

test('Demo: unbekannte Pfade liefern 404', async () => {
  const r = await demoHttp({ method: 'GET', url: API_BASE + 'api/gibtsnicht' });
  assert.equal(r.status, 404);
});
