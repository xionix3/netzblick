// Erzeugt App-Symbol (1024 × 1024, randlos, ohne Transparenz – iOS rundet selbst ab) und Startbild (2732 × 2732)
// für das iPhone-Projekt unter ios/App/App/Assets.xcassets.
// Aufruf: npm run build && node scripts/ios-assets.mjs   (CHROME_PATH bei Bedarf setzen)
import { readFile } from 'node:fs/promises';
import { existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
if (!chrome) { console.error('Chrome nicht gefunden (CHROME_PATH setzen).'); process.exit(1); }
const font = (await readFile(resolve(root, 'www/fonts/barlow-sc-600.woff2'))).toString('base64');
const assets = resolve(root, 'ios/App/App/Assets.xcassets');

const counter = (size) => `<div style="display:inline-flex;gap:${size * 0.08}px;padding:${size * 0.11}px;background:#0b1117;border-radius:${size * 0.18}px;box-shadow:inset 0 0 0 ${Math.max(2, size * 0.012)}px rgba(255,255,255,.08)">
  ${['1', '8', '0'].map((c, i) => `<div style="position:relative;width:${size * 0.64}px;height:${size}px;border-radius:${size * 0.08}px;background:${i === 2 ? '#c8102e' : '#1c2734'};color:#f2f5f7;font:600 ${size * 0.78}px/${size}px BSC;text-align:center;overflow:hidden;${i === 2 ? `margin-left:${size * 0.09}px` : ''}">${c}<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.5),rgba(255,255,255,.07) 28%,rgba(255,255,255,0) 55%,rgba(0,0,0,.55))"></div></div>`).join('')}
</div>`;
const page = (S, size) => `<!DOCTYPE html><html><head><style>
@font-face { font-family: 'BSC'; src: url(data:font/woff2;base64,${font}); font-weight: 600; }
html, body { margin: 0; background: #142231; }
</style></head><body><div style="width:${S}px;height:${S}px;display:grid;place-items:center;background:#142231">${counter(size)}</div></body></html>`;

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
async function shot(S, size, out) {
  const p = await browser.newPage();
  await p.setViewport({ width: S, height: S, deviceScaleFactor: 1 });
  await p.setContent(page(S, size), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  // type jpeg wäre ohne Alpha, aber Xcode erwartet PNG: weißer Hintergrund ist durch body gesetzt, PNG ohne Transparenz
  await p.screenshot({ path: out, omitBackground: false, clip: { x: 0, y: 0, width: S, height: S } });
  await p.close();
  console.log('✔', out);
}
await shot(1024, 300, resolve(assets, 'AppIcon.appiconset/AppIcon-512@2x.png'));
const splash = resolve(assets, 'Splash.imageset/splash-2732x2732.png');
await shot(2732, 220, splash);
copyFileSync(splash, resolve(assets, 'Splash.imageset/splash-2732x2732-1.png'));
copyFileSync(splash, resolve(assets, 'Splash.imageset/splash-2732x2732-2.png'));
await browser.close();
