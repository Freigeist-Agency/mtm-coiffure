// Task 7: scroll-linked image orbit around the Services CTA.
// Desktop: entry from the sides in the first 50% of the section's pass (scale 1.6 -> 1.0), then a rigid RADIAL ring
// that turns 90deg by the end (45deg slot spacing, so the end state is a permutation of the Figma layout).
// Mobile (<=767): same entry, settles into the Figma mobile slots, ring amplitude 0 (the Figma mobile slots already bleed
// past the viewport edges, so any rotation about the section centre would push some diamond further out).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/orbit');
fs.mkdirSync(OUT, { recursive: true });

const NAMES = ['tl', 't', 'tr', 'l', 'r', 'bl', 'b', 'br'];
// with JavaScript disabled the page cannot run a rAF promise; a short wait does the job there
const frames = page => page.__nojs ? page.waitForTimeout(80)
  : page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const wrap = a => ((((a + 180) % 360) + 360) % 360) - 180;
const clamp01 = v => Math.min(1, Math.max(0, v));
const ease = t => 0.5 - Math.cos(Math.PI * t) / 2;   // sine.inOut

// scroll so that the section's pass through the viewport is at progress p; wheel=true drives it with real wheel events
async function goto(page, p, wheel = false) {
  const target = await page.evaluate(p => {
    const r = document.querySelector('.services').getBoundingClientRect();
    return r.top + scrollY - innerHeight + p * (r.height + innerHeight);
  }, p);
  if (wheel) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const vp = page.viewportSize();
    await page.mouse.move(vp.width / 2, vp.height / 2);
    for (let i = 0; i < 8; i++) {
      const y = await page.evaluate(() => scrollY);
      if (Math.abs(y - target) < 1) break;
      await page.mouse.wheel(0, target - y);
      await page.waitForTimeout(120);
    }
  } else {
    await page.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), target);
  }
  await frames(page);
  await page.waitForTimeout(60);
  await frames(page);
}

// per-item geometry relative to the orbit box centre (the orbit box itself is never transformed)
const read = page => page.evaluate(() => {
  const sec = document.querySelector('.services');
  const orb = sec.querySelector('.orbit');
  const ob = orb.getBoundingClientRect();
  const ocx = ob.left + ob.width / 2, ocy = ob.top + ob.height / 2;
  const box = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const items = [...orb.children].map(li => {
    const cs = getComputedStyle(li);
    if (cs.display === 'none') return null;
    const b = li.getBoundingClientRect();
    const m = cs.transform === 'none' ? new DOMMatrix() : new DOMMatrix(cs.transform);
    return {
      cx: (b.left + b.right) / 2 - ocx, cy: (b.top + b.bottom) / 2 - ocy,
      l: b.left, r: b.right, t: b.top, b: b.bottom,
      scale: Math.hypot(m.a, m.b), rot: Math.atan2(m.b, m.a) * 180 / Math.PI, size: li.offsetWidth,
      tilt: parseFloat(cs.getPropertyValue('--tilt')), style: li.getAttribute('style'),
    };
  });
  return {
    items, h2: box(sec.querySelector('h2')), btn: box(sec.querySelector('.btn')), copyP: box(sec.querySelector('.services-copy p')), oh: ob.height,
    sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, y: scrollY,
    progress: sec.__orbit ? sec.__orbit.progress() : null, hasOrbit: !!sec.__orbit,
    ow: getComputedStyle(sec).overflowX,
  };
});

// separating-axis test: rotated square (centre, side, deg) against an axis-aligned rect; returns the penetration depth (<= 0: apart)
// viewport-space corners of an item (withOrigin() item): centre + size * scale, rotated
function corners(it) {
  const s = it.size * it.scale / 2, a = it.rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
  return [[-s, -s], [s, -s], [s, s], [-s, s]].map(([x, y]) => [it.cx0 + it.cx + x * c - y * sn, it.cy0 + it.cy + x * sn + y * c]);
}
function penetration(it, rect) {
  const a = it.rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
  const pts = corners(it);
  const rpts = [[rect.l, rect.t], [rect.r, rect.t], [rect.r, rect.b], [rect.l, rect.b]];
  const axes = [[1, 0], [0, 1], [c, sn], [-sn, c]];
  let min = Infinity;
  for (const [ax, ay] of axes) {
    const pa = pts.map(p => p[0] * ax + p[1] * ay), pb = rpts.map(p => p[0] * ax + p[1] * ay);
    const ov = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    min = Math.min(min, ov);
  }
  return min;
}
// the orbit centre in viewport space, so penetration() can use the item's viewport position
const withOrigin = (s, it) => {
  const o = s.items.find(Boolean);
  return { ...it, cx0: o.l + (o.r - o.l) / 2 - o.cx, cy0: o.t + (o.b - o.t) / 2 - o.cy };
};
const overlapsCopy = (s, it) => {
  const w = withOrigin(s, it);
  return Math.max(penetration(w, s.h2), penetration(w, s.copyP), penetration(w, s.btn));
};

const fmt = v => (Math.round(v * 10) / 10);
const EXPECTED_DESKTOP = [-45, 0, 45, -90, 90, -135, 180, 135];

// static Figma layout (no JS): slot centres, tilts, rects at this width
async function staticRef(width) {
  const { page, close } = await openPage({ width, js: false });
  try { await page.waitForTimeout(250); return await read(page); } finally { await close(); }
}

for (const width of [1440, 375]) {
  const mobile = width <= 767;
  const tag = `@${width}`;
  const ref = await staticRef(width);
  const slot = ref.items;                               // null for display:none items
  const vis = NAMES.map((n, i) => i).filter(i => slot[i]);
  assert(vis.length === (mobile ? 6 : 8), `${tag}: ${vis.length} visible orbit items`);
  const tilts = vis.map(i => slot[i].tilt);
  assert(JSON.stringify(tilts) === JSON.stringify(mobile ? [-30, 0, 30, -135, 180, 135] : EXPECTED_DESKTOP),
    `${tag}: static --tilt values ${JSON.stringify(tilts)}`);
  // side of entry per the ruling: slot x < 50% -> left, > 50% -> right; centre items: T left, B right
  const side = i => Math.abs(slot[i].cx) < 1 ? (slot[i].cy < 0 ? 'L' : 'R') : (slot[i].cx < 0 ? 'L' : 'R');

  const { page, errors, close } = await openPage({ width, height: 900 });
  try {
    await page.waitForTimeout(400);
    const ringFor = p => mobile ? 0 : 90 * ease(clamp01((p - 0.5) / 0.5));
    const S = {};
    const samplePs = mobile ? [0, 0.18, 0.26, 0.3, 0.4] : [0, 0.25, 0.5, 0.75, 1];
    // Samples: positions differ between consecutive samples. Real wheel on two of them.
    for (const p of samplePs) {
      await goto(page, p, p === 0.25 || p === 0.75 || p === 0.26);
      S[p] = await read(page);
      await page.screenshot({ path: path.join(OUT, `${width}-p${String(Math.round(p * 100)).padStart(3, '0')}.png`) });
    }
    assert(S[samplePs[0]].hasOrbit, `${tag}: root.__orbit exists once the page is ready`);
    for (const p of samplePs) assert(Math.abs(S[p].progress - p) < 0.012, `${tag}: p=${p} measured progress ${fmt(S[p].progress)}`);
    for (let k = 1; k < samplePs.length; k++) {
      const a = S[samplePs[k - 1]], b = S[samplePs[k]];
      const moved = vis.every(i => Math.hypot(a.items[i].cx - b.items[i].cx, a.items[i].cy - b.items[i].cy) > 1);
      assert(moved, `${tag}: every item's centre differs between p=${samplePs[k - 1]} and p=${samplePs[k]}`);
    }
    // entry: bigger at the start
    const mean = vis.reduce((t, i) => t + S[0].items[i].scale, 0) / vis.length;
    assert(mean > 1.3, `${tag}: mean item scale at the first sample ${fmt(mean)} > 1.3`);
    assert(vis.every(i => Math.abs(S[0].items[i].scale - 1.6) < 0.05), `${tag}: items start at scale 1.6 (${vis.map(i => fmt(S[0].items[i].scale))})`);
    // entry side: fully beyond the viewport edge
    const sides = vis.every(i => side(i) === 'L' ? S[0].items[i].r <= 0 : S[0].items[i].l >= S[0].iw);
    assert(sides, `${tag}: at p=0 left-slot items are fully off the left edge and right-slot items off the right (${vis.map(i => NAMES[i] + side(i))})`);
    assert(side(1) === 'L' && side(6) === 'R', `${tag}: T enters from the left, B from the right`);

    // ---- p >= 0.5 sweep ----
    const sweep = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1];
    const T = {};
    for (const p of sweep) {
      await goto(page, p, p === 0.5 || p === 1); T[p] = await read(page);
      if (p === 0.5 && !mobile) await page.screenshot({ path: path.join(OUT, `${width}-p050-formed.png`) });   // the formed ring, for the Figma comparison
    }
    // scale 1.0 from 50% on (the entry is done)
    assert(sweep.every(p => vis.every(i => Math.abs(T[p].items[i].scale - 1) < 0.05)), `${tag}: all items at scale 1.0 +-0.05 from 50% to 100%`);
    // no horizontal overflow at any sample
    const all = [...samplePs.map(p => S[p]), ...sweep.map(p => T[p])];
    assert(all.every(s => s.sw <= s.iw), `${tag}: scrollWidth <= innerWidth at every sample (max ${Math.max(...all.map(s => s.sw))} vs ${S[0].iw})`);
    assert(all.every(s => s.ow === 'clip'), `${tag}: .services clips horizontally with overflow-x: clip (${all[0].ow})`);

    // formed layout from 50% on: every item sits in a slot; net rotation = Figma tilt + ring angle
    let worstRing = 0, worstNet = 0, worstSpec = 0;
    for (const p of sweep) for (const i of vis) {
      const it = T[p].items[i];
      const ring = wrap(Math.atan2(it.cy, it.cx) * 180 / Math.PI - Math.atan2(slot[i].cy, slot[i].cx) * 180 / Math.PI);
      worstRing = Math.max(worstRing, Math.abs(wrap(ring - ringFor(p))));
      worstNet = Math.max(worstNet, Math.abs(wrap(it.rot - (slot[i].tilt + ring))));
      worstSpec = Math.max(worstSpec, Math.abs(wrap(it.rot - (slot[i].tilt + ringFor(p)))));   // independent of where the item is
    }
    assert(worstRing <= 3, `${tag}: ring angle follows ${mobile ? '0 (mobile amplitude)' : '90deg * progress after 50%'} within 3deg (worst ${fmt(worstRing)})`);
    assert(worstNet <= 2, `${tag}: from 50% on every face's net rotation = Figma tilt + ring angle +-2deg (worst ${fmt(worstNet)})`);
    assert(worstSpec <= 2, `${tag}: net rotation = Figma tilt + the specified ring angle (${mobile ? '0' : '90deg x ease((p-0.5)/0.5)'}) +-2deg (worst ${fmt(worstSpec)})`);
    // at 100%: the net rotation equals the Figma tilt of the slot the item now occupies
    let endTilt = 0, endPos = 0, permuted = 0;
    for (const i of vis) {
      const it = T[1].items[i];
      const j = vis.reduce((best, k) => Math.hypot(slot[k].cx - it.cx, slot[k].cy - it.cy) < Math.hypot(slot[best].cx - it.cx, slot[best].cy - it.cy) ? k : best, vis[0]);
      endTilt = Math.max(endTilt, Math.abs(wrap(it.rot - slot[j].tilt)));
      endPos = Math.max(endPos, Math.hypot(slot[j].cx - it.cx, slot[j].cy - it.cy));
      if (j !== i) permuted++;
    }
    assert(endTilt <= 2, `${tag}: at 100% net rotation = tilt of the occupied slot +-2deg (worst ${fmt(endTilt)})`);
    if (!mobile) {
      assert(endPos <= 3, `${tag}: at 100% every item sits on a Figma slot centre (worst offset ${fmt(endPos)}px)`);
      assert(permuted === 8, `${tag}: the 90deg turn maps all 8 slots onto other slots (${permuted}/8 moved)`);
    } else {
      assert(permuted === 0, `${tag}: mobile ring amplitude 0 -> items stay in their Figma slots (${permuted} moved)`);
    }

    // inside the viewport. Desktop: whole rect. Mobile: the Figma slots themselves bleed past the edges, so an item may not
    // reach further out than its Figma slot does, and anything that is fully inside in Figma stays fully inside.
    if (!mobile) {
      assert(sweep.every(p => vis.every(i => T[p].items[i].l >= -0.5 && T[p].items[i].r <= T[p].iw + 0.5)), `${tag}: every item rect inside [0, innerWidth] from 50% to 100%`);
    } else {
      const ok = sweep.every(p => vis.every(i => T[p].items[i].l >= slot[i].l - 1 && T[p].items[i].r <= slot[i].r + 1));
      assert(ok, `${tag}: mobile items never reach further out than their Figma slot`);
      assert(sweep.every(p => vis.every(i => T[p].items[i].cx + T[p].iw / 2 >= 0 && T[p].items[i].cx + T[p].iw / 2 <= T[p].iw)), `${tag}: mobile item centres stay inside the viewport`);
    }
    // never over the heading or the CTA (rotated rect vs rect, 0.5px slack for antialiasing)
    let worstPen = -Infinity;
    for (const p of sweep) for (const i of vis) worstPen = Math.max(worstPen, overlapsCopy(T[p], T[p].items[i]));
    assert(worstPen <= 0.5, `${tag}: no item overlaps the heading, paragraph or CTA from 50% to 100% (worst penetration ${fmt(worstPen)}px)`);
    // ---- ease shape (sine.inOut): halfway through an item's own entry window it has covered ~0.5 of its path, a quarter in ~0.146.
    // (cubic-out would give 0.875 and 0.58.) Path fraction is read two ways: from the scale (1.6 -> 1) and from the radius
    // (start radius is the p=0 sample, end radius the Figma slot). Entry window = [stagger start, 0.5]; start = 0.14 * (slot y / box height + 0.5).
    {
      const END = 0.5, startOf = i => 0.14 * clamp01(slot[i].cy / S[0].oh + 0.5);
      const worst = { 0.5: 0, 0.25: 0 };
      for (const f of [0.5, 0.25]) for (const i of vis) {
        const st = startOf(i);
        await goto(page, st + f * (END - st));
        const it = (await read(page)).items[i];
        const r0 = Math.hypot(S[0].items[i].cx, S[0].items[i].cy), R = Math.hypot(slot[i].cx, slot[i].cy);
        const eScale = (1.6 - it.scale) / 0.6, eRad = (r0 - Math.hypot(it.cx, it.cy)) / (r0 - R);
        worst[f] = Math.max(worst[f], Math.abs(eScale - ease(f)), Math.abs(eRad - ease(f)));
      }
      assert(worst[0.5] <= 0.05, `${tag}: halfway through its entry window every item has covered 0.5 of its path +-0.05 (worst error ${worst[0.5].toFixed(3)})`);
      assert(worst[0.25] <= 0.05, `${tag}: a quarter of the way through it has covered 0.146 +-0.05 (worst error ${worst[0.25].toFixed(3)})`);
    }
    // ---- vertical bounds (desktop, 1440x900): for some p in [0.5, 0.6] all 8 rotated rects lie fully inside the viewport, both axes ----
    if (!mobile) {
      let best = { p: null, over: Infinity }; const okPs = [];
      for (let k = 0; k <= 10; k++) {
        const p = 0.5 + k / 100;
        await goto(page, p);
        const s = await read(page);
        let over = 0;
        for (const it of s.items) for (const [x, y] of corners(withOrigin(s, it))) over = Math.max(over, -x, x - s.iw, -y, y - s.ih);
        if (over <= 0.01) okPs.push(p.toFixed(2));
        if (over < best.over) best = { p, over };
      }
      console.log(`INFO vertical bounds @${width}x900: best p=${best.p.toFixed(2)}, worst overshoot there ${fmt(best.over)}px; qualifying p: ${okPs.join(' ') || 'none'}`);
      assert(best.over <= 0.01, `${tag}: some p in [0.5, 0.6] has all 8 rotated rects inside [0,innerHeight]x[0,innerWidth] (best p=${best.p.toFixed(2)}, overshoot ${fmt(best.over)}px)`);
    }
    // the DOM stays 8 items, each with 1 img, no wrappers needed
    assert(errors.length === 0, `${tag}: no console errors ${JSON.stringify(errors)}`);
  } finally { await close(); }
}

// ---- widths 800-900: the ring sits close to the copy ----
for (const width of [800, 850, 900, 768]) {
  const { page, close } = await openPage({ width, height: 900 });
  try {
    await page.waitForTimeout(300);
    for (const p of [0.5, 1]) {
      await goto(page, p);
      const s = await read(page);
      let worst = -Infinity;
      for (const it of s.items) if (it) worst = Math.max(worst, overlapsCopy(s, it));
      assert(worst <= 0.5, `@${width} p=${p}: no item overlaps the heading, paragraph or CTA (worst penetration ${fmt(worst)}px)`);
      assert(s.sw <= s.iw, `@${width} p=${p}: no horizontal overflow`);
    }
    // all 13 sweep samples as well, to see the in-between positions
    let worst = -Infinity, at = null;
    for (const p of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
      await goto(page, p);
      const s = await read(page);
      for (const it of s.items) if (it) { const v = overlapsCopy(s, it); if (v > worst) { worst = v; at = p; } }
    }
    assert(worst <= 0.5, `@${width}: no overlap with heading/paragraph/CTA across the turn (worst ${fmt(worst)}px at p=${at})`);
  } finally { await close(); }
}

// ---- 768: overflow and clip at every 10% ----
{
  const { page, close } = await openPage({ width: 768, height: 900 });
  try {
    await page.waitForTimeout(300);
    let max = 0;
    for (let k = 0; k <= 10; k++) { await goto(page, k / 10); const s = await read(page); max = Math.max(max, s.sw - s.iw); }
    assert(max <= 0, `@768: scrollWidth <= innerWidth at every 10% of progress (excess ${max})`);
  } finally { await close(); }
}

// ---- resize from 1440 (p=0.5) to 375: the orbit rebuilds for mobile ----
{
  const { page, close } = await openPage({ width: 1440, height: 900 });
  try {
    await page.waitForTimeout(400);
    await goto(page, 0.5);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.waitForTimeout(700);
    await goto(page, 0.6);
    const a = await read(page);
    const fresh = await openPage({ width: 375, height: 900 });
    let b;
    try { await fresh.page.waitForTimeout(400); await goto(fresh.page, 0.6); b = await read(fresh.page); } finally { await fresh.close(); }
    const ref = await staticRef(375);
    assert(a.sw <= a.iw, `resize 1440 -> 375: no horizontal overflow (${a.sw} <= ${a.iw})`);
    assert(a.items.every((it, i) => !!it === !!b.items[i]), 'resize 1440 -> 375: the two side items are hidden as on a fresh mobile load');
    const same = a.items.every((it, i) => !it || Math.hypot(it.cx - b.items[i].cx, it.cy - b.items[i].cy) < 2);
    assert(same, 'resize 1440 -> 375: item positions equal a fresh 375 load at the same progress');
    const inside = a.items.every((it, i) => !it || (it.l >= ref.items[i].l - 1 && it.r <= ref.items[i].r + 1 && it.cx + a.iw / 2 > 0 && it.cx + a.iw / 2 < a.iw));
    assert(inside, 'resize 1440 -> 375: all items inside the viewport (mobile bleed limited to the Figma slots)');
    // and back up again
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(700);
    await goto(page, 0.6);
    const c = await read(page);
    assert(c.items.every(Boolean) && c.sw <= c.iw && c.items.every(it => Math.abs(it.scale - 1) < 0.05), 'resize 375 -> 1440: eight items again, scale 1.0, no overflow');
  } finally { await close(); }
}

// ---- reduced motion and no JS: the static Figma layout, nothing added by JS ----
for (const mode of ['reduced', 'nojs']) {
  for (const width of [1440, 375]) {
    const { page, close } = await openPage(mode === 'reduced' ? { width, reducedMotion: true } : { width, js: false });
    try {
      page.__nojs = mode === 'nojs';
      await page.waitForTimeout(400);
      const ref = await staticRef(width);
      const samples = [];
      for (const p of [0, 0.25, 0.5, 0.75, 1]) { await goto(page, p); samples.push(await read(page)); }
      const first = samples[0];
      const identical = samples.every(s => s.items.every((it, i) => !it || (Math.abs(it.cx - first.items[i].cx) < 0.5 && Math.abs(it.cy - first.items[i].cy) < 0.5 && Math.abs(it.scale - 1) < 1e-6)));
      assert(identical, `${mode} @${width}: item positions identical across 5 scroll samples, scale 1`);
      assert(samples.every(s => s.items.every(it => !it || it.style === null)), `${mode} @${width}: no inline styles added to the items`);
      assert(samples.every(s => s.items.every((it, i) => !it || Math.abs(wrap(it.rot - ref.items[i].tilt)) < 0.01)), `${mode} @${width}: rotation = the Figma tilt`);
      assert(!first.hasOrbit, `${mode} @${width}: no orbit controller`);
      assert(first.items.every((it, i) => !it || Math.hypot(it.cx - ref.items[i].cx, it.cy - ref.items[i].cy) < 0.5), `${mode} @${width}: positions equal the no-JS Figma layout`);
      assert(samples.every(s => s.sw <= s.iw), `${mode} @${width}: no horizontal overflow`);
    } finally { await close(); }
  }
}
await report();
