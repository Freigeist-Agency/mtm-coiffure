// The layout with a classic scrollbar (cofounder, 2026-11-19: "missing padding on the right" on desktop). On Windows the scrollbar
// takes 15-17px of the window; the layout unit was the window's width (100vw) divided by 1512, so every section was drawn that much
// too wide and its right edge went under the scrollbar. It is now the page's visible width (--page-w, set by the <head> script).
// The test browser hides scrollbars, so this test gives the page a real 17px one, then at 1512, 1440, 1920 and 1024, on the home
// page and a location page:
//   1. the scrollbar really takes room (the visible width is 17px less than the window) and the layout unit follows it;
//   2. nothing reaches under the scrollbar: the page is no wider than its visible width;
//   3. the services photos keep Figma's edges at the visible width's scale k: the first 9k from the left, the last ending 10.25k from
//      the right (it was 5px under the scrollbar at 1512); the team photo 58k / 56k from the sides; on a location page the name is
//      centred on 756k.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t = 1) => Math.abs(a - b) <= t;
const BAR = 'html::-webkit-scrollbar { width: 17px; } html::-webkit-scrollbar-thumb { background: #888; }';

for (const path of ['index.html', 'locations/nuembrecht.html']) {
  for (const [w, h] of [[1512, 900], [1440, 900], [1920, 1080], [1024, 768]]) {
    const tag = `${path} @${w}`;
    const { page, errors, close } = await openPage({ width: w, height: h, path, reducedMotion: true, scrollbars: true });
    await page.addStyleTag({ content: BAR });
    await sleep(1200);
    const r = await page.evaluate(() => {
      const cw = document.documentElement.clientWidth, b = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: cw - r.right, c: (r.left + r.right) / 2 }; };
      return { iw: innerWidth, cw, pageW: getComputedStyle(document.documentElement).getPropertyValue('--page-w').trim(), sw: document.documentElement.scrollWidth,
        p1: b('.cuts li:nth-child(1 of :not(.is-clone))'), p6: b('.cuts li:nth-child(6 of :not(.is-clone))'), fin: b('.finale-photo img'), title: b('.loc-hero__title') };
    });
    const k = r.cw / 1512;
    assert(r.iw - r.cw === 17 && r.pageW === r.cw + 'px', `${tag} 1: a 17px scrollbar, the layout unit on the visible ${r.cw}px (${r.pageW})`);
    assert(r.sw <= r.cw, `${tag} 2: nothing under the scrollbar (page ${r.sw} wide, visible ${r.cw})`);
    if (r.p1) assert(near(r.p1.l, 9 * k) && near(r.p6.r, 10.25 * k), `${tag} 3: the photos 9k from the left, 10.25k from the right (${r.p1.l.toFixed(1)}, ${r.p6.r.toFixed(1)}; k ${k.toFixed(3)})`);
    assert(near(r.fin.l, 58 * k) && near(r.fin.r, 56 * k), `${tag} 3: the team photo 58k / 56k from the sides (${r.fin.l.toFixed(1)} / ${r.fin.r.toFixed(1)})`);
    if (r.title) assert(near(r.title.c, 756 * k, 1.5), `${tag} 3: the salon's name centred on 756k (${r.title.c.toFixed(1)})`);
    assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
    await close();
  }
}
await report();
