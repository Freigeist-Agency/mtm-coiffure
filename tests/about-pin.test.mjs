// About: the Google rating card pinned in the middle of the screen while the text scrolls past (js/about-pin.js), 2026-11-13.
// At 1440x900, 768x1024 and 2560x1440 (motion on):
//   1. before the pin the card is in its Figma place (x=1183 at 1440, 18px from the right; its top level with the text's);
//   2. from the pin on, its centre stays on the viewport's centre (within 1px) while the text moves up past it;
//   3. it lets go when its bottom is level with the bottom of the text's last line, and then leaves with the text;
//   4. it never overlaps the text sideways, and the page is as long as without the pin (no spacing added);
// on a phone (375) and under reduced motion there is no pin: the card scrolls with the page.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const READ = () => {
  const c = document.querySelector('.rating-card').getBoundingClientRect(), a = document.querySelector('.about').getBoundingClientRect(), t = document.querySelector('.about-text').getBoundingClientRect();
  const p = document.querySelector('.about-text'), g = document.createRange(); g.selectNodeContents(p); const lines = [...g.getClientRects()], last = lines[lines.length - 1];
  return { toText: t.bottom - c.bottom, lastLine: last.bottom - c.bottom, mid: (c.top + c.bottom) / 2 - innerHeight / 2, left: c.left, right: innerWidth - c.right, top: c.top, toEnd: a.bottom - c.bottom, aboutTop: a.top, textTop: t.top, textRight: t.right, cardLeft: c.left, docH: document.documentElement.scrollHeight };
};

for (const [w, h] of [[1440, 900], [768, 1024], [2560, 1440]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h });
  await sleep(1000);
  const t = await page.evaluate(() => { const t = window.ScrollTrigger && ScrollTrigger.getById('about-pin'); return t ? { s: t.start, e: t.end } : null; });
  assert(!!t, `${tag}: the about-pin trigger exists`);
  if (!t) { await close(); continue; }
  await go(page, t.s - 150); await sleep(250);
  const pre = await page.evaluate(READ);
  assert(Math.abs(pre.right - 18 * w / 1440) <= 1.5 && Math.abs(pre.top - pre.textTop) <= 1.5, `${tag} 1: before the pin the card is in its place (${pre.right.toFixed(1)}px from the right, top ${pre.top.toFixed(1)} vs the text's ${pre.textTop.toFixed(1)})`);
  // 2026-11-13: with the text at Figma's 48px it can end above the card's bottom (768: the card is the taller one). Then nothing slides
  // past, the pin has no length, and the card simply scrolls with the text: check that instead of the pin run.
  if (pre.toText <= 0) {
    assert(Math.abs(t.e - t.s) < 1, `${tag} 2: the text ends ${(-pre.toText).toFixed(0)}px above the card's bottom: the pin has no length (${(t.e - t.s).toFixed(1)}px)`);
    const ys = [];
    for (const dy of [-150, 0, 150, 300]) { await go(page, t.s + dy); await sleep(200); const r = await page.evaluate(READ); ys.push(r.top - r.textTop); }
    assert(ys.every(y => Math.abs(y - ys[0]) <= 1), `${tag} 3: the card keeps its place beside the text while scrolling (card top - text top: ${ys.map(y => y.toFixed(1)).join(',')})`);
    assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
    await close();
    continue;
  }
  const mids = [], texts = [], over = [];
  for (let i = 0; i <= 8; i++) {
    await go(page, t.s + (t.e - t.s) * i / 8); await sleep(200);
    const r = await page.evaluate(READ);
    mids.push(r.mid); texts.push(r.textTop); over.push(r.textRight > r.cardLeft);
  }
  assert(mids.every(m => Math.abs(m) <= 1), `${tag} 2: centred on the screen for the whole pin (offsets ${mids.map(m => m.toFixed(1)).join(',')})`);
  assert(texts.every((y, i) => i === 0 || y < texts[i - 1] - 1), `${tag} 2: the text moves up past it (${texts.map(Math.round).join(',')})`);
  assert(over.every(o => !o), `${tag} 4: the text never runs under the card sideways`);
  const end = await page.evaluate(READ);
  assert(Math.abs(end.toText) <= 1, `${tag} 3: it lets go with its bottom level with the bottom of the text's last line (${end.toText.toFixed(1)}px apart; the last line's text box ${end.lastLine.toFixed(1)})`);
  await go(page, t.e + 200); await sleep(250);
  const after = await page.evaluate(READ);
  assert(Math.abs(after.toText) <= 1 && after.mid < -150, `${tag} 3: after the pin it leaves with the text (${after.toText.toFixed(1)} from the last line, ${after.mid.toFixed(0)} from the centre)`);
  const pinType = await page.evaluate(() => { const t = ScrollTrigger.getById('about-pin'); return !!t.vars.pinSpacing; });
  assert(!pinType, `${tag} 4: no pin spacing (the page's length is untouched)`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

for (const [w, h, rm, mobile] of [[375, 812, false, true], [1440, 900, true, false]]) {
  const tag = `@${w}x${h}${rm ? ' reduced-motion' : ''}`;
  const { page, close } = await openPage({ width: w, height: h, reducedMotion: rm, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1000);
  const has = await page.evaluate(() => !!(window.ScrollTrigger && ScrollTrigger.getById('about-pin')));
  const a = await page.evaluate(READ);
  await go(page, 600); await sleep(300);
  const b = await page.evaluate(READ);
  assert(!has && Math.abs((b.top - a.top) - (b.aboutTop - a.aboutTop)) < 1, `${tag}: no pin, the card scrolls with the section (moved ${(b.top - a.top).toFixed(0)}, the section ${(b.aboutTop - a.aboutTop).toFixed(0)})`);
  await close();
}

await report();
