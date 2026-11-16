// Standorte layout (cofounder, 2026-11-16: "change the location section back to the original height and on mobile and tablet have
// the cards stack like initially and make them twice the height they are now"; it was one screen tall on 2026-11-15).
// 1024 and up: Figma's 1185 tall (x width/1512), two cards side by side full height, title top 443, names 899, info 954 (all /1185),
//   the title centred on x 752.
// Below 1024: the title on top, clear of the nav pill; the two cards stacked under it, full width, each 100svh - 158.4px tall (twice
//   the half screen below the title each had before); each card's name and whole info block inside it.
// Every size: the title keeps its size while scrolling (no stretch), no sideways scroll, no errors.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const near = (a, b, t = 1) => Math.abs(a - b) <= t;

for (const [w, h, mobile] of [[1512, 900], [1440, 900], [1280, 720], [768, 1024], [375, 812, true], [390, 664, true], [2560, 1440]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1500);
  const top = await page.evaluate(() => document.querySelector('.locations').getBoundingClientRect().top + scrollY);
  const scales = [];
  for (const dy of [-h / 2, 0, h / 2]) {
    await go(page, top + dy); await sleep(400);
    scales.push(await page.evaluate(() => { const e = document.querySelector('.locations__title'); return [new DOMMatrix(getComputedStyle(e).transform).d, e.getBoundingClientRect().height]; }));
  }
  await go(page, top); await sleep(600);
  const r = await page.evaluate(() => {
    const s = document.querySelector('.locations').getBoundingClientRect();
    const rel = e => { const r = e.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, b: r.bottom - s.top }; };
    const g = document.createRange(); g.selectNodeContents(document.querySelector('.locations__title')); const ink = g.getBoundingClientRect();
    const p = document.createElement('div'); p.style.cssText = 'position:fixed;height:100svh'; document.body.appendChild(p); const svh = p.offsetHeight; p.remove();
    return { sh: s.height, t: rel(document.querySelector('.locations__title')), inkTop: ink.top, navB: document.querySelector('.pill-nav__plate').getBoundingClientRect().bottom,
      cards: [...document.querySelectorAll('.loc-card')].map(c => ({ c: rel(c), n: rel(c.querySelector('.loc-card__name')), i: rel(c.querySelector('.loc-card__info')) })),
      vw: innerWidth, sw: document.documentElement.scrollWidth, svh };
  });
  assert(scales.every(s => near(s[0], 1, 0.001) && near(s[1], scales[0][1], 0.5)), `${tag}: the title keeps its size while scrolling`);
  assert(r.cards.length === 2 && r.cards.every(k => k.n.y >= k.c.y && k.i.b <= k.c.b + 0.5 && k.n.b <= k.i.y + 1), `${tag}: each card's name and info inside it, name above info`);
  if (w >= 1024) {
    const u = w / 1512, k = r.cards[0];
    assert(near(r.sh, 1185 * u), `${tag}: Figma's height, 1185 x ${u.toFixed(3)} (${r.sh.toFixed(1)})`);
    assert(near(r.t.y, 443 * u, 1.5) && near(k.n.y, 899 * u, 1.5) && near(k.i.y, 954 * u, 1.5), `${tag}: title 443, name 899, info 954 (${r.t.y.toFixed(1)}, ${k.n.y.toFixed(1)}, ${k.i.y.toFixed(1)})`);
    assert(near(r.t.x + r.t.w / 2, 752 * u, 1.5), `${tag}: title centred on x 752`);
    assert(near(r.cards[0].c.y, 0) && near(r.cards[1].c.y, 0) && near(r.cards[0].c.h, r.sh) && near(r.cards[1].c.x, r.cards[0].c.w), `${tag}: two cards side by side, full height`);
  } else {
    assert(r.inkTop >= r.navB && r.t.b <= r.cards[0].c.y + 1, `${tag}: the title on top, clear of the nav pill (${r.inkTop.toFixed(0)} >= ${r.navB.toFixed(0)})`);
    assert(r.cards.every(k => near(k.c.x, 0) && near(k.c.w, r.vw)) && near(r.cards[1].c.y, r.cards[0].c.b), `${tag}: the cards stacked, full width`);
    assert(r.cards.every(k => near(k.c.h, r.svh - 158.4, 1)) && near(r.t.h, 158.4, 1),
      `${tag}: each card 100svh - 158.4 = ${(r.svh - 158.4).toFixed(1)} tall, twice the ${((r.svh - 158.4) / 2).toFixed(1)} before (${r.cards.map(k => k.c.h.toFixed(1))}; title ${r.t.h.toFixed(1)})`);
  }
  assert(r.sw <= r.vw, `${tag}: no sideways scroll`);
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
