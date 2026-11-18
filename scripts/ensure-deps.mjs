// Vor jedem Build: fehlen Pakete aus package.json (z. B. nach einem git pull mit neuer Abhängigkeit),
// wird einmal „npm install“ ausgeführt. Sonst passiert nichts.
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = names.filter((n) => !existsSync(new URL(`../node_modules/${n}/package.json`, import.meta.url)));
if (missing.length) {
  console.log(`Neue Pakete fehlen noch (${missing.join(', ')}), führe „npm install“ aus …`);
  execSync('npm install --no-audit --no-fund', { stdio: 'inherit', cwd: new URL('..', import.meta.url) });
}
