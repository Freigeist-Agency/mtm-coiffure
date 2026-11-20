// Intro portraits (js/word-reveal.js), 2026-11-13 (cofounder): "the portraits grow as they scroll into view starting at 0.8 to 1 in a sine in motion".
// At 375, 768, 1440 and 2560, for each of the three round portraits, over its own scroll window:
//   1. scale follows sine.in from 0.8 to 1: 0.8 + 0.2 * (1 - cos(pi p / 2)) at p = 0, .25, .5, .75, 1 (within 0.01);
//   2. scrolling back gives the same values (scrub, reversible);
//   3. the rendered size matches: at p = 0 the portrait is 0.8 of its full width, at p = 1 the full width;
//   4. no fade: the portrait is fully opaque the whole way (2026-11-13, cofounder: "remove the fade");
// under reduced motion the portraits sit at full size.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const want = p => 0.8 + 0.2 * (1 - Math.cos(Math.PI * p / 2));
const ps = [0, 0.25, 0.5, 0.75, 1];

for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [375, 812, true], [2560, 1440, false]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1200);
  const wins = await page.evaluate(() => [...document.querySelectorAll('.intro-text img.intro-pic')].map(img => {
    const t = img.__wrWin;   // js/word-reveal.js keeps each portrait's window on the element
    return t ? { s: t[0], e: t[1], full: img.offsetWidth } : null;
  }));
  assert(wins.length === 3 && wins.every(Boolean), `${tag}: three portraits, each with its own scroll window (${wins.length})`);
  for (let k = 0; k < wins.length; k++) {
    const wn = wins[k]; if (!wn) continue;
    const read = () => page.evaluate(k => { const img = document.querySelectorAll('.intro-text img.intro-pic')[k];
      return { s: new DOMMatrix(getComputedStyle(img).transform).a, w: img.getBoundingClientRect().width, op: +getComputedStyle(img).opacity }; }, k);
    const down = [], up = [];
    for (const p of ps) { await go(page, wn.s + (wn.e - wn.s) * p); await sleep(250); down.push(await read()); }
    for (const p of [...ps].reverse()) { await go(page, wn.s + (wn.e - wn.s) * p); await sleep(250); up.unshift(await read()); }
    assert(ps.every((p, i) => Math.abs(down[i].s - want(p)) <= 0.01), `${tag} portrait ${k + 1} 1: sine in 0.8 -> 1 (${down.map(r => r.s.toFixed(3)).join(',')}; want ${ps.map(p => want(p).toFixed(3)).join(',')})`);
    assert(ps.every((p, i) => Math.abs(up[i].s - want(p)) <= 0.01), `${tag} portrait ${k + 1} 2: the same on the way back (${up.map(r => r.s.toFixed(3)).join(',')})`);
    assert([...down, ...up].every(r => r.op === 1), `${tag} portrait ${k + 1} 4: no fade, fully visible all the way (${down.map(r => r.op).join(',')})`);
    assert(Math.abs(down[0].w / wn.full - 0.8) < 0.01 && Math.abs(down[4].w / wn.full - 1) < 0.01, `${tag} portrait ${k + 1} 3: drawn at ${(down[0].w / wn.full).toFixed(3)} then ${(down[4].w / wn.full).toFixed(3)} of its ${wn.full}px`);
  }
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

{
  const { page, close } = await openPage({ width: 1440, height: 900, reducedMotion: true });
  await sleep(1000);
  await page.evaluate(() => document.querySelector('.intro-text').scrollIntoView({ block: 'end' })); await sleep(500);
  const s = await page.evaluate(() => [...document.querySelectorAll('.intro-text img.intro-pic')].map(i => getComputedStyle(i).transform));
  assert(s.length === 3 && s.every(t => t === 'none'), `@1440 reduced-motion: portraits at full size, not animated (${s.join(' | ')})`);
  await close();
}

await report();
