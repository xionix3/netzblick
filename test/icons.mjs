import puppeteer from 'puppeteer-core';
const res = '/home/claude/netzblick/android/app/src/main/res';
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const [d, f] of Object.entries(dens)) {
  for (const [mode, file, dp] of [['fg', 'ic_launcher_foreground.png', 108], ['legacy', 'ic_launcher.png', 48], ['round', 'ic_launcher_round.png', 48]]) {
    const px = Math.round(dp * f);
    await page.setViewport({ width: 432, height: 432, deviceScaleFactor: px / 432 });
    await page.goto(`http://localhost:8765/icon.html?m=${mode}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${res}/mipmap-${d}/${file}`, omitBackground: true, clip: { x: 0, y: 0, width: 432, height: 432 } });
  }
}
await page.setViewport({ width: 432, height: 432, deviceScaleFactor: 1 });
await page.goto('http://localhost:8765/icon.html?m=legacy', { waitUntil: 'networkidle0' });
await page.screenshot({ path: '/tmp/icon_preview.png', omitBackground: true });
await browser.close();
console.log('ok');
