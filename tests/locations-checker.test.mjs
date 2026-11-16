// Checkerboard out of Standorte (js/checker.js '.locations__checker'; cofounder's frame, 2026-11-15). At 1512, 1440, 768, 375 and 2560:
//   1. the grid is 8 across, cells 12.5% x 11.875vw, its bottom on the section's bottom, at least five rows and enough rows to cover the
//      part of the section on screen (one screen tall at most), so it ends all white on screen; drawn over the title and the cards;
//   1b. 768px and up the section is pinned (its bottom stays on the screen's bottom; since 2026-11-16 the section is taller than the
//      screen again) for one screen of scrolling while the cells come in, then scrolls on; below 768 no pin (it plays while the
//      section's bottom scrolls up to the top);
//   2. with the section's bottom at the bottom of the screen no cell shows; halfway to its bottom reaching the top, the
//      bottom five rows are exactly the frame's 20 cells (row by row below) and any rows above are still empty; at the end every cell
//      shows, all white;
//   3. scrolling back up hides them again in the same order (the cells at a given scroll are the same both ways);
//   4. the cells never catch a click (the cards still open the salon pages);
//   5. under reduced motion there is no grid at all.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const FRAME = '0001001011000000011010011011110011101111';
for (const [w, h, mobile] of [[1512, 900], [1440, 900], [768, 1024], [375, 812, true], [2560, 1440]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1800);
  const t = await page.evaluate(() => { const c = window.checker && window.checker['.locations__checker']; return c ? { s: c.trigger.start, e: c.trigger.end, n: c.cells.length } : null; });
  assert(!!t && t.n >= 40 && t.n % 8 === 0, `${tag}: the Standorte checker runs (${t && t.n} cells)`);
  if (!t) { await close(); continue; }
  const sec = await page.evaluate(() => document.querySelector('.locations').getBoundingClientRect().bottom + scrollY - innerHeight);
  assert(Math.abs(t.s - sec) < 1.5, `${tag} 2: it starts with the section's bottom at the bottom of the screen (${t.s} vs ${sec.toFixed(0)})`);
  const state = () => page.evaluate(() => {
    const box = document.querySelector('.locations__checker'), s = document.querySelector('.locations').getBoundingClientRect(), g = box.querySelector('.checker-grid').getBoundingClientRect();
    const cells = window.checker['.locations__checker'].cells;
    const c0 = cells[0].el.getBoundingClientRect(), c39 = cells[cells.length - 1].el.getBoundingClientRect();
    return { sbot: s.bottom - innerHeight, cover: Math.min(s.height, innerHeight), gh: g.height, gt: g.top - s.top, on: cells.map(x => getComputedStyle(x.el).visibility === 'hidden' ? 0 : 1).join(''), gb: g.bottom - s.bottom, cw: c0.width, ch: c0.height, x39: c39.left, y39: c39.top - g.top,
      bg: getComputedStyle(cells[0].el).backgroundColor, z: +getComputedStyle(box).zIndex, pe: getComputedStyle(box).pointerEvents };
  });
  const ps = [0, 0.25, 0.5, 0.75, 1], down = [], up = [];
  for (const p of ps) { await go(page, t.s + (t.e - t.s) * p); await sleep(700); down.push(await state()); }
  for (const p of [...ps].reverse()) { await go(page, t.s + (t.e - t.s) * p); await sleep(700); up.unshift(await state()); }
  const d = down[0], vw = w, rows = t.n / 8;
  assert(Math.abs(d.gb) < 1 && Math.abs(d.cw - vw / 8) < 1.5 && Math.abs(d.ch - vw * 0.11875) < 1.5 && Math.abs(d.x39 - vw * 7 / 8) < 1.5 && Math.abs(d.y39 - (rows - 1) * vw * 0.11875) < 1.5 && d.gh >= d.cover - 0.5 && d.gh < d.cover + vw * 0.11875,
    `${tag} 1: 8 x 5 cells of ${(vw / 8).toFixed(1)} x ${(vw * .11875).toFixed(1)}, the grid's bottom on the section's (cell ${d.cw.toFixed(1)} x ${d.ch.toFixed(1)}, off ${d.gb.toFixed(1)})`);
  assert(d.bg === 'rgb(255, 255, 255)' && d.z > 2 && d.pe === 'none', `${tag} 1/4: white cells over the title, never catching clicks (${d.bg}, z ${d.z}, ${d.pe})`);
  assert(down[0].on === '0'.repeat(t.n), `${tag} 2: none at the start (${down[0].on})`);
  assert(down[2].on.slice(-40) === FRAME && !down[2].on.slice(0, -40).includes('1'), `${tag} 2: halfway the bottom five rows are the frame, rows above still empty (${down[2].on})`);
  if (w >= 768) assert(down.every(x => Math.abs(x.sbot) < 1) && Math.abs(t.e - t.s - h) < 2, `${tag} 1b: pinned with its bottom on the screen's bottom for one screen of scrolling (${down.map(x => x.sbot.toFixed(0))}, length ${(t.e - t.s).toFixed(0)})`);
  else assert(down[4].sbot < -h + 2, `${tag} 1b: no pin on a phone, the section's bottom scrolls to the top as it plays (${down[4].sbot.toFixed(0)} at the end)`);
  assert(down[4].on === '1'.repeat(t.n), `${tag} 2: all white as it leaves (${down[4].on})`);
  const cnt = s => [...s].filter(c => c === '1').length;
  assert(down.every((x, i) => i === 0 || cnt(x.on) >= cnt(down[i - 1].on)), `${tag} 2: more cells with every step down (${down.map(x => cnt(x.on))})`);
  assert(ps.every((_, i) => up[i].on === down[i].on), `${tag} 3: scrolling back up gives the same cells at each point (${up.map(x => cnt(x.on))})`);
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
{
  const { page, close } = await openPage({ width: 1512, height: 900, reducedMotion: true });
  await sleep(1500);
  const r = await page.evaluate(() => ({ grid: !!document.querySelector('.locations__checker .checker-grid'), api: !!(window.checker && window.checker['.locations__checker']) }));
  assert(!r.grid && !r.api, `@1512 reduced motion 5: no cells (${JSON.stringify(r)})`);
  await close();
}
await report();
