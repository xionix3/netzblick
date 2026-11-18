// Bilder für README.md / README.en.md nach docs/readme/:
//   banner-de.png, banner-en.png (Marke + drei Handys), einzelne Bildschirme (Demo-Daten), tablet.png, quer.png
// Aufruf: npm run build && node scripts/readme-images.mjs   (CHROME_PATH bei Bedarf setzen)
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const www = resolve(root, 'www');
const out = resolve(root, 'docs/readme');
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

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const ISO = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const M12345 = 'AT0090000000000000000000000012345';

/** Bildschirm der App aufnehmen; jede Aufnahme in einem frischen Kontext (keine gespeicherten Einstellungen) */
async function shot(name, query, { viewport = PHONE, scrollTo = null, waitText = null, theme = 'light', after = 700 } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.emulateTimezone('Europe/Vienna');
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: theme }]);
  await p.setViewport(viewport);
  await p.goto(base + '?demo=1' + query, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => !document.body.classList.contains('is-loading') && document.querySelector('#heroValue')?.textContent.trim(), { timeout: 20000 });
  if (waitText) await p.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 20000 }, waitText);
  if (scrollTo) await p.evaluate((sel) => window.scrollTo(0, document.querySelector(sel).getBoundingClientRect().top + window.scrollY - 70), scrollTo);
  await new Promise((r) => setTimeout(r, after));
  const buf = await p.screenshot({ path: resolve(out, name + '.png') });
  await ctx.close();
  console.log('✔ ' + name + '.png');
  return buf;
}

const shots = {};
shots.uebersicht = await shot('uebersicht', `&period=month&date=2026-10-01&sel=all&price=14.9`);
shots.kosten = await shot('kosten', `&period=month&date=2026-10-01&sel=all&price=14.9`, { scrollTo: '#costPanel' });
shots.tag = await shot('tag', `&period=day&date=2026-10-07&sel=${M12345}&price=14.9`);
shots.aufteilung = await shot('aufteilung', `&period=month&date=2026-10-01&sel=all&chart=pie&split=daypart`, { scrollTo: '#mainPanel' });
shots.analyse = await shot('analyse', `&period=month&date=2026-10-01&sel=${M12345}`, { scrollTo: '#analysis' });
shots.jahr = await shot('jahr-dunkel', `&period=year&date=2025-06-01&theme=dark&price=14.9`, { theme: 'dark' });
shots.leistungMonat = await shot('leistung-monat', `&period=month&date=2026-07-01&sel=${M12345}&power=1`, { scrollTo: '#mainPanel', waitText: 'Höchste Viertelstunde' });
shots.leistung = await shot('leistung', `&page=power`, { waitText: 'im Jahr fürs Netz' });
shots.strompreis = await shot('strompreis', `&page=tariff&price=14.9&remind=${ISO(75)}`, { waitText: '€ im Jahr' });
shots.abrechnung = await shot('abrechnung', `&page=billing&price=14.9`, { waitText: 'Hochrechnung' });
shots.gemeinschaft = await shot('energiegemeinschaft', `&page=community`, { waitText: 'Teilnahmefaktor im Verlauf' });
shots.anlagen = await shot('anlagen', `&page=plants`, { waitText: 'Zählernummer' });
shots.stoerung = await shot('stoerung', `&page=outage`);
shots.kontakt = await shot('kontakt', `&page=contact`);
shots.menue = await shot('menue', `&menu`, { after: 900 });
await shot('tablet', `&period=month&date=2026-10-01&sel=all&price=14.9`, { viewport: { width: 1280, height: 800, deviceScaleFactor: 1.5, isMobile: false, hasTouch: true } });
await shot('quer', `&period=day&date=2026-10-07&sel=all&price=14.9`, { viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true } });

/* ------------------------------------------------------------ Banner je Sprache */
const page = await browser.newPage();
const FONTS = `
@font-face { font-family: 'BSC'; src: url('${base}fonts/barlow-sc-600.woff2'); font-weight: 600; }
@font-face { font-family: 'B'; src: url('${base}fonts/barlow-500.woff2'); font-weight: 500; }`;
const counter = (digits, size) => `<div style="display:inline-flex;gap:${size * 0.08}px;padding:${size * 0.11}px;background:#0b1117;border-radius:${size * 0.18}px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.08)">
  ${digits.map((c, i) => `<div style="position:relative;width:${size * 0.64}px;height:${size}px;border-radius:${size * 0.08}px;background:${i === digits.length - 1 ? '#c8102e' : '#1c2734'};color:#f2f5f7;font:600 ${size * 0.78}px/${size}px BSC;text-align:center;overflow:hidden;${i === digits.length - 1 ? `margin-left:${size * 0.09}px` : ''}">${c}<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.5),rgba(255,255,255,.07) 28%,rgba(255,255,255,0) 55%,rgba(0,0,0,.55))"></div></div>`).join('')}
</div>`;
const img = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
const phone = (buf, x, y, w, rot = 0, z = 1) => `<img src="${img(buf)}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;border-radius:${w * 0.085}px;box-shadow:0 0 0 1px rgba(255,255,255,.10),0 24px 60px rgba(0,0,0,.45);transform:rotate(${rot}deg);z-index:${z}">`;

async function banner(file, { title, tagline, by }) {
  const W = 1600, H = 820;
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setContent(`<!DOCTYPE html><html><head><style>${FONTS} html,body{margin:0}</style></head><body>
  <div style="width:${W}px;height:${H}px;background:#142231;position:relative;overflow:hidden;font-family:B">
    <div style="position:absolute;left:84px;top:236px;width:600px">
      ${counter(['1', '8', '0'], 76)}
      <div style="color:#fff;font:600 108px/1 BSC;margin-top:40px;letter-spacing:-.01em">${title}</div>
      <div style="color:#c4cdd6;font:500 36px/1.3 B;margin-top:18px">${tagline}</div>
      <div style="color:#7f8c98;font:500 24px/1.3 B;margin-top:34px">${by}</div>
    </div>
    ${phone(shots.kosten, 1010, 150, 300, 0, 1)}
    ${phone(shots.gemeinschaft, 1260, 190, 300, 0, 0)}
    ${phone(shots.uebersicht, 760, 110, 330, 0, 2)}
  </div></body></html>`, { waitUntil: 'load', timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(out, file), clip: { x: 0, y: 0, width: W, height: H } });
  console.log('✔ ' + file);
}
await banner('banner-de.png', { title: 'Netzblick', tagline: 'Deinen Stromverbrauch im Blick', by: 'App für Smart Meter von Netz Burgenland' });
await banner('banner-en.png', { title: 'Netzblick', tagline: 'Your electricity use at a glance', by: 'App for Netz Burgenland smart meters' });

await browser.close();
server.close();
