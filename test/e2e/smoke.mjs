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

async function scenario(name, { query = '', theme = 'light', viewport, actions, checks, shot }) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.emulateTimezone('Europe/Vienna');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...viewport });
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
const openMenuItem = async (page, id) => {
  if (await page.$eval('.menu-btn', (b) => getComputedStyle(b).display !== 'none')) {
    await page.click('#pageUsage:not([hidden]) .menu-btn, #pageOther:not([hidden]) .menu-btn');
    await sleep(350);
  }
  await page.click(`.nav-item[data-nav="${id}"]`);
  await sleep(400);
};
const waitText = (page, re, timeout = 8000) => page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), { timeout }, re.source);

await scenario('Menü: Einstellungen und Zählpunktwahl öffnen', {
  query: '&period=month',
  actions: async (page) => {
    await openMenuItem(page, 'settings');
    await page.click('#sheetClose');
    await sleep(300);
    await page.click('#meterBtn');
    await sleep(300);
  },
  checks: (s) => [expect(s.sheetOpen, 'Zählpunkt-Auswahl nicht geöffnet'), expect(/Alle auswählen/.test(s.text) && /nur dieser/.test(s.text), 'Mehrfachauswahl fehlt')],
});
await scenario('Mehrfachauswahl: Zählpunkt in der Legende abwählen', {
  query: '&period=month&date=2026-10-01&sel=all',
  shot: 'auswahl',
  actions: async (page) => {
    const before = await page.$eval('#heroValue', (el) => el.textContent);
    await page.evaluate(() => document.querySelectorAll('#mainLegend .lg--btn')[1].click());
    await page.waitForFunction((b) => !document.body.classList.contains('is-loading') && document.querySelector('#heroValue').textContent !== b, { timeout: 10000 }, before);
  },
  checks: async (s, page) => [
    expect(/1 von 2 Zählpunkten/.test(s.text), 'Hinweis-Chip zur Auswahl fehlt'),
    expect(await page.$eval('#meterName', (el) => el.textContent.startsWith('AT0090…')), 'Zählpunkt heißt nicht nach seiner Nummer'),
    expect(await page.$$eval('#mainLegend .lg--btn.is-off', (l) => l.length === 1), 'abgewählter Zählpunkt nicht markiert'),
  ],
});
await scenario('Diagrammart: Linien und Kreis', {
  query: '&period=month&date=2026-10-01&sel=all',
  shot: 'kreis',
  actions: async (page) => {
    await page.click('#typeSeg button[aria-label="Linien"]');
    await sleep(300);
    await page.click('#typeSeg button[aria-label="Kreis (Aufteilung)"]');
    await sleep(500);
  },
  checks: async (s, page) => [
    expect(await page.$$eval('#splitBox tbody tr', (r) => r.length === 2), 'Aufteilung nach Zählpunkten fehlt'),
    expect(/Tageszeit/.test(s.text), 'Umschalter Tageszeit fehlt'),
    expect(await page.$eval('#typeSeg button[aria-label="Kreis (Aufteilung)"]', (b) => b.classList.contains('on')), 'Kreis nicht aktiv'),
  ],
});
await scenario('Seite Anlagen mit Daten aus dem Kundenportal', {
  query: '&page=plants',
  shot: 'anlagen',
  actions: async (page) => { await waitText(page, /Zählernummer/); },
  checks: (s) => [expect(/1KFM0200012345/.test(s.text), 'Zählernummer fehlt'), expect(/Energiegemeinschaft/.test(s.text), 'Energiegemeinschaft fehlt'), expect(/Musterstrom/.test(s.text), 'Lieferant fehlt')],
});
await scenario('Seite Abrechnung: laufendes Jahr und Hochrechnung', {
  query: '&page=billing&price=0.29',
  shot: 'abrechnung',
  actions: async (page) => { await waitText(page, /Hochrechnung/, 15000); },
  checks: (s) => [
    expect(/Abrechnungsjahr seit/.test(s.text), 'laufendes Abrechnungsjahr fehlt'),
    expect(/Abgerechnete Jahresverbräuche/.test(s.text), 'Jahresverbräuche fehlen'),
    expect(/Teilbeträge|Nächster Teilbetrag/.test(s.text), 'Teilbeträge fehlen'),
    expect(/externen|stellt .* aus/.test(s.text), 'Hinweis auf externen Rechnungssteller fehlt'),
  ],
});
await scenario('Seite Konto und Info', {
  query: '&page=account',
  actions: async (page) => { await waitText(page, /Verbunden über die Smart-Meter-Anmeldung/); await openMenuItem(page, 'info'); },
  checks: (s) => [expect(/geister-it/.test(s.text) && /Patrick Schlögl/.test(s.text), 'Info ohne Marke'), expect(/Version/.test(s.text), 'Version fehlt')],
});
await scenario('Tablet quer: Menü fest, Summe neben dem Diagramm', {
  query: '&period=month&sel=all',
  viewport: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: true },
  shot: 'tablet',
  checks: async (s, page) => {
    const g = await page.evaluate(() => {
      const r = (q) => { const x = document.querySelector(q).getBoundingClientRect(); return { left: x.left, right: x.right, top: x.top, width: x.width }; };
      return { nav: r('#nav').width, navX: r('#nav').left, hero: r('#hero'), main: r('#mainPanel'), menu: getComputedStyle(document.querySelector('.menu-btn')).display };
    });
    return [
      expect(g.nav > 200 && g.navX >= 0, 'Menü ist nicht fest sichtbar'),
      expect(g.menu === 'none', 'Menü-Knopf sollte ausgeblendet sein'),
      expect(g.hero.right <= g.main.left + 1 && Math.abs(g.hero.top - g.main.top) < 60, 'Summe und Diagramm stehen nicht nebeneinander'),
    ];
  },
});
await scenario('Handy quer: Diagramm neben der Summe', {
  query: '&period=day&date=2026-10-07&sel=all',
  viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true },
  shot: 'quer',
  checks: async (s, page) => {
    const g = await page.evaluate(() => {
      const r = (q) => { const x = document.querySelector(q).getBoundingClientRect(); return { left: x.left, right: x.right }; };
      return { hero: r('#hero'), main: r('#mainPanel'), ctl: getComputedStyle(document.querySelector('#controls')).position };
    });
    return [expect(g.hero.right <= g.main.left + 1, 'im Querformat nicht nebeneinander'), expect(g.ctl === 'static', 'Steuerung sollte im Querformat nicht kleben')];
  },
});
await scenario('Anmeldeseite nach „Demo beenden“', {
  query: '&period=month',
  shot: 'anmeldung',
  actions: async (page) => {
    if (await page.$eval('.menu-btn', (b) => getComputedStyle(b).display !== 'none')) { await page.click('#pageUsage .menu-btn'); await sleep(350); }
    await page.evaluate(() => [...document.querySelectorAll('.nav-item')].find((b) => b.textContent.includes('Demo beenden')).click());
    await sleep(500);
    await page.evaluate(() => { document.querySelector('#heroValue').textContent = 'x'; }); // Summen-Prüfung gilt hier nicht
  },
  checks: async (s, page) => [expect(await page.$eval('#login', (el) => !el.hidden), 'Anmeldeseite nicht sichtbar'), expect(/von geister-it/.test(s.text), 'Marke auf der Anmeldeseite fehlt')],
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
