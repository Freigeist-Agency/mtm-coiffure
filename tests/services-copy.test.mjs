// Services title and text slide in from the sides as the ring pins (js/services-copy.js, cofounder 2026-11-13). At 768, 1440 and 2560:
//   1. the slide starts on the ring's pin start ('orbit-pin') and lasts 30% of the pin (0.45 viewport heights);
//   2. before it, both are fully off screen: the title past the left edge, the text past the right edge;
//   3. through it the title moves right and the text left, following sine.inOut (within 3% of the distance), while the ring is pinned;
//   4. at its end both stand in their Figma places (title at 27,192, text at 1028,792 of the 1440 frame) and the ring is still pinned;
//   5. scrolling back puts them off screen again (scrub, reversible);
// and on a phone (375) and under reduced motion nothing moves: no trigger, no transform.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const READ = () => {
  const s = document.querySelector('.services'), sb = s.getBoundingClientRect(), k = sb.width / 1440;
  const t = document.querySelector('.services-copy h2').getBoundingClientRect(), p = document.querySelector('.services-copy p').getBoundingClientRect();
  return { vw: document.documentElement.clientWidth, secTop: sb.top, tl: t.left, tr: t.right, pl: p.left, pr: p.right,
    tx: (t.left - sb.left) / k, ty: (t.top - sb.top) / k, px: (p.left - sb.left) / k, py: (p.top - sb.top) / k };
};
const ease = q => 0.5 - Math.cos(Math.PI * q) / 2;

for (const [w, h] of [[1440, 900], [768, 1024], [2560, 1440]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h });
  await sleep(1500);
  const t = await page.evaluate(() => { const a = ScrollTrigger.getById('services-copy'), b = ScrollTrigger.getById('orbit-pin'); return a && b ? { s: a.start, e: a.end, ps: b.start, pe: b.end } : null; });
  assert(!!t, `${tag}: the services-copy and orbit-pin triggers exist`);
  if (!t) { await close(); continue; }
  assert(Math.abs(t.s - t.ps) <= 1 && Math.abs((t.e - t.s) - 0.3 * (t.pe - t.ps)) <= 1, `${tag} 1: starts on the pin (${t.s.toFixed(0)} vs ${t.ps.toFixed(0)}) and lasts 30% of it (${(t.e - t.s).toFixed(0)} of ${(t.pe - t.ps).toFixed(0)})`);
  await go(page, t.s - 120); await sleep(900);
  const pre = await page.evaluate(READ);
  assert(pre.tr <= 0 && pre.pl >= pre.vw, `${tag} 2: before the pin both are off screen (title right edge ${pre.tr.toFixed(0)}, text left edge ${pre.pl.toFixed(0)} of ${pre.vw})`);
  const qs = [0, 0.25, 0.5, 0.75, 1], down = [];
  for (const q of qs) { await go(page, t.s + (t.e - t.s) * q); await sleep(900); down.push(await page.evaluate(READ)); }
  const end = down[down.length - 1], startX = { t: down[0].tx, p: down[0].px };
  const tFrac = down.map(r => (r.tx - startX.t) / (end.tx - startX.t)), pFrac = down.map(r => (r.px - startX.p) / (end.px - startX.p));
  assert(qs.every((q, i) => Math.abs(tFrac[i] - ease(q)) <= 0.03 && Math.abs(pFrac[i] - ease(q)) <= 0.03), `${tag} 3: both follow sine.inOut (title ${tFrac.map(f => f.toFixed(3)).join(',')}; text ${pFrac.map(f => f.toFixed(3)).join(',')})`);
  assert(down.every((r, i) => i === 0 || (r.tx > down[i - 1].tx && r.px < down[i - 1].px)) && down[0].tr <= 1 && down[0].pl >= down[0].vw - 1, `${tag} 3: the title moves right and the text left, from off screen (${down.map(r => Math.round(r.tx)).join(',')} | ${down.map(r => Math.round(r.px)).join(',')})`);
  assert(down.every(r => Math.abs(r.secTop - down[0].secTop) <= 1), `${tag} 3: the ring stays pinned while they slide (section top ${down.map(r => r.secTop.toFixed(0)).join(',')})`);
  assert(Math.abs(end.tx - 27) <= 1 && Math.abs(end.ty - 192) <= 1 && Math.abs(end.px - 1028) <= 1 && Math.abs(end.py - 792) <= 1, `${tag} 4: at the end both are in their Figma places (title ${end.tx.toFixed(1)},${end.ty.toFixed(1)}; text ${end.px.toFixed(1)},${end.py.toFixed(1)})`);
  await go(page, t.s - 120); await sleep(900);
  const back = await page.evaluate(READ);
  assert(back.tr <= 0 && back.pl >= back.vw, `${tag} 5: scrolling back puts them off screen again (${back.tr.toFixed(0)}, ${back.pl.toFixed(0)})`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

for (const [w, h, rm, mobile] of [[375, 812, false, true], [1440, 900, true, false]]) {
  const tag = `@${w}x${h}${rm ? ' reduced-motion' : ''}`;
  const { page, close } = await openPage({ width: w, height: h, reducedMotion: rm, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1200);
  const r = await page.evaluate(() => ({ trig: !!(window.ScrollTrigger && ScrollTrigger.getById('services-copy')), tf: [...document.querySelectorAll('.services-copy h2, .services-copy p')].map(e => getComputedStyle(e).transform) }));
  assert(!r.trig && r.tf.every(x => x === 'none'), `${tag}: nothing moves (trigger ${r.trig}, transforms ${r.tf.join(' | ')})`);
  await close();
}
await report();
