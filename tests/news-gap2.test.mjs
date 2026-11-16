// Social -> news spacing (cofounder, 2026-11-16): from 1024 up, the room from the social slider's arrows to the "News & Updates"
// heading equals the room from the news cards to the photo gallery under them (within 1.5px). Below 1024 the stacked layout keeps
// its own spacing, which is already larger above the heading than under the cards. No white seam: both edges are plain white.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [w, h, mobile] of [[1512, 900], [1440, 900], [1024, 768], [2560, 1440], [768, 1024], [375, 812, true]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1800);
  const r = await page.evaluate(() => {
    const y = e => { const r = e.getBoundingClientRect(); return { t: r.top + scrollY, b: r.bottom + scrollY }; };
    const ctl = Math.max(...[...document.querySelectorAll('.radial-slider__btn, .radial-slider__dot')].map(e => y(e).b));
    const cards = Math.max(...[...document.querySelectorAll('.news-card')].map(e => y(e).b));
    return { above: y(document.querySelector('.news-head h2')).t - ctl, below: y(document.querySelector('.news .team-row')).t - cards };
  });
  if (w >= 1024) assert(Math.abs(r.above - r.below) <= 1.5, `${tag}: arrows -> heading ${r.above.toFixed(1)}px, the same as cards -> gallery ${r.below.toFixed(1)}px`);
  else assert(r.above > r.below, `${tag}: stacked layout keeps more room above the heading (${r.above.toFixed(1)}) than under the cards (${r.below.toFixed(1)})`);
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
