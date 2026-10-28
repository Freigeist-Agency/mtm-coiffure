// Standorte: the Nümbrecht row pins under the nav and the Waldbröl row scrolls up over it and covers it,
// the same stack as the news cards (js/stack.js). Real wheel scrolling through the section.
// STACK_ONLY=a,b runs just those blocks (used for the mutation runs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/location-stack');
fs.mkdirSync(OUT, { recursive: true });
const want = k => !process.env.STACK_ONLY || process.env.STACK_ONLY.split(',').includes(k);
const near = (v, t, tol) => Math.abs(v - t) <= tol;

const settle = async page => {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(50);
    const now = await page.evaluate(() => Math.round(scrollY));
    if (now === last) break;
    last = now;
  }
  await page.waitForTimeout(40);
};

// everything about both rows at the current scroll position
const probe = page => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.location-info')];
  const R = e => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height, w: b.width }; };
  const one = row => {
    const cs = getComputedStyle(row), m = cs.transform === 'none' ? null : new DOMMatrix(cs.transform);
    return {
      position: cs.position, topCss: parseFloat(cs.top), z: cs.zIndex, bg: cs.backgroundColor, hasTransform: cs.transform !== 'none', scale: m ? m.a : 1,
      offsetH: row.offsetHeight,
      opacity: Math.max(...[...row.children].map(c => parseFloat(getComputedStyle(c).opacity))),
      opacityMin: Math.min(...[...row.children].map(c => parseFloat(getComputedStyle(c).opacity))),
      row: R(row), img: R(row.querySelector('.location-img')), label: R(row.querySelector('h3')), btn: R(row.querySelector('.btn')),
    };
  };
  return { y: scrollY, ih: innerHeight, nue: one(rows[0]), wal: one(rows[1]), navH: document.querySelector('.site-header').getBoundingClientRect().bottom,
    mainH: document.querySelector('.locations__main').offsetHeight };
});

// which row owns the element at (x, y)
const hit = (page, x, y) => page.evaluate(([x, y]) => {
  const rows = [...document.querySelectorAll('.location-info')], el = document.elementFromPoint(x, y);
  return { nue: !!el && rows[0].contains(el), wal: !!el && rows[1].contains(el), what: el ? el.tagName + '.' + el.className : null };
}, [x, y]);

// scroll with the real wheel by dy
const wheel = async (page, dy) => { await page.mouse.wheel(0, dy); await settle(page); };
const wheelTo = async (page, y) => { const cur = await page.evaluate(() => scrollY); if (Math.abs(y - cur) > 0.5) await wheel(page, y - cur); };

async function run(width, height) {
  const tag = `@${width}x${height}`;
  const mobile = width <= 767;
  const { page, errors, close } = await openPage({ width, height });
  try {
    await page.evaluate(() => window.mtmReady);
    await page.waitForTimeout(300);
    await page.mouse.move(width / 2, height / 2);
    const p0 = await probe(page);
    const H = p0.nue.offsetH, navH = p0.navH;
    const expTop = Math.min(navH + (mobile ? 0 : 0.02 * height), height - H);
    const natNue = p0.nue.row.top + p0.y, natWal = p0.wal.row.top + p0.y;   // document y with nothing stuck

    if (want('css')) {
      assert(p0.nue.position === 'sticky', `${tag}: the Nümbrecht row is position:sticky (${p0.nue.position})`);
      assert(near(p0.nue.topCss, expTop, 1), `${tag}: it pins at ${expTop.toFixed(1)}px so its whole photo fits (top ${p0.nue.topCss.toFixed(1)}, row ${H}px tall, viewport ${height})`);
      assert(p0.wal.position !== 'static' && p0.wal.position !== 'sticky' && Number(p0.wal.z) > 0, `${tag}: the Waldbröl row is positioned above it (${p0.wal.position}, z ${p0.wal.z})`);
      assert(p0.wal.bg === 'rgb(0, 0, 0)', `${tag}: the Waldbröl row has an opaque black background (${p0.wal.bg})`);
      const extra = p0.mainH - 2 * H;
      assert(extra <= height, `${tag}: the stack adds at most one viewport of scroll (${extra.toFixed(0)}px of ${height})`);
      const chain = await page.evaluate(() => {
        const bad = [];
        for (let e = document.querySelector('.location-info').parentElement; e && e !== document.body; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (['hidden', 'auto', 'scroll'].some(v => cs.overflowX === v || cs.overflowY === v)) bad.push(`${e.tagName}.${e.className}`);
        }
        return bad;
      });
      assert(chain.length === 0, `${tag}: no ancestor of the pinned row is a scroll container ${JSON.stringify(chain)}`);
    }

    // ---- scroll through the section with the real wheel, recording as we go
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, Math.round(natNue - height * 0.9)));
    await page.waitForTimeout(250);
    const trace = [];
    const endY = Math.round(natWal - expTop + 260);
    let guard = 0;
    for (;;) {
      const s = await probe(page);
      trace.push(s);
      if (s.y >= endY || guard++ > 80) break;
      await wheel(page, 110);
    }
    assert(trace.length > 12, `${tag}: wheel trace has enough steps (${trace.length})`);

    // (a) pinned, photo fully visible below the nav
    const pinned = trace.filter(s => near(s.nue.row.top, expTop, 1));
    assert(pinned.length >= 3, `${tag} (a): the Nümbrecht row holds its position for several wheel steps (${pinned.length} steps at top ${expTop.toFixed(1)})`);
    const pin = pinned[0];
    assert(pin && pin.nue.img.top >= pin.navH - 0.5 && pin.nue.img.bottom <= height + 0.5, `${tag} (a): pinned, the whole photo is inside the viewport below the nav (photo ${pin && pin.nue.img.top.toFixed(1)}..${pin && pin.nue.img.bottom.toFixed(1)}, nav ${navH}, viewport ${height})`);
    const tops = pinned.map(s => +s.nue.row.top.toFixed(1));
    assert(Math.max(...tops) - Math.min(...tops) <= 1.5, `${tag} (a): its top is constant while pinned ${JSON.stringify(tops.slice(0, 8))}`);
    const x = (pin.nue.img.left + pin.nue.img.right) / 2, yMid = (pin.nue.img.top + pin.nue.img.bottom) / 2;
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), pin.y);
    await page.waitForTimeout(150);
    if (want('shots') && (width === 1440 || width === 375)) await page.screenshot({ path: path.join(OUT, `${width}-pinned.png`) });
    const before = await hit(page, x, yMid);
    assert(before.nue, `${tag} (a): before Waldbröl arrives, the middle of the Nümbrecht photo hits the Nümbrecht row (${before.what})`);

    // (b) Waldbröl's top passes over the Nümbrecht row
    const T = expTop;
    const midS = trace.filter(s => s.wal.row.top > T + 0.3 * H && s.wal.row.top < T + 0.7 * H).sort((a, b) => Math.abs(a.wal.row.top - (T + H / 2)) - Math.abs(b.wal.row.top - (T + H / 2)))[0];
    assert(!!midS, `${tag} (b): the trace has a mid-cover step`);
    if (midS) {
      await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), midS.y);
      await page.waitForTimeout(200);
      const m = await probe(page);
      const above = await hit(page, x, m.wal.row.top - 15), below = await hit(page, x, m.wal.row.top + 15);
      assert(above.nue && !above.wal, `${tag} (b): mid-cover, just above Waldbröl's top edge is still Nümbrecht (${above.what})`);
      assert(below.wal && !below.nue, `${tag} (b): mid-cover, just below Waldbröl's top edge is Waldbröl, on top of the Nümbrecht row (${below.what})`);
      assert(m.nue.scale < 0.999 && m.nue.scale > 0.92 && m.nue.opacity < 0.999 && m.nue.opacity > 0.35, `${tag} (c): mid-cover the depth cue is part-way (scale ${m.nue.scale.toFixed(3)}, opacity ${m.nue.opacity.toFixed(3)})`);
      assert(near(m.nue.row.top, T, 1), `${tag} (b): the Nümbrecht row is still pinned while it is being covered (${m.nue.row.top.toFixed(1)} vs ${T.toFixed(1)})`);
      if (want('shots') && (width === 1440 || width === 375)) await page.screenshot({ path: path.join(OUT, `${width}-mid-cover.png`) });
    }

    // exactly covered: real wheel by the remaining distance
    const cur = await probe(page);
    await wheel(page, cur.wal.row.top - T);
    // the scrub is applied on the next frame; a loaded, software-rendered headless run can lag it, so let it catch up
    await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.location-info h3')).opacity) <= 0.37, null, { timeout: 2000 }).catch(() => {});
    const cov = await probe(page);
    assert(near(cov.wal.row.top, T, 2), `${tag} (b): the wheel lands Waldbröl's top on the pinned line (${cov.wal.row.top.toFixed(1)} vs ${T.toFixed(1)})`);
    const covered = await hit(page, x, yMid);
    assert(covered.wal && !covered.nue, `${tag} (b): once covered, the middle of the Nümbrecht photo's pinned rect hits a Waldbröl element (${covered.what})`);
    const wr = cov.wal.row, nr = cov.nue.row;
    assert(wr.top <= nr.top + 2 && wr.bottom >= nr.bottom - 2 && wr.left <= nr.left + 0.5 && wr.right >= nr.right - 0.5, `${tag} (b): the Waldbröl row's box contains the Nümbrecht row's box`);

    // (c) depth cue at the end of the scrub
    assert(near(cov.nue.scale, 0.92, 0.01), `${tag} (c): covered Nümbrecht row scale ${cov.nue.scale.toFixed(3)} ~ 0.92`);
    assert(near(cov.nue.opacity, 0.35, 0.05) && near(cov.nue.opacityMin, 0.35, 0.05), `${tag} (c): its content opacity ${cov.nue.opacityMin.toFixed(3)}..${cov.nue.opacity.toFixed(3)} ~ 0.35`);
    assert(cov.wal.scale === 1 && cov.wal.opacity === 1, `${tag} (c): the Waldbröl row itself is untouched (scale ${cov.wal.scale}, opacity ${cov.wal.opacity})`);
    if (want('shots') && (width === 1440 || width === 375)) await page.screenshot({ path: path.join(OUT, `${width}-covered.png`) });

    // (d) nothing of Nümbrecht is hit-testable above Waldbröl, at the cover and for a few steps after
    const pts = r => [['label', (r.label.left + r.label.right) / 2, (r.label.top + r.label.bottom) / 2], ['label corner', r.label.left + 3, r.label.top + 3],
      ['button', (r.btn.left + r.btn.right) / 2, (r.btn.top + r.btn.bottom) / 2], ['photo corner', r.img.left + 3, r.img.top + 3], ['photo', (r.img.left + r.img.right) / 2, (r.img.top + r.img.bottom) / 2]];
    let leaks = [];
    for (let k = 0; k < 4; k++) {
      const s = await probe(page);
      const pl = pts(s.nue);
      for (const [what, px, py] of pl) {
        if (py < s.navH + 1 || py > height - 1) continue;
        const h = await hit(page, px, py);
        if (h.nue) leaks.push(`${what}@${Math.round(s.y)} ${h.what}`);
        if (k === 0 && !h.wal) leaks.push(`${what} not Waldbröl ${h.what}`);
      }
      await wheel(page, 90);
    }
    assert(leaks.length === 0, `${tag} (d): no Nümbrecht label, button or photo point is hit above the Waldbröl row once covered ${JSON.stringify(leaks)}`);

    // after the cover the section carries on normally: both rows leave together, then the page continues
    const after = await probe(page);
    assert(after.nue.row.top < T - 40 && after.wal.row.top < T - 40, `${tag}: after the cover both rows scroll away together (${after.nue.row.top.toFixed(0)}, ${after.wal.row.top.toFixed(0)})`);

    // scrolling back up reverses it
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, natNue - height));
    await page.waitForTimeout(250);
    const top = await probe(page);
    assert(near(top.nue.scale, 1, 0.001) && near(top.nue.opacity, 1, 0.001), `${tag}: scrolled back above the section the depth cue is gone (scale ${top.nue.scale.toFixed(3)}, opacity ${top.nue.opacity.toFixed(3)})`);

    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(sw[0] <= sw[1], `${tag}: no horizontal overflow (${sw[0]} <= ${sw[1]})`);
    assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);
  } finally { await close(); }
}

if (want('stack')) {
  await run(1440, 900);
  await run(1280, 720);
  await run(375, 812);
}

// ---- a viewport shorter than the row (1440x520: the photo is 645px tall): pinned bottom-aligned, so the photo's bottom edge and the button stay in view
if (want('short')) {
  const [width, height] = [1440, 520], tag = `@${width}x${height}`;
  const { page, errors, close } = await openPage({ width, height });
  try {
    await page.evaluate(() => window.mtmReady);
    await page.waitForTimeout(300);
    const p0 = await probe(page), H = p0.nue.offsetH, natNue = p0.nue.row.top + p0.y;
    assert(H > height - p0.navH, `${tag}: the row (${H}px) does not fit under the nav, so the bottom-aligned branch is the one under test`);
    assert(near(p0.nue.topCss, height - H, 1), `${tag}: pin line is innerHeight - row height (${p0.nue.topCss.toFixed(1)} vs ${(height - H)})`);
    await page.mouse.move(width / 2, height / 2);
    await wheelTo(page, Math.round(natNue - (height - H) + 120));
    const s = await probe(page);
    assert(near(s.nue.row.top, height - H, 1) && near(s.nue.row.bottom, height, 1), `${tag}: pinned bottom-aligned, row bottom ${s.nue.row.bottom.toFixed(1)} = viewport bottom ${height}`);
    assert(s.nue.btn.bottom <= height && s.nue.btn.top >= s.navH, `${tag}: its button is in view (${s.nue.btn.top.toFixed(0)}..${s.nue.btn.bottom.toFixed(0)})`);
    assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);
  } finally { await close(); }
}

// ---- reduced motion and no JS: plain flow, no sticky row, no transforms
if (want('plain')) {
  for (const [label, opts] of [['reduced motion', { reducedMotion: true }], ['no JS', { js: false }]]) {
    for (const [width, height] of [[1440, 900], [375, 812]]) {
      const tag = `${label} @${width}x${height}`;
      const { page, errors, close } = await openPage({ width, height, ...opts });
      try {
        await page.waitForTimeout(300);
        const natural = await probe(page);
        assert(natural.nue.position !== 'sticky' && natural.wal.position !== 'sticky', `${tag} (e): neither row is sticky (${natural.nue.position}, ${natural.wal.position})`);
        let moved = false, tr = false;
        const y0 = natural.nue.row.top + natural.y;
        for (let k = 0; k < 14; k++) {
          await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, y0 - height + k * 140));
          await page.waitForTimeout(40);
          const s = await probe(page);
          if (s.nue.hasTransform || s.wal.hasTransform || s.nue.opacity < 1) tr = true;
          const n0 = s.nue.row.top + s.y;
          if (Math.abs(n0 - y0) > 1) moved = true;   // a sticky row would drift from its natural document position
        }
        assert(!tr && !moved, `${tag} (e): no transform, no fade and the Nümbrecht row stays at its natural place while scrolling (transform ${tr}, moved ${moved})`);
        const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
        assert(sw[0] <= sw[1], `${tag}: no horizontal overflow (${sw[0]} <= ${sw[1]})`);
        assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);
      } finally { await close(); }
    }
  }
}

await report();
