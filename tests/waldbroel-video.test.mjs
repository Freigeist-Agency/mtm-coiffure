// Waldbröl location video (cofounder, 2026-11-16, "Sequenz 01_11"): the Waldbröl card plays its own film, the Nümbrecht card keeps
// its own. Phones (below 768) get the 432x720 copy, everything else the square 1080 one; it is silent, loops, plays when on screen,
// fills its card edge to edge (object-fit cover), also when the card is hovered wide on desktop. At 375, 768, 1512 and 2560.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
for (const [w, h, mobile] of [[375, 812, true], [768, 1024], [1512, 900], [2560, 1440]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1500);
  const card = await page.evaluate(() => { const c = document.querySelectorAll('.loc-card')[1]; return c.getBoundingClientRect().top + scrollY; });
  await go(page, card + 40); await sleep(2500);
  const read = () => page.evaluate(() => { const [n, wb] = [...document.querySelectorAll('.loc-card')].map(c => c.querySelector('video'));
    const c = wb.closest('.loc-card').getBoundingClientRect(), v = wb.getBoundingClientRect();
    return { src: wb.currentSrc.split('/').pop(), poster: wb.getAttribute('poster'), other: n.currentSrc.split('/').pop() || n.querySelector('source').getAttribute('src'), vw: wb.videoWidth, vh: wb.videoHeight,
      t: wb.currentTime, paused: wb.paused, muted: wb.muted, loop: wb.loop, fit: getComputedStyle(wb).objectFit, fills: Math.abs(v.width - c.width) < 1 && Math.abs(v.height - c.height) < 1, cw: c.width }; });
  const a = await read(); await sleep(800); const b = await read();
  const want = w < 768 ? ['waldbroel-720.mp4', 432, 720] : ['waldbroel-1080.mp4', 1080, 1080];
  assert(a.src === want[0] && a.vw === want[1] && a.vh === want[2] && a.poster === 'assets/waldbroel-poster.jpg', `${tag}: Waldbröl plays ${want[0]} (${a.src}, ${a.vw}x${a.vh})`);
  assert(!/waldbroel/.test(a.other), `${tag}: Nümbrecht keeps its own video (${a.other})`);
  assert(a.muted && a.loop && !b.paused && b.t > a.t, `${tag}: silent, looping, playing on screen (${a.t.toFixed(2)} -> ${b.t.toFixed(2)})`);
  assert(a.fit === 'cover' && a.fills, `${tag}: fills its card`);
  if (w >= 1024) {
    const c = await page.evaluate(() => { const r = document.querySelectorAll('.loc-card')[1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.max(r.top + 80, 80) }; });
    await page.mouse.move(c.x, c.y); await sleep(1100);
    const hv = await read();
    assert(hv.fills && hv.cw > w * 0.75, `${tag}: still fills its card hovered wide (${hv.cw.toFixed(0)} wide)`);
  }
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
