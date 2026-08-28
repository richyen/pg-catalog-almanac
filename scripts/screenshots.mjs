import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const shots = [
  { path: 'docs/home.png',            hash: '#/',                    scrollY: 0  },
  { path: 'docs/version-changes.png', hash: '#/v/16',                scrollY: 0  },
  { path: 'docs/relation-detail.png', hash: '#/r/pg_stat_activity',  scrollY: 220 },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

for (const s of shots) {
  await page.goto(`${BASE}/${s.hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  if (s.scrollY) await page.evaluate(y => window.scrollTo(0, y), s.scrollY);
  await page.waitForTimeout(200);
  await page.screenshot({ path: s.path });
  console.log(`saved ${s.path}`);
}

await browser.close();
