// News cards -> team photo gap, 2026-11-13 (cofounder): "reduce the spacing to about 50% of what it is now on desktop, and check for similar
// effect on mobile". Measured before the change (document px, 2026-11-13):
//   768px and up (cards side by side): the photo's top is 244.3 / 458 / 814.2 px below the cards' bottom at 768 / 1440 / 2560;
//   phones (the cards stack and stick): the largest white gap seen on screen between the stuck second card and the rising photo, 380.6 px at 375x812.
// Now each is half of that (within 3px; the phone gap within 5%, as it is set in vh).
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const BEFORE = { 768: 244.3, 1440: 458, 2560: 814.2, 375: 380.6 };

for (const [w, h, mobile] of [[768, 1024, false], [1440, 900, false], [2560, 1440, false], [375, 812, true]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1500);
  const r = await page.evaluate(async () => {
    const card = document.querySelectorAll('.news-card')[1], fin = document.querySelector('.news .finale');
    const doc = e => { const b = e.getBoundingClientRect(); return { t: b.top + scrollY, b: b.bottom + scrollY }; };
    const go = async y => { window.lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); };
    const cb = doc(card).b, ft = doc(fin).t;
    let maxGap = 0;
    for (let y = cb - innerHeight; y < ft + 200; y += 20) { await go(y); const c = card.getBoundingClientRect(), f = fin.getBoundingClientRect();
      if (c.bottom > 0 && f.top < innerHeight) maxGap = Math.max(maxGap, f.top - c.bottom); }
    return { layout: ft - cb, seen: maxGap };
  });
  const want = BEFORE[w] / 2;
  if (mobile) assert(Math.abs(r.seen / want - 1) <= 0.05, `${tag}: the white gap seen under the stuck cards is half of before (${r.seen.toFixed(1)}px, want ${want.toFixed(1)})`);
  else assert(Math.abs(r.layout - want) <= 3 && Math.abs(r.seen - want) <= 3, `${tag}: the photo is half as far below the cards (${r.layout.toFixed(1)}px, seen ${r.seen.toFixed(1)}; want ${want.toFixed(1)})`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

await report();
