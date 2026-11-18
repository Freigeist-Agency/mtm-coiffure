// Line-by-line text reveal (js/word-reveal.js), 2026-11-13 (cofounder): "animate them line by line, not word by word", on the intro
// ("Wir sind ein Familienfriseurbetrieb ...", .intro-text) and the about text that slides past the Google card (.about-text).
// At 375, 768, 1440 and 2560, for both paragraphs:
//   1. the text is split and every word has a scroll window;
//   2. every word on a rendered line has the same window as the rest of its line (one line = one movement);
//   3. the lines start in reading order, each later than the one above;
//   4. 15% into a line's window its words sit at one height and one opacity, partly faded in (they move together);
//   5. every line is fully in once the paragraph's centre is at the viewport's centre (or, below the fold then, once it is in view);
//   6. the screen-reader copy reads the sentence once;
// and under reduced motion nothing is split.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const TEXTS = [['.intro-text', 'word-reveal-']];   // 2026-11-15: the about text (and its section) left the page in the Desktop_new rebuild

for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [375, 812, true], [2560, 1440, false]]) {
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1500);
  for (const [sel, prefix] of TEXTS) {
    const tag = `@${w}x${h} ${sel}`;
    const d = await page.evaluate(([sel, prefix]) => {
      const text = document.querySelector(sel), fs = parseFloat(getComputedStyle(text).fontSize);
      const docTop = el => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
      const words = [...text.querySelectorAll('.wr-word')], all = [...text.querySelectorAll('.wr-word, img')];
      const trig = el => el.__wrWin ? [el.__wrWin[0], el.__wrWin[1]] : null;   // js/word-reveal.js keeps each word's window on the element
      const lines = [];
      for (const el of words) { const mid = docTop(el) + el.offsetHeight / 2, last = lines[lines.length - 1];
        if (!last || Math.abs(mid - last.mid) > 0.4 * fs) lines.push({ mid, top: docTop(el), bot: docTop(el) + el.offsetHeight, wins: [] });
        const L = lines[lines.length - 1]; L.wins.push(trig(el)); L.bot = Math.max(L.bot, docTop(el) + el.offsetHeight); }
      const sr = text.previousElementSibling;
      return { n: words.length, lines: lines.map(l => ({ top: l.top, bot: l.bot, wins: l.wins })), pc: docTop(text) + text.offsetHeight / 2,
        srOk: !!sr && sr.classList.contains('wr-sr') && sr.textContent.length > 20 && text.getAttribute('aria-hidden') === 'true' && text.parentNode.querySelectorAll(':scope > .wr-sr').length === 1 };
    }, [sel, prefix]);
    assert(d.n > 10 && d.lines.length >= 2 && d.lines.every(l => l.wins.every(Boolean)), `${tag} 1: split into ${d.n} words on ${d.lines.length} lines, each with a scroll window`);
    if (!d.lines.every(l => l.wins.every(Boolean))) continue;
    const spread = l => Math.max(...l.wins.map(x => Math.abs(x[0] - l.wins[0][0])), ...l.wins.map(x => Math.abs(x[1] - l.wins[0][1])));
    assert(d.lines.every(l => spread(l) <= 0.5), `${tag} 2: every word shares its line's window (worst spread inside a line ${Math.max(...d.lines.map(spread)).toFixed(1)}px of scroll)`);
    assert(d.lines.every((l, i) => i === 0 || l.wins[0][0] > d.lines[i - 1].wins[0][0]), `${tag} 3: the lines start in reading order (${d.lines.map(l => Math.round(l.wins[0][0])).join(' < ')})`);
    const late = d.lines.filter(l => l.wins[0][1] > Math.max(d.pc - h / 2, l.bot - h, l.wins[0][0] + 0.03 * h) + 1);   // a pop is never shorter than 3% of a screen of scroll
    assert(late.length === 0, `${tag} 5: every line is in by the time the paragraph's centre is at the screen's centre, or the line is in view (${late.length} late)`);
    // 4: 15% into each of the first three lines that are reached by scrolling (the pop overshoots: by halfway a line is already fully in).
    // A line already on screen when the page loads (its window starting above scroll 0) has no such moment to scroll to.
    const reach = d.lines.filter(l => l.wins[0][0] + 0.15 * (l.wins[0][1] - l.wins[0][0]) >= 0);
    let together = 0, partial = 0; const notes = [];
    for (const [k, l] of reach.slice(0, 3).entries()) {
      await go(page, l.wins[0][0] + 0.15 * (l.wins[0][1] - l.wins[0][0])); await sleep(350);
      const r = await page.evaluate(([sel, k, top]) => {
        const text = document.querySelector(sel), fs = parseFloat(getComputedStyle(text).fontSize);
        const docTop = el => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
        const ws = [...text.querySelectorAll('.wr-word')].filter(el => Math.abs(docTop(el) - top) < 0.4 * fs);
        return ws.map(el => ({ y: new DOMMatrix(getComputedStyle(el).transform).m42, o: +getComputedStyle(el).opacity }));
      }, [sel, k, l.top]);
      const ys = r.map(x => x.y), os = r.map(x => x.o);
      if (Math.max(...ys) - Math.min(...ys) <= 0.5 && Math.max(...os) - Math.min(...os) <= 0.02) together++;
      if (os[0] > 0.02 && os[0] < 0.98) partial++;
      notes.push(`line ${k + 1}: y ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}, opacity ${Math.min(...os).toFixed(2)}..${Math.max(...os).toFixed(2)}`);
    }
    const nChk = Math.min(3, reach.length);
    if (nChk === 0) assert(d.lines.every(l => l.wins[0][0] < 0), `${tag} 4: the whole paragraph is on screen when the page loads, so every line is already in (nothing to scroll to)`);
    else assert(together === nChk && partial === nChk, `${tag} 4: 15% into a line its words move as one, part way in (${notes.join('; ')})`);
    assert(d.srOk, `${tag} 6: one screen-reader copy of the sentence, the split text hidden from screen readers`);
  }
  assert(errors.length === 0, `@${w}x${h}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

{
  const { page, close } = await openPage({ width: 1440, height: 900, reducedMotion: true });
  await sleep(1000);
  const n = await page.evaluate(() => document.querySelectorAll('.wr-word').length);
  assert(n === 0, `@1440 reduced-motion: the text is not split, it stays plain and visible (${n} split words)`);
  await close();
}

await report();
