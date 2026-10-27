// Saves nav and footer screenshots at 1440 and 450 to tests/out/ for comparison with Figma.
import { openPage, shutdown } from './harness.mjs';
import fs from 'node:fs';
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
for (const width of [1440, 450]) {
  const { page, close } = await openPage({ width });
  await page.waitForTimeout(500);
  await page.locator('header.site-header').screenshot({ path: `tests/out/nav-${width}.png` });
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator('footer').screenshot({ path: `tests/out/footer-${width}.png` });
  await close();
}
await shutdown();
