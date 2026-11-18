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

async function scenario(name, { query = '', theme = 'light', viewport, sat, actions, checks, shot }) {
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
    if (sat) await page.evaluate((v) => document.documentElement.style.setProperty('--safe-area-inset-top', v + 'px'), sat);
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
  query: '&period=month&price=14.9&sel=all',
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
  query: '&period=year&date=2025-06-01&theme=dark&price=14.9',
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

await scenario('Hohe Statusleiste: Kopfzeile mit Menü bleibt sichtbar', {
  query: '&period=month&sel=all',
  theme: 'dark',
  sat: 48,
  checks: async (s, page) => {
    const g = await page.evaluate(async () => {
      const at = (el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); };
      const name = document.querySelector('#meterName');
      const menu = document.querySelector('#pageUsage .menu-btn');
      const free = { name: document.querySelector('#meterBtn').contains(at(name)), menu: menu.contains(at(menu)) };
      window.scrollTo(0, 600);
      await new Promise((r) => setTimeout(r, 200));
      const c = document.querySelector('#controls').getBoundingClientRect();
      return { ...free, stuckTop: Math.round(c.top) };
    });
    return [
      expect(g.name, 'Zählpunkt-Name ist verdeckt'),
      expect(g.menu, 'Menü-Knopf ist verdeckt'),
      expect(g.stuckTop === 48, `Steuerung klebt nicht unter der Statusleiste (${g.stuckTop})`),
    ];
  },
});
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
await scenario('Kosten: Lieferant, Netz Burgenland, Abgaben und Erinnerung', {
  query: '&period=month&sel=all&price=14.9&remind=' + new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
  shot: 'kosten',
  checks: async (s, page) => [
    expect(/Netz Burgenland/.test(s.text) && /Erneuerbaren-Förderbeitrag/.test(s.text), 'Kostenaufstellung fehlt'),
    expect(/Kosten ca\./.test(s.text), 'Kosten im Kopf fehlen'),
    expect(/Neukundenrabatt bei Musterstrom GmbH endet in 10 Tagen/.test(s.text), 'Erinnerungshinweis fehlt'),
    expect(await page.$eval('#costPanel', (el) => el.querySelectorAll('.stackbar span').length === 3), 'Anteilsbalken fehlt'),
  ],
});
await scenario('Seite Strompreis mit Netzpreisen und Jahreskosten', {
  query: '&page=tariff&price=14.9',
  actions: async (page) => { await waitText(page, /€ im Jahr/, 15000); },
  checks: (s) => [
    expect(/Sommer-Niedertarif/.test(s.text), 'Niedertarif fehlt'),
    expect(/10,15 ct/.test(s.text), 'Netznutzung brutto 10,15 ct fehlt'),
    expect(/Erinnerung setzen/.test(s.text), 'Erinnerung fehlt'),
    expect(/Steuern und Abgaben 2026/.test(s.text), 'Abgaben fehlen'),
  ],
});
await scenario('Leistung: eigenes Diagramm unter dem Verbrauch, Monat in Viertelstunden', {
  query: '&period=month&date=2026-10-05&sel=all',
  shot: 'leistung-monat',
  actions: async (page) => {
    await waitText(page, /Höchste Viertelstunde/);
    // Tarifklasse aus dem Kundenportal kommt nach: Übersicht wird neu gerechnet
    await waitText(page, /Unterbrechbar: laut Entwurf ohne Leistungspreis/, 15000);
    await page.evaluate(() => document.querySelector('#powerPanel').scrollIntoView());
  },
  checks: async (s, page) => {
    const before = await page.evaluate(() => ({
      panel: !document.querySelector('#powerPanel').hidden,
      main: !!document.querySelector('#mainChart canvas'),
      power: !!document.querySelector('#powerChart canvas'),
      types: !document.querySelector('#typeSeg').hidden,
      toggle: !!document.querySelector('#unitSeg'),
      chip: document.querySelector('#powerTools .chip')?.getAttribute('aria-pressed'),
      legend: document.querySelectorAll('#powerLegend .lg').length,
      order: (() => { const k = [...document.querySelector('#content').children].map((e) => e.id); return k.indexOf('mainPanel') < k.indexOf('powerPanel') && k.indexOf('powerPanel') < k.indexOf('kpis'); })(),
    }));
    await page.evaluate(() => document.querySelector('#powerTools .chip').click());
    await sleep(300);
    const chipOff = await page.$eval('#powerTools .chip', (b) => b.getAttribute('aria-pressed'));
    return [
      expect(before.panel && before.main && before.power, 'Verbrauch und Leistung nicht beide sichtbar'),
      expect(before.types && !before.toggle, 'Umschalter kWh/kW sollte weg sein'),
      expect(before.order, 'Leistung steht nicht unter dem Verbrauch'),
      expect(before.legend === 2, 'Legende je Zählpunkt fehlt'),
      expect(before.chip === 'true' && chipOff === 'false', '10-kW-Linie lässt sich nicht ausblenden'),
      expect(/über 10 kW|Immer unter 10 kW/.test(s.text), 'Überschreitung fehlt'),
      expect(/je kW und Monat/.test(s.text), 'Hinweis zum Leistungspreis fehlt'),
    ];
  },
});
await scenario('Leistung im Jahr: Monatsspitzen werden nachgeladen', {
  query: '&period=year&date=2026-03-01',
  actions: async (page) => { await waitText(page, /von 12 Monaten über 10 kW|Immer unter 10 kW/, 20000); },
  checks: async (s, page) => [
    expect(/Höchste Viertelstunde je Monat/.test(s.text), 'Untertitel Monatsspitzen fehlt'),
    expect(await page.$$eval('#powerChart canvas', (l) => l.length === 1), 'Diagramm fehlt'),
  ],
});
await scenario('Seite Leistung: Monatsspitzen und Vergleich 2026/2027', {
  query: '&page=power',
  shot: 'leistung',
  actions: async (page) => { await waitText(page, /im Jahr fürs Netz/, 20000); },
  checks: async (s, page) => [
    expect(/Deine Monatsspitzen/.test(s.text) && /Dieser Monat bisher/.test(s.text), 'Monatsspitzen fehlen'),
    expect(/4,08 €/.test(s.text) && /6,12 €/.test(s.text), 'Leistungspreis brutto fehlt'),
    expect(/unterbrechbar/.test(s.text), 'unterbrechbarer Zählpunkt nicht erkannt'),
    expect(await page.$$eval('.peak-card', (l) => l.length === 2), 'Karten je Zählpunkt fehlen'),
    expect(await page.$$eval('.chart--peaks canvas', (l) => l.length === 1), 'Diagramm fehlt'),
  ],
});
await scenario('Seite Kosten: Monate, Zählpunkte, Aufstellung, Jahr wählen', {
  query: '&page=costs&price=14.9',
  shot: 'kosten-seite',
  actions: async (page) => { await waitText(page, /Alle Monate/, 30000); },
  checks: async (s, page) => {
    const first = await page.evaluate(() => ({
      chips: [...document.querySelectorAll('.chip-row .chip')].map((b) => b.textContent),
      active: document.querySelector('.chip-row .chip--active')?.textContent,
      chart: document.querySelectorAll('.chart--costs canvas').length,
      meters: document.querySelectorAll('.meter-cost').length,
      months: document.querySelectorAll('.tbl--months tbody tr').length,
    }));
    await page.evaluate(() => [...document.querySelectorAll('.chip-row .chip')].find((b) => b.textContent === '2026').click());
    await waitText(page, /Kosten 2026 bisher/, 30000);
    await waitText(page, /Alle Monate/, 30000);
    const year = await page.evaluate(() => document.querySelectorAll('.tbl--months tbody tr').length);
    return [
      expect(first.active === 'Letzte 12 Monate' && first.chips.includes('2026') && first.chips.includes('2025'), `Zeitraum-Auswahl falsch: ${first.chips.join(',')}`),
      expect(first.chart === 1, 'Monatsdiagramm fehlt'),
      expect(first.meters === 2, 'Kosten je Zählpunkt fehlen'),
      expect(first.months === 13, `12 Monate plus Summe erwartet, sind ${first.months}`),
      expect(/Gerechnet aus Viertelstundenwerten/.test(s.text) && /Sommer-Niedertarif/.test(s.text), 'Niedertarif nicht genau gerechnet'),
      expect(/Energie \(Lieferant\)/.test(s.text) && /Erneuerbaren-Förderbeitrag/.test(s.text), 'Aufstellung unvollständig'),
      expect(/unterbrechbar/.test(s.text), 'Tarifklasse je Zählpunkt fehlt'),
      expect(year >= 11 && year <= 13, `Jahr 2026: ${year} Zeilen`),
    ];
  },
});
await scenario('Übersicht: „Alle Kosten“ öffnet die Seite Kosten', {
  query: '&period=month&date=2026-10-01&price=14.9',
  actions: async (page) => {
    await page.evaluate(() => [...document.querySelectorAll('#costPanel button')].find((b) => /Alle Kosten/.test(b.textContent)).click());
    await waitText(page, /Monat für Monat/, 30000);
  },
  checks: async (s, page) => [
    expect(await page.$eval('#pageTitle', (e) => e.textContent === 'Kosten'), 'Seite Kosten nicht geöffnet'),
  ],
});
await scenario('Strompreis: Lieferant nicht aus dem Portal vorbelegt', {
  query: '&page=tariff',
  actions: async (page) => { await waitText(page, /Bei Netz Burgenland als Lieferant gemeldet/); },
  checks: async (s, page) => {
    const v = await page.evaluate(() => [...document.querySelectorAll('.field')].find((f) => /Lieferant \(optional\)/.test(f.textContent))?.querySelector('input')?.value);
    return [
      expect(v === '', `Lieferant ist vorbelegt: ${v}`),
      expect(/gemeldet: Musterstrom GmbH/.test(s.text), 'Hinweis auf gemeldeten Lieferanten fehlt'),
      expect(!/Dein Strompreis heute und morgen/.test(s.text), 'Börsenpreise ohne dynamischen Tarif'),
    ];
  },
});
await scenario('Strompreis: dynamischer Tarif mit Börsenpreis heute und morgen', {
  query: '&page=tariff&dyn=awattar',
  shot: 'strompreis-dynamisch',
  actions: async (page) => { await waitText(page, /Günstigste 2 Stunden/, 20000); },
  checks: async (s, page) => {
    const st = await page.evaluate(() => ({
      on: [...document.querySelectorAll('#pageBody .seg button.on')].map((b) => b.textContent).find((t) => /Fixpreis|Dynamisch/.test(t)),
      prov: document.querySelector('select.select')?.value,
      chart: document.querySelectorAll('.chart--spot canvas').length,
    }));
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Fixpreis').click());
    await sleep(200);
    const fixedVisible = await page.evaluate(() => !!document.querySelector('input[placeholder="z. B. 14,9"]')?.offsetParent);
    return [
      expect(st.on === 'Dynamisch (Börse)' && st.prov === 'awattar', `Tarifwahl falsch: ${st.on}/${st.prov}`),
      expect(st.chart === 1, 'Preisdiagramm fehlt'),
      expect(/Energy-Charts/.test(s.text) && /SMARD/.test(s.text), 'Quelle der Börsenpreise fehlt'),
      expect(/Was dich ein Jahr kostet/.test(s.text), 'Jahreskosten fehlen'),
      expect(fixedVisible, 'Umschalten auf Fixpreis klappt nicht'),
    ];
  },
});
await scenario('Kosten mit dynamischem Tarif', {
  query: '&period=month&date=2026-10-01&dyn=smartenergy',
  checks: (s) => [
    expect(/Börsenpreis und Aufschlag/.test(s.text) && /Ø Börse/.test(s.text), 'dynamische Energiekosten fehlen'),
    expect(!/fehlen Börsenpreise/.test(s.text), 'Börsenpreise fehlen'),
  ],
});
await scenario('Seite Börsenpreis: Tag, Zeitfenster, Nachbarländer, Muster', {
  query: '&page=spot',
  shot: 'boersenpreis-seite',
  actions: async (page) => {
    await waitText(page, /Typischer Tagesverlauf/, 30000);
    await page.waitForFunction(() => document.querySelector('.chart--zones')?.style.height === '254px' || document.querySelector('.zone-retry'), { timeout: 40000 });
  },
  checks: async (s, page) => {
    const st = await page.evaluate(() => ({
      nav: [...document.querySelectorAll('.nav-item')].some((b) => b.textContent.trim() === 'Börsenpreis'),
      title: document.querySelector('#pageTitle').textContent,
      day: document.querySelectorAll('.chart--spotday canvas').length,
      carpet: document.querySelectorAll('.chart--spotcarpet canvas').length,
      prof: document.querySelectorAll('.chart--spotprofile canvas').length,
      zonesH: document.querySelector('.chart--zones')?.style.height,
      winRows: document.querySelectorAll('.tbl--win tbody tr').length,
      nextOff: document.querySelector('.spot-controls .icon-btn[aria-label="Nächster Tag"]').disabled,
    }));
    await page.click('.seg--res button[data-res="60"]');
    await sleep(300);
    const hourly = await page.evaluate(() => ({
      h2: document.querySelector('#pageBody section.panel h2').textContent,
      wins: [...document.querySelectorAll('.tbl--win td b')].map((b) => b.textContent),
      saved: JSON.parse(localStorage.getItem('nb.settings') || '{}').spotRes,
    }));
    await page.click('.seg--res button[data-res="15"]');
    await sleep(200);
    await page.click('.spot-controls .icon-btn[aria-label="Nächster Tag"]');
    await waitText(page, /Am ganzen Tag/, 15000);
    const tomorrow = await page.evaluate(() => ({ t: document.querySelector('.spot-controls .period-title').textContent, off: document.querySelector('.spot-controls .icon-btn[aria-label="Nächster Tag"]').disabled }));
    return [
      expect(st.nav && st.title === 'Börsenpreis', 'Seite Börsenpreis fehlt im Menü'),
      expect(st.day >= 1 && st.carpet >= 1 && st.prof >= 1, `Diagramme fehlen: ${JSON.stringify(st)}`),
      expect(st.zonesH === '254px', `nicht alle 7 Länder: ${st.zonesH}`),
      expect(st.winRows === 4, `Zeitfenster fehlen (${st.winRows})`),
      expect(hourly.h2 === 'Preise je Stunde' && hourly.wins.length && hourly.wins.every((w) => /^\d\d:00–\d\d:00 Uhr$/.test(w)), `Stundenwerte falsch: ${JSON.stringify(hourly)}`),
      expect(/Am günstigsten/.test(s.text) && /Am teuersten/.test(s.text) && /Meist am günstigsten/.test(s.text), 'Kennzahlen fehlen'),
      expect(await page.$$eval('.zone-table tbody tr', (r) => r.length) === 7, 'Nachbarländer fehlen in der Tabelle'),
      expect(/Energy-Charts/.test(s.text) && /SMARD/.test(s.text), 'Quelle fehlt'),
      expect(/Strompreis einstellen/.test(s.text), 'Hinweis auf dynamischen Tarif fehlt'),
      expect(!st.nextOff, 'morgen nicht erreichbar'),
      expect(/^Morgen, /.test(tomorrow.t) && tomorrow.off, `morgen falsch: ${JSON.stringify(tomorrow)}`),
    ];
  },
});
await scenario('Börsenpreis mit dynamischem Tarif, dunkel, 12 Monate', {
  query: '&page=spot&dyn=verbund&theme=dark',
  theme: 'dark',
  actions: async (page) => {
    await waitText(page, /Typischer Tagesverlauf/, 30000);
  },
  checks: async (s, page) => {
    const mine = await page.evaluate(() => [...document.querySelectorAll('.spot-controls .seg button')].find((b) => b.classList.contains('on'))?.textContent);
    await page.evaluate(() => [...document.querySelectorAll('.spot-controls .seg button')].find((b) => b.textContent === 'Börse netto').click());
    await sleep(300);
    const spotText = await page.evaluate(() => document.querySelector('#pageBody').innerText);
    await page.evaluate(() => [...document.querySelectorAll('.chip-row--inline .chip')].find((b) => b.textContent === '12 Monate').click());
    await waitText(page, /Meist am günstigsten/, 30000);
    await sleep(500);
    const year = await page.evaluate(() => ({ on: document.querySelector('.chip-row--inline .chip--active')?.textContent, carpet: document.querySelectorAll('.chart--spotcarpet canvas').length }));
    return [
      expect(mine === 'Dein Preis', `Ansicht „Dein Preis“ nicht aktiv: ${mine}`),
      expect(/Dein Energiepreis brutto/.test(s.text) && /VERBUND V-Strom Spot/.test(s.text), 'dein Preis fehlt'),
      expect(/Börsenpreis netto ohne USt/.test(spotText), 'Umschalten auf Börse netto klappt nicht'),
      expect(year.on === '12 Monate' && year.carpet >= 1, `12 Monate fehlen: ${JSON.stringify(year)}`),
    ];
  },
});
await scenario('Seite Energiegemeinschaft mit Teilnahmefaktoren', {
  query: '&page=community',
  shot: 'energiegemeinschaft',
  actions: async (page) => { await waitText(page, /Teilnahmefaktor im Verlauf/); },
  checks: (s) => [
    expect(/Bürgerenergiegemeinschaft/.test(s.text) && /Erneuerbare-Energie-Gemeinschaft \(regional\)/.test(s.text), 'Gemeinschaften fehlen'),
    expect(/60 %/.test(s.text) && /40 %/.test(s.text), 'Teilnahmefaktoren fehlen'),
    expect(/dynamisch/.test(s.text), 'Aufteilung fehlt'),
  ],
});
await scenario('Seiten Störung und Kontakt', {
  query: '&page=outage',
  shot: 'stoerung',
  actions: async (page) => { await openMenuItem(page, 'contact'); },
  checks: async (s, page) => [
    expect(/0800 888 9001/.test(s.text) && /Servicezentren/.test(s.text), 'Kontakt fehlt'),
    expect(/Güssing/.test(s.text), 'Servicezentrum fehlt'),
    expect(await page.$$eval('.callcard', (l) => l.length >= 1), 'Anruf-Karte fehlt'),
  ],
});
await scenario('Seite Anlagen mit Daten aus dem Kundenportal', {
  query: '&page=plants',
  shot: 'anlagen',
  actions: async (page) => { await waitText(page, /Zählernummer/); },
  checks: (s) => [expect(/1KFM0200012345/.test(s.text), 'Zählernummer fehlt'), expect(/Energiegemeinschaft/.test(s.text), 'Energiegemeinschaft fehlt'), expect(/Musterstrom/.test(s.text), 'Lieferant fehlt')],
});
await scenario('Seite Abrechnung: laufendes Jahr und Hochrechnung', {
  query: '&page=billing&price=14.9',
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
