// Hero text on load and the services' entrance (js/intro-motion.js; cofounder, 2026-11-16, from a reference recording).
// Home page and a location page, at 1512, 1024, 768, 375 and 2560:
//   1. the split into masks changes no layout: every animated box is where it is without motion (reduced motion), within 0.5px;
//   2. on load each hero line starts hidden under its own mask (its content a full line below, clipped), slides up into place
//      (power4.out, 0.9s), the next line 0.2s later (so early on the first line is further along than the last), and all are in
//      place after 1.6s;
//   3. home only: the services' Google card and photos are invisible and 80px low while the section is below the screen, rise into
//      place as it comes in (the photos one after another: early on the first is further along than the last; the heading's lines
//      slide up from their masks), and sink back when the page is scrolled back to the top.
// Under reduced motion nothing is split and nothing moves.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const near = (a, b, t) => Math.abs(a - b) <= t;

const HERO = { 'index.html': ['.hero-claim__light', '.hero-claim__bold', '.hero-hello__word', '.hero-arabic'], 'locations/nuembrecht.html': ['.loc-hero__title', '.loc-hero__info'] };
const SVC = ['.services-title', '.svc-rating', '.cuts li:nth-child(1 of :not(.is-clone))', '.cuts li:nth-child(6 of :not(.is-clone))'];
// positions relative to the element's section: the hero's pin adds scroll room above the services only when motion is on
const boxes = (page, sels) => page.evaluate(sels => sels.map(s => { const e = document.querySelector(s); if (!e) return null; const host = e.closest('.hl-mask--img') || e; const r = host.getBoundingClientRect(), sec = host.closest('section').getBoundingClientRect(); return [r.left - sec.left, r.top - sec.top, r.width, r.height]; }), sels);

for (const path of Object.keys(HERO)) {
  for (const [w, h, mobile] of [[1512, 900], [1024, 768], [768, 1024], [375, 812, true], [2560, 1440]]) {
    const tag = `${path} @${w}`;
    const sels = HERO[path].concat(path === 'index.html' ? SVC : []);
    const still = await openPage({ width: w, height: h, path, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    await sleep(1500);
    const ref = await boxes(still.page, sels);
    const split = await still.page.evaluate(() => document.querySelectorAll('.hl-mask').length);
    await still.close();
    assert(split === 0, `${tag}: under reduced motion nothing is split (${split})`);

    const { page, errors, close } = await openPage({ width: w, height: h, path, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    const ins = () => page.evaluate(() => [...document.querySelectorAll('.hero .hl-in, .hero .hl-mask--img > img')].map(e => { const m = (e.closest('.hl-mask--img') || e.parentElement).getBoundingClientRect(), r = e.getBoundingClientRect();
      return { off: (r.top - m.top) / (m.height || 1), clip: getComputedStyle(e.closest('.hl-mask--img') || e.parentElement).overflowY }; }));
    // the timeline itself, paused and set to a time (the page's own timing races the test's first sample)
    const at = async t => { await page.evaluate(t => { const tl = window.introMotion.hero; tl.pause(); tl.time(t); }, t); return ins(); };
    const t0 = await at(0), t1 = await at(0.15), t2 = await at(1.6);
    await page.evaluate(() => { window.introMotion.hero.play(); });
    const heroNow = await boxes(page, HERO[path]), heroRef = ref.slice(0, HERO[path].length);   // at the top, before the hero shrinks on scroll
    assert(heroNow.every((b, i) => b && heroRef[i] && b.every((v, k) => near(v, heroRef[i][k], 0.5))), `${tag} 1: the hero's text where it is without motion (${heroNow.map((b, i) => b && heroRef[i] ? Math.max(...b.map((v, k) => Math.abs(v - heroRef[i][k]))).toFixed(2) : 'x').join(' ')})`);
    assert(t0.length >= 2 && t0.every(x => x.clip === 'clip'), `${tag} 2: ${t0.length} hero lines, each clipped by its own mask`);
    assert(t0.every(x => x.off > 0.5), `${tag} 2: at the start every line is (mostly) below its mask (${t0.map(x => x.off.toFixed(2))})`);
    const offs = t1.map(x => x.off);
    assert(Math.min(...offs) < Math.max(...offs) - 0.05, `${tag} 2: line by line: 0.15s in, the first line is further along than the later ones (${offs.map(x => x.toFixed(2))})`);
    assert(t2.every(x => Math.abs(x.off) < 0.005), `${tag} 2: all in place after 1.6s (${t2.map(x => x.off.toFixed(3))})`);
    if (path === 'index.html') {
      const sv = () => page.evaluate(() => { const g = e => { const cs = getComputedStyle(e); return { o: +cs.opacity, y: new DOMMatrix(cs.transform).f }; };
        return { card: g(document.querySelector('.svc-rating')), photos: [...document.querySelectorAll('.cuts li:not(.is-clone)')].map(g), heads: [...document.querySelectorAll('.services-title .hl-in')].map(e => { const m = e.parentElement.getBoundingClientRect(); return (e.getBoundingClientRect().top - m.top) / m.height; }) }; });
      const before = await sv();
      assert(before.card.o === 0 && near(before.card.y, 80, 0.5) && before.photos.every(p => p.o === 0 && near(p.y, 80, 0.5)) && before.heads.every(x => x > 0.9), `${tag} 3: below the screen the card and photos are hidden 80px low, the heading under its masks`);
      const top = await page.evaluate(() => document.querySelector('.services').getBoundingClientRect().top + scrollY);
      await go(page, top - h * 0.1); await sleep(250);
      const early = await sv();
      await sleep(1600);
      const after = await sv();
      assert(early.photos[0].y < early.photos[early.photos.length - 1].y - 2 || early.photos[0].o > early.photos[early.photos.length - 1].o + 0.05, `${tag} 3: the photos one after another (${early.photos.map(p => p.y.toFixed(0)).join(',')})`);
      assert(after.card.o === 1 && Math.abs(after.card.y) < 0.5 && after.photos.every(p => p.o === 1 && Math.abs(p.y) < 0.5) && after.heads.every(x => Math.abs(x) < 0.005), `${tag} 3: in view, all risen into place`);
      const now = (await boxes(page, SVC)), svcRef = ref.slice(HERO[path].length);
      assert(now.every((b, i) => b && svcRef[i] && b.every((v, k) => near(v, svcRef[i][k], 0.5))), `${tag} 1: the services' boxes where they are without motion (${now.map((b, i) => b && svcRef[i] ? Math.max(...b.map((v, k) => Math.abs(v - svcRef[i][k]))).toFixed(2) : 'x').join(' ')})`);
      await go(page, 0); await sleep(1600);
      const back = await sv();
      assert(back.card.o === 0 && back.photos.every(p => p.o === 0), `${tag} 3: scrolled back to the top they sink back`);
    }
    assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
    await close();
  }
}
await report();
