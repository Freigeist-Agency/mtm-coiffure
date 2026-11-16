// Line reveal on every running-text paragraph (js/word-reveal.js; cofounder, 2026-11-15: "apply it to all paragraphs"), the same
// motion as the intro: each line rises 0.6em and fades in, line by line, scrubbed by scroll, reversed going back up.
// For each paragraph (services, social, news intro, both news cards, FAQ about) at 1512, 768, 375 and 2560:
//   1. it is split (aria-hidden) with exactly one screen-reader copy of the same sentence next to it;
//   2. its box is the same size as without motion (reduced-motion page): the split changes no line breaks;
//   3. with its top just below the screen, every word is invisible; with its centre at the screen's centre every word is fully in place;
//   4. it goes line by line: at some scroll in between, an earlier line is further along than a later one;
//   5. scrolling back up hides it again.
// Under reduced motion none is split. Text with links (the addresses), labels and review quotes are not split.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const PARAS = ['.services-text', '.social-head p:not(.wr-sr)', '.news-head p:not(.wr-sr)', '.news-card:nth-of-type(1) p:not(.wr-sr)', '.news-card:nth-of-type(2) p:not(.wr-sr)', '.faq__about'];
const sizes = (page) => page.evaluate(P => P.map(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [+r.width.toFixed(1), +r.height.toFixed(1)]; }), PARAS);

for (const [w, h, mobile] of [[1512, 900], [768, 1024], [375, 812, true], [2560, 1440]]) {
  const tag = `@${w}`;
  const still = await openPage({ width: w, height: h, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1200);
  const ref = await sizes(still.page);
  const notSplit = await still.page.evaluate(() => document.querySelectorAll('.wr-word').length);
  await still.close();
  assert(notSplit === 0, `${tag}: under reduced motion nothing is split (${notSplit} words)`);

  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1800);
  const now = await sizes(page);
  for (const [k, sel] of PARAS.entries()) {
    const t = `${tag} ${sel.replace(':not(.wr-sr)', '')}`;
    const info = await page.evaluate(sel => { const e = document.querySelector(sel); const prev = e.previousElementSibling;
      return { hidden: e.getAttribute('aria-hidden'), words: e.querySelectorAll('.wr-word').length, sr: prev && prev.classList.contains('wr-sr') ? prev.textContent : null, text: e.textContent.replace(/\s+/g, ' ').trim(),
        srs: e.parentNode.querySelectorAll(':scope > .wr-sr').length, top: e.getBoundingClientRect().top + scrollY, hgt: e.offsetHeight }; }, sel);
    assert(info.hidden === 'true' && info.words > 3 && info.sr === info.text, `${t} 1: split into ${info.words} words, one screen-reader copy of the same text`);
    assert(ref[k] && Math.abs(ref[k][0] - now[k][0]) < 0.6 && Math.abs(ref[k][1] - now[k][1]) < 0.6, `${t} 2: same box as without motion (${now[k]} vs ${ref[k]})`);
    const read = () => page.evaluate(sel => { const e = document.querySelector(sel); const ws = [...e.querySelectorAll('.wr-word')];
      const lines = []; let cur = null;
      ws.forEach(x => { const top = x.offsetTop; if (!cur || Math.abs(top - cur.top) > 4) { cur = { top, op: [] }; lines.push(cur); } cur.op.push(+getComputedStyle(x).opacity); });
      return { lines: lines.map(l => l.op.reduce((a, b) => a + b, 0) / l.op.length), min: Math.min(...ws.map(x => +getComputedStyle(x).opacity)), maxY: Math.max(...ws.map(x => Math.abs(new DOMMatrix(getComputedStyle(x).transform).f))) }; }, sel);
    await go(page, info.top - h + -200 + 0); await sleep(500);   // its top 200px below the screen
    const before = await read();
    // the order: walk from its top entering to its centre at the centre, look for a moment an earlier line leads a later one
    const s0 = info.top - h, s1 = info.top + info.hgt / 2 - h / 2;
    let ordered = false, monotone = true;
    for (let i = 1; i < 8; i++) { await go(page, s0 + (s1 - s0) * i / 8); await sleep(350); const r = await read();
      if (r.lines.length > 1 && r.lines[0] > r.lines[r.lines.length - 1] + 0.05) ordered = true;
      if (r.lines.some((v, j) => j > 0 && v > r.lines[j - 1] + 0.02)) monotone = false; }
    await go(page, s1); await sleep(600);
    const done = await read();
    await go(page, info.top - h - 200); await sleep(600);
    const back = await read();
    assert(before.min === 0 && before.lines.every(v => v === 0), `${t} 3: invisible before it enters (${before.lines.map(v => v.toFixed(2))})`);
    assert(done.min === 1 && done.maxY < 0.5, `${t} 3: fully in place with its centre at the screen's centre (opacity ${done.min}, y ${done.maxY.toFixed(2)})`);
    assert(done.lines.length === 1 || (ordered && monotone), `${t} 4: line by line, top line first (${done.lines.length} lines, ordered ${ordered}, never a later line ahead ${monotone})`);
    assert(back.lines.every(v => v === 0), `${t} 5: hidden again after scrolling back up`);
  }
  const others = await page.evaluate(() => ['.loc-card__info', '.reviews blockquote p', '.hero-hello', '.svc-rating__count', '.footer p'].map(s => document.querySelectorAll(s + ' .wr-word').length));
  assert(others.every(n => n === 0), `${tag}: addresses, quotes and labels are not split (the FAQ answers have their own reveal on opening, js/faq-reveal.js) (${others})`);
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
