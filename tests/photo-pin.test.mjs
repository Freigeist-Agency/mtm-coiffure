// Team photo, pinned (js/photo-pin.js, css/photo-pin.css): from 768px up the photo stays pinned while the footer slides over it, and the image
// pans up inside its box. Below 768px, and under prefers-reduced-motion, none of it applies.
// Everything is driven with real wheel input and read from the rendered layout:
//   1. pin: the box's top is constant from the moment it reaches its pin line to the end of the page, and the whole box is in view where it fits
//   2. pan: the image's translate goes 0 -> -(image height - box height) against the footer's top edge ('top bottom+=50%' .. 'top 85%'), never reversing
//   3. cover: at the end of the page the footer sits at the bottom of the viewport over the photo (fully covering it where the footer is tall enough)
//   4. the team photo's ellipse (arc-finale) ends exactly where the photo pins
//   5. a resize while scrolled into the photo/footer area leaves the same numbers as a fresh load at the new size (also across the 768px line)
//   6. reduced motion, and below 768px: no pin, no pan, the page as before
// Frames of the footer coming up go to tests/out/r2-pin/ (not asserted here; compared with the demo frames by hand).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/r2-pin');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp01 = v => Math.max(0, Math.min(1, v));
const ONLY = process.env.PIN_ONLY;                        // mutation runs: pin | pan | cover | curve | resize | static
const on = g => !ONLY || ONLY.split(',').includes(g);

// the numbers of one moment
const snap = () => {
  const f = document.querySelector('.finale'), i = f.querySelector('img'), ft = document.querySelector('.site-footer');
  const b = f.getBoundingClientRect(), ib = i.getBoundingClientRect(), fb = ft.getBoundingClientRect(), cs = getComputedStyle(f);
  const tf = getComputedStyle(i).transform;
  const at = y => { const x = innerWidth * 0.1; return y >= 1 && y < innerHeight - 1 ? document.elementFromPoint(x, y) : null; };   // 10% in: left of the dome and the logo
  const above = at(fb.top - 4), below = at(fb.top + 4);
  return {
    underFooterTop: below ? !!below.closest('.site-footer') : null, aboveFooterTop: above ? !!above.closest('.finale') : null,
    y: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight, H: innerHeight, W: innerWidth, hidden: document.hidden,
    boxTop: b.top, boxBot: b.bottom, boxH: b.height, imgBot: ib.bottom, imgH: ib.height, t: tf === 'none' ? 0 : new DOMMatrix(tf).m42,
    footTop: fb.top, footBot: fb.bottom, footH: fb.height, pos: cs.position, stuck: cs.position === 'sticky' ? parseFloat(cs.top) : null,
    s: window.arcScroll ? window.arcScroll.factor('finale') : null,
    cls: document.documentElement.className, fhVar: document.documentElement.style.getPropertyValue('--fh'),
    pan: !!(window.ScrollTrigger && ScrollTrigger.getById('pan')), arcEnd: window.ScrollTrigger && ScrollTrigger.getById('arc-finale') ? ScrollTrigger.getById('arc-finale').end : null,
  };
};
// every ScrollTrigger's start and end, rounded, in a stable order: what a resize must reproduce
const triggers = () => ScrollTrigger.getAll().map(t => `${t.vars.id || '-'} ${Math.round(t.start)}..${Math.round(t.end)}`).sort();
const layoutNums = () => ({ docH: document.documentElement.scrollHeight, fh: document.documentElement.style.getPropertyValue('--fh'), boxh: document.documentElement.style.getPropertyValue('--box-h'), stuck: getComputedStyle(document.querySelector('.finale')).top, tail: getComputedStyle(document.querySelector('.news .stack'), '::after').height });

// wheel the page from 1.1 viewports above the photo to the end, sampling after each step
async function sweep(page, h, step) {
  const top0 = await page.evaluate(() => document.querySelector('.finale').getBoundingClientRect().top + scrollY);
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, top0 - h * 1.1));
  await sleep(300);
  const seq = [];
  for (let i = 0; i < 400; i++) {
    const s = await page.evaluate(snap); seq.push(s);
    if (s.y >= s.max - 1) break;
    await page.mouse.wheel(0, step); await sleep(48);
  }
  return seq;
}

async function pinned(w, h, note) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h });
  await page.mouse.move(w / 2, h / 2);
  await sleep(600);
  const s0 = await page.evaluate(snap);
  assert(s0.W === w && s0.H === h && !s0.hidden, `${tag}: viewport is ${w}x${h} and the tab is visible`);
  assert(s0.cls.split(/\s+/).includes('photo-pin') && s0.pan && s0.pos === 'sticky' && s0.arcEnd !== null, `${tag}: preconditions: html.photo-pin, the pan trigger and the finale curve exist, the photo is sticky (class "${s0.cls}")`);
  const navH = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')));
  const range = s0.imgH - s0.boxH;
  assert(range > 100, `${tag}: the image is ${s0.imgH.toFixed(1)} tall in a ${s0.boxH.toFixed(1)} box: ${range.toFixed(1)}px to pan`);
  const seq = await sweep(page, h, Math.max(40, Math.round(h / 15)));
  const last = seq[seq.length - 1];
  assert(last.y >= last.max - 1 && seq.length >= 25, `${tag}: the wheel swept ${seq.length} steps to the end of the page (scrollY ${last.y} of ${last.max})`);

  // ---- 1. pin
  const stuck = s0.stuck, wantStuck = Math.max(navH, Math.min(navH + 0.09 * h, h - s0.boxH));
  const iPin = seq.findIndex(s => s.boxTop <= stuck + 0.6);
  const before = seq.slice(0, iPin), after = seq.slice(iPin);
  if (on('pin')) {
    assert(Math.abs(stuck - wantStuck) <= 1, `${tag} pin: the pin line is max(nav, min(nav + 9vh, viewport - box)) = ${wantStuck.toFixed(1)} (is ${stuck.toFixed(1)})`);
    assert(iPin > 3 && before.every(s => s.boxTop > stuck + 0.6) && after.length >= 10, `${tag} pin: the sweep has ${before.length} samples above the pin line and ${after.length} on it`);
    // a footer taller than the viewport (2560 x 1440) ends the page with its top above the fold: the stack's end then nudges the box up, behind a footer that already fills the screen
    const live = after.filter(s => s.footTop >= 0), dev = live.reduce((m, s) => Math.max(m, Math.abs(s.boxTop - stuck)), 0);
    assert(dev <= 0.6 && live.length >= 10, `${tag} pin: the box's top stays at ${stuck.toFixed(1)} from the pin line on, to the end of the page (max deviation ${dev.toFixed(2)}px over ${live.length} samples while the footer's top is on screen; last scrollY ${last.y})`);
    if (s0.boxH + navH <= h) assert(after.every(s => s.boxBot <= h + 0.5), `${tag} pin: the whole box is in view while pinned (bottom ${after[0].boxBot.toFixed(1)} of ${h})`);
    else console.log(`INFO ${tag} pin: the box (${s0.boxH.toFixed(0)}) plus the header (${navH}) is taller than the viewport; its bottom ${(after[0].boxBot - h).toFixed(0)}px lies below the fold while pinned`);
  }

  // ---- 2. pan
  if (on('pan')) {
    const want = s => -range * clamp01((1.5 * h - s.footTop) / (0.65 * h));       // PAN_START 'top bottom+=50%' .. PAN_END 'top 85%'
    const err = seq.reduce((m, s) => Math.max(m, Math.abs(s.t - want(s))), 0);
    let rev = 0; for (let i = 1; i < seq.length; i++) if (seq[i].t > seq[i - 1].t + 0.01) rev++;
    assert(err <= 4, `${tag} pan: the translate follows the footer's top edge (0 at 150% of the viewport, -${range.toFixed(1)} at 85%) within 4px (max error ${err.toFixed(2)}px over ${seq.length} samples)`);
    assert(seq.filter(s => s.footTop >= 1.5 * h).every(s => s.t === 0) && seq.filter(s => s.footTop >= 1.5 * h).length >= 3, `${tag} pan: no translate until the footer's top is 150% down (${seq.filter(s => s.footTop >= 1.5 * h).length} samples)`);
    assert(Math.abs(last.t + range) <= 1 && seq.filter(s => s.t < -2 && s.t > -range + 2).length >= 5 && rev === 0, `${tag} pan: it runs 0 -> ${(-range).toFixed(1)} through ${seq.filter(s => s.t < -2 && s.t > -range + 2).length} intermediate samples, never back (${rev} reversals; end ${last.t.toFixed(2)})`);
    const done = seq.filter(s => s.footTop <= 0.85 * h - 3);
    assert(done.length >= 3 && done.every(s => s.imgBot <= s.boxBot + 0.5), `${tag} pan: once the footer's top is above 85% the image's bottom edge is at or above the box's bottom (${done.length} samples, worst ${Math.max(...done.map(s => s.imgBot - s.boxBot)).toFixed(2)}px)`);
    const covered = Math.max(0, (after[0].boxBot - 0.85 * h) / after[0].boxH);       // the share of the box the footer has taken at the moment the pan is finished
    assert(covered <= 0.25, `${tag} pan: when the pan is finished (footer's top at 85%) the footer has covered ${(covered * 100).toFixed(0)}% of the box (at most a quarter), the rest of the photo with the chair is in view`);
    const cross = seq.find(s => s.footTop <= s.boxBot);
    console.log(`INFO ${tag} pan: when the footer's top reaches the box's bottom (${cross.boxBot.toFixed(1)}) the pan is ${(100 * cross.t / -range).toFixed(0)}% done, the image's bottom is ${(cross.imgBot - cross.boxBot).toFixed(1)}px below the box's`);
  }

  // ---- 3. cover
  if (on('cover')) {
    const fh = last.footH;
    assert(Math.abs(last.footBot - h) <= 1 && Math.abs(last.footTop - (h - fh)) <= 1, `${tag} cover: at the end of the page the footer's bottom is the viewport's bottom (footer ${last.footTop.toFixed(1)}..${last.footBot.toFixed(1)} of ${h})`);
    const over = Math.max(0, Math.min(last.boxBot, last.footBot) - Math.max(last.boxTop, last.footTop));
    if (h - fh <= stuck + 0.5) assert(over >= last.boxH - 0.5, `${tag} cover: the footer covers the whole box at the end (${over.toFixed(1)} of ${last.boxH.toFixed(1)}px)`);
    else {
      assert(over > 0 && Math.abs(over - (last.boxBot - (h - fh))) <= 1, `${tag} cover: the footer slid over the box's lower ${over.toFixed(0)}px (it is only ${fh.toFixed(0)}px tall, the box pins at ${stuck.toFixed(0)}: ${(last.boxH - over).toFixed(0)}px of photo stay above it)`);
      console.log(`INFO ${tag} cover: the footer (${fh.toFixed(0)}px) cannot cover the whole box (${last.boxH.toFixed(0)}px, pinned at ${stuck.toFixed(0)}) in a ${h}px viewport`);
    }
    // the footer slides OVER the pinned photo: while its top edge is inside the box, the pixel just below the edge belongs to the footer and the one just above to the photo
    const slide = seq.filter(s => s.footTop > Math.max(s.boxTop, 4) + 10 && s.footTop < Math.min(s.boxBot, s.H - 5) - 10);   // both probe pixels (4px either side of the edge) on screen
    assert(slide.length >= 2 && slide.every(s => s.underFooterTop === true && s.aboveFooterTop === true), `${tag} cover: at the ${slide.length} samples with the footer's top inside the box the footer is painted over the photo (${slide.filter(s => s.underFooterTop !== true || s.aboveFooterTop !== true).length} wrong${slide.filter(s => s.underFooterTop !== true || s.aboveFooterTop !== true).map(s => `: footer top ${s.footTop.toFixed(1)}, box ${s.boxTop.toFixed(1)}..${s.boxBot.toFixed(1)}, below ${s.underFooterTop}, above ${s.aboveFooterTop}`).join('; ')})`);
    if (fh <= h) assert(seq.every(s => s.footTop >= 0), `${tag} cover: the footer's top never leaves the viewport upward (lowest ${Math.min(...seq.map(s => s.footTop)).toFixed(1)})`);
    else console.log(`INFO ${tag} cover: the footer (${fh.toFixed(0)}px) is taller than the viewport; at the end its top is ${last.footTop.toFixed(0)}`);
  }

  // ---- 4. the finale curve ends where the photo pins
  if (on('curve')) {
    const u = before[before.length - 1];                                           // last sample still in the flow: its top moves 1:1 with the scroll
    const pinY = u.y + u.boxTop - stuck;
    assert(Math.abs(seq[0].arcEnd - pinY) <= 2, `${tag} curve: the team photo's ellipse ends at scrollY ${seq[0].arcEnd.toFixed(1)}, the photo pins at ${pinY.toFixed(1)} (${Math.abs(seq[0].arcEnd - pinY).toFixed(2)}px apart)`);
    assert(after.every(s => s.s <= 0.05) && before[0].s >= 0.95, `${tag} curve: deep as the photo enters (${before[0].s.toFixed(2)}), flat from the pin line on (${Math.max(...after.map(s => s.s)).toFixed(3)} at most)`);
    const mid = before.filter(s => s.boxTop < h * 0.85 && s.boxTop > stuck + 20);
    const e = mid.reduce((m, s) => Math.max(m, Math.abs(s.s - Math.max(0.04, (s.boxTop - stuck) / (h - stuck)))), 0);
    assert(mid.length >= 4 && e <= 0.06, `${tag} curve: the depth follows the photo's travel to the pin line within 0.06 (${e.toFixed(3)} over ${mid.length} samples)`);
  }

  // ---- 5. resize while scrolled to the middle of the pan and to the end
  if (on('resize')) {
    const w2 = w === 768 ? 900 : w - 120, h2 = h - 100;
    const fresh = await openPage({ width: w2, height: h2 });
    await sleep(600);
    const freshT = await fresh.page.evaluate(triggers), freshN = await fresh.page.evaluate(layoutNums);
    await fresh.close();
    for (const [label, frac] of [['mid-pan', 0.5], ['end of the page', 1]]) {
      await page.setViewportSize({ width: w, height: h }); await sleep(600);
      const t0 = await page.evaluate(triggers);
      const target = frac === 1 ? 'end' : seq.find(s => s.t <= -range * 0.5).y;
      await page.evaluate(y => window.scrollTo({ top: y === 'end' ? document.documentElement.scrollHeight : y, behavior: 'instant' }), target);
      await sleep(300);
      const before2 = await page.evaluate(snap);
      await page.setViewportSize({ width: w2, height: h2 });
      await sleep(1200);                                                           // ScrollTrigger refreshes ~200ms after the last resize event
      const afterT = await page.evaluate(triggers), afterN = await page.evaluate(layoutNums), a = await page.evaluate(snap);
      assert(a.W === w2 && a.H === h2 && before2.y > 0, `${tag} resize ${label}: precondition: scrolled to ${before2.y} at ${w}x${h}, now ${a.W}x${a.H}`);
      const same = JSON.stringify(afterT) === JSON.stringify(freshT);
      const diff = afterT.filter((t, i) => t !== freshT[i]).slice(0, 3).map((t, i) => `${t} vs ${freshT[afterT.indexOf(t)]}`);
      assert(same, `${tag} resize ${label} -> ${w2}x${h2}: every ScrollTrigger start/end equals a fresh load's (${afterT.length} triggers${same ? '' : '; ' + diff.join('; ')}; pan ${afterT.find(t => t.startsWith('pan'))})`);
      assert(JSON.stringify(afterN) === JSON.stringify(freshN), `${tag} resize ${label}: document height, --fh, --box-h, pin line and tail equal a fresh load's (${JSON.stringify(afterN)} vs ${JSON.stringify(freshN)})`);
      const wantT = -(a.imgH - a.boxH) * clamp01((1.5 * a.H - a.footTop) / (0.65 * a.H));
      assert(Math.abs(a.t - wantT) <= 4 && a.s !== null, `${tag} resize ${label}: the pan stands where the footer puts it (translate ${a.t.toFixed(1)}, wanted ${wantT.toFixed(1)}; box top ${a.boxTop.toFixed(1)}, pin line ${a.stuck})`);
      console.log(`INFO ${tag} resize ${label}: scrollY ${before2.y} -> ${a.y}; pan trigger ${t0.find(t => t.startsWith('pan'))} before the resize cycle, ${afterT.find(t => t.startsWith('pan'))} after (fresh ${freshT.find(t => t.startsWith('pan'))})`);
    }
  }
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

// frames as the footer comes up (the demo's own stepping: 60px wheel steps from the top, a frame when the footer's top first reaches a fraction of the viewport)
async function frames(w, h) {
  const { page, close } = await openPage({ width: w, height: h });
  await page.mouse.move(w / 2, h / 2); await sleep(600);
  const wanted = [['f150', 1.5], ['f115', 1.15], ['f100', 1.0], ['f85', 0.85], ['f70', 0.7], ['f50', 0.5], ['f25', 0.25]];
  let wi = 0, lastY = -1, shots = 0;
  for (let i = 0; i < 600; i++) {
    await page.mouse.wheel(0, 60); await sleep(40);
    const s = await page.evaluate(() => ({ y: scrollY, top: document.querySelector('.site-footer').getBoundingClientRect().top }));
    if (wi < wanted.length && s.top <= wanted[wi][1] * h) { await page.screenshot({ path: path.join(OUT, `b-${w}-${wanted[wi][0]}.png`) }); wi++; shots++; }
    if (s.y === lastY) break; lastY = s.y;
  }
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, `b-${w}-end.png`) });
  assert(shots >= wanted.length - 1, `@${w}x${h} frames: ${shots} of ${wanted.length} frames saved to tests/out/r2-pin/ plus the end frame (a 1024px viewport never brings the footer's top above 47%)`);
  await close();
}

// no pin: reduced motion, and below 768px (compared with feat/mo-r2 by hand: same rects at the same scroll positions)
async function plain(w, h, opts, label) {
  const tag = `@${w}x${h} ${label}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...opts });
  await sleep(600);
  const base = await page.evaluate(snap);
  const s = await page.evaluate(() => ({ fh: document.documentElement.style.getPropertyValue('--fh'), imgTf: getComputedStyle(document.querySelector('.finale img')).transform, footMt: parseFloat(getComputedStyle(document.querySelector('.site-footer')).marginTop), tail: parseFloat(getComputedStyle(document.querySelector('.news .stack'), '::after').height), pos: getComputedStyle(document.querySelector('.finale')).position, top: getComputedStyle(document.querySelector('.finale')).top, nav: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) }));
  assert(base.W === w && base.H === h, `${tag}: viewport is ${w}x${h}`);
  assert(!base.cls.split(/\s+/).includes('photo-pin') && !base.pan && s.fh === '', `${tag}: no html.photo-pin, no pan trigger, no --fh (class "${base.cls}")`);
  assert(s.imgTf === 'none', `${tag}: the image is not translated (${s.imgTf})`);
  const wantMt = w >= 768 ? -0.172222 * w : 0, wantTail = opts.reducedMotion ? 0 : Math.max(0, 420 - 0.58 * w);
  assert(Math.abs(s.footMt - wantMt) <= 1, `${tag}: the footer keeps its own overlap (margin-top ${s.footMt.toFixed(1)}, as before ${wantMt.toFixed(1)})`);
  if (!opts.reducedMotion) {
    assert(Math.abs(s.tail - wantTail) <= 1 && s.pos === 'sticky', `${tag}: the stack's tail is the old max(0, 420 - 58vw) = ${wantTail.toFixed(1)} (is ${s.tail.toFixed(1)}) and the photo keeps the stack's sticky line ${s.top} (nav + 4vh + 5vh = ${(s.nav + 0.09 * h).toFixed(1)})`);
    assert(Math.abs(parseFloat(s.top) - (s.nav + 0.09 * h)) <= 1, `${tag}: pin line is the stack's own`);
  } else assert(s.pos !== 'sticky', `${tag}: the stack is plain flow (${s.pos})`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

// the 768px line is crossed live: pinned -> plain -> pinned, and the last state equals the first load
async function crossing(w, h) {
  const tag = `@${w}x${h} crossing 768`;
  const { page, errors, close } = await openPage({ width: w, height: h });
  await sleep(600);
  const t0 = await page.evaluate(triggers), n0 = await page.evaluate(layoutNums);
  await page.setViewportSize({ width: 600, height: h }); await sleep(1200);
  const mid = await page.evaluate(snap);
  assert(mid.W === 600 && !mid.cls.split(/\s+/).includes('photo-pin') && !mid.pan && mid.fhVar === '', `${tag}: at 600 wide the pin is gone (class "${mid.cls}", pan trigger ${mid.pan}, --fh "${mid.fhVar}")`);
  const midMt = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.site-footer')).marginTop));
  assert(midMt === 0, `${tag}: and the footer is not pulled up (margin-top ${midMt})`);
  await page.setViewportSize({ width: w, height: h }); await sleep(1200);
  const t1 = await page.evaluate(triggers), n1 = await page.evaluate(layoutNums), cls = await page.evaluate(() => document.documentElement.className);
  assert(cls.split(/\s+/).includes('photo-pin') && JSON.stringify(t1) === JSON.stringify(t0) && JSON.stringify(n1) === JSON.stringify(n0), `${tag}: back at ${w} wide the pin is back and every trigger and number equals the first load's (doc ${n1.docH} vs ${n0.docH})`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

if (on('pin') || on('pan') || on('cover') || on('curve') || on('resize')) {
  for (const [w, h] of [[1440, 900], [768, 1024], [2560, 1600]]) await pinned(w, h);
  if (!ONLY) {
    for (const [w, h] of [[2560, 1440], [1920, 1080]]) await pinned(w, h);   // 16:9: the box is taller than the viewport less the header; see the INFO lines
    await frames(1440, 900); await frames(768, 1024);
  }
}
if (on('resize')) await crossing(1440, 900);
if (on('static')) {
  await plain(375, 812, { isMobile: true, hasTouch: true }, 'phone');
  await plain(767, 900, {}, 'just below the line');
  await plain(1440, 900, { reducedMotion: true }, 'reduced motion');
  await plain(768, 1024, { reducedMotion: true }, 'reduced motion');
}
await report();
