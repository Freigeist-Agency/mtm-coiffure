// Team photo above the footer (js/photo-grow.js; cofounder, 2026-11-16): scales from 100% to 105% around its centre, scrubbed with
// sine in-out (102.5% halfway), its corners staying 20px on screen; back to 100% scrolling up.
// 768 and up: it pins with its top 7.5% down the screen ("about 5-10%") and stays pinned to the end of the page: it grows over 0.6 of
// a screen of scrolling, the footer's white is not on screen until then, and then the footer slides up over the still photo.
// Below 768 no pin: it grows while crossing the screen and the footer follows it.
// Under reduced motion it never scales. At 1512, 1440, 1024, 768, 375 and 2560.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const near = (a, b, t) => Math.abs(a - b) <= t;
for (const [w, h, mobile] of [[1512, 900], [1440, 900], [1024, 768], [768, 1024], [375, 812, true], [2560, 1440]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1800);
  const t = await page.evaluate(() => { const s = window.ScrollTrigger && ScrollTrigger.getById('photo-grow'); return s ? { s: s.start, e: s.end, pin: !!s.pin } : null; });
  assert(!!t, `${tag}: the photo grow runs`);
  if (!t) { await close(); continue; }
  const read = () => page.evaluate(() => { const e = document.querySelector('.finale-photo img'), r = e.getBoundingClientRect(), sc = r.width / e.offsetWidth;
    // the footer's solid white starts 17.2222vw below its top (its top band is see-through, css/site.css): where that is on screen
    const ft = document.querySelector('.site-footer').getBoundingClientRect().top + innerWidth * 0.172222;
    return { sc, rad: parseFloat(getComputedStyle(e).borderTopLeftRadius) * sc, cy: r.top + r.height / 2, top: r.top, solid: ft, bottomIs: ft < innerHeight - 2 ? 'footer' : 'photo' }; });   // 2px: on a photo shorter than the screen the footer arrives exactly as the grow ends
  const want = (await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.finale-photo img')).borderTopLeftRadius)));
  const at = [];
  for (const p of [0, 0.5, 1]) { await go(page, t.s + (t.e - t.s) * p); await sleep(900); at.push(await read()); }
  await go(page, t.s + (t.e - t.s) * 0.25); await sleep(900);
  const q = await read(), qWant = 1 + 0.05 * (1 - Math.cos(Math.PI * 0.25)) / 2;   // sine in-out: 14.6% along at a quarter (straight: 25%)
  assert(near(q.sc, qWant, 0.0012), `${tag}: a quarter in it is ${qWant.toFixed(4)}, the sine in-out curve (${q.sc.toFixed(4)}; straight would be 1.0125)`);
  assert(near(at[0].sc, 1, 0.002), `${tag}: 100% at the start (${at[0].sc.toFixed(4)})`);
  assert(near(at[1].sc, 1.025, 0.003), `${tag}: 102.5% halfway, sine in-out (${at[1].sc.toFixed(4)})`);
  assert(near(at[2].sc, 1.05, 0.002), `${tag}: 105% at the end (${at[2].sc.toFixed(4)})`);
  assert(at.every(a => near(a.rad, want, 0.3)), `${tag}: the corners stay ${want.toFixed(1)}px on screen (${at.map(a => a.rad.toFixed(2))})`);
  if (w >= 768) {
    const pin = await page.evaluate(() => { const p = ScrollTrigger.getById('photo-pin'); return p ? { s: p.start, e: p.end, max: document.documentElement.scrollHeight - innerHeight } : null; });
    assert(!!pin && near(pin.s, t.s, 1) && near(pin.e, pin.max, 2) && near(t.e - t.s, h * 0.6, 2), `${tag}: pinned from the grow's start to the end of the page, growing over 0.6 of a screen`);
    assert(near(at[0].top, h * 0.075, 1.5) && at.every(a => near(a.cy, at[0].cy, 1.5)), `${tag}: its top 7.5% down at the pin, its centre still while it grows (top ${at[0].top.toFixed(1)} of ${h}; centres ${at.map(a => a.cy.toFixed(0))})`);
    assert(at[2].bottomIs !== 'footer', `${tag}: the footer is not on screen before the grow is done (${at[2].bottomIs})`);
    const end = []; for (const y of [(t.e + pin.max) / 2, pin.max]) { await go(page, y); await sleep(900); end.push(await read()); }
    assert(end.every(a => near(a.cy, at[0].cy, 1.5) && near(a.sc, 1.05, 0.002)) && end[1].bottomIs === 'footer', `${tag}: then the footer slides over the still photo (centres ${end.map(a => a.cy.toFixed(0))}, at the bottom: ${end[1].bottomIs})`);
  }
  else assert(!t.pin && at[2].top < at[0].top - h * 0.5, `${tag}: no pin on a phone, it crosses the screen as it grows`);
  await go(page, t.s - h); await sleep(900);
  assert(near((await read()).sc, 1, 0.002), `${tag}: back to 100% scrolling up`);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await go(page, max); await sleep(900);
  const ft = await page.evaluate(() => { const r = document.querySelector('.site-footer').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  assert(ft, `${tag}: the footer is on screen at the end of the page`);
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
{
  const { page, close } = await openPage({ width: 1512, height: 900, reducedMotion: true });
  await sleep(1500);
  const r = await page.evaluate(() => ({ st: !!(window.ScrollTrigger && ScrollTrigger.getById('photo-grow')), tf: getComputedStyle(document.querySelector('.finale-photo img')).transform }));
  assert(!r.st && (r.tf === 'none' || r.tf === 'matrix(1, 0, 0, 1, 0, 0)'), `@1512 reduced motion: no grow (${JSON.stringify(r)})`);
  await close();
}
await report();
