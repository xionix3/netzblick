// End-to-End-Test der Oberfläche im Handyformat (Demo-Daten, echter Chrome).
//   npm run test:e2e          → prüft alle Ansichten
//   npm run screenshots       → zusätzlich Bilder nach docs/screenshots/
// Voraussetzung: vorher `npm run build`. Chrome wird automatisch gesucht (oder CHROME_PATH setzen).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const www = resolve(root, 'www');
const shotDir = resolve(root, 'docs/screenshots');
const takeShots = process.argv.includes('--screenshots');
const inCI = !!process.env.CI;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  const msg = 'Kein Chrome gefunden (CHROME_PATH setzen).';
  if (inCI) { console.error(msg); process.exit(1); }
  console.log(msg + ' E2E-Test übersprungen.');
  process.exit(0);
}
if (!existsSync(resolve(www, 'index.html'))) {
  console.error('www/ fehlt – zuerst `npm run build` ausführen.');
  process.exit(1);
}

/* ---------- kleiner statischer Webserver für www/ ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = resolve(www, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(www)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

/* ---------- Test-Helfer ---------- */
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scenario(name, { query = '', theme = 'light', actions, checks, shot }) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.emulateTimezone('Europe/Vienna');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const started = Date.now();
  try {
    await page.goto(base + '?demo=1' + query, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelector('#heroValue')?.textContent.trim().length > 0 && !document.body.classList.contains('is-loading'), { timeout: 20000 });
    if (actions) await actions(page);
    await sleep(600);
    const state = await page.evaluate(() => ({
      hero: document.querySelector('#heroValue')?.textContent.trim(),
      title: document.querySelector('#periodTitle')?.textContent.trim(),
      canvases: document.querySelectorAll('canvas').length,
      kpis: document.querySelectorAll('.kpi').length,
      tableRows: document.querySelectorAll('#tableWrap tbody tr').length,
      banner: document.querySelector('#banner')?.hidden === false ? document.querySelector('#banner').textContent : null,
      sheetOpen: document.querySelector('#sheet')?.hidden === false,
      text: document.body.innerText,
    }));
    const problems = [];
    if (errors.length) problems.push('Konsolenfehler: ' + errors.join(' | '));
    if (!state.hero || state.hero === '–') problems.push('keine Summe angezeigt');
    if (state.banner) problems.push('Fehlermeldung: ' + state.banner);
    if (/\bnull\b|undefined|NaN/.test(state.text)) problems.push('„null/undefined/NaN“ im sichtbaren Text');
    if (checks) problems.push(...(await checks(state, page)).filter(Boolean));
    if (takeShots && shot) {
      await mkdir(shotDir, { recursive: true });
      await page.screenshot({ path: resolve(shotDir, shot + '.png'), fullPage: false });
    }
    results.push({ name, ok: problems.length === 0, problems, ms: Date.now() - started });
  } catch (e) {
    results.push({ name, ok: false, problems: [e.message], ms: Date.now() - started });
  } finally {
    await page.close();
  }
}

const MP1 = 'AT0090000000000000000000000012345';
const expect = (cond, msg) => (cond ? null : msg);

/* ---------- Szenarien ---------- */
await scenario('Monat, alle Zählpunkte (gestapelt)', {
  query: '&period=month&price=0.29&sel=all',
  shot: 'monat',
  checks: (s) => [
    expect(s.canvases >= 4, `zu wenige Diagramme (${s.canvases})`),
    expect(s.kpis >= 4, 'Kennzahlen fehlen'),
    expect(s.tableRows > 0, 'Wertetabelle leer'),
    expect(/Lastgang|Wann Strom gebraucht wird/.test(s.text), 'Lastgang-Teppich fehlt'),
  ],
});
await scenario('Tag, ein Zählpunkt, mit Zählerstand', {
  query: `&period=day&date=2026-10-07&sel=${MP1}`,
  shot: 'tag',
  checks: async (s, page) => [
    expect(s.title.includes('Okt 2026'), `falscher Titel: ${s.title}`),
    expect(s.tableRows === 24, `Tag sollte 24 Stundenzeilen haben, hat ${s.tableRows}`),
    expect(await page.$eval('#readingBox', (el) => !el.hidden), 'Zählerstand fehlt'),
  ],
});
await scenario('Woche', { query: '&period=week&date=2026-10-05', checks: (s) => [expect(s.title.startsWith('KW 41'), `falscher Titel: ${s.title}`)] });
await scenario('Jahr im Dunkelmodus mit Kalender', {
  query: '&period=year&date=2025-06-01&theme=dark&price=0.29',
  theme: 'dark',
  shot: 'jahr-dunkel',
  checks: (s) => [expect(/Tage im Jahr/.test(s.text), 'Jahreskalender fehlt'), expect(s.tableRows === 12, `12 Monatszeilen erwartet, ${s.tableRows}`)],
});
await scenario('Gesamt mit Jahresvergleich', {
  query: '&period=total',
  checks: (s) => [expect(/Jahre im Vergleich/.test(s.text), 'Jahresvergleich fehlt'), expect(/2019/.test(s.title), `Titel sollte bei 2019 beginnen: ${s.title}`)],
});
await scenario('Filter: nur Wochenende, nachts', {
  query: `&period=month&date=2026-10-01&sel=${MP1}`,
  shot: 'filter',
  actions: async (page) => {
    await page.click('#chips .chip:nth-child(2)'); // „Filtern“
    await sleep(300);
    await page.evaluate(() => {
      const chips = [...document.querySelectorAll('#sheetBody .chip')];
      chips.find((c) => c.textContent.includes('Wochenende')).click();
      chips.find((c) => c.textContent.includes('Nachts')).click();
    });
    await sleep(200);
    await page.click('#sheetBody .btn--primary');
    await sleep(500);
  },
  checks: (s) => [
    expect(/Wochenende/.test(s.text) && /22–6 Uhr/.test(s.text), 'Filter-Chips fehlen'),
    expect(/gefiltert/.test(s.text), 'Hinweis „gefiltert“ fehlt'),
  ],
});
await scenario('Zeitraum wechseln (Pfeil zurück)', {
  query: '&period=month&date=2026-10-01',
  actions: async (page) => { await page.click('#prevBtn'); await page.waitForFunction(() => !document.body.classList.contains('is-loading')); },
  checks: (s) => [expect(s.title === 'September 2026', `nach „zurück“ falscher Titel: ${s.title}`)],
});
await scenario('Einstellungen und Zählpunktwahl öffnen', {
  query: '&period=month',
  actions: async (page) => {
    await page.click('#settingsBtn');
    await sleep(300);
    await page.click('#sheetClose');
    await sleep(300);
    await page.click('#meterBtn');
    await sleep(300);
  },
  checks: (s) => [expect(s.sheetOpen, 'Zählpunkt-Auswahl nicht geöffnet'), expect(/Alle Zählpunkte/.test(s.text), 'Auswahl „Alle Zählpunkte“ fehlt')],
});
await scenario('Anmeldeseite nach „Demo beenden“', {
  query: '&period=month',
  shot: 'anmeldung',
  actions: async (page) => {
    await page.click('#settingsBtn');
    await sleep(300);
    await page.evaluate(() => [...document.querySelectorAll('#sheetBody .btn')].find((b) => b.textContent.includes('Demo beenden')).click());
    await sleep(500);
    await page.evaluate(() => { document.querySelector('#heroValue').textContent = 'x'; }); // Summen-Prüfung gilt hier nicht
  },
  checks: async (s, page) => [expect(await page.$eval('#login', (el) => !el.hidden), 'Anmeldeseite nicht sichtbar')],
});

await browser.close();
server.close();

/* ---------- Ergebnis ---------- */
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? '✔' : '✖'} ${r.name} (${r.ms} ms)`);
  for (const p of r.problems) console.log('    → ' + p);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} Szenarien bestanden${takeShots ? `, Screenshots in docs/screenshots/` : ''}`);
process.exit(failed ? 1 : 0);
