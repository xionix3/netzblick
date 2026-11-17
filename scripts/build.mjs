// Baut die Web-Oberfläche nach www/ (wird von Capacitor in die Android-App kopiert)
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'www');
// Version: aus der Umgebung (Release-Workflow setzt sie aus dem Git-Tag) oder aus package.json
const version = process.env.APP_VERSION || JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'fonts'), { recursive: true });

await build({
  entryPoints: [resolve(root, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome80'],
  outfile: resolve(out, 'app.js'),
  legalComments: 'eof',
  define: { __APP_VERSION__: JSON.stringify(version) },
  logLevel: 'info',
});

copyFileSync(resolve(root, 'www-src/index.html'), resolve(out, 'index.html'));
copyFileSync(resolve(root, 'www-src/app.css'), resolve(out, 'app.css'));
const fonts = {
  'barlow-400.woff2': '@fontsource/barlow/files/barlow-latin-400-normal.woff2',
  'barlow-500.woff2': '@fontsource/barlow/files/barlow-latin-500-normal.woff2',
  'barlow-600.woff2': '@fontsource/barlow/files/barlow-latin-600-normal.woff2',
  'barlow-700.woff2': '@fontsource/barlow/files/barlow-latin-700-normal.woff2',
  'barlow-sc-500.woff2': '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff2',
  'barlow-sc-600.woff2': '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff2',
};
for (const [name, src] of Object.entries(fonts)) copyFileSync(resolve(root, 'node_modules', src), resolve(out, 'fonts', name));
console.log(`www/ fertig (Version ${version})`);
