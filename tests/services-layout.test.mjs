// Services section layout (css/site.css, Figma 73:3 pulled again 2026-11-13: "scale [the carousel] down to match ... and add the texts in
// the new positions"). Static layout, reduced motion, measured in Figma px (the section's width / 1440). At 768, 1440 and 2560:
//   1. the section is 1093 tall;
//   2. the eight photos are 124.7 square, the side ones' centres 277 from the ring centre at (720.5, 547), the diagonals 281 out;
//   3. the title is at (27, 192), the text at (1028, 792) 399 wide, the button centred on (720, 546.5);
//   4. at 1440 the title is 36px and the text 20px (Figma); the title scales with the page, the text keeps a 16px floor;
// and on a phone (375) the section keeps its own phone layout (six photos, the copy in the flow).
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t) => Math.abs(a - b) <= t;
for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [2560, 1440, false], [375, 812, true]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1200);
  const r = await page.evaluate(() => {
    const s = document.querySelector('.services').getBoundingClientRect(), k = s.width / 1440;
    const box = e => { const b = e.getBoundingClientRect(); return { x: (b.left - s.left) / k, y: (b.top - s.top) / k, w: b.width / k, h: b.height / k, cx: ((b.left + b.right) / 2 - s.left) / k, cy: ((b.top + b.bottom) / 2 - s.top) / k }; };
    const items = [...document.querySelectorAll('.orbit__item')].filter(li => getComputedStyle(li).display !== 'none').map(li => ({ name: li.className.split('--')[1], size: li.offsetWidth / k, ...box(li) }));
    const fs = sel => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
    return { k, H: s.height / k, items, h2: box(document.querySelector('.services-copy h2')), p: box(document.querySelector('.services-copy p')), btn: box(document.querySelector('.services-copy .btn')), h2fs: fs('.services-copy h2'), pfs: fs('.services-copy p'), copyPos: getComputedStyle(document.querySelector('.services-copy')).position };
  });
  if (mobile) {
    assert(r.items.length === 6 && r.copyPos !== 'absolute', `${tag}: phones keep their own layout (${r.items.length} photos, copy ${r.copyPos})`);
    await close(); continue;
  }
  assert(near(r.H, 1093, 1), `${tag} 1: the section is 1093 tall (${r.H.toFixed(1)})`);
  const side = r.items.filter(i => ['t', 'l', 'r', 'b'].includes(i.name)), diag = r.items.filter(i => ['tl', 'tr', 'bl', 'br'].includes(i.name));
  const dist = i => Math.hypot(i.cx - 720.5, i.cy - 547);
  assert(r.items.length === 8 && r.items.every(i => near(i.size, 124.7, 1.2)), `${tag} 2: eight photos, 124.7 square (${r.items.map(i => i.size.toFixed(1)).join(',')})`);
  assert(side.every(i => near(dist(i), 277, 1.5)) && diag.every(i => near(dist(i), 281, 2)), `${tag} 2: on a ring around (720.5, 547): sides ${side.map(i => dist(i).toFixed(1)).join(',')}, diagonals ${diag.map(i => dist(i).toFixed(1)).join(',')}`);
  assert(near(r.h2.x, 27, 1) && near(r.h2.y, 192, 1) && near(r.p.x, 1028, 1) && near(r.p.y, 792, 1) && near(r.p.w, 399, 1), `${tag} 3: title at (${r.h2.x.toFixed(1)}, ${r.h2.y.toFixed(1)}), text at (${r.p.x.toFixed(1)}, ${r.p.y.toFixed(1)}) ${r.p.w.toFixed(1)} wide`);
  assert(near(r.btn.cx, 720, 1.5) && near(r.btn.cy, 546.5, 1.5), `${tag} 3: the button is centred on the ring (${r.btn.cx.toFixed(1)}, ${r.btn.cy.toFixed(1)})`);
  const wantH2 = 36 * r.k, wantP = Math.max(20 * r.k, 16);   // the title scales with the page (a floor made it hit the ring at 768-850)
  assert(near(r.h2fs, wantH2, 0.3) && near(r.pfs, wantP, 0.3), `${tag} 4: title ${r.h2fs.toFixed(1)}px (want ${wantH2.toFixed(1)}), text ${r.pfs.toFixed(1)}px (want ${wantP.toFixed(1)})`);
  assert(r.p.y + r.p.h <= r.H, `${tag} 3: the text ends inside the section (${(r.p.y + r.p.h).toFixed(0)} of ${r.H.toFixed(0)})`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}
await report();
