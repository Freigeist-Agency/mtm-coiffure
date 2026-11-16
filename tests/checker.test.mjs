// Checkerboard transitions (js/checker.js, css/site.css "Checkerboard blocks"), 2026-11-13.
// Brief: white -> black starts as a fully white canvas, blocks are picked away at random as in the design until the black underneath
// is fully revealed; black -> white is the inverse. At every width (1440, 768, 375) and for each of the three areas:
//   1. the grid has 8 x rows cells, sized 180x171 (Figma units, in vw);
//   2. entering (area just below the viewport): every cell shows the colour being left; at the end of its range: none does;
//   3. sweeping down the count of showing cells never rises, sweeping back up it never falls (reversible);
//   4. at p = 0.5 the showing cells are exactly the ones the static Figma SVG shows in the old colour (read here from the SVG,
//      independently of the script);
//   5. pixels: at p = 0.5, every cell centre on screen is the colour the DOM says (origin or arriving), so the SVG is hidden and
//      the grid really paints;
// and under reduced motion there is no grid and the static Figma SVG shows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/checker');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// sel, rows, the static SVG's offset in its box (Figma units), what its rects are, the leaving colour, the arriving ground
const AREAS = [
  { sel: '.blocks--into-intro', rows: 5, dx: -4, dy: -171, rects: 'to', from: [255, 255, 255], to: [0, 0, 0] },
  // 2026-11-15: the checkerboards out of Standorte and over the team photo left the page in the Desktop_new rebuild
];

const state = (page, sel) => page.evaluate(sel => {
  const box = document.querySelector(sel), cells = [...box.querySelectorAll('.checker-grid i')];
  return { p: +box.getAttribute('data-checker-p'), show: cells.map(c => getComputedStyle(c).visibility !== 'hidden') };
}, sel);

for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [375, 812, true]]) {
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  await sleep(1000);
  const k = w / 1440;
  for (const a of AREAS) {
    const tag = `@${w} ${a.sel}`;
    const g = await page.evaluate(sel => {
      const box = document.querySelector(sel), grid = box && box.querySelector('.checker-grid');
      if (!grid) return null;
      const cells = [...grid.children].map(c => c.getBoundingClientRect());
      const t = window.checker && window.checker[sel] && window.checker[sel].trigger;
      return { n: cells.length, cw: cells[0].width, ch: cells[0].height, live: box.classList.contains('checker-live'),
        svgVis: getComputedStyle(box.querySelector('svg')).visibility, start: t && t.start, end: t && t.end,
        max: document.documentElement.scrollHeight - innerHeight, bg: getComputedStyle(grid.children[0]).backgroundColor };
    }, a.sel);
    assert(!!g, `${tag}: the grid exists`);
    if (!g) continue;
    assert(g.n === 8 * a.rows, `${tag}: 8 x ${a.rows} cells (${g.n})`);
    assert(Math.abs(g.cw - 180 * k - 1) <= 1.5 && Math.abs(g.ch - 171 * k - 1) <= 1.5, `${tag}: cells are 180x171 at ${w} (+1px overlap): ${g.cw.toFixed(1)}x${g.ch.toFixed(1)}`);
    assert(g.live && g.svgVis === 'hidden', `${tag}: the static SVG is hidden while the grid runs`);
    assert(g.bg === `rgb(${a.from.join(', ')})`, `${tag}: cells are the colour being left (${g.bg})`);

    // 2 + 3: sweep down from before the start to the end, then back up
    const at = async y => { await page.evaluate(y => window.scrollTo(0, y), Math.max(0, Math.min(g.max, Math.round(y)))); await sleep(420); return state(page, a.sel); };
    const ys = []; for (let i = 0; i <= 14; i++) ys.push(g.start - 60 + (g.end + 30 - (g.start - 60)) * i / 14);
    const down = []; for (const y of ys) down.push(await at(y));
    const up = []; for (const y of [...ys].reverse()) up.push(await at(y));
    const count = s => s.show.filter(Boolean).length;
    assert(count(down[0]) === g.n, `${tag}: entering, every cell shows the old colour (${count(down[0])}/${g.n}, p ${down[0].p})`);
    assert(count(down[down.length - 1]) === 0, `${tag}: at the end of its range no cell is left (${count(down[down.length - 1])}, p ${down[down.length - 1].p})`);
    let rise = 0, fall = 0;
    for (let i = 1; i < down.length; i++) if (count(down[i]) > count(down[i - 1])) rise++;
    for (let i = 1; i < up.length; i++) if (count(up[i]) < count(up[i - 1])) fall++;
    assert(rise === 0 && fall === 0, `${tag}: one way down, the exact reverse up (down ${down.map(count).join(',')} | up ${up.map(count).join(',')})`);
    assert(count(up[up.length - 1]) === g.n, `${tag}: back above it, every cell shows the old colour again (${count(up[up.length - 1])})`);

    // 4: at p = 0.5 the showing cells are the Figma frame's old-colour cells
    const design = await page.evaluate(([sel, a]) => {
      const rects = [...document.querySelector(sel + ' svg').querySelectorAll('rect')].map(r => ['x', 'y', 'width', 'height'].map(n => +r.getAttribute(n)));
      const out = [];
      for (let r = 0; r < a.rows; r++) for (let c = 0; c < 8; c++) {
        const cx = c * 180 + 90 - a.dx, cy = r * 171 + 85.5 - a.dy;
        const hit = rects.some(([x, y, w, h]) => cx >= x && cx < x + w && cy >= y && cy < y + h);
        out.push(a.rects === 'to' ? !hit : hit);   // true = still the old colour in the design
      }
      return out;
    }, [a.sel, a]);
    const mid = Math.round(g.start + (g.end - g.start) * 0.5);
    const s = await at(mid); await sleep(300);
    const s2 = await state(page, a.sel);
    const diff = s2.show.reduce((n, v, i) => n + (v !== design[i] ? 1 : 0), 0);
    assert(Math.abs(s2.p - 0.5) < 0.02 && diff === 0, `${tag}: at p ${s2.p} the showing cells are exactly Figma's frame (${diff} of ${g.n} differ)`);

    // 5: pixels at the midpoint: the cell centres on screen have the colour the DOM says
    if (a.photo) await page.addStyleTag({ content: '.finale img { filter: brightness(0) !important; }' });
    await sleep(100);
    const png = await page.screenshot();
    fs.writeFileSync(path.join(OUT, `${w}-${a.sel.replace(/[^a-z]/g, '')}.png`), png);
    const px = await page.evaluate(async ([b64, sel]) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      const sc = img.width / innerWidth;
      return [...document.querySelectorAll(sel + ' .checker-grid i')].map(c => {
        const r = c.getBoundingClientRect(), X = Math.round((r.left + r.width / 2) * sc), Y = Math.round((r.top + r.height / 2) * sc);
        if (X < 0 || Y < 0 || X >= img.width || Y >= img.height || r.top < 60) return null;   // off screen or under the header
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!top || !(top === c || top.closest(sel.split(' ')[0]) || top.closest('.finale'))) return null;   // something else (the sliding footer) lies over it
        return [...x.getImageData(X, Y, 1, 1).data.slice(0, 3)];
      });
    }, [png.toString('base64'), a.sel]);
    let checked = 0, wrong = 0;
    px.forEach((rgb, i) => {
      if (!rgb) return; checked++;
      const near = c => c && Math.max(...rgb.map((v, j) => Math.abs(v - c[j]))) <= 6;
      if (s2.show[i] ? !near(a.from) : !near(a.to)) wrong++;
    });
    assert(checked >= 8 && wrong === 0, `${tag}: on screen, each cell centre is the colour its state says (${checked} checked, ${wrong} wrong)`);
  }
  assert(errors.length === 0, `@${w}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

// reduced motion: the static Figma frames, no grid
for (const [w, h] of [[1440, 900], [375, 812]]) {
  const { page, close } = await openPage({ width: w, height: h, reducedMotion: true, ...(w < 768 ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1000);
  const r = await page.evaluate(sels => sels.map(sel => { const b = document.querySelector(sel); return { grid: !!b.querySelector('.checker-grid'), live: b.classList.contains('checker-live'), svg: getComputedStyle(b.querySelector('svg')).visibility }; }), AREAS.map(a => a.sel));
  assert(r.every(x => !x.grid && !x.live && x.svg === 'visible'), `@${w} reduced-motion: no grid, the static Figma blocks show (${JSON.stringify(r)})`);
  await close();
}

await report();
