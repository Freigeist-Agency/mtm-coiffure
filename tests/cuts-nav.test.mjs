// The services photos' nav (js/cuts-nav.js; cofounder, 2026-11-16): on phones and tablets the swipeable row of photos gets the social
// slider's nav: the same round buttons and dots (same size, shape and colour, read from the page), six dots, the first dark.
// "Next" moves the row one photo and darkens the next dot, "previous" moves it back; at the end the last dot is dark; swiping the
// row by hand moves the dot too. Desktop (1024 and up) has no nav. No sideways scroll, no console errors.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [w, h, mobile, reduced] of [[375, 812, true], [390, 844, true], [768, 1024], [1023, 800], [1512, 900], [375, 812, true, true]]) {
  const tag = `@${w}${reduced ? ' reduced motion' : ''}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}), ...(reduced ? { reducedMotion: true } : {}) });
  await sleep(1500);
  const top = await page.evaluate(() => document.querySelector('.cuts').getBoundingClientRect().top + scrollY - 100);
  await page.evaluate(y => window.lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y), top); await sleep(1800);
  const vis = await page.evaluate(() => { const n = document.querySelector('.cuts-nav'); return !!n && getComputedStyle(n).display !== 'none'; });
  if (w >= 1024) { assert(!vis, `${tag}: no nav on desktop`); assert(errors.length === 0, `${tag}: 0 console errors`); await close(); continue; }
  assert(vis, `${tag}: the nav shows`);
  const same = await page.evaluate(() => {
    const pick = (e, ps) => { const cs = getComputedStyle(e); return ps.map(p => cs[p]).join('|'); };
    const P = ['width', 'height', 'borderRadius', 'backgroundColor', 'color'], D = ['width', 'height', 'borderRadius', 'backgroundColor'];
    const a = document.querySelector('.cuts-nav .radial-slider__btn--next'), b = document.querySelector('.social .radial-slider__btn--next');
    const da = document.querySelector('.cuts-nav .radial-slider__dot'), db = document.querySelector('.social .radial-slider__dot');
    return { btn: [pick(a, P), pick(b, P)], dot: [pick(da, D), pick(db, D)], icon: [a.innerHTML, b.innerHTML], dots: document.querySelectorAll('.cuts-nav .radial-slider__dot').length, photos: document.querySelectorAll('.cuts li').length };
  });
  assert(same.btn[0] === same.btn[1] && same.dot[0] === same.dot[1] && same.icon[0] === same.icon[1], `${tag}: buttons and dots identical to the social slider's (${same.btn[0]} / ${same.btn[1]})`);
  assert(same.dots === same.photos, `${tag}: one dot per photo (${same.dots})`);
  const st = () => page.evaluate(() => ({ x: document.querySelector('.cuts').scrollLeft, dot: [...document.querySelectorAll('.cuts-nav .radial-slider__dot')].findIndex(d => d.classList.contains('is-active')),
    first: (() => { const c = document.querySelector('.cuts').getBoundingClientRect(); return [...document.querySelectorAll('.cuts li')].findIndex(li => li.getBoundingClientRect().left >= c.left + 10); })() }));
  const s0 = await st();
  await page.locator('.cuts-nav .radial-slider__btn--next').click(); await sleep(900);
  const s1 = await st();
  await page.locator('.cuts-nav .radial-slider__btn--prev').click(); await sleep(900);
  const s2 = await st();
  assert(s0.dot === 0 && s1.dot === 1 && s1.x > s0.x + 50 && s1.first === 1 && s2.dot === 0 && s2.x < 2, `${tag}: next moves one photo and darkens dot 2, previous moves back (${s0.x}/${s0.dot} -> ${s1.x}/${s1.dot}, photo ${s1.first} first -> ${s2.x}/${s2.dot})`);
  for (let k = 0; k < 8; k++) { await page.locator('.cuts-nav .radial-slider__btn--next').click(); await sleep(450); }
  await sleep(600);
  const end = await st();
  assert(end.dot === same.photos - 1, `${tag}: at the end the last dot is dark (${end.dot})`);
  await page.evaluate(() => document.querySelector('.cuts').scrollTo({ left: 0, behavior: 'auto' })); await sleep(400);
  await page.evaluate(() => { const c = document.querySelector('.cuts'), li = c.children; c.scrollTo({ left: li[2].offsetLeft - li[0].offsetLeft, behavior: 'auto' }); }); await sleep(400);
  assert((await st()).dot === 2, `${tag}: swiping the row by hand moves the dot too`);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no sideways scroll`);
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
