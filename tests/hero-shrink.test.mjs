// Hero shrink and review card corners (cofounder, 2026-11-16).
// Hero (js/hero-shrink.js), at 1512, 1440, 1024, 768, 375 and 2560:
//   1. at the top of the page it is full size with square corners;
//   2. scrubbed by the scroll with sine in-out, it scales around its centre to 97.5% halfway (sine in-out is exactly half way at
//      the middle) and 95% at the end (85% at first; cofounder: too much), its corners rounding to 10.3px and then 20px on screen
//      (the corner, 0 to 20 / 0.95, times the scale);
//   3. 768 and up it is pinned meanwhile (its centre stays put) for 0.6 of a screen of scrolling; below 768 no pin: it shrinks while it
//      scrolls away (its top at the top of the screen to its bottom there);
//   4. scrolling back to the top: full size, square corners again;
//   5. the white page shows around it while it is small.
// Under reduced motion it never scales and has 20px corners.
// Review card (js/review-grow.js), 768 and up: 20px corners at the start of its grow, square (0px) once it fills the screen; its
// timeline eases in sine in-out. Below 768 (no grow) its card has 20px corners.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const near = (a, b, t) => Math.abs(a - b) <= t;

for (const [w, h, mobile] of [[1512, 900], [1440, 900], [1024, 768], [768, 1024], [375, 812, true], [2560, 1440]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1800);
  const t = await page.evaluate(() => { const s = window.ScrollTrigger && ScrollTrigger.getById('hero-shrink'); return s ? { s: s.start, e: s.end, pin: !!s.pin } : null; });
  assert(!!t, `${tag}: the hero shrink runs`);
  if (!t) { await close(); continue; }
  const read = () => page.evaluate(() => { const e = document.querySelector('.hero'), r = e.getBoundingClientRect(), sc = r.width / e.offsetWidth;
    const bg = getComputedStyle(document.body).backgroundColor;
    return { sc, rad: parseFloat(getComputedStyle(e).borderTopLeftRadius) * sc, cx: r.left + r.width / 2, cy: r.top + r.height / 2, top: r.top, bg,
      edge: (() => { const el = document.elementFromPoint(3, Math.max(5, r.top + r.height / 2)); return el ? el.tagName + '.' + el.className : ''; })() }; });
  const at = [], ps = [0, 0.5, 1];
  for (const p of ps) { await go(page, t.s + (t.e - t.s) * p); await sleep(900); at.push(await read()); }
  await go(page, t.s + (t.e - t.s) * 0.25); await sleep(900);
  const q = await read(), qWant = 1 - 0.05 * (1 - Math.cos(Math.PI * 0.25)) / 2;   // sine in-out: 14.6% along at a quarter (straight: 25%)
  assert(near(q.sc, qWant, 0.0012), `${tag} 2: a quarter in it is ${qWant.toFixed(4)}, the sine in-out curve (${q.sc.toFixed(4)}; straight would be 0.9875)`);
  assert(near(at[0].sc, 1, 0.002) && at[0].rad < 0.1, `${tag} 1: full size, square corners at the top (${at[0].sc.toFixed(3)}, ${at[0].rad.toFixed(1)})`);
  assert(near(at[1].sc, 0.975, 0.004) && near(at[1].rad, 20 / 0.95 * 0.5 * 0.975, 0.3), `${tag} 2: halfway 97.5% with 10.3px corners (half of 21.05 x 0.975), sine in-out (${at[1].sc.toFixed(3)}, ${at[1].rad.toFixed(1)})`);
  assert(near(at[2].sc, 0.95, 0.003) && near(at[2].rad, 20, 0.3), `${tag} 2: 95% with 20px corners at the end (${at[2].sc.toFixed(3)}, ${at[2].rad.toFixed(1)})`);
  if (w >= 768) assert(t.pin && near(t.e - t.s, h * 0.6, 2) && at.every(a => near(a.cx, at[0].cx, 1) && near(a.cy, at[0].cy, 1)), `${tag} 3: pinned, its centre still, for 0.6 of a screen (${(t.e - t.s).toFixed(0)}; centres ${at.map(a => a.cy.toFixed(0)).join(',')})`);
  else assert(!t.pin && at[2].top < at[0].top - h * 0.5, `${tag} 3: no pin on a phone, it scrolls away as it shrinks (top ${at[0].top.toFixed(0)} -> ${at[2].top.toFixed(0)})`);
  assert(at[2].bg === 'rgb(255, 255, 255)', `${tag} 5: the white page around it (${at[2].bg})`);
  await go(page, 0); await sleep(900);
  const back = await read();
  assert(near(back.sc, 1, 0.002) && back.rad < 0.1, `${tag} 4: back at the top, full size and square (${back.sc.toFixed(3)})`);
  // the review card
  const rv = await page.evaluate(() => { const s = window.ScrollTrigger && ScrollTrigger.getById('review-grow'); return s ? { s: s.start, e: s.end, ease: window.reviewGrow.tl.vars.defaults.ease, total: window.reviewGrow.total } : null; });
  if (w >= 768) {
    assert(!!rv && rv.ease === 'sine.inOut', `${tag} review: the grow runs, easing in sine in-out (${rv && rv.ease})`);
    if (rv) {
      const clip = async p => { await go(page, rv.s + (rv.e - rv.s) * p); await sleep(1100); return page.evaluate(() => getComputedStyle(document.querySelector('.reviews__frame')).clipPath); };
      const c0 = await clip(0.001), c1 = await clip(1 / rv.total + 0.01);
      assert(Math.abs(parseFloat((c0.match(/round ([0-9.]+)px/) || [])[1]) - 20) < 0.5 && /round 0px|^inset\(0px\)$|inset\(0px 0px 0px 0px\)/.test(c1) && !/round [1-9]/.test(c1), `${tag} review: 20px corners at the start, square at full screen (${c0.slice(-12)} -> ${c1.slice(-14)})`);
    }
  } else {
    const r = await page.evaluate(() => getComputedStyle(document.querySelector('.reviews__card')).borderTopLeftRadius);
    assert(r === '20px', `${tag} review: the card has 20px corners (${r})`);
  }
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
{
  const { page, close } = await openPage({ width: 1512, height: 900, reducedMotion: true });
  await sleep(1500);
  await go(page, 400); await sleep(600);
  const r = await page.evaluate(() => { const e = document.querySelector('.hero'); return { sc: e.getBoundingClientRect().width / e.offsetWidth, rad: getComputedStyle(e).borderTopLeftRadius, st: !!(window.ScrollTrigger && ScrollTrigger.getById('hero-shrink')) }; });
  assert(!r.st && Math.abs(r.sc - 1) < 0.002 && r.rad === '20px', `@1512 reduced motion: no shrink, 20px corners (${JSON.stringify(r)})`);
  await close();
}
await report();
