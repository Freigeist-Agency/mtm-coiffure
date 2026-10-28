// Whole-page real-wheel scroll pass: top to bottom with page.mouse.wheel only (never scrollTo).
// At every step: no horizontal overflow, no console/page errors. At the end: the page reached the bottom
// (no scroll lock trapping it) and took more than 10 steps.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/scroll-pass');
fs.mkdirSync(OUT, { recursive: true });

const STEP = 200, WAIT = 50, MAX_STEPS = 600;

async function pass(width, height, mobile) {
  const tag = `@${width}`;
  const { page, errors, close } = await openPage({ width, height, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await page.mouse.move(width / 2, height / 2);
  let steps = 0, stagnant = 0, last = -1, badOverflow = null, errAt = null, shots = 0;
  const state = () => page.evaluate(() => ({
    y: window.scrollY, sw: document.documentElement.scrollWidth, iw: window.innerWidth,
    wide: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 3).map(e => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '')),
  }));
  while (steps < MAX_STEPS) {
    await page.mouse.wheel(0, STEP);
    await page.waitForTimeout(WAIT);
    steps++;
    const s = await state();
    if (s.sw > s.iw && !badOverflow) badOverflow = `step ${steps} scrollY ${s.y}: scrollWidth ${s.sw} > innerWidth ${s.iw}; right-of-viewport: ${s.wide.join(', ')}`;
    if (errors.length && !errAt) errAt = `step ${steps} scrollY ${s.y}: ${errors.join(' | ')}`;
    if (steps % 5 === 0) { await page.screenshot({ path: path.join(OUT, `${width}-${steps}.png`) }); shots++; }
    if (s.y <= last) { if (++stagnant >= 3) break; } else stagnant = 0;
    last = s.y;
  }
  await page.waitForTimeout(150);
  const end = await page.evaluate(() => ({ y: window.scrollY, max: document.documentElement.scrollHeight - window.innerHeight }));
  assert(!badOverflow, `${tag}: no horizontal overflow at any step${badOverflow ? ' - ' + badOverflow : ''} (${steps} steps)`);
  assert(!errAt && errors.length === 0, `${tag}: 0 console/page errors during scroll${errAt ? ' - ' + errAt : ''}`);
  assert(Math.abs(end.y - end.max) <= 2, `${tag}: reached bottom (scrollY ${end.y}, max ${end.max})`);
  assert(steps > 10, `${tag}: more than 10 wheel steps (${steps})`);
  assert(shots > 0, `${tag}: ${shots} screenshots saved`);
  console.log(`   ${tag}: steps=${steps} finalScrollY=${end.y} max=${end.max}`);
  await close();
}

await pass(1440, 900, false);
await pass(375, 812, true);
await report();
