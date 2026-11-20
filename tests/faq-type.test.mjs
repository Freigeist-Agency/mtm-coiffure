// FAQ texts (Figma 324:3021, 339:4251..4308; 2026-11-15, cofounder: "the font size and weight is off"). At 1512, relative to the section,
// within 1px: about text Google Sans Flex 300 20px, 605 wide at 35/799; the questions (the salon edits them in Forge, up to 8), 300 24px, the open one's top at 276
// and the closed ones at 444, 499, 554, 609, 664; signs 100 36px, "+" at x 1403 (tops 434..654), the open row's "-" at 1411/266;
// the open answer 300 16px, 612 wide at 886/328. Every width: questions and signs inside the viewport, a click opens/closes a row,
// no sideways scroll.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t = 1) => Math.abs(a - b) <= t;
for (const [w, h, mobile] of [[1512, 900], [1440, 900], [768, 1024], [375, 812, true], [2560, 1440]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1200);
  const top = await page.evaluate(() => document.querySelector('.faq').getBoundingClientRect().top + scrollY);
  await page.evaluate(y => window.lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y), top); await sleep(600);
  const read = () => page.evaluate(() => {
    const s = document.querySelector('.faq').getBoundingClientRect();
    const b = e => { const r = e.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, vr: r.right, vl: r.left }; };
    const f = e => { const c = getComputedStyle(e); return { fam: c.fontFamily.split(',')[0].replace(/"/g, ''), wt: c.fontWeight, fs: parseFloat(c.fontSize) }; };
    const qs = [...document.querySelectorAll('.faq__q')], ss = [...document.querySelectorAll('.faq__sign')];
    return { about: { ...b(document.querySelector('.faq__about')), ...f(document.querySelector('.faq__about')) }, q: qs.map(e => ({ ...b(e), ...f(e) })), s: ss.map(e => ({ ...b(e), ...f(e), t: getComputedStyle(e, '::before').content })),
      a: { ...b(document.querySelector('.faq__a')), ...f(document.querySelector('.faq__a')) }, open: [...document.querySelectorAll('.faq__item')].map(d => d.open), sw: document.documentElement.scrollWidth, vw: innerWidth };
  });
  const r = await read();
  assert(r.q.length >= 1 && r.q.length <= 8, `${tag}: the questions are there, as many as the salon has entered in Forge, at most 8 (${r.q.length})`);   /* was six placeholders (Figma); staging has the real ones (2026-11-20) */
  assert(r.about.fam === 'Google Sans Flex' && r.about.wt === '300' && r.q.every(q => q.fam === 'Google Sans Flex' && q.wt === '300') && r.s.every(s => s.wt === '100') && r.a.wt === '300', `${tag}: Google Sans Flex, light text and thin signs (${r.about.wt}/${r.q[0].wt}/${r.s[0].wt}/${r.a.wt})`);
  if (w === 1512) {
    assert(near(r.about.fs, 20, .01) && near(r.about.x, 35) && near(r.about.y, 799) && near(r.about.w, 605), `${tag}: about 20px, 605 wide at 35/799 (${r.about.fs} ${r.about.x}/${r.about.y} ${r.about.w})`);
    const ys = [276, 444, 499, 554, 609, 664];
    assert(r.q.every((q, i) => near(q.fs, 24, .01) && near(q.x, 886) && near(q.y, ys[i])), `${tag}: questions 24px at x 886, tops ${ys} (${r.q.map(q => q.y.toFixed(0))})`);
    const sy = [266, 434, 489, 544, 599, 654], sx = [1411, 1403, 1403, 1403, 1403, 1403];
    assert(r.s.every((s, i) => near(s.fs, 36, .01) && near(s.x, sx[i]) && near(s.y, sy[i])), `${tag}: signs 36px at Figma's spots (${r.s.map(s => s.x.toFixed(0) + '/' + s.y.toFixed(0))})`);
    assert(near(r.a.fs, 16, .01) && near(r.a.x, 886) && near(r.a.y, 328) && near(r.a.w, 612), `${tag}: open answer 16px, 612 wide at 886/328 (${r.a.x}/${r.a.y} ${r.a.w})`);
  }
  assert(r.s[0].t === '"-"' && r.s.slice(1).every(s => s.t === '"+"'), `${tag}: "-" on the open row, "+" on the others`);
  assert(r.q.every(q => q.vl >= 0 && q.vr <= r.vw + 0.5) && r.s.every(s => s.vl >= 0 && s.vr <= r.vw + 0.5), `${tag}: questions and signs inside the viewport`);
  await page.locator('.faq__item summary').nth(2).click(); await sleep(300);
  const r2 = await read();
  assert(r2.open[2] && r2.s[2].t === '"-"', `${tag}: clicking a question opens it and its sign turns to "-"`);
  assert(r.sw <= r.vw, `${tag}: no sideways scroll`);
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
