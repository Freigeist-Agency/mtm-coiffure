// FAQ answers (js/faq-reveal.js; cofounder, 2026-11-15): opening a question brings its answer in line by line with the scroll reveal's
// motion (rise 0.6em, fade in, back.out pop), top line first. At 1512, 768, 375 and 2560:
//   1. every answer is split (aria-hidden) with one plain screen-reader copy of the same text inside its row;
//   2. the split changes no line breaks: the open answer is the same size as without motion;
//   3. the row open on load shows its answer fully, with no motion;
//   4. closing the first row (its answer runs over several lines) and opening it again: just after the click its lines are part way in,
//      faded (not yet fully opaque) and the top line ahead of the last; after a second every word is fully in place; twice;
//   5. the split answers' row still opens and closes with a click (the sign turns to "-").
// Under reduced motion nothing is split and the answers simply show.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [w, h, mobile] of [[1512, 900], [768, 1024], [375, 812, true], [2560, 1440]]) {
  const tag = `@${w}`;
  const still = await openPage({ width: w, height: h, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1000);
  const ref = await still.page.evaluate(() => { const a = document.querySelector('.faq__item[open] .faq__a').getBoundingClientRect(); return [a.width, a.height, document.querySelectorAll('.faq__a .wr-word').length]; });
  await still.close();
  assert(ref[2] === 0, `${tag}: under reduced motion nothing is split`);
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1500);
  const top = await page.evaluate(() => document.querySelector('.faq__list').getBoundingClientRect().top + scrollY - 100);
  await page.evaluate(y => window.lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y), top); await sleep(500);
  const r = await page.evaluate(() => [...document.querySelectorAll('.faq__item')].map(d => { const a = d.querySelector('.faq__a'), sr = a.previousElementSibling;
    return { split: a.getAttribute('aria-hidden') === 'true' && a.querySelectorAll('.wr-word').length > 0, sr: !!sr && sr.classList.contains('wr-sr') && sr.textContent === a.textContent.replace(/\s+/g, ' ').trim() && d.querySelectorAll('.wr-sr').length === 1 }; }));
  assert(r.every(x => x.split && x.sr), `${tag} 1: all ${r.length} answers split, one screen-reader copy each`);
  const box = await page.evaluate(() => { const a = document.querySelector('.faq__item[open] .faq__a').getBoundingClientRect(); return [a.width, a.height]; });
  assert(Math.abs(box[0] - ref[0]) < 0.6 && Math.abs(box[1] - ref[1]) < 0.6, `${tag} 2: same size as without motion (${box.map(v => v.toFixed(1))} vs ${ref.map(v => v.toFixed(1))})`);
  const read = i => page.evaluate(i => { const a = document.querySelectorAll('.faq__a')[i]; const lines = []; let cur = null;
    a.querySelectorAll('.wr-word').forEach(x => { if (!cur || Math.abs(x.offsetTop - cur.t) > 4) { cur = { t: x.offsetTop, o: [], y: [] }; lines.push(cur); } cur.o.push(+getComputedStyle(x).opacity); cur.y.push(new DOMMatrix(getComputedStyle(x).transform).f); });
    return lines.map(l => ({ o: l.o.reduce((p, q) => p + q, 0) / l.o.length, y: Math.max(...l.y.map(Math.abs)) })); }, i);
  const first = await read(0);
  assert(first.every(l => l.o === 1 && l.y < 0.01), `${tag} 3: the row open on load shows its answer fully, no motion`);
  for (const pass of [1, 2]) {
    await page.locator('.faq__item summary').nth(0).click(); await sleep(200);
    assert(!(await page.evaluate(() => document.querySelectorAll('.faq__item')[0].open)), `${tag} 5: the row closes`);
    await page.locator('.faq__item summary').nth(0).click();
    await sleep(110);
    const mid = await read(0);
    await sleep(1100);
    const done = await read(0);
    const open = await page.evaluate(() => document.querySelectorAll('.faq__item')[0].open);
    assert(open && mid.length >= 2, `${tag} 4 (open #${pass}): it opens, the answer on ${mid.length} lines`);
    assert(mid[0].o > 0.05 && mid.some(l => l.o < 0.9) && mid[0].o > mid[mid.length - 1].o + 0.05, `${tag} 4 (open #${pass}): just after the click part way in and faded, the top line first (${mid.map(l => l.o.toFixed(2)).join(' ')})`);
    assert(done.every(l => l.o === 1 && l.y < 0.01), `${tag} 4 (open #${pass}): every word in place after a second`);
  }
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
