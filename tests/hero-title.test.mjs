// Hero (index.html .hero, css/site.css hero rules), rebuilt 2026-11-13 from Figma 66:8 "Hero video" + 265:63 "MTM Coiffure."
// (file HFuZZUOKyUWmXb8yER287l). Reference values were measured on Figma's render of frame 64:2 at 1440 on 2026-11-13:
//   text row:  "Wilkommen." at x=11, y=329; the subtitle centred at x=712, y=333; the Arabic greeting 80x24 at x=1349..1429, y=329
//   title:     Badeen Display 200px, white; its letters' top at y=865 and the right edge of the "." at x=1400; the "M" starts
//              off the left edge (ink at x=0); the hero (1005 tall) clips the bottom of the letters
//   hero:      the client's video under a 32% black layer, bottom corners 5px, a straight bottom edge (no curve since 2026-11-13)
// Phones (no phone frame for this design yet): the text stacked and centred above the title, which keeps the desktop's vw size
// and sits on the bottom edge in the same proportion (line box from 1.15em above the edge).
// Pixels are read in the page from a screenshot (no python / pngjs), with the video hidden so only the title can be white.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/hero-title');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FIGMA = { hello: [11, 329], smallCx: 712, smallTop: 333, arabic: [1349, 329, 1429], heroH: 1005, inkTop: 865, inkRight: 1400 };

// white-pixel scan of a screenshot, done in the page (canvas): per-row first/last white x and the first white row in a band
const scan = (page, png, rows, band, minGap = 3) => page.evaluate(async ([b64, rows, band, minGap]) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const W = img.width, white = (d, i) => d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245;
  const runs = rows.map(y => { const d = x.getImageData(0, y, W, 1).data; let a = -1, z = -1, n = 0; for (let i = 0; i < W; i++) if (white(d, i * 4)) { if (a < 0) a = i; z = i; n++; } return [y, a, z, n / W]; });
  // dark gaps (>= 3px) between letters on the first row, and how many of their centre columns are white on the second row
  const d0 = x.getImageData(0, rows[0], W, 1).data, d1 = x.getImageData(0, rows[1], W, 1).data, gaps = [];
  for (let i = runs[0][1], g = -1; i <= runs[0][2]; i++) { const w = white(d0, i * 4); if (!w && g < 0) g = i; if (w && g >= 0) { if (i - g >= minGap) gaps.push((g + i) >> 1); g = -1; } }
  const gapWhite = gaps.filter(c => white(d1, c * 4)).length;
  let top = -1;
  for (let y = band[0]; y < band[1] && top < 0; y++) { const d = x.getImageData(0, y, W, 1).data; for (let i = 0; i < W; i++) if (white(d, i * 4)) { top = y; break; } }
  return { runs, top, gaps: gaps.length, gapWhite };
}, [png.toString('base64'), rows, band, minGap]);

const READ = () => {
  const rect = el => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY, cx: (b.left + b.right) / 2 }; };
  const box = el => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY, cx: (b.left + b.right) / 2, w: b.width, h: b.height }; };
  const hero = document.querySelector('.hero'), span = document.querySelector('.hero-title span'), v = document.querySelector('.hero video');
  const hs = getComputedStyle(hero), ov = getComputedStyle(hero, '::after'), ts = getComputedStyle(span);
  return {
    iw: innerWidth, sw: document.documentElement.scrollWidth,
    hero: box(hero), radius: [hs.borderTopLeftRadius, hs.borderBottomLeftRadius, hs.borderBottomRightRadius], overlay: ov.backgroundColor, overlayRadius: ov.borderTopLeftRadius,
    hello: rect(document.querySelector('.hero-hello')), small: rect(document.querySelector('.hero-title small')), arabic: box(document.querySelector('.hero-arabic')),
    title: box(span), titleFont: ts.fontFamily, titleSize: parseFloat(ts.fontSize), titleColor: ts.color, textColor: getComputedStyle(document.querySelector('.hero-hello')).color,
    fontReady: document.fonts.check(`${ts.fontSize} "Badeen Display"`),
    h1: document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(), h1Count: document.querySelectorAll('h1').length,
    video: { src: v.currentSrc.split('/').pop(), paused: v.paused, poster: v.getAttribute('poster') },
    live: hero.classList.contains('arc-live'),
    header: (() => { const hd = document.querySelector('.site-header'), logos = [...hd.querySelectorAll('.brand img')].filter(i => getComputedStyle(i).display !== 'none'); return { over: hd.classList.contains('is-over-hero'), bg: getComputedStyle(hd).backgroundColor, color: getComputedStyle(hd).color, logo: logos.map(i => i.getAttribute('src')).join(',') }; })(),
  };
};
const meets = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);

for (const [w, h, mobile] of [[1440, 1100, false], [768, 1024, false], [375, 812, true], [2560, 2000, false]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await page.evaluate(() => document.fonts.ready);
  await sleep(1500);
  const r = await page.evaluate(READ);
  const top = r.hero.t, k = w / 1440;   // hero-relative coordinates; desktop values scale with the width (the layout is in vw)
  assert(r.iw === w, `${tag}: the viewport really is ${w} wide (${r.iw})`);
  assert(r.sw <= r.iw, `${tag}: no horizontal overflow (scrollWidth ${r.sw})`);
  assert(r.h1Count === 1 && r.h1 === 'Friseurmeister in Nümbrecht & Waldbröl MTM Coiffure.', `${tag}: one h1 carrying the real text for search engines ("${r.h1}")`);
  assert(/Badeen Display/.test(r.titleFont) && r.fontReady, `${tag}: the title is set in Badeen Display and the font has loaded (${r.titleFont})`);
  assert(Math.abs(r.titleSize - 200 * k) < 0.5, `${tag}: title size ${r.titleSize.toFixed(1)}px = 200px x ${k.toFixed(3)}`);
  assert(r.titleColor === 'rgb(255, 255, 255)' && r.textColor === 'rgb(255, 255, 255)', `${tag}: title and text are white (${r.titleColor}, ${r.textColor})`);
  assert(r.overlay === 'rgba(0, 0, 0, 0.32)' && r.overlayRadius !== '50%', `${tag}: the video lies under Figma's 32% black layer (${r.overlay})`);
  assert(r.radius[0] === '0px' && r.radius[1] === '5px' && r.radius[2] === '5px', `${tag}: square top, 5px bottom corners (${r.radius.join(' ')})`);
  assert(!r.live, `${tag}: the hero carries no scroll-driven curve`);
  assert(Math.abs(top) < 0.5, `${tag}: the hero starts at the top of the page, under the header (top ${top})`);
  assert(r.header.over && r.header.bg === 'rgba(0, 0, 0, 0)' && r.header.color === 'rgb(255, 255, 255)' && r.header.logo === 'assets/logo-nav-white.png', `${tag}: over the hero the header is transparent, white, with the white logo (${JSON.stringify(r.header)})`);
  assert(r.video.src === (w < 768 ? 'hero-960.mp4' : 'hero-1600.mp4') && !r.video.paused && r.video.poster === 'assets/hero-poster.jpg', `${tag}: the ${w < 768 ? 'phone' : 'large'} video plays, with its poster (${r.video.src}, paused ${r.video.paused})`);

  if (!mobile) {
    assert(Math.abs(r.hero.h - FIGMA.heroH * k) <= 1, `${tag}: hero height ${r.hero.h.toFixed(1)} = ${(FIGMA.heroH * k).toFixed(1)}`);
    assert(Math.abs(r.hello.l - FIGMA.hello[0] * k) <= 2 && Math.abs(r.hello.t - top - FIGMA.hello[1] * k) <= 3, `${tag}: "Wilkommen." at (${r.hello.l.toFixed(0)}, ${(r.hello.t - top).toFixed(0)}) vs Figma (${(FIGMA.hello[0] * k).toFixed(0)}, ${(FIGMA.hello[1] * k).toFixed(0)})`);
    assert(Math.abs(r.small.cx - FIGMA.smallCx * k) <= 3 && Math.abs(r.small.t - top - FIGMA.smallTop * k) <= 3 * Math.max(1, k), `${tag}: subtitle centred at ${r.small.cx.toFixed(0)}, top ${(r.small.t - top).toFixed(0)} vs Figma ${(FIGMA.smallCx * k).toFixed(0)}, ${(FIGMA.smallTop * k).toFixed(0)}`);
    assert(Math.abs(r.arabic.l - FIGMA.arabic[0] * k) <= 2 && Math.abs(r.arabic.r - FIGMA.arabic[2] * k) <= 2 && Math.abs(r.arabic.t - top - FIGMA.arabic[1] * k) <= 3, `${tag}: Arabic greeting ${r.arabic.l.toFixed(0)}..${r.arabic.r.toFixed(0)} at ${(r.arabic.t - top).toFixed(0)} vs Figma ${(FIGMA.arabic[0] * k).toFixed(0)}..${(FIGMA.arabic[2] * k).toFixed(0)}`);
    assert(!meets(r.hello, r.small) && !meets(r.small, r.arabic), `${tag}: the three texts of the row do not touch`);
  } else {
    assert(Math.abs(r.small.cx - w / 2) <= 2 && Math.abs(r.hello.cx - w / 2) <= 2 && Math.abs(r.arabic.cx - w / 2) <= 2, `${tag}: the stacked texts are centred (${r.arabic.cx.toFixed(0)}, ${r.small.cx.toFixed(0)}, ${r.hello.cx.toFixed(0)})`);
    assert(r.arabic.b <= r.small.t && r.small.b <= r.hello.t, `${tag}: order top to bottom: Arabic, subtitle, Wilkommen`);
    assert(Math.abs(r.title.t - (r.hero.b - 1.15 * r.titleSize)) <= 1, `${tag}: the title's line box starts 1.15em above the hero's bottom edge (${(r.hero.b - r.title.t).toFixed(1)} vs ${(1.15 * r.titleSize).toFixed(1)})`);
    assert(r.hello.b + 8 <= r.title.t + 0.45 * r.titleSize, `${tag}: "Wilkommen." stays clear of the title's letters`);
  }

  // pixels: hide the video, header and texts, so the only white inside the hero is the title's letters
  await page.addStyleTag({ content: '.hero-media video, .site-header, .hero-intro > p, .hero-arabic, .hero-title small { visibility: hidden !important; }' });
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
  const png = await page.screenshot({ fullPage: false, clip: { x: 0, y: 0, width: w, height: Math.min(h, Math.ceil(r.hero.b)) } });
  fs.writeFileSync(path.join(OUT, `hero-${w}.png`), png);
  const heroB = Math.floor(r.hero.b), rowMid = Math.round(top + (mobile ? (r.hero.b - top) - 0.325 * r.titleSize : 940 * k));
  const s = await scan(page, png, [rowMid, heroB - 7], [Math.round(top), heroB - 1], mobile ? 1 : 3);   // the 52px phone title has 1-2px gaps   // 7px up: clear of the 5px rounded corners, where the page shows through
  const [, aMid, zMid] = s.runs[0];
  if (!mobile) {
    assert(Math.abs(s.top - top - FIGMA.inkTop * k) <= 3 * Math.max(1, k), `${tag}: the letters' top at ${(s.top - top).toFixed(0)} vs Figma ${(FIGMA.inkTop * k).toFixed(0)}`);
    assert(aMid === 0 && Math.abs(zMid - FIGMA.inkRight * k) <= 4 * Math.max(1, k), `${tag}: the title runs from the left edge (ink at ${aMid}) to x=${zMid} vs Figma ${(FIGMA.inkRight * k).toFixed(0)}`);
  } else {
    assert(aMid >= 0 && aMid <= 6 && zMid >= w - 30 && zMid < w, `${tag}: the title spans the phone's width (ink ${aMid}..${zMid})`);
  }
  // straight edge: the dark gaps between the letters stay dark down to the bottom edge; the old white ellipse would fill them
  assert(s.gaps >= 6 && s.gapWhite <= Math.floor(s.gaps / 4), `${tag}: no white curve along the hero's bottom (${s.gapWhite} of ${s.gaps} letter gaps white near the edge)`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

// the header turns back into the white Figma bar as soon as the hero's bottom edge rises past it, and clear again on the way back
for (const [w, h, mobile] of [[1440, 900, false], [375, 812, true]]) {
  const tag = `@${w} header`;
  const { page, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(800);
  const st = () => page.evaluate(() => { const hd = document.querySelector('.site-header'); return { over: hd.classList.contains('is-over-hero'), bg: getComputedStyle(hd).backgroundColor, logo: [...hd.querySelectorAll('.brand img')].filter(i => getComputedStyle(i).display !== 'none').map(i => i.getAttribute('src')).join() }; });
  const H = await page.evaluate(() => document.querySelector('.hero').offsetHeight);
  const at = async y => { await page.evaluate(y => window.scrollTo(0, y), y); await sleep(450); return st(); };
  const a = await at(H - 60), b = await at(H - 45), c = await at(H - 60), d = await at(0);
  assert(a.over && !b.over && c.over && d.over, `${tag}: clear while the hero covers the header (10px left: ${a.over}), white once its edge is 5px past the header (${!b.over}), clear again scrolling back (${c.over}, top ${d.over})`);
  assert(b.bg === 'rgb(255, 255, 255)' && b.logo === 'assets/logo-nav.png', `${tag}: past the hero the header is the white bar with the normal logo (${b.bg}, ${b.logo})`);
  await close();
}

// reduced motion: the still poster, not the moving video
{
  const { page, close } = await openPage({ width: 1440, height: 900, reducedMotion: true });
  await sleep(1200);
  const v = await page.evaluate(() => { const v = document.querySelector('.hero video'); return { paused: v.paused, autoplay: v.hasAttribute('autoplay'), t: v.currentTime }; });
  assert(v.paused && !v.autoplay && v.t === 0, `@1440 reduced-motion: the video stays on its poster (paused ${v.paused}, autoplay ${v.autoplay}, t ${v.t})`);
  await close();
}

await report();
