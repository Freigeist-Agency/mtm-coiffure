// Motion carried over to the Desktop_new layout (2026-11-15): the two older animations whose targets are still on the page.
//   1. (retired 2026-11-15: the Standorte stretch was removed on request; tests/locations-screen.test.mjs checks it stays gone)
//   2. The footer's white dome (js/arc-scroll.js) deepens as it rises over the team photo: its depth factor never falls while scrolling down
//      to the end of the page, is (near) full at the end, and flattens again on the way back up; 768px and up (the dome exists there).
// Under reduced motion the dome does not run.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const want = p => 1 + (1 - Math.cos(Math.PI * p)) / 2;

for (const [w, h, mobile] of [[1512, 900, false], [1440, 900, false], [768, 1024, false], [375, 812, true], [2560, 1440, false]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1500);
  // 2
  if (w >= 768) {
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const f = [];
    for (const k of [0.94, 0.96, 0.98, 1]) { await go(page, max * k); await sleep(700); f.push(await page.evaluate(() => ({ s: window.arcScroll ? window.arcScroll.factor('footer') : null, live: document.querySelector('.footer-top').classList.contains('arc-live') }))); }
    await go(page, max * 0.94); await sleep(700);
    const back = await page.evaluate(() => window.arcScroll ? window.arcScroll.factor('footer') : null);
    assert(f.every(x => x.live && x.s != null) && f.every((x, i) => i === 0 || x.s >= f[i - 1].s - 0.001) && f[f.length - 1].s >= 0.99 && f[0].s < f[f.length - 1].s - 0.05,
      `${tag} 2: the footer dome deepens to full at the end (${f.map(x => x.s && x.s.toFixed(3)).join(',')})`);
    assert(back != null && Math.abs(back - f[0].s) < 0.01, `${tag} 2: and flattens again on the way back (${back && back.toFixed(3)} vs ${f[0].s && f[0].s.toFixed(3)})`);
  }
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}
{
  const { page, close } = await openPage({ width: 1512, height: 900, reducedMotion: true });
  await sleep(1200);
  const r = await page.evaluate(() => ({ arc: !!window.arcScroll }));
  assert(!r.arc, `@1512 reduced-motion: neither runs (${JSON.stringify(r)})`);
  await close();
}
await report();
