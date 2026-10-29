// Scroll-driven curved edges (js/arc-scroll.js): the white ellipse over About, the curve before Social, the footer dome.
// Real wheel scrolling (page.mouse.wheel) through each curve at 1440x900, 768x1024 and 375x812. Every sample reads the
// rendered state (computed transform of the ::before ellipse / the ry of the inlined SVG ellipse) and the geometry of the
// section edge, derives the expected depth factor from the reference mapping on its own, and compares.
//   dome  (Locations curve, footer):  s = max(0.04, p)        p = 0 when the edge enters at the bottom, 1 when it has settled
//   smile (About top):                s = max(0.04, 1 - p)    p = 0 when the edge enters, 1 when it reaches the top
//   s = rendered depth / designed depth. The footer's p ends where the document ends (the page cannot scroll the dome higher).
// At rest (scrolling stopped, edge anywhere in view) s must be exactly 1 and the geometry the Figma one from css/site.css.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/arc-scroll');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIN_S = 0.04;
const TOL = 0.15;            // |rendered s - expected s| while moving: one frame of lag plus the gate's 90ms rise
const NAMES = ['about', 'curve', 'footer'];
const KIND = { about: 'smile', curve: 'dome', footer: 'dome' };

// everything a test needs to know, read in one evaluate (layout reads are fine here, this is the test)
const READ = () => {
  const iw = window.innerWidth, H = window.innerHeight;
  const about = document.querySelector('.about'), fb = document.querySelector('.footer-body'), svg = document.querySelector('svg.curve');
  const pseudo = el => {
    const cs = getComputedStyle(el, '::before');
    return {
      s: cs.transform === 'none' ? 1 : new DOMMatrix(cs.transform).d, transform: cs.transform,
      top: parseFloat(cs.top), height: parseFloat(cs.height), radius: cs.borderTopLeftRadius, live: el.classList.contains('arc-live'),
    };
  };
  const a = pseudo(about), f = pseudo(fb);
  const sr = svg.getBoundingClientRect(), dome = svg.querySelector('.curve__dome');
  const max = document.documentElement.scrollHeight - H;
  return {
    iw, H, y: window.scrollY, max, overflow: document.documentElement.scrollWidth > iw,
    about: { ...a, corner: about.getBoundingClientRect().top },
    curve: { s: parseFloat(dome.getAttribute('ry')) / 286, ry: dome.getAttribute('ry'), live: false, boxH: sr.height, boxW: sr.width, corner: sr.bottom },
    footer: { ...f, corner: fb.getBoundingClientRect().top + f.top + f.height / 2 },
  };
};

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
// progress of a curve's edge, derived from the geometry alone
function progress(name, r) {
  const c = r[name].corner;
  if (name !== 'footer') return clamp01(1 - c / r.H);
  const cornerEnd = c - (r.max - r.y);                     // where the dome's centre line sits at the end of the document
  return clamp01((r.H - c) / (r.H - cornerEnd));
}
const expected = (name, p) => Math.max(MIN_S, KIND[name] === 'smile' ? 1 - p : p);

// the resting geometry from css/site.css (Figma), per breakpoint; the same numbers main renders
function restGeometry(iw) {
  const mobile = iw <= 767;
  return {
    about: { top: -(mobile ? 31.78 : 19.86) * iw / 100, height: (mobile ? 63.56 : 39.72) * iw / 100 },
    footer: { top: (mobile ? 20 : 9) * iw / 100, height: 39.72 * iw / 100 },
    curveH: mobile ? 0.741 * iw : Math.min(628, Math.max(200, 0.436 * iw)),
  };
}

async function wheelStep(page, dy) { await page.mouse.wheel(0, dy); await sleep(32); }
const scrollTo = (page, y) => page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), y);
const settle = () => sleep(900);                           // gate falls over 500ms after the last scroll event

// absolute scrollY that puts a curve's edge at progress p
async function yForProgress(page, name, p) {
  return page.evaluate(([name, p, MIN]) => {
    const H = innerHeight, y = scrollY, max = document.documentElement.scrollHeight - H;
    const about = document.querySelector('.about'), fb = document.querySelector('.footer-body'), svg = document.querySelector('svg.curve');
    let corner;
    if (name === 'about') corner = about.getBoundingClientRect().top;
    else if (name === 'curve') corner = svg.getBoundingClientRect().bottom;
    else { const cs = getComputedStyle(fb, '::before'); corner = fb.getBoundingClientRect().top + parseFloat(cs.top) + parseFloat(cs.height) / 2; }
    let target;
    if (name !== 'footer') target = H * (1 - p);
    else { const cornerEnd = corner - (max - y); target = H - p * (H - cornerEnd); }
    return Math.max(0, Math.min(max, y + corner - target));
  }, [name, p]);
}

async function pass(w, h, mobile) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await page.mouse.move(w / 2, h / 2);
  await sleep(400);
  assert(await page.evaluate(() => !!window.arcScroll), `${tag}: js/arc-scroll.js is running (window.arcScroll)`);
  const step = Math.round(h / 20);
  let overflowAt = null;

  const rest0 = await page.evaluate(READ);
  const G = restGeometry(rest0.iw);

  for (const name of NAMES) {
    // ---- forward pass: start below the entry line, wheel through to the settled end ------------------------------
    const st = name === 'footer' ? Math.max(8, Math.round(step / 3)) : step;   // the footer's whole travel is only ~15% of the viewport
    await scrollTo(page, await yForProgress(page, name, name === 'footer' ? -0.12 : -0.45));
    await settle();
    const fwd = [];
    for (let i = 0; i < 160; i++) {
      await wheelStep(page, st);
      const r = await page.evaluate(READ);
      if (r.overflow && !overflowAt) overflowAt = `${name} y=${r.y}`;
      const p = progress(name, r);
      fwd.push({ y: r.y, p, s: r[name].s, e: expected(name, p), raw: r });
      if (p >= 0.995 || r.y >= r.max - 1) break;
    }
    const mid = fwd.filter(x => x.p >= 0.1 && x.p <= 0.9);
    const maxErr = mid.reduce((m, x) => Math.max(m, Math.abs(x.s - x.e)), 0);
    assert(mid.length >= 4, `${tag} ${name}: forward pass has >= 4 samples between p 0.1 and 0.9 (${mid.length})`);
    assert(maxErr <= TOL, `${tag} ${name}: s follows the ${KIND[name]} mapping within ${TOL} while moving (max error ${maxErr.toFixed(3)} over ${mid.length} samples)`);
    const early = fwd.filter(x => x.p >= 0.1 && x.p <= 0.3), late = fwd.filter(x => x.p >= 0.7 && x.p <= 0.9);
    const avg = a => a.reduce((t, x) => t + x.s, 0) / (a.length || 1);
    if (KIND[name] === 'smile') {
      assert(early.length && late.length && avg(early) - avg(late) > 0.3, `${tag} ${name}: deepest while entering, flattening as it rises (s ${avg(early).toFixed(2)} at p<=0.3 -> ${avg(late).toFixed(2)} at p>=0.7)`);
      assert(Math.max(...fwd.map(x => x.s)) <= 1.02 && avg(early) > 0.7, `${tag} ${name}: the entering depth is the designed one, never deeper (max s ${Math.max(...fwd.map(x => x.s)).toFixed(2)})`);
    } else {
      assert(early.length && late.length && avg(late) - avg(early) > 0.3, `${tag} ${name}: flat while entering, deepening as it rises (s ${avg(early).toFixed(2)} at p<=0.3 -> ${avg(late).toFixed(2)} at p>=0.7)`);
      assert(Math.max(...fwd.map(x => x.s)) <= 1.02, `${tag} ${name}: never deeper than designed (max s ${Math.max(...fwd.map(x => x.s)).toFixed(2)})`);
    }
    assert(Math.min(...mid.map(x => x.s)) < 0.75, `${tag} ${name}: leaves the resting shape while travelling (min s ${Math.min(...mid.map(x => x.s)).toFixed(2)})`);

    // ---- backwards through the same range: same states, no stuck curve -----------------------------------------
    const back = [];
    for (let i = 0; i < 160; i++) {
      await wheelStep(page, -st);
      const r = await page.evaluate(READ);
      if (r.overflow && !overflowAt) overflowAt = `${name} back y=${r.y}`;
      const p = progress(name, r);
      back.push({ y: r.y, p, s: r[name].s, e: expected(name, p) });
      if (p <= 0.005 || r.y <= 1) break;
    }
    const bmid = back.filter(x => x.p >= 0.1 && x.p <= 0.9);
    const bErr = bmid.reduce((m, x) => Math.max(m, Math.abs(x.s - x.e)), 0);
    assert(bmid.length >= 4 && bErr <= TOL, `${tag} ${name}: scrolling back follows the same mapping (max error ${bErr.toFixed(3)} over ${bmid.length} samples)`);
    const sForward = fwd.filter(x => x.p >= 0.2 && x.p <= 0.8), sBack = back.filter(x => x.p >= 0.2 && x.p <= 0.8);
    const around = (arr, p) => arr.reduce((b, x) => Math.abs(x.p - p) < Math.abs(b.p - p) ? x : b, arr[0]);
    const dPair = [0.3, 0.5, 0.7].map(p => Math.abs(around(sForward, p).s - around(sBack, p).s));
    assert(sForward.length && sBack.length && Math.max(...dPair) <= TOL, `${tag} ${name}: forward and backward states agree at p 0.3/0.5/0.7 (max diff ${Math.max(...dPair).toFixed(3)})`);

    // ---- stop with the edge in view at p ~ 0.35, 0.65 and at the settled end: the designed bow -------------------
    for (const stopP of [0.3, 0.6, 0.97]) {
      await scrollTo(page, await yForProgress(page, name, stopP - 0.05));
      for (let i = 0; i < 4; i++) await wheelStep(page, name === 'footer' ? 3 : 12);
      await page.evaluate(() => {});
      await settle();
      const r = await page.evaluate(READ);
      const p = progress(name, r);
      const g = r[name];
      let geomOk, detail;
      if (name === 'curve') {
        geomOk = g.ry === '286' && Math.abs(g.boxH - G.curveH) <= 1 && Math.abs(g.boxW - r.iw) <= 1;
        detail = `ry ${g.ry}, box ${g.boxW.toFixed(1)}x${g.boxH.toFixed(1)} vs ${r.iw}x${G.curveH.toFixed(1)}`;
      } else {
        geomOk = g.s === 1 && g.transform === 'none' && !g.live && Math.abs(g.top - G[name].top) <= 1 && Math.abs(g.height - G[name].height) <= 1 && g.radius.startsWith('50%');
        detail = `s ${g.s}, live ${g.live}, transform ${g.transform}, top ${g.top.toFixed(1)} vs ${G[name].top.toFixed(1)}, height ${g.height.toFixed(1)} vs ${G[name].height.toFixed(1)}, radius ${g.radius}`;
      }
      assert(Math.abs(p - stopP) <= 0.15 && geomOk, `${tag} ${name}: stopped at p ${p.toFixed(2)}: resting geometry is today's, within 1px (${detail})`);
    }

    // ---- strip of 5 shots at 1440 and 375, the gate held open so each frame shows the depth the mapping gives ----------
    if (w === 1440 || w === 375) {
      const probs = [0.15, 0.35, 0.55, 0.75, 0.9];
      for (let i = 0; i < probs.length; i++) {
        await scrollTo(page, await yForProgress(page, name, probs[i]));
        await page.evaluate(() => window.arcScroll && window.arcScroll.hold(true));
        await sleep(350);
        const r = await page.evaluate(READ);
        await page.screenshot({ path: path.join(OUT, `${w}-${name}-${i + 1}-p${Math.round(progress(name, r) * 100)}-s${Math.round(r[name].s * 100)}.png`) });
        await page.evaluate(() => window.arcScroll && window.arcScroll.hold(false));
      }
      await settle();
    }
  }
  assert(!overflowAt, `${tag}: no horizontal overflow at any sample${overflowAt ? ' - ' + overflowAt : ''}`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

// reduced motion: the curves never move and the script does not run
async function reduced(w, h, mobile) {
  const tag = `@${w} reduced-motion`;
  const { page, errors, close } = await openPage({ width: w, height: h, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await page.mouse.move(w / 2, h / 2);
  await sleep(400);
  const G = restGeometry((await page.evaluate(READ)).iw);
  let samples = 0, bad = null;
  const check = async () => {
    const r = await page.evaluate(READ);
    samples++;
    const ok = r.about.transform === 'none' && !r.about.live && r.footer.transform === 'none' && !r.footer.live && r.curve.ry === '286'
      && Math.abs(r.about.top - G.about.top) <= 1 && Math.abs(r.footer.top - G.footer.top) <= 1 && Math.abs(r.curve.boxH - G.curveH) <= 1;
    if (!ok && !bad) bad = `y=${r.y} about ${r.about.transform} footer ${r.footer.transform} ry ${r.curve.ry}`;
    return r;
  };
  for (let i = 0; i < 400; i++) {
    await wheelStep(page, Math.round(h / 4));
    const r = await check();
    if (r.y >= r.max - 1) break;
  }
  for (let i = 0; i < 400; i++) {
    await wheelStep(page, -Math.round(h / 4));
    const r = await check();
    if (r.y <= 1) break;
  }
  assert(samples > 20, `${tag}: sampled the whole page down and up (${samples} samples)`);
  assert(!bad, `${tag}: all three curves static at every scroll position${bad ? ' - ' + bad : ''}`);
  assert(await page.evaluate(() => !window.arcScroll), `${tag}: the script is not running`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

await pass(1440, 900, false);
await pass(768, 1024, false);
await pass(375, 812, true);
await reduced(1440, 900, false);
await reduced(375, 812, true);
await report();
