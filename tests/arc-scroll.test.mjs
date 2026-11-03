// Scroll-driven curved edges (js/arc-scroll.js): the white dome under the hero, the white ellipse over Standorte (.locations), the curve
// before Social, and the white dome above the footer (.footer-top, from 768px up). The black footer dome (.footer-body::before) has no moving edge.
// The team photo's mask ellipse (.finale) and the corner seams are covered by tests/curves-r2.test.mjs.
// Real wheel scrolling (page.mouse.wheel) through each curve at 1440x900, 768x1024 and 375x812. Every sample reads the
// rendered state (computed transform of the ellipse pseudo-element / the ry of the inlined SVG ellipse) and the geometry of the
// section edge, derives the expected depth factor from the reference mapping on its own, and compares.
//   dome  (Locations curve, footer):        s = max(floor, p)       p = 0 when the edge enters at the bottom, 1 when it has settled; floor 0.5 on the
//                                                                   Locations curve (the Social title stays on its white), 0.04 elsewhere
//   smile (hero, Standorte top):            s = max(0.04, 1 - p)    p = 0 when the edge enters, 1 when it reaches the top. The hero starts at
//                                                                   scrollY 0 when it is shorter than the viewport, so it is curved at load.
//   s = rendered depth / designed depth. The footer's p ends where the document ends (the page cannot scroll the dome higher).
// There is no resting state: a stopped page shows the depth its position maps to (checked after a 900ms stop, mid-travel).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/arc-scroll');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIN_S = 0.04;
const FLOOR = { curve: 0.5 };
const TOL = 0.06;            // |rendered s - expected s|: the depth is drawn from the scroll position, so only a frame of lag
const ALL = ['hero', 'about', 'curve', 'footer'];   // 'about' = .locations (the old About smile moved to the Standorte top)
const KIND = { hero: 'smile', about: 'smile', curve: 'dome', footer: 'dome' };

// everything a test needs to know, read in one evaluate (layout reads are fine here, this is the test)
const READ = () => {
  const iw = window.innerWidth, H = window.innerHeight;
  const hero = document.querySelector('.hero'), about = document.querySelector('.locations'), fin = document.querySelector('.finale'),
    fb = document.querySelector('.footer-body'), svg = document.querySelector('svg.curve'), ft = document.querySelector('html[data-home] .footer-top');
  const pseudo = (el, which) => {
    const cs = getComputedStyle(el, which);
    return {
      s: cs.transform === 'none' ? 1 : new DOMMatrix(cs.transform).d, transform: cs.transform,
      top: parseFloat(cs.top), height: parseFloat(cs.height), radius: cs.borderTopLeftRadius, content: cs.content, live: el.classList.contains('arc-live'),
    };
  };
  const sr = svg.getBoundingClientRect(), dome = svg.querySelector('.curve__dome');
  const max = document.documentElement.scrollHeight - H;
  return {
    iw, H, y: window.scrollY, max, overflow: document.documentElement.scrollWidth > iw,
    hero: { ...pseudo(hero, '::after'), corner: hero.getBoundingClientRect().bottom, top0: hero.offsetHeight },
    about: { ...pseudo(about, '::before'), corner: about.getBoundingClientRect().top },
    curve: { s: parseFloat(dome.getAttribute('ry')) / 286, ry: dome.getAttribute('ry'), live: false, boxH: sr.height, boxW: sr.width, corner: sr.bottom },
    footer: { ...pseudo(ft, '::before'), corner: ft.getBoundingClientRect().bottom },     // the white dome's centre line is the bottom edge of .footer-top
    black: { ...pseudo(fb, '::before'), live: fb.classList.contains('arc-live'), hasVar: fb.style.getPropertyValue('--arc-s') !== '' },
    finale: { before: getComputedStyle(fin, '::before').content, live: fin.classList.contains('arc-live') || fin.style.getPropertyValue('--arc-s') !== '' },
  };
};

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
// progress of a curve's edge, derived from the geometry alone
function progress(name, r) {
  const c = r[name].corner;
  if (name === 'hero') { const doc = c + r.y, start = Math.max(0, doc - r.H); return clamp01((r.y - start) / (doc - start)); }   // starts at scrollY 0 when the hero is shorter than the viewport
  if (name !== 'footer') return clamp01(1 - c / r.H);
  const cornerEnd = c - (r.max - r.y);                     // where the dome's centre line sits at the end of the document
  return clamp01((r.H - c) / (r.H - cornerEnd));
}
const expected = (name, p) => Math.max(FLOOR[name] ?? MIN_S, KIND[name] === 'smile' ? 1 - p : p);

// the resting geometry from css/site.css (Figma), per breakpoint; the same numbers main renders
function restGeometry(iw) {
  const mobile = iw <= 767;
  return {
    hero: { top: -19.8611 * iw / 100, height: 39.7222 * iw / 100 },   // top relative to the hero's bottom edge
    about: { top: -(mobile ? 31.78 : 20.2083) * iw / 100, height: (mobile ? 63.56 : 42.2917) * iw / 100 },
    footer: { top: 3.3333 * iw / 100, height: 13.8889 * iw / 100 },   // a half-ellipse standing on the photo's bottom edge (17.2222vw)
    black: { top: (mobile ? 20 : 9) * iw / 100, height: 39.72 * iw / 100 },
    curveH: mobile ? 0.741 * iw : Math.min(628, Math.max(200, 0.436 * iw)),
  };
}

async function wheelStep(page, dy) { await page.mouse.wheel(0, dy); await sleep(32); }
const scrollTo = (page, y) => page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), y);
const settle = () => sleep(900);                           // a stopped page must keep its depth: look again after this long

// absolute scrollY that puts a curve's edge at progress p
async function yForProgress(page, name, p) {
  return page.evaluate(([name, p]) => {
    const H = innerHeight, y = scrollY, max = document.documentElement.scrollHeight - H;
    const el = { hero: '.hero', about: '.locations', footer: 'html[data-home] .footer-top' }[name];
    let corner;
    if (name === 'curve') corner = document.querySelector('svg.curve').getBoundingClientRect().bottom;
    else if (name === 'about') corner = document.querySelector(el).getBoundingClientRect().top;
    else corner = document.querySelector(el).getBoundingClientRect().bottom;
    let target;
    if (name === 'hero') { const doc = corner + y, start = Math.max(0, doc - H); return Math.max(0, Math.min(max, start + p * (doc - start))); }
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
  assert(await page.evaluate(() => innerWidth) === w, `${tag}: the viewport really is ${w} wide`);
  const step = Math.round(h / 20);
  let overflowAt = null;
  const NAMES = w >= 768 ? ALL : ALL.filter(n => n !== 'footer');   // the footer's white ellipse exists from 768px up

  const rest0 = await page.evaluate(READ);
  const G = restGeometry(rest0.iw);
  assert(await page.evaluate(() => window.arcScroll.factor('photo') === null && window.arcScroll.factor('footer') !== undefined), `${tag}: no curve is driven for the team photo`);

  for (const name of NAMES) {
    // ---- forward pass: start below the entry line, wheel through to the settled end ------------------------------
    const st = name === 'footer' ? Math.max(8, Math.round(step / 2)) : step;
    await scrollTo(page, await yForProgress(page, name, name === 'footer' ? -0.12 : -0.45));
    await sleep(200);
    const fwd = [];
    for (let i = 0; i < 160; i++) {
      await wheelStep(page, st);
      const r = await page.evaluate(READ);
      if (r.overflow && !overflowAt) overflowAt = `${name} y=${r.y}`;
      const p = progress(name, r);
      fwd.push({ y: r.y, p, s: r[name].s, e: expected(name, p), raw: r });
      if (p >= 0.995 || r.y >= r.max - 1) break;
    }
    assert(fwd[fwd.length - 1].y > fwd[0].y + 5, `${tag} ${name}: the wheel really moved the page (${fwd[0].y} -> ${fwd[fwd.length - 1].y})`);
    const mid = fwd.filter(x => x.p >= 0.1 && x.p <= 0.9);
    const maxErr = mid.reduce((m, x) => Math.max(m, Math.abs(x.s - x.e)), 0);
    assert(mid.length >= 4, `${tag} ${name}: forward pass has >= 4 samples between p 0.1 and 0.9 (${mid.length})`);
    assert(maxErr <= TOL, `${tag} ${name}: s follows the ${KIND[name]} mapping within ${TOL} while moving (max error ${maxErr.toFixed(3)} over ${mid.length} samples)`);
    const byP = mid.slice().sort((x, y) => x.p - y.p), qn = Math.max(1, Math.floor(byP.length / 4));
    const early = byP.slice(0, qn), late = byP.slice(-qn);   // the lowest / highest quarter of the sampled p range (a tall viewport starts the hero already part-way)
    const avg = a => a.reduce((t, x) => t + x.s, 0) / (a.length || 1);
    if (KIND[name] === 'smile') {
      assert(early.length && late.length && avg(early) - avg(late) > 0.2, `${tag} ${name}: deepest while entering, flattening as it rises (s ${avg(early).toFixed(2)} at p ${early[0]?.p.toFixed(2)} -> ${avg(late).toFixed(2)} at p ${late[late.length - 1]?.p.toFixed(2)})`);
    } else {
      assert(early.length && late.length && avg(late) - avg(early) > 0.2, `${tag} ${name}: flat while entering, deepening as it rises (s ${avg(early).toFixed(2)} at p ${early[0]?.p.toFixed(2)} -> ${avg(late).toFixed(2)} at p ${late[late.length - 1]?.p.toFixed(2)})`);
    }
    assert(Math.max(...fwd.map(x => x.s)) <= 1.02, `${tag} ${name}: never deeper than designed (max s ${Math.max(...fwd.map(x => x.s)).toFixed(2)})`);
    assert(Math.min(...fwd.map(x => x.s)) >= (FLOOR[name] ?? MIN_S) - 0.005, `${tag} ${name}: never flatter than its floor ${FLOOR[name] ?? MIN_S} (min s ${Math.min(...fwd.map(x => x.s)).toFixed(3)})`);
    assert(Math.min(...mid.map(x => x.s)) < 0.75, `${tag} ${name}: leaves the designed shape while travelling (min s ${Math.min(...mid.map(x => x.s)).toFixed(2)})`);

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

    // ---- stop with the edge in view mid-travel: it stays at the scroll-mapped depth, it does not ease back to the designed bow --------
    for (const stopP of [0.3, 0.6, 0.9]) {
      await scrollTo(page, await yForProgress(page, name, stopP - 0.05));
      for (let i = 0; i < 4; i++) await wheelStep(page, name === 'footer' ? 3 : 12);
      await sleep(400);                                    // the wheel's own smooth scroll has to finish first
      const before = await page.evaluate(READ);
      await settle();
      const r = await page.evaluate(READ);
      const p = progress(name, r), g = r[name], e = expected(name, p);
      assert(Math.abs(p - stopP) <= 0.15 && Math.abs(r.y - before.y) < 1 && Math.abs(g.s - e) <= TOL, `${tag} ${name}: stopped at p ${p.toFixed(2)} for 900ms: s ${g.s.toFixed(3)} is the mapped ${e.toFixed(3)} (page did not move: ${before.y} -> ${r.y})`);
      if (stopP <= 0.6) assert(Math.abs(g.s - 1) > 0.2, `${tag} ${name}: at rest at p ${p.toFixed(2)} the curve is NOT back at its designed shape (s ${g.s.toFixed(3)})`);
      if (name === 'curve') assert(Math.abs(g.boxH - G.curveH) <= 1 && Math.abs(g.boxW - r.iw) <= 1, `${tag} ${name}: its box is still the Figma one (${g.boxW.toFixed(1)}x${g.boxH.toFixed(1)} vs ${r.iw}x${G.curveH.toFixed(1)})`);
      else assert(Math.abs((g.top - (g.top0 || 0)) - G[name].top) <= 1 && Math.abs(g.height - G[name].height) <= 1 && g.radius.startsWith('50%'), `${tag} ${name}: its ellipse box is still the Figma one (top ${(g.top - (g.top0 || 0)).toFixed(1)} vs ${G[name].top.toFixed(1)}, height ${g.height.toFixed(1)} vs ${G[name].height.toFixed(1)}, radius ${g.radius})`);
    }

    // ---- strip of 5 shots at 1440, 375 and 2560: the depth the mapping gives ------------------------------------------------
    if (w === 1440 || w === 768 || w === 375 || w === 2560) {
      const probs = [0.15, 0.35, 0.55, 0.75, 0.9];
      for (let i = 0; i < probs.length; i++) {
        await scrollTo(page, await yForProgress(page, name, probs[i]));
        await sleep(250);
        const r = await page.evaluate(READ);
        await page.screenshot({ path: path.join(OUT, `${w}-${name}-${i + 1}-p${Math.round(progress(name, r) * 100)}-s${Math.round(r[name].s * 100)}.png`) });
      }
    }
  }

  // ---- the black footer dome and the team photo never move -----------------------------------------------------------
  const blacks = [];
  for (const f of [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.97, 1]) {
    await scrollTo(page, Math.round(f * rest0.max));
    await sleep(120);
    const r = await page.evaluate(READ);
    blacks.push({ f, y: r.y, ...r.black, fin: r.finale });
  }
  assert(new Set(blacks.map(b => b.y)).size >= 6, `${tag}: the black-dome probe visited >= 6 distinct scroll positions (${new Set(blacks.map(b => b.y)).size})`);
  assert(blacks.every(b => b.transform === 'none' && !b.live && !b.hasVar && Math.abs(b.top - G.black.top) <= 1 && Math.abs(b.height - G.black.height) <= 1 && b.radius.startsWith('50%')),
    `${tag}: the black footer dome keeps one path/size at every scroll position (top ${blacks.map(b => b.top.toFixed(1))}, height ${blacks.map(b => b.height.toFixed(1))}, transforms ${[...new Set(blacks.map(b => b.transform))]})`);
  assert(blacks.every(b => b.fin.before === 'none'), `${tag}: the team-photo layer has no ellipse element (its curve is a mask, tests/curves-r2.test.mjs) (${[...new Set(blacks.map(b => b.fin.before))]})`);

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
    const ok = ['hero', 'about', 'footer'].every(n => r[n].transform === 'none' && !r[n].live) && !r.finale.live && r.black.transform === 'none' && r.curve.ry === '286'
      && Math.abs(r.hero.top - r.hero.top0 - G.hero.top) <= 1 && Math.abs(r.about.top - G.about.top) <= 1 && (r.iw < 768 || Math.abs(r.footer.top - G.footer.top) <= 1) && Math.abs(r.black.top - G.black.top) <= 1 && Math.abs(r.curve.boxH - G.curveH) <= 1;
    if (!ok && !bad) bad = `y=${r.y} hero ${r.hero.transform} about ${r.about.transform} footer ${r.footer.transform} ry ${r.curve.ry}`;
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
  assert(!bad, `${tag}: all curves static at every scroll position${bad ? ' - ' + bad : ''}`);
  assert(await page.evaluate(() => !window.arcScroll), `${tag}: the script is not running`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

// The Social title sits inside the white of the curve. While the page moves the curve flattens, and without its floor the top of the
// title would land on the black above it. Desktop widths: the phone frame has its own curve and comes with the mobile pass.
// The curve now keeps its scroll-mapped depth at rest, so the title must stay on the white at every stopped position too.
async function titleOnWhite(w, h) {
  const tag = `@${w}x${h} social title`;
  const { page, errors, close } = await openPage({ width: w, height: h });
  await page.evaluate(() => window.mtmReady);
  await page.waitForTimeout(300);
  const start = await page.evaluate(() => { const b = document.querySelector('svg.curve').getBoundingClientRect(); return b.bottom + scrollY - innerHeight; });
  const seen = [];
  for (const q of [0, 0.1, 0.2, 0.3, 0.45, 0.6]) {
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), start + q * h);
    await page.waitForTimeout(260);
    seen.push(await page.evaluate(() => {
      const title = document.querySelector('.social h2'), range = document.createRange();
      range.selectNodeContents(title);
      const b = range.getBoundingClientRect();
      const white = (x, y) => document.elementsFromPoint(x, y).some(e => e.classList && e.classList.contains('curve__dome'));
      const top = b.top + 1;
      return { s: window.arcScroll.factor('curve'), visible: top >= 0 && top < innerHeight, ok: [b.left + 1, (b.left + b.right) / 2, b.right - 1].map(x => white(x, top)) };
    }));
  }
  const lowest = Math.min(...seen.map(r => r.s)), checked = seen.filter(r => r.visible);
  assert(lowest <= 0.51, `${tag}: the sweep reaches a flattened curve (lowest factor ${lowest.toFixed(3)})`);
  assert(checked.length >= 3, `${tag}: the title was on screen for enough samples (${checked.length})`);
  assert(checked.every(r => r.ok.every(Boolean)), `${tag}: the top of the title stays on the white at every depth ${JSON.stringify(checked.map(r => [+r.s.toFixed(3), ...r.ok]))}`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

await titleOnWhite(1440, 900);
await titleOnWhite(1280, 720);
await titleOnWhite(1920, 1080);
await titleOnWhite(2560, 1440);
await pass(1440, 900, false);
await pass(768, 1024, false);
await pass(375, 812, true);
await pass(2560, 1440, false);
await reduced(1440, 900, false);
await reduced(375, 812, true);
await report();
