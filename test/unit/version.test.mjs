import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Standard-Version im Android-Projekt muss zur package.json passen (versionCode = X*10000 + Y*100 + Z)
test('Version: package.json und build.gradle stimmen überein', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const gradle = readFileSync(new URL('../../android/app/build.gradle', import.meta.url), 'utf8');
  const name = gradle.match(/findProperty\('appVersionName'\) \?: '([^']+)'/)[1];
  const code = gradle.match(/findProperty\('appVersionCode'\) \?: '([^']+)'/)[1];
  assert.match(code, /^\d+$/, `versionCode muss eine Zahl sein, ist „${code}“`);
  assert.equal(name, pkg.version);
  const [x, y, z] = pkg.version.split('.').map(Number);
  assert.equal(Number(code), x * 10000 + y * 100 + z);
});
