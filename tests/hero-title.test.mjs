// Hero title (index.html .hero-intro, css/site.css hero rules).
// "MTM Coiffure" must sit on the viewport's centre line at every width; Wilkommen (left) and the Arabic
// (right) must not touch it; the phone layout follows Figma frame 76:223 (450 wide).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/hero-title');
fs.mkdirSync(OUT, { recursive: true });

// Figma reference, measured on the renders of node 66:8 (1440x1080) and 76:223 (450x667) on 2026-11-03.
// Dark-pixel bounding boxes in hero-relative coordinates (x0, y0, x1, y1).
const FIGMA_DESKTOP = {
  small: [544, 25, 897, 40], hello: [11, 334, 120, 349], title: [648, 335, 791, 350], arabic: [1349, 329, 1429, 352],
};
const FIGMA_PHONE = {
  arabic: [146, 325, 305, 372], small: [49, 403, 402, 418], title: [72, 432, 378, 471], hello: [170, 514, 278, 529],
};

// Dark-pixel bbox of the hero screenshot inside each search window (python3 -I; PIL is already on this host).
const PY = `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); px = im.load()
out = {}
for name, (x0, y0, x1, y1) in json.loads(sys.argv[2]).items():
    xs, ys = [], []
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y]
            if (r + g + b) / 3 < 80: xs.append(x); ys.append(y)
    out[name] = [min(xs), min(ys), max(xs) + 1, max(ys) + 1] if xs else None
print(json.dumps(out))
`;
const inkBoxes = (png, windows) =>
  JSON.parse(execFileSync('python3', ['-I', '-c', PY, png, JSON.stringify(windows)], { encoding: 'utf8' }));

// Text rectangles (what is actually painted), not the grid boxes that contain them.
const textRects = page => page.evaluate(() => {
  const rect = el => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, cx: (b.left + b.right) / 2, w: b.width }; };
  return {
    small: rect(document.querySelector('.hero-title small')),
    title: rect(document.querySelector('.hero-title span')),
    hello: rect(document.querySelector('.hero-hello')),
    arabic: (() => { const b = document.querySelector('.hero-arabic').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, cx: (b.left + b.right) / 2, w: b.width }; })(),
    hero: (() => { const b = document.querySelector('.hero').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; })(),
    smallBox: (() => { const b = document.querySelector('.hero-title small').getBoundingClientRect(); return { t: b.top, b: b.bottom }; })(),
    titleBox: (() => { const b = document.querySelector('.hero-title span').getBoundingClientRect(); return { t: b.top, b: b.bottom }; })(),
    sw: document.documentElement.scrollWidth, iw: innerWidth,
  };
});
const meets = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t); // overlapping boxes

// ---- 1. centre line and no collisions at every width ---------------------------------------
for (const width of [375, 768, 1440, 2560]) {
  const tag = `@${width}`;
  const { page, errors, close } = await openPage({ width, height: width === 375 ? 667 : 900, isMobile: width === 375 });
  try {
    await page.evaluate(() => document.fonts.ready);
    const m = await textRects(page);
    assert(m.iw === width, `${tag}: viewport is ${width} (probe precondition, got ${m.iw})`);
    assert(m.title.w > 0 && m.hello.w > 0 && m.arabic.w > 0, `${tag}: title, Wilkommen and Arabic are rendered`);
    assert(Math.abs(m.title.cx - width / 2) <= 1, `${tag}: "MTM Coiffure" text centre ${m.title.cx.toFixed(2)} is within 1px of ${width / 2}`);
    assert(!meets(m.title, m.hello), `${tag}: title does not overlap Wilkommen`);
    assert(!meets(m.title, m.arabic), `${tag}: title does not overlap the Arabic`);
    assert(m.smallBox.b <= m.titleBox.t + 0.5, `${tag}: subtitle line box ends above the title line box`);
    assert(m.sw <= width, `${tag}: no horizontal overflow (scrollWidth ${m.sw} <= ${width})`);
    assert(m.title.l >= m.hero.l && m.title.r <= m.hero.r, `${tag}: title inside the hero`);
    assert(errors.length === 0, `${tag}: no page errors (${errors.join(' | ') || 'none'})`);
  } finally { await close(); }
}

// ---- 2. desktop render against Figma node 66:8 (1440) -----------------------------------------
{
  const { page, close } = await openPage({ width: 1440, height: 1200 });
  try {
    await page.evaluate(() => document.fonts.ready);
    const h = await page.evaluate(() => { const b = document.querySelector('.hero').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
    assert(h.w === 1440 && h.h === 1080, `@1440 hero is the 1440x1080 Figma frame (got ${h.w}x${h.h})`);
    const png = path.join(OUT, 'desktop-1440.png');
    await page.screenshot({ path: png, clip: { x: 0, y: h.y, width: 1440, height: 1080 } });
    const ours = inkBoxes(png, {
      small: [0, 0, 1440, 60], hello: [0, 300, 400, 420], title: [400, 300, 1040, 420], arabic: [1040, 300, 1440, 420],
    });
    const d = {};
    for (const k of Object.keys(FIGMA_DESKTOP)) d[k] = ours[k].map((v, i) => v - FIGMA_DESKTOP[k][i]);
    console.log('  desktop ink boxes (ours, Figma, delta px):');
    for (const k of Object.keys(FIGMA_DESKTOP)) console.log(`    ${k.padEnd(7)} ours ${JSON.stringify(ours[k])} figma ${JSON.stringify(FIGMA_DESKTOP[k])} delta ${JSON.stringify(d[k])}`);
    const titleCx = (ours.title[0] + ours.title[2]) / 2, figCx = (FIGMA_DESKTOP.title[0] + FIGMA_DESKTOP.title[2]) / 2;
    assert(Math.abs(titleCx - 720) <= 1.5, `@1440 Figma-vs-ours: title ink centre ${titleCx} is on the 720 centre line (±1.5px ink tolerance)`);
    assert(Math.abs(titleCx - figCx) <= 1, `@1440 title ink centre matches Figma (${titleCx} vs ${figCx}, delta ${(titleCx - figCx).toFixed(1)}px)`);
    assert(Math.abs(ours.title[0] - FIGMA_DESKTOP.title[0]) <= 1 && Math.abs(ours.title[2] - FIGMA_DESKTOP.title[2]) <= 1, '@1440 title ink edges match Figma within 1px');
    assert(Math.abs(ours.hello[0] - FIGMA_DESKTOP.hello[0]) <= 1 && Math.abs(ours.arabic[2] - FIGMA_DESKTOP.arabic[2]) <= 1, '@1440 Wilkommen left edge and Arabic right edge match Figma within 1px');
    assert(Math.abs(ours.small[0] - FIGMA_DESKTOP.small[0]) <= 1 && Math.abs(ours.small[2] - FIGMA_DESKTOP.small[2]) <= 1, '@1440 subtitle ink edges match Figma within 1px');
  } finally { await close(); }
}

// ---- 3. phone render against Figma frame 76:223 (450 wide) ----------------------------------
{
  const { page, close } = await openPage({ width: 450, height: 800, isMobile: true });
  try {
    await page.evaluate(() => document.fonts.ready);
    const h = await page.evaluate(() => { const b = document.querySelector('.hero').getBoundingClientRect(); return { y: b.top, w: b.width, h: b.height }; });
    assert(h.w === 450 && h.h === 667, `@450 hero is the 450x667 Figma frame (got ${h.w}x${h.h})`);
    const png = path.join(OUT, 'phone-450.png');
    await page.screenshot({ path: png, clip: { x: 0, y: h.y, width: 450, height: 667 } });
    const ours = inkBoxes(png, {
      arabic: [0, 300, 450, 384], small: [0, 385, 450, 420], title: [0, 421, 450, 490], hello: [0, 495, 450, 545],
    });
    console.log('  phone ink boxes (ours, Figma, delta px):');
    for (const k of Object.keys(FIGMA_PHONE)) console.log(`    ${k.padEnd(7)} ours ${JSON.stringify(ours[k])} figma ${JSON.stringify(FIGMA_PHONE[k])} delta ${JSON.stringify(ours[k].map((v, i) => v - FIGMA_PHONE[k][i]))}`);
    const tw = ours.title[2] - ours.title[0], fw = FIGMA_PHONE.title[2] - FIGMA_PHONE.title[0];
    assert(Math.abs(tw - fw) <= 4, `@450 title ink width ${tw}px vs Figma ${fw}px (±4px)`);
    const tcx = (ours.title[0] + ours.title[2]) / 2;
    assert(Math.abs(tcx - 225) <= 1.5, `@450 title ink centre ${tcx} is on the 225 centre line (±1.5px)`);
    assert(Math.abs(ours.arabic[1] - FIGMA_PHONE.arabic[1]) <= 2 && Math.abs(ours.small[1] - FIGMA_PHONE.small[1]) <= 1, `@450 Arabic top (${ours.arabic[1]} vs 325) and subtitle top (${ours.small[1]} vs 403) on Figma's rows`);
    assert(Math.abs(ours.title[1] - FIGMA_PHONE.title[1]) <= 3, `@450 title ink top ${ours.title[1]} vs Figma ${FIGMA_PHONE.title[1]} (±3px, residual reported)`);
  } finally { await close(); }
}

await report();
