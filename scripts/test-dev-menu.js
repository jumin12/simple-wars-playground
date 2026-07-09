const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const outDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('http://127.0.0.1:8765/index.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(() => {
    const m = document.getElementById('mainMenu');
    return m && !m.classList.contains('hidden');
  }, { timeout: 120000 });
  await page.waitForTimeout(800);

  const before = await page.evaluate(() => ({
    open: typeof wodDevMenuOpen === 'function' && wodDevMenuOpen(),
    gold: gameData.gold | 0,
  }));
  console.log('before', before);

  // Triple backtick
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(80);
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(80);
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(300);

  const opened = await page.evaluate(() => ({
    open: wodDevMenuOpen(),
    hidden: document.getElementById('wodDevMenu')?.classList.contains('hidden'),
    fpsText: document.getElementById('wodDevFps')?.textContent,
    stats: document.getElementById('wodDevStats')?.textContent?.slice(0, 200),
  }));
  console.log('opened', opened);

  const goldBefore = await page.evaluate(() => gameData.gold | 0);
  await page.click('[data-cheat="gold1000"]');
  await page.waitForTimeout(200);
  const goldAfter = await page.evaluate(() => ({
    gold: gameData.gold | 0,
    activity: document.getElementById('wodDevActivity')?.textContent?.slice(0, 200),
    notifyOk: true,
  }));
  console.log('gold', goldBefore, '->', goldAfter);

  await page.screenshot({ path: path.join(outDir, 'dev-menu-test.png') });

  // Close with Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const closed = await page.evaluate(() => wodDevMenuOpen());
  console.log('closed', closed);

  const failed =
    !opened.open ||
    opened.hidden ||
    goldAfter.gold < goldBefore + 1000 ||
    closed;
  console.log('errors', errors.slice(0, 8));
  console.log(failed ? 'TEST FAILED' : 'TEST OK');
  process.exitCode = failed ? 1 : 0;
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
