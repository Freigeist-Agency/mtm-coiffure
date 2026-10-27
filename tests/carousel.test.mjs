import { openPage, assert, report } from './harness.mjs';
import fs from 'node:fs';

const OUT = new URL('./out/carousel/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// CAROUSEL_ONLY=a,b runs just those blocks (used for the mutation runs)
const want = k => !process.env.CAROUSEL_ONLY || process.env.CAROUSEL_ONLY.split(',').includes(k);

const NAMES = ['team', 'social'];
const sel = name => `.carousel[data-carousel="${name}"]`;

// ---- in-page helpers (all take the carousel name) --------------------------------------------
// Snapshot: every item's bounding-box centre, skew read back from its computed matrix, clone flag.
const snap = (page, name) => page.evaluate(s => {
  const root = document.querySelector(s);
  const rr = root.getBoundingClientRect();
  const items = [...root.querySelectorAll('.carousel__item')].map(el => {
    const r = el.getBoundingClientRect();
    const m = getComputedStyle(el).transform;
    let skew = 0, scale = 1;
    if (m && m !== 'none') {
      const v = m.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
      skew = Math.atan(v[1] / v[0]) * 180 / Math.PI; scale = v[0];
    }
    return { idx: +el.dataset.carouselIndex, clone: el.hasAttribute('data-clone'), cx: (r.left + r.right) / 2,
      left: r.left, right: r.right, w: r.width, skew, scale, transform: m };
  });
  return {
    index: root.__carousel ? root.__carousel.index() : null,
    n: root.__carousel ? root.__carousel.length : null,
    mid: rr.left + rr.width / 2, rl: rr.left, rw: rr.width, rt: rr.top, rh: rr.height, items,
    gap: parseFloat(getComputedStyle(root).columnGap) || 0,
  };
}, sel(name));

const centred = st => st.items.reduce((a, b) => Math.abs(b.cx - st.mid) < Math.abs(a.cx - st.mid) ? b : a);

async function reveal(page, name) {
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center', behavior: 'instant' }), sel(name));
  await sleep(60);
}

// Pick, in-page, the item for logical index (index()+dir) closest to where dir*pitch from the centre is, and
// return the point on its visible part. `mark` tags it so a later click can be verified.
const target = (page, name, dir) => page.evaluate(([s, dir]) => {
  const root = document.querySelector(s), api = root.__carousel;
  const rr = root.getBoundingClientRect(), mid = rr.left + rr.width / 2;
  const n = api.length, want = ((api.index() + dir) % n + n) % n;
  const items = [...root.querySelectorAll('.carousel__item')];
  const pitch = items[0].offsetWidth + (parseFloat(getComputedStyle(root).columnGap) || 0);
  let best = null, bd = 1e9;
  for (const el of items) {
    if (+el.dataset.carouselIndex !== want) continue;
    const r = el.getBoundingClientRect(), d = Math.abs((r.left + r.right) / 2 - (mid + dir * pitch));
    if (d < bd) { bd = d; best = el; }
  }
  items.forEach(e => e.removeAttribute('data-probe'));
  best.setAttribute('data-probe', '1');
  const r = best.getBoundingClientRect();
  const x0 = Math.max(r.left, rr.left), x1 = Math.min(r.right, rr.right);
  const x = (x0 + x1) / 2, y = rr.top + rr.height / 2;
  const hit = document.elementFromPoint(x, y);
  // a clone is inert, so a real hit-test lands on the root; carousel.js then resolves the card from its box
  const hitOk = !!hit && (hit.closest('.carousel__item') === best || (best.hasAttribute('data-clone') && hit === root));
  return { x, y, hitOk, clone: best.hasAttribute('data-clone'), want };
}, [sel(name), dir]);

// el.click() on the same pick, for rapid sequences where a real mouse would be needed per item
const clickEl = async (page, name, dir) => {
  const t = await target(page, name, dir);
  await page.evaluate(() => document.querySelector('[data-probe="1"]').click());
  return t;
};

const mod = (a, n) => ((a % n) + n) % n;

// Samples across the root's width every 20px at mid-height; returns the longest run of consecutive misses.
const gapScan = (page, name) => page.evaluate(s => {
  const root = document.querySelector(s), rr = root.getBoundingClientRect();
  const y = rr.top + rr.height / 2, step = 20;
  let run = 0, maxRun = 0, hits = 0, total = 0;
  for (let x = rr.left + 1; x < rr.right; x += step) {
    total++;
    const hit = document.elementFromPoint(x, y);
    const inClone = hit === root && [...root.querySelectorAll('[data-clone]')].some(e => { const r = e.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
    if (inClone || (hit && hit.closest('.carousel__item') && root.contains(hit))) { hits++; run = 0; }
    else { run++; maxRun = Math.max(maxRun, run); }
  }
  const half = root.querySelector('.carousel__item').offsetWidth / 2;
  return { maxRun, hits, total, step, half, gap: parseFloat(getComputedStyle(root).columnGap) || 0 };
}, sel(name));

// ---- per-viewport, per-carousel checks --------------------------------------------------------
for (const width of [1440, 375]) {
  for (const name of NAMES) {
    const tag = `${name}@${width}`;

    if (want('structure')) {
      const { page, errors, close } = await openPage({ width });
      try {
        await page.waitForSelector(`${sel(name)}.is-enhanced`, { timeout: 5000 }).catch(() => {});
        const s = await page.evaluate(([c, w]) => {
          const root = document.querySelector(c), items = [...root.querySelectorAll('.carousel__item')];
          const gl = root.querySelector('.carousel__glass--left'), gr = root.querySelector('.carousel__glass--right');
          const gs = gl && getComputedStyle(gl);
          return {
            enhanced: root.classList.contains('is-enhanced'), api: !!root.__carousel,
            tabindex: root.getAttribute('tabindex'), left: !!gl, right: !!gr,
            gw: gl && gl.getBoundingClientRect().width, vw: w / 100,
            blur: gs && (gs.backdropFilter || gs.webkitBackdropFilter),
            pe: gs && gs.pointerEvents,
            clones: items.filter(e => e.hasAttribute('data-clone')),
            cloneOk: items.filter(e => e.hasAttribute('data-clone')).every(e => e.getAttribute('aria-hidden') === 'true' && e.hasAttribute('inert')),
            origOk: items.filter(e => !e.hasAttribute('data-clone')).every(e => !e.hasAttribute('inert') && e.getAttribute('aria-hidden') !== 'true'),
            nOrig: items.filter(e => !e.hasAttribute('data-clone')).length,
            keys: root.__carousel && ['next', 'prev', 'goTo', 'index'].every(k => typeof root.__carousel[k] === 'function'),
            gsapTags: document.querySelectorAll('script[src*="gsap.min"]').length,
            overflow: getComputedStyle(root).overflowX,
          };
        }, [sel(name), width]);
        assert(s.enhanced && s.api && s.keys, `${tag}: initCarousel ran (is-enhanced, __carousel with next/prev/goTo/index)`);
        assert(s.tabindex === '0' && s.left && s.right, `${tag}: root tabindex=0, left and right glass strips inserted`);
        const wantVw = width <= 767 ? 8 : 12;
        assert(Math.abs(s.gw - wantVw * s.vw) < 1, `${tag}: glass strip is ${wantVw}vw wide (${s.gw && s.gw.toFixed(1)}px vs ${(wantVw * s.vw).toFixed(1)})`);
        assert(/blur\(12px\)/.test(s.blur || ''), `${tag}: glass has backdrop-filter blur(12px) (${s.blur})`);
        assert(s.pe === 'none', `${tag}: glass strips let clicks through (pointer-events ${s.pe})`);
        assert(s.cloneOk && s.origOk, `${tag}: clones are aria-hidden + inert, originals are not`);
        if (name === 'social') assert(s.clones.length >= 4 && s.nOrig === 4, `${tag}: social (4 cards) is padded with clones (${s.clones.length})`);
        assert(s.overflow !== 'auto' && s.overflow !== 'scroll', `${tag}: enhanced root does not scroll natively (overflow-x ${s.overflow})`);
        assert(s.gsapTags === 1, `${tag}: exactly one gsap script tag (${s.gsapTags})`);
        assert(errors.length === 0, `${tag}: no page errors (${errors.join(' | ')})`);
      } finally { await close(); }
    }

    if (want('next')) {
      const { page, close } = await openPage({ width });
      try {
        await page.waitForSelector(`${sel(name)}.is-enhanced`, { timeout: 5000 }).catch(() => {});
        await reveal(page, name);
        const before = await snap(page, name);
        const t = await target(page, name, +1);
        assert(t.hitOk, `${tag}: the item right of centre is what the mouse hits at its visible part`);
        await page.mouse.click(t.x, t.y);
        await sleep(150);
        const early = await snap(page, name);
        assert(Math.abs(early.items.find(i => i.idx === t.want && Math.abs(i.cx - before.mid) < before.rw).cx - early.mid) > early.rw * 0.02,
          `${tag}: at 150ms the move is still under way (0.6s tween, not a jump)`);
        await sleep(650);
        const after = await snap(page, name);
        assert(after.index === mod(before.index + 1, before.n), `${tag}: click right of centre -> index +1 (${before.index} -> ${after.index})`);
        const c = centred(after);
        assert(c.idx === after.index && Math.abs(c.cx - after.mid) <= after.rw * 0.02,
          `${tag}: that item is within 2% of the centre (off by ${(Math.abs(c.cx - after.mid) / after.rw * 100).toFixed(2)}%)`);
        // clicking the centre item does nothing
        await page.mouse.click(after.mid, after.rt + after.rh / 2);
        await sleep(300);
        assert((await snap(page, name)).index === after.index, `${tag}: clicking the centred item does not move`);
      } finally { await close(); }
    }

    if (want('skew')) {
      const { page, close } = await openPage({ width });
      try {
        await page.waitForSelector(`${sel(name)}.is-enhanced`, { timeout: 5000 }).catch(() => {});
        await reveal(page, name);
        const st = await snap(page, name);
        const c = centred(st);
        assert(Math.abs(c.skew) < 1, `${tag}: centre item |skewY| < 1deg (${c.skew.toFixed(2)})`);
        const vis = st.items.filter(i => i.right > st.rl && i.left < st.rl + st.rw);
        const outer = vis.reduce((a, b) => Math.abs(b.cx - st.mid) > Math.abs(a.cx - st.mid) ? b : a);
        assert(Math.abs(outer.skew) > 4, `${tag}: outermost visible item |skewY| > 4deg (${outer.skew.toFixed(2)})`);
        assert(Math.abs(outer.skew) <= 8.01, `${tag}: skew never exceeds 8deg (${outer.skew.toFixed(2)})`);
        assert(outer.scale > 1.05 && outer.scale <= 1.2501, `${tag}: outermost item is widened (scaleX ${outer.scale.toFixed(3)}, max 1.25)`);
        const left = vis.filter(i => i.cx < st.mid - 1), right = vis.filter(i => i.cx > st.mid + 1);
        assert(left.every(i => i.skew < 0) && right.every(i => i.skew > 0), `${tag}: skew sign follows the side of the centre`);
        // no autoplay: nothing changes without input
        await sleep(2000);
        const st2 = await snap(page, name);
        assert(st2.index === st.index && st2.items.every((i, k) => i.transform === st.items[k].transform),
          `${tag}: nothing moves for 2s without a click (no autoplay)`);
      } finally { await close(); }
    }

    if (want('rapid')) {
      const { page, close } = await openPage({ width });
      try {
        await page.waitForSelector(`${sel(name)}.is-enhanced`, { timeout: 5000 }).catch(() => {});
        await reveal(page, name);
        const start = (await snap(page, name)).index, n = (await snap(page, name)).n;
        for (let i = 0; i < 6; i++) { await clickEl(page, name, +1); await sleep(80); }
        await sleep(300);
        const mid = await gapScan(page, name);
        const bad = (g) => (g.maxRun - 1) * g.step > 2 * g.gap || (g.maxRun - 1) * g.step >= g.half;
        assert(!bad(mid), `${tag}: mid-move after 6 rapid clicks no gap (longest miss run ${mid.maxRun} x ${mid.step}px, css gap ${mid.gap}px)`);
        await sleep(700);
        const st = await snap(page, name);
        assert(st.index === mod(start + 6, n), `${tag}: 6 rapid clicks -> index +6 mod ${n} (${start} -> ${st.index})`);
        const c = centred(st);
        assert(c.idx === st.index && Math.abs(c.cx - st.mid) <= st.rw * 0.02, `${tag}: rapid clicks settle centred`);
        const end = await gapScan(page, name);
        assert(!bad(end), `${tag}: settled after rapid clicks every 20px sample is covered but for normal gaps (miss run ${end.maxRun}, ${end.hits}/${end.total} hit)`);
      } finally { await close(); }
    }

    if (want('back')) {
      const { page, close } = await openPage({ width });
      try {
        await page.waitForSelector(`${sel(name)}.is-enhanced`, { timeout: 5000 }).catch(() => {});
        await reveal(page, name);
        const s0 = await snap(page, name), seq = [];
        let clones = 0, hitsOk = true;
        for (let i = 0; i < 10; i++) {
          const t = await target(page, name, -1);
          hitsOk = hitsOk && t.hitOk; if (t.clone) clones++;
          await page.mouse.click(t.x, t.y);
          await sleep(680);
          seq.push((await snap(page, name)).index);
        }
        const exp = Array.from({ length: 10 }, (_, i) => mod(s0.index - 1 - i, s0.n));
        assert(JSON.stringify(seq) === JSON.stringify(exp), `${tag}: 10 clicks backwards wrap ${seq.join(',')} (want ${exp.join(',')})`);
        assert(hitsOk, `${tag}: every backward click landed on the intended item (real mouse hit-test)`);
        if (name === 'social') assert(clones > 0, `${tag}: some of those clicks were on clones and still mapped right (${clones} clones)`);
        const st = await snap(page, name), c = centred(st);
        assert(c.idx === st.index && Math.abs(c.cx - st.mid) <= st.rw * 0.02, `${tag}: centred after wrapping backwards`);
      } finally { await close(); }
    }

    if (want('forward')) {
      const { page, close } = await openPage({ width });
      try {
        await page.waitForSelector(`${sel(name)}.is-enhanced`, { timeout: 5000 }).catch(() => {});
        await reveal(page, name);
        const s0 = await snap(page, name), seq = [];
        let clones = 0, hitsOk = true;
        for (let i = 0; i < 10; i++) {
          const t = await target(page, name, +1);
          hitsOk = hitsOk && t.hitOk; if (t.clone) clones++;
          await page.mouse.click(t.x, t.y);
          await sleep(680);
          seq.push((await snap(page, name)).index);
        }
        const exp = Array.from({ length: 10 }, (_, i) => mod(s0.index + 1 + i, s0.n));
        assert(JSON.stringify(seq) === JSON.stringify(exp), `${tag}: 10 clicks forwards wrap ${seq.join(',')} (want ${exp.join(',')})`);
        assert(hitsOk, `${tag}: every forward click landed on the intended item`);
        if (name === 'social') assert(clones > 0, `${tag}: forward clicks on clones map to the right logical index (${clones} clones clicked)`);
      } finally { await close(); }
    }

    if (want('keys')) {
      const { page, close } = await openPage({ width });
      try {
        await page.waitForSelector(`${sel(name)}.is-enhanced`, { timeout: 5000 }).catch(() => {});
        await reveal(page, name);
        await page.focus(sel(name));
        const i0 = (await snap(page, name)).index, n = (await snap(page, name)).n;
        await page.keyboard.press('ArrowRight');
        await sleep(800);
        const i1 = (await snap(page, name)).index;
        assert(i1 === mod(i0 + 1, n), `${tag}: ArrowRight -> index +1 (${i0} -> ${i1})`);
        await page.keyboard.press('ArrowLeft'); await sleep(800);
        await page.keyboard.press('ArrowLeft'); await sleep(800);
        const i2 = (await snap(page, name)).index;
        assert(i2 === mod(i0 - 1, n), `${tag}: ArrowLeft twice -> index -1 from the start (${i2})`);
        // Tab never lands on a clone
        const tabbable = await page.evaluate(s => [...document.querySelectorAll(s + ' [data-clone], ' + s + ' [data-clone] *')]
          .some(e => e.tabIndex >= 0 && !e.closest('[inert]')), sel(name));
        assert(!tabbable, `${tag}: no clone is reachable by Tab`);
        // the public api drives the same machine
        const api = await page.evaluate(s => { const a = document.querySelector(s).__carousel; a.goTo(3); return a.index(); }, sel(name));
        assert(api === 3, `${tag}: goTo(3) updates index() at once (${api})`);
      } finally { await close(); }
    }

    if (want('resize') && width === 1440) {
      const { page, close } = await openPage({ width: 1440 });
      try {
        await page.waitForSelector(`${sel(name)}.is-enhanced`, { timeout: 5000 }).catch(() => {});
        await reveal(page, name);
        const t = await target(page, name, +1);
        await page.mouse.click(t.x, t.y); await sleep(800);
        await page.setViewportSize({ width: 375, height: 900 });
        await sleep(500);
        await reveal(page, name);
        const st = await snap(page, name), c = centred(st);
        assert(c.idx === st.index && Math.abs(c.cx - st.mid) <= st.rw * 0.02,
          `${name}: 1440 -> 375 resize re-centres the current item (off ${(Math.abs(c.cx - st.mid) / st.rw * 100).toFixed(2)}%)`);
        const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
        assert(ov.sw <= ov.iw, `${name}: no page overflow after the resize (${ov.sw} <= ${ov.iw})`);
        const gs = await gapScan(page, name), bad = (gs.maxRun - 1) * gs.step > 2 * gs.gap || (gs.maxRun - 1) * gs.step >= gs.half;
        assert(!bad, `${name}: no gap after the resize (miss run ${gs.maxRun})`);
        await page.setViewportSize({ width: 1440, height: 900 }); await sleep(500);
        await reveal(page, name);
        const st2 = await snap(page, name), c2 = centred(st2), gs2 = await gapScan(page, name);
        assert(c2.idx === st2.index && Math.abs(c2.cx - st2.mid) <= st2.rw * 0.02 && !((gs2.maxRun - 1) * gs2.step > 2 * gs2.gap),
          `${name}: 375 -> 1440 resize also re-centres and leaves no gap`);
      } finally { await close(); }
    }

    if (want('shots')) {
      const { page, close } = await openPage({ width });
      try {
        await page.waitForSelector(`${sel(name)}.is-enhanced`, { timeout: 5000 }).catch(() => {});
        await reveal(page, name);
        const t = await target(page, name, +1);
        await page.mouse.click(t.x, t.y);
        await sleep(270);
        const box = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 30), width: innerWidth, height: Math.min(innerHeight - Math.max(0, r.top - 30), r.height + 60) }; }, sel(name));
        await page.screenshot({ path: `${OUT}${name}-${width}-midmove.png`, clip: box });
        await sleep(600);
        await page.screenshot({ path: `${OUT}${name}-${width}-rest.png`, clip: box });
        assert(fs.existsSync(`${OUT}${name}-${width}-midmove.png`), `${tag}: mid-move screenshot saved`);
      } finally { await close(); }
    }
  }
}

// ---- glass strip width switches at 767 (ruling), not 600 --------------------------------------
if (want('structure')) {
  for (const [width, vw] of [[767, 8], [768, 12]]) {
    const { page, close } = await openPage({ width });
    try {
      await page.waitForSelector('.carousel.is-enhanced', { timeout: 5000 }).catch(() => {});
      const w = await page.evaluate(() => document.querySelector('.carousel__glass--left').getBoundingClientRect().width);
      assert(Math.abs(w - vw * width / 100) < 1, `@${width}: glass strip is ${vw}vw (${w.toFixed(1)}px)`);
    } finally { await close(); }
  }
}

// ---- reduced motion: early return, native scroll-snap row stays -------------------------------
if (want('reduced')) {
  for (const width of [1440, 375]) {
    const { page, errors, close } = await openPage({ width, reducedMotion: true });
    try {
      await sleep(400);
      for (const name of NAMES) {
        const r = await page.evaluate(c => {
          const root = document.querySelector(c), cs = getComputedStyle(root);
          const items = [...root.querySelectorAll('.carousel__item')];
          return {
            ox: cs.overflowX, snap: cs.scrollSnapType, enhanced: root.classList.contains('is-enhanced'),
            glass: root.querySelectorAll('[class*="carousel__glass"]').length, api: !!root.__carousel,
            transforms: items.map(e => getComputedStyle(e).transform).filter(t => t !== 'none'),
            inlineT: items.filter(e => e.style.transform).length,
            n: items.length, clones: root.querySelectorAll('[data-clone]').length,
          };
        }, sel(name));
        assert(r.transforms.length === 0 && r.inlineT === 0, `reduced-motion @${width} ${name}: no item has a transform (${r.transforms.length})`);
        assert(r.ox === 'auto' && r.snap.includes('mandatory'), `reduced-motion @${width} ${name}: root keeps overflow-x auto + scroll-snap (${r.ox}, ${r.snap})`);
        assert(!r.enhanced && !r.glass && !r.api && !r.clones, `reduced-motion @${width} ${name}: no glass strips, no clones, no api, not enhanced`);
      }
      assert(errors.length === 0, `reduced-motion @${width}: no errors`);
    } finally { await close(); }
  }
}

// ---- no JS: both carousels are static scroll rows, all items in layout -------------------------
if (want('nojs')) {
  for (const width of [1440, 375]) {
    const { page, close } = await openPage({ width, js: false });
    try {
      for (const name of NAMES) {
        const r = await page.evaluate(c => {
          const root = document.querySelector(c), cs = getComputedStyle(root);
          const items = [...root.querySelectorAll('.carousel__item')];
          return { n: items.length, ox: cs.overflowX, snap: cs.scrollSnapType, disp: cs.display,
            sizes: items.map(e => [e.offsetWidth, e.offsetHeight]), transforms: items.filter(e => getComputedStyle(e).transform !== 'none').length,
            glass: root.querySelectorAll('[class*="carousel__glass"]').length };
        }, sel(name));
        const want = name === 'social' ? 4 : 8;
        assert(r.n === want && r.sizes.every(([w, h]) => w > 0 && h > 0),
          `no-JS @${width} ${name}: all ${want} items have non-zero size ${JSON.stringify(r.sizes[0])}`);
        assert(r.transforms === 0 && r.glass === 0, `no-JS @${width} ${name}: no transforms, no glass`);
        assert(r.ox === 'auto' && r.snap.includes('mandatory') && r.disp === 'flex', `no-JS @${width} ${name}: scroll-snap flex row (${r.disp}, ${r.ox}, ${r.snap})`);
      }
    } finally { await close(); }
  }
}

await report();
