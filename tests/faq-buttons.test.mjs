// FAQ section (Figma 324:3985, 2026-11-15): the "MTM by Mo" and "MTM by Abdul" pills sit on one line, Mo 145 wide at 547/979 and
// Abdul 156 wide at 718/979 at 1512 (within 1px, relative to the section); on every width their tops match and they do not overlap.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t = 1) => Math.abs(a - b) <= t;
for (const [w, h, mobile] of [[1512, 900], [768, 1024], [375, 812, true], [2560, 1440]]) {
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1200);
  const r = await page.evaluate(() => { const s = document.querySelector('.faq').getBoundingClientRect(); const b = q => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, r: r.right - s.left, h: r.height }; }; return { mo: b('.pill-btn--mo'), ab: b('.pill-btn--abdul') }; });
  if (w === 1512) assert(near(r.mo.x, 547) && near(r.mo.y, 979) && near(r.mo.w, 145) && near(r.ab.x, 718) && near(r.ab.y, 979) && near(r.ab.w, 156), `@1512: Mo at 547/979, Abdul at 718/979 (${JSON.stringify(r)})`);
  assert(near(r.mo.y, r.ab.y, 0.5) && near(r.mo.h, r.ab.h, 0.5), `@${w}: both pills on one line (${r.mo.y.toFixed(1)} vs ${r.ab.y.toFixed(1)})`);
  assert(r.mo.r <= r.ab.x, `@${w}: they do not overlap`);
  assert(errors.length === 0, `@${w}: 0 console errors`);
  await close();
}
await report();
