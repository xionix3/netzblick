import puppeteer from 'puppeteer-core';
const [,, url, out, w = '390', hgt = '844', full = '1', clickSel = ''] = process.argv;
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });
const page = await browser.newPage();
await page.emulateTimezone('Europe/Vienna');
await page.setViewport({ width: +w, height: +hgt, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 2500));
if (clickSel) { for (const s of clickSel.split('|')) { await page.click(s); await new Promise((r) => setTimeout(r, 900)); } }
await page.screenshot({ path: out, fullPage: full === '1' });
console.log(JSON.stringify({ errors, h: await page.evaluate(() => document.documentElement.scrollHeight) }));
await browser.close();
