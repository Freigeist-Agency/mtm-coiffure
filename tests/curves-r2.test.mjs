// Round 2 curves (js/arc-scroll.js, css/site.css):
//   1. seams: on every animated curve the first row beside the section edge is white across the FULL width (x 0..20 and the last 20 px included)
//      at the floor, mid and full depth. A flattened ellipse scaled about a centre line that is not the edge leaves the section background
//      showing as a strip; this reads rendered pixels.
//   2. the hero is curved at load (scrollY 0 = full depth) and flattens monotonically as it scrolls out.
//   3. the news section's white ellipse over the top of the team photo: mapped like the Standorte curve, never painted over a card.
//   4. the footer logo and button never lie over the photo (768px and up), and whether they do below that.
// Pixels come from page screenshots decoded with pngjs. To see the photo against the white the test blacks it out (a real photo has white walls),
// hides the sticky header (it covers the top 50px) and, where it asks what lies UNDER an element, hides that element.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const { PNG } = createRequire('/home/eddie/Work/Amatsima/Code/studio/node_modules/')('pngjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/r2-curves');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = buf => PNG.sync.read(buf);
const px = (img, x, y) => { const i = (img.width * y + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };

const FLOOR = { hero: 0.04, about: 0.04, curve: 0.5, finale: 0.04, footer: 0.04 };
const KIND = { hero: 'smile', about: 'smile', curve: 'dome', finale: 'smile', footer: 'dome' };
// progress that puts each curve at its floor / mid / full depth (s = 1 - p for a smile, p for a dome; the Locations curve's floor is 0.5)
const AT = {
  smile: { floor: 0.97, mid: 0.5, full: 0.04 },
  dome: { floor: 0.02, mid: 0.55, full: 0.98 },
  curve: { floor: 0.2, mid: 0.75, full: 0.98 },
};
const WHITE = 150;   // min channel of "the curve's white": the backgrounds are black (photo, Standorte), sand (hero: 45), a sand-black gradient (the curve); a card's shadow tint or an antialiased corner stays above it

// style for the pixel probes: photo black, header gone
const PROBE_CSS = '.site-header{visibility:hidden!important}.finale img{visibility:hidden!important}.finale{background:#000!important}';
const SEAM_CSS = PROBE_CSS + '.social *,.footer-logo,.footer-cta{visibility:hidden!important}';   // the Social title and the footer logo sit in the white we are looking at

// How far in from each corner the ellipse itself may leave the background showing in the row beside the edge. An ellipse has a vertical tangent only
// at its centre line: d px from the edge a flattened one is already narrower by rx * (1 - sqrt(1 - (d / (s * ry))^2)). That is the shape, not a seam;
// a seam is background showing along the whole row. +3px for antialiasing. dims in px at width w: rx, ry (designed half height), c (centre line below the edge).
const MODEL = (name, w, h, s, d) => {
  const vw = w / 100, mobile = w <= 767;
  const m = {
    hero: { rx: w / 2 + 1, ry: 19.8611 * vw, c: 0 },
    about: mobile ? { rx: w / 2 + 1, ry: 31.78 * vw, c: 0 } : { rx: w / 2 + 1, ry: 21.1458 * vw, c: 0.9375 * vw },
    finale: { rx: 0.502 * w, ry: 21.1458 * vw, c: 0 },
    footer: { rx: w / 2, ry: 13.8889 * vw, c: 0 },
    curve: { rx: w / 2, ry: 286 * (mobile ? 0.741 * w : Math.min(628, Math.max(200, 0.436 * w))) / 628, c: 0 },
  }[name];
  const u = (d / s - m.c) / m.ry;
  const half = Math.abs(u) < 1 ? m.rx * Math.sqrt(1 - u * u) : 0;
  return Math.max(0, w / 2 - half) + 3;
};

// the scroll position that puts a curve's edge at progress p; the edge's viewport y; the row just beside it
const GEO = ([name, p]) => {
  const H = innerHeight, y = scrollY, max = document.documentElement.scrollHeight - H;
  const q = s => document.querySelector(s);
  let edge, y2, row;
  if (name === 'hero') {
    edge = q('.hero').getBoundingClientRect().bottom;
    const doc = edge + y, start = Math.max(0, doc - H);
    y2 = start + p * (doc - start); row = Math.floor(edge) - 1;               // the last whole row above the edge
  } else if (name === 'about') {
    edge = q('.locations').getBoundingClientRect().top; y2 = y + edge - H * (1 - p); row = Math.ceil(edge);   // the first whole row below it
  } else if (name === 'finale') {
    const f = q('.finale'); edge = f.getBoundingClientRect().top;
    const stuck = getComputedStyle(f).position === 'sticky' ? parseFloat(getComputedStyle(f).top) || 0 : 0;
    y2 = y + edge - (H - p * (H - stuck)); row = Math.ceil(edge);
  } else if (name === 'curve') {
    edge = q('svg.curve').getBoundingClientRect().bottom; y2 = y + edge - H * (1 - p); row = Math.floor(edge) - 3;   // 3px up: the section below paints its own white over the last 1.5px
  } else {
    const ft = q('html[data-home] .footer-top'), E = -(parseFloat(getComputedStyle(ft.parentElement).marginTop) || 0);
    const corner = ft.getBoundingClientRect().bottom, cornerEnd = corner - (max - y);
    edge = ft.getBoundingClientRect().top + E - 1;                             // the photo's bottom edge (the footer's white starts 1px early): the only edge this dome has
    y2 = y + corner - (H - p * (H - cornerEnd)); row = Math.floor(edge) - 1;
  }
  return { y: Math.max(0, Math.min(max, y2)), edge, row, H, scrollY: y };
};

async function seams(w, h, mobile) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await page.addStyleTag({ content: SEAM_CSS });
  await page.mouse.move(w / 2, h / 2);
  await sleep(400);
  assert(await page.evaluate(() => innerWidth) === w && await page.evaluate(() => !!window.arcScroll), `${tag}: viewport is ${w} wide and js/arc-scroll.js is running`);
  const names = ['hero', 'about', 'curve', ...(w >= 768 ? ['finale', 'footer'] : [])];
  for (const name of names) {
    const table = name === 'curve' ? AT.curve : AT[KIND[name]];
    for (const level of ['floor', 'mid', 'full']) {
      const geo = await page.evaluate(GEO, [name, table[level]]);
      await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), geo.y);
      await sleep(300);
      const now = await page.evaluate(GEO, [name, table[level]]);
      const s = await page.evaluate(n => window.arcScroll.factor(n), name);
      const okDepth = level === 'floor' ? s <= FLOOR[name] + 0.03 : level === 'mid' ? s > 0.3 && s < 0.8 : s >= 0.9;
      assert(okDepth && Math.abs(now.scrollY - geo.y) <= 1, `${tag} ${name} ${level}: the page is at the depth asked for (s ${s?.toFixed(3)}, scrollY ${now.scrollY})`);
      const shot = await page.screenshot({ path: path.join(OUT, `${w}-${name}-${level}.png`) });
      const img = decode(shot);
      assert(img.width === w && now.row >= 0 && now.row < img.height, `${tag} ${name} ${level}: the row beside the edge is on screen (row ${now.row} of ${img.height}, edge y ${now.edge.toFixed(1)})`);
      if (!(now.row >= 0 && now.row < img.height)) continue;
      const above = name === 'hero' || name === 'footer' || name === 'curve';
      const d = above ? now.edge - (now.row + 0.5) : now.row + 0.5 - now.edge;      // distance of the row's centre from the edge
      let allow = MODEL(name, w, h, s, d);
      if (level === 'floor') allow = Math.max(2 * (allow - 3) + 12, 0.1 * w);     // at the floor the ellipse is a lens a few px thick, resampled by the compositor: its ends blur further in. A seam is background along the whole row
      const bad = [];
      for (let x = 0; x < img.width; x++) { const c = px(img, x, now.row); if (Math.min(...c) < WHITE) bad.push(x); }
      const strip = bad.filter(x => x >= allow && x < w - allow);                   // background anywhere but in the ellipse's own rounded ends
      const corner = bad.filter(x => x < 20 || x >= w - 20).length;
      assert(strip.length === 0, `${tag} ${name} ${level} (s ${s?.toFixed(2)}): the row beside the edge (${d.toFixed(1)}px off it) is white from corner to corner: ${bad.length} background px, ${corner} in the outer 20px, the ellipse's own ends allow ${allow.toFixed(1)}px each side${strip.length ? `, but ${strip.length} inside it, x ${strip.slice(0, 4)}..` : ''}`);
    }
  }
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

// ---- 2. hero curved at load ----------------------------------------------------------------------------------------------------------
async function heroAtLoad(w, h, mobile) {
  const tag = `@${w} hero`;
  const { page, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await page.mouse.move(w / 2, h / 2);
  await sleep(500);
  const read = () => page.evaluate(() => {
    const hero = document.querySelector('.hero'), cs = getComputedStyle(hero, '::after');
    return { y: scrollY, s: window.arcScroll.factor('hero'), d: cs.transform === 'none' ? 1 : new DOMMatrix(cs.transform).d, bottom: hero.getBoundingClientRect().bottom, H: innerHeight, W: innerWidth };
  });
  const r0 = await read();
  assert(r0.W === w && r0.y === 0, `${tag}: the page is at scrollY 0 at ${w} wide`);
  assert(r0.s >= 0.999 && r0.d >= 0.999, `${tag}: curved at load: depth factor ${r0.s?.toFixed(4)} in the script, ${r0.d.toFixed(4)} rendered (full = 1)`);
  const seq = [r0];
  for (let i = 0; i < 80; i++) {
    await page.mouse.wheel(0, Math.round(h / 20)); await sleep(40);
    const r = await read(); seq.push(r);
    if (r.bottom < 0) break;
  }
  assert(seq[seq.length - 1].y > 100 && seq[seq.length - 1].bottom < 0, `${tag}: the wheel really scrolled the hero out (scrollY 0 -> ${seq[seq.length - 1].y})`);
  let inc = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i].d > seq[i - 1].d + 0.002) inc++;
  assert(inc === 0, `${tag}: the rendered depth never increases while scrolling out (${seq.length} samples, ${inc} increases; ${seq.filter((_, i) => i % 6 === 0).map(r => r.d.toFixed(2)).join(' ')})`);
  assert(seq[seq.length - 1].d <= 0.06 && seq.some(r => r.d > 0.3 && r.d < 0.7), `${tag}: it passes through mid depth and ends at the floor (min ${Math.min(...seq.map(r => r.d)).toFixed(3)})`);
  await close();
}

// ---- 3. the team photo's ellipse -----------------------------------------------------------------------------------------------------
const finaleInfo = () => {
  const f = document.querySelector('.finale'), cs = getComputedStyle(f), r = f.getBoundingClientRect();
  const m = (cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage) || 'none';
  const ry = /radial-gradient\(\s*[\d.]+%\s+([\d.]+)px/.exec(m);
  return { top: r.top, left: r.left, width: r.width, H: innerHeight, W: innerWidth, y: scrollY, mask: m !== 'none', ry: ry ? parseFloat(ry[1]) : null, s: window.arcScroll ? window.arcScroll.factor('finale') : null, stuck: cs.position === 'sticky' ? parseFloat(cs.top) : 0 };
};

async function finaleCurve(w, h) {
  const tag = `@${w} photo ellipse`;
  const { page, errors, close } = await openPage({ width: w, height: h });
  await page.addStyleTag({ content: PROBE_CSS });
  await page.mouse.move(w / 2, h / 2);
  await sleep(500);
  assert(await page.evaluate(() => innerWidth) === w && await page.evaluate(() => !!window.arcScroll), `${tag}: viewport is ${w} wide and js/arc-scroll.js is running`);
  const top0 = await page.evaluate(() => document.querySelector('.finale').getBoundingClientRect().top + scrollY);
  const info0 = await page.evaluate(finaleInfo);
  assert(info0.mask, `${tag}: the photo layer carries the ellipse mask`);
  // scroll up to the photo from far above with the wheel and record the depth as it comes in
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), top0 - h * 1.4);
  await sleep(300);
  const seq = [];
  for (let i = 0; i < 200; i++) {
    await page.mouse.wheel(0, Math.round(h / 24)); await sleep(36);
    const r = await page.evaluate(finaleInfo);
    r.p = Math.max(0, Math.min(1, (r.H - r.top) / (r.H - r.stuck)));
    seq.push(r);
    if (r.top < -h * 0.2) break;
  }
  assert(seq[seq.length - 1].y > seq[0].y + 200, `${tag}: the wheel really moved the page (${seq[0].y} -> ${seq[seq.length - 1].y})`);
  const mid = seq.filter(r => r.p >= 0.1 && r.p <= 0.9);
  const err = mid.reduce((m, r) => Math.max(m, Math.abs(r.s - Math.max(0.04, 1 - r.p))), 0);
  assert(mid.length >= 6 && err <= 0.06, `${tag}: s follows the Standorte mapping (smile: max(0.04, 1 - p)) within 0.06 (max error ${err.toFixed(3)} over ${mid.length} samples)`);
  let up = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i].s > seq[i - 1].s + 0.01) up++;
  assert(up === 0 && seq[0].s > 0.95 && seq[seq.length - 1].s <= 0.05, `${tag}: deep as it enters, flat as it settles, never deepening on the way up (first ${seq[0].s.toFixed(2)}, last ${seq[seq.length - 1].s.toFixed(2)}, ${up} increases)`);
  const rdErr = seq.reduce((m, r) => Math.max(m, Math.abs(r.ry - r.s * 21.1458 * w / 100)), 0);
  assert(rdErr < 0.6, `${tag}: the mask's ellipse is 21.1458vw * s deep at every sample (max error ${rdErr.toFixed(2)}px over ${seq.length})`);

  // the rendered apex: the first non-white row below the photo's top edge in the middle column, at mid and near full depth
  for (const [level, p0] of [['floor', 0.97], ['mid', 0.6], ['deep', 0.3]]) {   // the apex must be on screen to be read: 'deep' moves p up until it is (at 2560 x 1440 p 0.3 puts it 0.8px below the viewport); the mask value itself is checked at every sample above
    let p = p0;
    const apexRow = q => info0.H - q * (info0.H - info0.stuck) + 21.1458 * w / 100 * Math.max(0.04, 1 - q);   // expected viewport y of the apex at progress q
    while (apexRow(p) > h - 6 && p < 0.9) p += 0.01;
    assert(apexRow(p) <= h - 6, `${tag} ${level}: precondition: the apex is expected at viewport y ${apexRow(p).toFixed(1)}, on screen (${h} tall; progress ${p.toFixed(2)})`);
    await page.evaluate(([y, H, stuck, p]) => window.scrollTo({ top: y - (H - p * (H - stuck)), behavior: 'instant' }), [top0, h, info0.stuck, p]);
    await sleep(300);
    const info = await page.evaluate(finaleInfo);
    const shot = await page.screenshot({ path: path.join(OUT, `${w}-finale-apex-${level}.png`) });
    const img = decode(shot), x = Math.round(w / 2), y0 = Math.ceil(info.top);
    let apex = null;
    for (let y = y0; y < img.height; y++) if (Math.min(...px(img, x, y)) < 128) { apex = y - y0; break; }
    const want = 21.1458 * w / 100 * info.s;
    assert(apex !== null && Math.abs(apex - want) <= 2.5, `${tag} ${level}: the white ellipse hangs ${apex}px below the photo's top edge in the middle column (21.1458vw * s ${info.s.toFixed(2)} = ${want.toFixed(1)}px)`);
  }

  // never over a card: render the same scroll positions with the photo hidden and with it shown. Above the curve the two must be identical
  // (the ellipse is a hole in the photo, nothing is painted over the cards); below it the photo must be there.
  const cards = await page.evaluate(() => [...document.querySelectorAll('.news-card')].map(c => c.getBoundingClientRect().top + scrollY));
  assert(cards.length === 2, `${tag}: two news cards found`);
  let overlapSamples = 0, aboveBad = 0, aboveChecked = 0, belowPhoto = 0, worst = null;
  const steps = 34;
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;                                            // photo top from the bottom of the viewport to its stuck line
    await page.evaluate(([y, H, stuck, p]) => window.scrollTo({ top: y - (H - p * (H - stuck)), behavior: 'instant' }), [top0, h, info0.stuck, p]);
    await sleep(160);
    const info = await page.evaluate(finaleInfo);
    const rects = await page.evaluate(() => [...document.querySelectorAll('.news-card')].map(c => { const b = c.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }));
    await page.addStyleTag({ content: '.finale{visibility:hidden!important}' }).then(async tag2 => {
      const hiddenShot = decode(await page.screenshot());
      await tag2.evaluate(el => el.remove());
      const shownShot = decode(await page.screenshot());
      const W = shownShot.width, Hh = shownShot.height;
      for (const [l, t, r, b] of rects) {
        for (let y = Math.max(0, Math.floor(t)); y < Math.min(Hh, Math.ceil(b)); y++) {
          for (let x = Math.max(0, Math.floor(l)); x < Math.min(W, Math.ceil(r)); x += 2) {
            const u = (x - W / 2) / (0.502 * W);
            const edgeY = info.top + (Math.abs(u) < 1 ? info.ry * Math.sqrt(1 - u * u) : 0);   // the curve's y at this column
            const a = px(shownShot, x, y), c = px(hiddenShot, x, y);
            const same = Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]) <= 6;
            if (y < edgeY - 3 && y >= info.top + 0.5) { aboveChecked++; if (!same) { aboveBad++; worst ??= `x ${x} y ${y} step ${i}`; } }
            else if (y > edgeY + 3 && y > info.top && Math.min(...a) < 60) belowPhoto++;
          }
        }
        if (info.top > t && info.top < b) overlapSamples++;
      }
    });
  }
  assert(overlapSamples >= 6, `${tag}: the photo's top edge was inside a card's rect for ${overlapSamples} card-samples (the test reaches the overlap)`);
  assert(aboveChecked > 2000 && aboveBad === 0, `${tag}: above the curve nothing of the photo layer is painted over a card (${aboveChecked} card pixels compared with the photo hidden, ${aboveBad} differ${worst ? ', first ' + worst : ''})`);
  assert(belowPhoto > 2000, `${tag}: below the curve the photo does cover the card (${belowPhoto} black pixels on card rects), so the comparison above is not vacuous`);

  // past the end of the range: stays flat, comes back deep on the way up
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await sleep(300);
  assert((await page.evaluate(() => window.arcScroll.factor('finale'))) <= 0.05, `${tag}: at the end of the document the photo's curve is at its floor`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

// ---- 4. footer logo and button inside the white ---------------------------------------------------------------------------------------
async function footerRide(w, h, mobile) {
  const tag = `@${w} footer`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await page.addStyleTag({ content: PROBE_CSS + '.footer-logo,.footer-cta{opacity:0!important}' });   // invisible but still hit-testable: the pixels under them are what we look at
  await page.mouse.move(w / 2, h / 2);
  await sleep(500);
  assert(await page.evaluate(() => innerWidth) === w, `${tag}: viewport is ${w} wide`);
  const ft = await page.evaluate(() => { const f = document.querySelector('.footer-top'); return f.getBoundingClientRect().top + scrollY; });
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, ft - h * 1.1));
  await sleep(300);
  let worstCover = null, steps = 0, logoCovered = 0, logoSeen = 0, ctaSeen = 0, logoOver = 0, ctaOver = 0, restOver = 0, worst = null, ks = [];
  for (let i = 0; i < 400; i++) {
    const info = await page.evaluate(() => {
      const logo = document.querySelector('.footer-logo'), cta = document.querySelector('.footer-cta'), ftp = document.querySelector('.footer-top');
      const r = e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      const fr = ftp.getBoundingClientRect();
      const lb = logo.getBoundingClientRect(), py = lb.bottom - 3, hit = py >= 0 && py < innerHeight - 0.5 ? document.elementFromPoint((lb.left + lb.right) / 2, py) : null;
      return { y: scrollY, max: document.documentElement.scrollHeight - innerHeight, logoOnTop: !(py >= 0 && py < innerHeight - 0.5) || !!(hit && hit.closest('.footer-logo')), hitTag: hit ? hit.className || hit.tagName : null, logo: r(logo), cta: r(cta), rest: [fr.left + logo.offsetLeft, fr.top + logo.offsetTop, fr.left + logo.offsetLeft + logo.offsetWidth, fr.top + logo.offsetTop + logo.offsetHeight], s: window.arcScroll ? window.arcScroll.factor('footer') : null, tf: logo.style.transform };
    });
    const img = decode(await page.screenshot());
    const dark = ([l, t, r, b]) => {                                   // pixels under the element that are the (black) photo
      let n = 0, seen = 0;
      for (let y = Math.max(0, Math.ceil(t)); y < Math.min(img.height, Math.floor(b)); y++) for (let x = Math.max(0, Math.ceil(l)); x < Math.min(img.width, Math.floor(r)); x++) { seen++; if (Math.min(...px(img, x, y)) < 235) n++; }
      return { n, seen };
    };
    const a = dark(info.logo), c = dark(info.cta), rest = dark(info.rest);
    if (!info.logoOnTop) { logoCovered++; worstCover ??= `${info.hitTag} at scrollY ${info.y}`; }
    steps++; if (a.seen > 0) logoSeen++; if (c.seen > 0) ctaSeen++;
    if (a.n > 0) { logoOver++; worst ??= `logo, ${a.n}px over the photo at scrollY ${info.y}, s ${info.s?.toFixed(2)}`; }
    if (c.n > 0) { ctaOver++; worst ??= `button, ${c.n}px over the photo at scrollY ${info.y}, s ${info.s?.toFixed(2)}`; }
    if (rest.n > 0) restOver++;
    ks.push(info.tf ? 1 : 0);
    if (info.y >= info.max - 1) break;
    await page.mouse.wheel(0, 22); await sleep(48);
  }
  const end = await page.evaluate(() => scrollY);
  assert(end >= max - 1 && steps >= 12, `${tag}: swept the scroll through the footer's entry to the end of the page (${steps} steps, scrollY ${end} of ${max})`);
  assert(logoSeen >= 8 && ctaSeen >= 8, `${tag}: logo and button were on screen for ${logoSeen} / ${ctaSeen} steps`);
  if (w >= 768) {
    assert(restOver >= 3, `${tag}: precondition: at ${restOver} steps the logo's resting rect (no motion) would lie over the photo, so the sweep reaches the bug`);
    assert(ks.some(Boolean) && ks.some(k => !k), `${tag}: the script moves the logo during the sweep and leaves it alone at rest`);
    assert(logoCovered === 0, `${tag}: the logo is never cut off by the footer body painting over it (${logoCovered} of ${steps} steps where the element at its lower edge is not the logo${worstCover ? ': ' + worstCover : ''})`);
    assert(logoOver === 0, `${tag}: no pixel of the logo's rect lies over the photo at any step (${logoOver} of ${steps} steps over${worst && logoOver ? '; ' + worst : ''})`);
    assert(ctaOver === 0, `${tag}: no pixel of the button's rect lies over the photo at any step (${ctaOver} of ${steps} steps over)`);
  } else {
    console.log(`INFO ${tag}: logo rect over the photo at ${logoOver} steps, button at ${ctaOver} steps, resting logo rect at ${restOver} steps (of ${steps})`);
    assert(logoOver === 0 && ctaOver === 0, `${tag}: below 768px the logo and button never lie over the photo (the footer does not overlap it there)`);
  }
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

for (const [w, h, m] of [[1440, 900, false], [768, 1024, false], [375, 812, true], [2560, 1440, false]]) await seams(w, h, m);
for (const [w, h, m] of [[1440, 900, false], [768, 1024, false], [375, 812, true], [2560, 1440, false]]) await heroAtLoad(w, h, m);
for (const [w, h] of [[1440, 900], [768, 1024], [2560, 1440]]) await finaleCurve(w, h);
for (const [w, h, m] of [[1440, 900, false], [768, 1024, false], [2560, 1440, false], [375, 812, true]]) await footerRide(w, h, m);
{
  const { page, close } = await openPage({ width: 375, height: 812, isMobile: true, hasTouch: true });
  assert(await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.finale')); return (cs.maskImage || 'none') === 'none' && (cs.webkitMaskImage || 'none') === 'none'; }), '@375: no photo ellipse below 768px (the mobile Figma frame has none)');
  await close();
}
{
  const { page, close } = await openPage({ width: 1440, height: 900, reducedMotion: true });
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('.finale').getBoundingClientRect().top + scrollY - 400, behavior: 'instant' }));
  await sleep(300);
  const r = await page.evaluate(() => { const f = document.querySelector('.finale'), cs = getComputedStyle(f); return { mask: (cs.maskImage || cs.webkitMaskImage), v: f.style.getPropertyValue('--arc-s'), ry: parseFloat(/([\d.]+)px at/.exec(cs.maskImage)?.[1]), logo: document.querySelector('.footer-logo').style.transform }; });
  assert(r.mask !== 'none' && r.v === '' && Math.abs(r.ry - 304.5) < 0.5 && r.logo === '', `@1440 reduced motion: the photo ellipse is the static Figma one (ry ${r.ry}px, no variable, logo untouched)`);
  await close();
}
await report();
