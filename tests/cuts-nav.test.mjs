// The services photos' nav (js/cuts-nav.js; cofounder, 2026-11-16): on phones and tablets the swipeable row of photos gets the social
// slider's nav: the same round buttons and dots (same size, shape and colour, read from the page), six dots, the first dark.
// "Next" moves the row one photo and darkens the next dot, "previous" moves it back; at the end the last dot is dark; swiping the
// row by hand moves the dot too. Endless (2026-11-19): previous at the first photo goes to the last, next keeps going round, a hidden copy of the six sits before and after the real ones, and the row always settles back among the real ones; desktop has no copies. The nav is left-aligned: its first button starts where the first photo starts (2026-11-19). Desktop (1024 and up) has no nav. No sideways scroll, no console errors.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [w, h, mobile, reduced] of [[375, 812, true], [390, 844, true], [768, 1024], [1023, 800], [1512, 900], [375, 812, true, true]]) {
  const tag = `@${w}${reduced ? ' reduced motion' : ''}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}), ...(reduced ? { reducedMotion: true } : {}) });
  await sleep(1500);
  const top = await page.evaluate(() => document.querySelector('.cuts').getBoundingClientRect().top + scrollY - 100);
  await page.evaluate(y => window.lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y), top); await sleep(1800);
  if (w < 1024) { const al = await page.evaluate(() => { const c = document.querySelector('.cuts').getBoundingClientRect(); const li = [...document.querySelectorAll('.cuts li')].find(l => l.getBoundingClientRect().left >= c.left + 10); return { b: document.querySelector('.cuts-nav .radial-slider__btn').getBoundingClientRect().left, p: li.getBoundingClientRect().left }; }); assert(Math.abs(al.b - al.p) < 1, `${tag}: the nav starts at the first photo's left edge (button ${al.b.toFixed(1)}, photo ${al.p.toFixed(1)})`); }
  const vis = await page.evaluate(() => { const n = document.querySelector('.cuts-nav'); return !!n && getComputedStyle(n).display !== 'none'; });
  if (w >= 1024) { assert(!vis, `${tag}: no nav on desktop`); assert(await page.evaluate(() => document.querySelectorAll('.cuts li').length === 6 && !document.querySelector('.cuts .is-clone')), `${tag}: desktop: the six photos, no copies`); assert(errors.length === 0, `${tag}: 0 console errors`); await close(); continue; }
  assert(vis, `${tag}: the nav shows`);
  const same = await page.evaluate(() => {
    const pick = (e, ps) => { const cs = getComputedStyle(e); return ps.map(p => cs[p]).join('|'); };
    const P = ['width', 'height', 'borderRadius', 'backgroundColor', 'color'], D = ['width', 'height', 'borderRadius', 'backgroundColor'];
    const a = document.querySelector('.cuts-nav .radial-slider__btn--next'), b = document.querySelector('.social .radial-slider__btn--next');
    const da = document.querySelector('.cuts-nav .radial-slider__dot'), db = document.querySelector('.social .radial-slider__dot');
    return { btn: [pick(a, P), pick(b, P)], dot: [pick(da, D), pick(db, D)], icon: [a.innerHTML, b.innerHTML], dots: document.querySelectorAll('.cuts-nav .radial-slider__dot').length, photos: document.querySelectorAll('.cuts li:not(.is-clone)').length, all: document.querySelectorAll('.cuts li').length, clonesHidden: [...document.querySelectorAll('.cuts li.is-clone')].every(l => l.getAttribute('aria-hidden') === 'true' && l.querySelector('img').alt === '') };
  });
  assert(same.btn[0] === same.btn[1] && same.dot[0] === same.dot[1] && same.icon[0] === same.icon[1], `${tag}: buttons and dots identical to the social slider's (${same.btn[0]} / ${same.btn[1]})`);
  assert(same.dots === same.photos, `${tag}: one dot per photo (${same.dots})`);
  const st = () => page.evaluate(() => { const c = document.querySelector('.cuts'), r = c.getBoundingClientRect(); const lis = [...c.querySelectorAll('li')]; const real = [...c.querySelectorAll('li:not(.is-clone)')].map(l => l.querySelector('img').getAttribute('src'));
    const at = lis.find(li => li.getBoundingClientRect().left >= r.left + 10);
    return { x: c.scrollLeft, dot: [...document.querySelectorAll('.cuts-nav .radial-slider__dot')].findIndex(d => d.classList.contains('is-active')), first: real.indexOf(at.querySelector('img').getAttribute('src')), inSet: !at.classList.contains('is-clone') }; });
  assert(same.all === 3 * same.photos && same.clonesHidden, `${tag}: a hidden copy of the six before and after the real ones (${same.all} photos)`);
  const s0 = await st();
  await page.locator('.cuts-nav .radial-slider__btn--next').click(); await sleep(900);
  const s1 = await st();
  await page.locator('.cuts-nav .radial-slider__btn--prev').click(); await sleep(900);
  const s2 = await st();
  assert(s0.dot === 0 && s0.first === 0 && s0.inSet && s1.dot === 1 && s1.x > s0.x + 50 && s1.first === 1 && s2.dot === 0 && s2.first === 0 && Math.abs(s2.x - s0.x) < 2, `${tag}: next moves one photo and darkens dot 2, previous moves back (${s0.x}/${s0.dot} -> ${s1.x}/${s1.dot}, photo ${s1.first} first -> ${s2.x}/${s2.dot})`);
  await page.locator('.cuts-nav .radial-slider__btn--prev').click(); await sleep(1000);
  const back = await st();
  assert(back.dot === same.photos - 1 && back.first === same.photos - 1 && back.inSet, `${tag}: previous at the first photo goes round to the last (dot ${back.dot}, photo ${back.first}, settled among the real ones: ${back.inSet})`);
  let seq = [];
  for (let k = 0; k < 14; k++) { await page.locator('.cuts-nav .radial-slider__btn--next').click(); await sleep(reduced ? 150 : 700); seq.push((await st()).dot); }
  await sleep(500);
  const fin = await st();
  const want = [...Array(14)].map((_, k) => k % same.photos);
  assert(JSON.stringify(seq) === JSON.stringify(want) && fin.first === fin.dot && fin.inSet, `${tag}: next goes on round and round, never stopping (${seq.join(',')}), ending among the real ones on photo ${fin.first}`);
  for (let k = 0; k < 4; k++) { await page.locator('.cuts-nav .radial-slider__btn--next').click(); await sleep(120); }
  await sleep(1500);
  const fast = await st(), off = await page.evaluate(() => { const c = document.querySelector('.cuts'), r = c.getBoundingClientRect(); const at = [...c.querySelectorAll('li')].find(li => li.getBoundingClientRect().left >= r.left + 10); return at.getBoundingClientRect().left - r.left - parseFloat(getComputedStyle(c).paddingLeft); });
  assert(fast.dot === (fin.dot + 4) % same.photos && Math.abs(off) < 1 && fast.inSet, `${tag}: four quick clicks move four photos and land exactly on one (dot ${fin.dot} -> ${fast.dot}, ${off.toFixed(2)}px off)`);
  await page.evaluate(() => { const c = document.querySelector('.cuts'), lis = [...c.querySelectorAll('li')], r = c.getBoundingClientRect(); const real = [...c.querySelectorAll('li:not(.is-clone)')]; c.scrollTo({ left: c.scrollLeft + real[2].getBoundingClientRect().left - r.left - parseFloat(getComputedStyle(c).paddingLeft), behavior: 'auto' }); }); await sleep(500);
  assert((await st()).dot === 2, `${tag}: swiping the row by hand moves the dot too`);
  const edge = await page.evaluate(async () => { const c = document.querySelector('.cuts'); c.scrollTo({ left: c.scrollWidth, behavior: 'auto' }); await new Promise(r => setTimeout(r, 600)); const max = c.scrollWidth - c.clientWidth; return { x: c.scrollLeft, max }; });
  assert(edge.x < edge.max - 50, `${tag}: flung to the very end, the row settles back among the real ones, so there is always more to swipe (${edge.x} of ${edge.max})`);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no sideways scroll`);
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
