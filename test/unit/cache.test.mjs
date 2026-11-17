import { MemoryStorage } from './setup.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cacheGet, cachePut, cacheClear } from '../../src/cache.js';

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  cacheClear();
});

test('Messreihen werden kompakt gespeichert und vollständig wiederhergestellt', () => {
  const pts = [{ t: new Date('2026-11-15T00:00:00Z'), v: 0.162, s: 'W' }, { t: new Date('2026-11-15T00:15:00Z'), v: null, s: 'E' }];
  cachePut('k1', pts);
  const raw = JSON.parse(localStorage.getItem('nb.cache.k1'));
  assert.equal(raw.kind, 'pts');
  assert.deepEqual(raw.value[0], [pts[0].t.getTime(), 0.162, 0], 'Status „W“ wird als 0 gespeichert');
  cacheClear(); // Speicher im RAM leeren, localStorage behalten? → cacheClear entfernt auch localStorage
  cachePut('k1', pts);
  const hit = cacheGet('k1', 60000);
  assert.equal(hit.fresh, true);
  assert.equal(hit.value[1].s, 'E');
  assert.equal(hit.value[0].t.getTime(), pts[0].t.getTime());
});

test('Veraltete Einträge werden als nicht frisch gemeldet', () => {
  cachePut('k', { a: 1 });
  assert.equal(cacheGet('k', -1).fresh, false);
  assert.deepEqual(cacheGet('k', -1).value, { a: 1 });
  assert.equal(cacheGet('fehlt', 1000), null);
});

test('Höchstens 80 Einträge (älteste fliegen raus)', () => {
  for (let i = 0; i < 85; i++) cachePut('e' + i, { i });
  const keys = Object.keys(Object.fromEntries(localStorage.map)).filter((k) => k.startsWith('nb.cache.e'));
  assert.equal(keys.length, 80);
  assert.equal(localStorage.getItem('nb.cache.e0'), null);
  assert.notEqual(localStorage.getItem('nb.cache.e84'), null);
});

test('Volle Festplatte: ältere Einträge werden geräumt statt abzustürzen', () => {
  globalThis.localStorage = new MemoryStorage(3000);
  cacheClear();
  const big = { blob: 'x'.repeat(900) };
  for (let i = 0; i < 6; i++) cachePut('b' + i, big);
  assert.notEqual(localStorage.getItem('nb.cache.b5'), null, 'neuester Eintrag ist gespeichert');
  assert.equal(localStorage.getItem('nb.cache.b0'), null, 'ältester wurde geräumt');
});
