// Erzeugt die Grafiken für den Google-Play-Eintrag nach docs/store/:
//   icon-512.png, feature-graphic.png (1024×500), phone-1…4.png (1080×1920, Demo-Daten)
// Aufruf: npm run build && node scripts/store-assets.mjs   (CHROME_PATH bei Bedarf setzen)
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const www = resolve(root, 'www');
const out = resolve(root, 'docs/store');
const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
if (!chrome) { console.error('Chrome nicht gefunden (CHROME_PATH setzen).'); process.exit(1); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const file = resolve(www, '.' + (p === '/' ? '/index.html' : p));
  try {
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(out, { recursive: true });

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

const FONTS = `
@font-face { font-family: 'BSC'; src: url('${base}fonts/barlow-sc-600.woff2'); font-weight: 600; }
@font-face { font-family: 'B'; src: url('${base}fonts/barlow-500.woff2'); font-weight: 500; }`;
const counter = (digits, size) => `<div style="display:inline-flex;gap:${size * 0.08}px;padding:${size * 0.11}px;background:#0b1117;border-radius:${size * 0.18}px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.08)">
  ${digits.map((c, i) => `<div style="position:relative;width:${size * 0.64}px;height:${size}px;border-radius:${size * 0.08}px;background:${i === digits.length - 1 ? '#c8102e' : '#1c2734'};color:#f2f5f7;font:600 ${size * 0.78}px/${size}px BSC;text-align:center;overflow:hidden;${i === digits.length - 1 ? `margin-left:${size * 0.09}px` : ''}">${c}<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.5),rgba(255,255,255,.07) 28%,rgba(255,255,255,0) 55%,rgba(0,0,0,.55))"></div></div>`).join('')}
</div>`;

async function render(html, w, h, file) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(`<!DOCTYPE html><html><head><style>${FONTS} html,body{margin:0}</style></head><body>${html}</body></html>`, { waitUntil: 'load', timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(out, file), clip: { x: 0, y: 0, width: w, height: h } });
  console.log('✔ ' + file);
}

// Symbol 512 × 512 (Google rundet die Ecken selbst ab → volle Fläche)
await render(`<div style="width:512px;height:512px;background:#142231;display:grid;place-items:center">${counter(['1', '8', '0'], 120)}</div>`, 512, 512, 'icon-512.png');

// Vorstellungsgrafik 1024 × 500
const bars = [38, 52, 30, 64, 47, 80, 58, 42, 70, 55, 90, 61, 45, 72, 50, 84, 66, 40, 58, 76];
await render(`<div style="width:1024px;height:500px;background:#142231;position:relative;overflow:hidden;font-family:B">
  <div style="position:absolute;right:40px;bottom:0;display:flex;gap:8px;align-items:flex-end;height:300px;opacity:.9">
    ${bars.map((b, i) => `<div style="width:18px;height:${b * 3}px;border-radius:5px 5px 0 0;background:${i === 10 ? '#6da7ec' : '#2a78d6'};opacity:${0.35 + (i / bars.length) * 0.65}"></div>`).join('')}
  </div>
  <div style="position:absolute;left:64px;top:96px">
    ${counter(['0', '7', '3', '4', '9', '5'], 64)}
    <div style="color:#fff;font:600 84px/1 BSC;margin-top:34px;letter-spacing:-.01em">Netzblick</div>
    <div style="color:#a9b4bf;font:500 30px/1.3 B;margin-top:14px">Deinen Stromverbrauch im Blick</div>
  </div>
</div>`, 1024, 500, 'feature-graphic.png');

// Handy-Screenshots 1080 × 1920 (9:16) und Tablet 1920 × 1080 (16:9) aus dem Demo-Modus
const PHONE = { width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const TABLET = { width: 1280, height: 720, deviceScaleFactor: 1.5, isMobile: false, hasTouch: true };
const shots = [
  ['?demo=1&period=month&price=14.9&sel=all', 'phone-1.png', null, PHONE],
  ['?demo=1&period=day&date=2026-10-07&sel=AT0090000000000000000000000012345', 'phone-2.png', null, PHONE],
  ['?demo=1&period=month&date=2026-10-01&sel=AT0090000000000000000000000012345', 'phone-3.png', '#analysis', PHONE],
  ['?demo=1&period=year&date=2025-06-01&theme=dark&price=14.9', 'phone-4.png', null, PHONE],
  ['?demo=1&page=billing&price=14.9', 'phone-5.png', null, PHONE, 'Hochrechnung'],
  ['?demo=1&period=month&date=2026-10-01&sel=all&chart=pie&split=daypart', 'phone-6.png', '#mainPanel', PHONE],
  ['?demo=1&period=month&price=14.9&sel=all&chart=bar', 'tablet-1.png', null, TABLET],
  ['?demo=1&page=plants', 'tablet-2.png', null, TABLET, 'Zählernummer'],
];
for (const [q, file, scrollTo, viewport, waitText] of shots) {
  const p = await browser.newPage();
  await p.emulateTimezone('Europe/Vienna');
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.setViewport(viewport);
  await p.goto(base + q, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => !document.body.classList.contains('is-loading') && document.querySelector('#heroValue')?.textContent.trim());
  if (waitText) await p.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 15000 }, waitText);
  if (scrollTo) await p.evaluate((sel) => window.scrollTo(0, document.querySelector(sel).getBoundingClientRect().top + window.scrollY - 150), scrollTo);
  await new Promise((r) => setTimeout(r, 800));
  await p.screenshot({ path: resolve(out, file) });
  await p.close();
  console.log('✔ ' + file);
}

await browser.close();
server.close();
