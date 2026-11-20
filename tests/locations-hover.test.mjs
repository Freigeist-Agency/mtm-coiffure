// Standorte hover grow (cofounder, 2026-11-16): on desktop (1024px and up, with a mouse) the card under the pointer widens to 80% of
// the section and the other narrows to 20%, over 0.6s in sine in-out; the narrowed card's name and address fade out and come back.
// At 1024, 1512 and 2560:
//   1. at rest both cards are half the width;
//   2. hovering card 1 (then card 2): 0.25s in, the width is part way (between where it was and 80%); after 1s it is 80% / 20% (within 1px),
//      the video still covers the card, the hovered card's text is fully visible and the other's is faded out (opacity 0);
//   3. moving the mouse off the cards: back to half / half, all text visible;
//   4. the wide card still opens its salon page on a click.
// Below 1024 (768) and on a touch phone (375) nothing changes on hover. Under reduced motion it still grows, without the transition.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t = 1) => Math.abs(a - b) <= t;
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const read = page => page.evaluate(() => {
  const s = document.querySelector('.locations').getBoundingClientRect();
  return { sw: s.width, cards: [...document.querySelectorAll('.loc-card')].map(c => { const r = c.getBoundingClientRect(), v = c.querySelector('.loc-card__media').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cover: near(v.width, r.width) && near(v.height, r.height), op: [c.querySelector('.loc-card__name'), c.querySelector('.loc-card__info')].map(e => +getComputedStyle(e).opacity) }; }) };
  function near(a, b) { return Math.abs(a - b) < 1; }
});

for (const [w, h, mobile, reduced] of [[1512, 900], [1024, 768], [2560, 1440], [768, 1024], [375, 812, true], [1512, 900, false, true]]) {
  const tag = `@${w}${reduced ? ' reduced motion' : ''}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}), ...(reduced ? { reducedMotion: true } : {}) });
  await sleep(1500);
  const top = await page.evaluate(() => document.querySelector('.locations').getBoundingClientRect().top + scrollY);
  await go(page, top - h * 0.3); await sleep(600);   // the section starts 30% down the screen: the mouse can rest above it at 5,5
  await page.mouse.move(5, 5); await sleep(300);
  const rest = await read(page);
  const half = rest.sw / 2;
  if (w < 1024) {
    if (mobile) {   // a touch screen has no hover: the rule's (hover: hover) does not match, so a tap only opens the card's link
      assert(await page.evaluate(() => !matchMedia('(hover: hover)').matches), `${tag}: a touch screen does not match (hover: hover)`);
    }
    else { const c = rest.cards[0]; await page.mouse.move(c.x + c.w / 2, Math.max(c.y + 40, 40)); await sleep(900); }
    const after = await read(page);
    assert(after.cards.every((c, i) => near(c.w, rest.cards[i].w) && c.op.every(o => o === 1)), `${tag}: nothing changes on hover/tap (${after.cards.map(c => c.w.toFixed(0))})`);
    assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
    await close(); continue;
  }
  assert(rest.cards.every(c => near(c.w, half) && c.op.every(o => o === 1)), `${tag} 1: at rest both cards are half the width (${rest.cards.map(c => c.w.toFixed(1))})`);
  let prev = rest;
  for (const k of [0, 1]) {
    const c = rest.cards[k], other = 1 - k, from = prev.cards[k].w;   // card 2 starts from 20% (card 1 was just hovered)
    await page.mouse.move(k === 0 ? c.x + c.w * 0.25 : c.x + c.w * 0.75, Math.max(c.y + 60, 60));
    await sleep(250);
    const mid = await read(page);
    await sleep(800);
    const end = await read(page);
    if (reduced) assert(near(mid.cards[k].w, end.cards[k].w), `${tag} 2: no transition, already ${end.cards[k].w.toFixed(0)} at 0.25s`);
    else assert(mid.cards[k].w > from + 20 && mid.cards[k].w < 0.8 * rest.sw - 20, `${tag} 2 card ${k + 1}: part way at 0.25s (${mid.cards[k].w.toFixed(0)} between ${from.toFixed(0)} and ${(0.8 * rest.sw).toFixed(0)})`);
    assert(near(end.cards[k].w, 0.8 * rest.sw) && near(end.cards[other].w, 0.2 * rest.sw), `${tag} 2 card ${k + 1}: 80% / 20% (${end.cards.map(c => c.w.toFixed(1))} of ${rest.sw})`);
    assert(end.cards.every(c => c.cover), `${tag} 2 card ${k + 1}: the videos still cover their cards`);
    prev = end;
    assert(end.cards[k].op.every(o => o === 1) && end.cards[other].op.every(o => o === 0), `${tag} 2 card ${k + 1}: its text shows, the narrow card's is faded out (${end.cards.map(c => c.op).join(' | ')})`);
  }
  await page.mouse.move(5, 5); await sleep(1000);
  const back = await read(page);
  assert(back.cards.every(c => near(c.w, half) && c.op.every(o => o === 1)), `${tag} 3: off the cards, back to half / half (${back.cards.map(c => c.w.toFixed(1))})`);
  if (!reduced) {
    const c = back.cards[0];
    await page.mouse.move(c.x + c.w * 0.3, Math.max(c.y + 60, 60)); await sleep(900);
    const pos = await read(page); const cc = pos.cards[0];
    await Promise.all([page.waitForURL(u => u.pathname.endsWith('/locations/nuembrecht'), { timeout: 5000 }).catch(() => {}), page.mouse.click(cc.x + cc.w * 0.6, Math.max(cc.y + 80, 80))]);
    assert(page.url().endsWith('/locations/nuembrecht'), `${tag} 4: the wide card opens its salon page (${page.url()})`);
  }
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
