import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewer, latestRelease, dueForCheck, RELEASES_API } from '../../src/update.js';

test('isNewer vergleicht X.Y.Z numerisch', () => {
  assert.equal(isNewer('1.8.0', '1.7.2'), true);
  assert.equal(isNewer('v1.10.0', '1.9.9'), true);
  assert.equal(isNewer('1.7.2', '1.7.2'), false);
  assert.equal(isNewer('1.7.1', '1.7.2'), false);
  assert.equal(isNewer('2.0', '1.7.2'), false);
  assert.equal(isNewer('1.8.0', 'dev'), false);
});

test('latestRelease liest Tag und Seite, ignoriert Vorabversionen und Fehler', async () => {
  let asked;
  const ok = async (req) => { asked = req; return { status: 200, data: { tag_name: 'v1.8.0', html_url: 'https://github.com/x/y/releases/tag/v1.8.0' } }; };
  assert.deepEqual(await latestRelease(ok), { version: '1.8.0', url: 'https://github.com/x/y/releases/tag/v1.8.0' });
  assert.equal(asked.url, RELEASES_API);
  assert.equal(await latestRelease(async () => ({ status: 200, data: { tag_name: 'v1.9.0', prerelease: true } })), null);
  assert.equal(await latestRelease(async () => ({ status: 403, data: { message: 'rate limit' } })), null);
  assert.equal(await latestRelease(async () => ({ status: 200, data: { tag_name: 'nightly' } })), null);
});

test('dueForCheck: höchstens einmal am Tag', () => {
  const now = Date.UTC(2026, 10, 23, 12);
  assert.equal(dueForCheck(null, now), true);
  assert.equal(dueForCheck(String(now - 3600e3), now), false);
  assert.equal(dueForCheck(String(now - 21 * 3600e3), now), true);
});
