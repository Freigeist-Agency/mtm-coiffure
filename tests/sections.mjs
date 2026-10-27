// Saves per-section screenshots of the home page at 1440 and 450 to tests/out/sections/ (header hidden).
// Usage: node tests/sections.mjs [selector ...]   (default: every home section)
import { openPage, shutdown } from './harness.mjs';
import fs from 'node:fs';
fs.mkdirSync(new URL('./out/sections/', import.meta.url), { recursive: true });
const SECTIONS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['.hero', '.intro', '.services', '.about', '.locations', '.social', '.news'];
for (const width of [1440, 450]) {
  const { page, close } = await openPage({ width, height: 900 });
  await page.addStyleTag({ content: '.site-header{display:none !important}' });
  await page.evaluate(async () => {
    for (let y = 0; y <= document.documentElement.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
  for (const sel of SECTIONS) {
    await page.locator(sel).first().screenshot({ path: `tests/out/sections/${sel.replace(/\W/g, '')}-${width}.png` });
  }
  await close();
}
await shutdown();
