// Erzeugt das Programmsymbol für die Desktop-Version (1024 × 1024, abgerundet, mit Rand wie unter macOS üblich)
// und daraus mit der Tauri-CLI alle Größen nach src-tauri/icons/.
// Aufruf: npm run build && node scripts/desktop-icon.mjs   (CHROME_PATH bei Bedarf setzen)
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
if (!chrome) { console.error('Chrome nicht gefunden (CHROME_PATH setzen).'); process.exit(1); }

const font = (await readFile(resolve(root, 'www/fonts/barlow-sc-600.woff2'))).toString('base64');
const S = 1024;
const tile = 824; // sichtbare Fläche, 100 px Rand wie bei macOS-Symbolen
const size = 250; // Höhe einer Ziffer
const digits = ['1', '8', '0'];
const counter = `<div style="display:inline-flex;gap:${size * 0.08}px;padding:${size * 0.11}px;background:#0b1117;border-radius:${size * 0.18}px;box-shadow:inset 0 0 0 3px rgba(255,255,255,.08)">
  ${digits.map((c, i) => `<div style="position:relative;width:${size * 0.64}px;height:${size}px;border-radius:${size * 0.08}px;background:${i === digits.length - 1 ? '#c8102e' : '#1c2734'};color:#f2f5f7;font:600 ${size * 0.78}px/${size}px BSC;text-align:center;overflow:hidden;${i === digits.length - 1 ? `margin-left:${size * 0.09}px` : ''}">${c}<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.5),rgba(255,255,255,.07) 28%,rgba(255,255,255,0) 55%,rgba(0,0,0,.55))"></div></div>`).join('')}
</div>`;
const html = `<!DOCTYPE html><html><head><style>
@font-face { font-family: 'BSC'; src: url(data:font/woff2;base64,${font}); font-weight: 600; }
html, body { margin: 0; background: transparent; }
</style></head><body>
<div style="width:${S}px;height:${S}px;display:grid;place-items:center">
  <div style="width:${tile}px;height:${tile}px;border-radius:${tile * 0.225}px;background:#142231;display:grid;place-items:center;box-shadow:inset 0 0 0 2px rgba(255,255,255,.06)">${counter}</div>
</div></body></html>`;

const out = resolve(root, 'src-tauri/icons');
await mkdir(out, { recursive: true });
const src = resolve(root, 'src-tauri/icons/source-1024.png');
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: S, height: S, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: src, omitBackground: true, clip: { x: 0, y: 0, width: S, height: S } });
await browser.close();
console.log('✔ ' + pathToFileURL(src).href);

// Alle Größen (ICO, ICNS, PNG) erzeugen
execFileSync(process.execPath, [resolve(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'icon', src, '-o', out], { stdio: 'inherit', cwd: root });

// Nur die Desktop-Größen behalten (Android hat eigene Symbole, Store-Logos braucht es nicht)
import { rmSync, readdirSync } from 'node:fs';
for (const f of readdirSync(out)) {
  if (['android', 'ios'].includes(f) || /^(Square\d+x\d+Logo|StoreLogo)\.png$/.test(f)) rmSync(resolve(out, f), { recursive: true, force: true });
}
