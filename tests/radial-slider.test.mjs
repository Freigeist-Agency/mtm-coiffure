// Curved video-card slider (Social section, js/radial-slider.js): geometry, infinite wrap, input, touch, reduced motion, media slots.
import { openPage, assert, report } from './harness.mjs';

const settle = page => page.waitForFunction(() => !document.querySelector('.radial-slider').__radialSlider.busy(), null, { timeout: 5000 });
const cards = page => page.evaluate(() => {
  const st = document.querySelector('.radial-slider__stage'), sr = st.getBoundingClientRect();
  return [...st.children].filter(c => c.classList.contains('radial-slider__card')).map((c, i) => {
    const b = c.getBoundingClientRect();
    return { i, item: i % 6, clone: c.hasAttribute('data-clone'), l: b.left - sr.left, r: b.right - sr.left, h: b.height, w: b.width, op: getComputedStyle(c).opacity, vis: getComputedStyle(c).visibility };
  });
});
const visible = (cs, W) => cs.filter(c => c.op !== '0' && c.vis === 'visible' && c.l >= -1 && c.r <= W + 1).sort((a, b) => a.l - b.l);
const api = (page, fn) => page.evaluate(fn);

async function desktop() {
  const { page, errors, close } = await openPage({ width: 1440, height: 900 });
  try {
    await page.waitForSelector('.radial-slider.is-enhanced');
    const sl = page.locator('.radial-slider'); await sl.scrollIntoViewIfNeeded();
    assert(page.viewportSize().width === 1440 && await page.evaluate(() => innerWidth) === 1440, 'desktop: viewport is 1440 wide');
    const W = await page.evaluate(() => document.querySelector('.radial-slider__stage').getBoundingClientRect().width);
    assert(W === 1440, `desktop: stage is 1440 wide (${W})`);
    assert(errors.length === 0, `desktop: no page errors ${JSON.stringify(errors)}`);

    // --- markup / media slots / semantics
    const mk = await page.evaluate(() => {
      const r = document.querySelector('.radial-slider'), all = [...r.querySelectorAll('.radial-slider__card')];
      return {
        total: all.length, orig: all.filter(c => !c.hasAttribute('data-clone')).length,
        slots: all.filter(c => c.querySelector(':scope > .radial-slider__media[data-video-slot]')).length,
        role: r.getAttribute('role'), rd: r.getAttribute('aria-roledescription'), label: r.getAttribute('aria-label'), tab: r.tabIndex,
        clonesHidden: all.filter(c => c.hasAttribute('data-clone')).every(c => c.getAttribute('aria-hidden') === 'true' && c.hasAttribute('inert')),
        oldCarousel: document.querySelectorAll('.social .carousel, .social .carousel__item').length,
        bg: getComputedStyle(r.querySelector('.radial-slider__media')).backgroundColor,
      };
    });
    assert(mk.orig === 6 && mk.total === 12, `slots: 6 original cards, ring of 12 (${mk.orig}/${mk.total})`);
    assert(mk.slots === mk.total, `slots: every card (clones too) holds a .radial-slider__media[data-video-slot] (${mk.slots}/${mk.total})`);
    assert(mk.bg === 'rgb(217, 217, 217)', `slots: placeholder fill is the Figma tile grey #d9d9d9 (${mk.bg})`);
    assert(mk.role === 'region' && mk.rd === 'Karussell' && mk.label === 'Beiträge auf Social Media' && mk.tab === 0, `semantics: region / Karussell / label / focusable (${JSON.stringify([mk.role, mk.rd, mk.label, mk.tab])})`);
    assert(mk.clonesHidden, 'semantics: clones are aria-hidden + inert');
    assert(mk.oldCarousel === 0, 'old social carousel markup is gone');

    // --- geometry at rest: 7 cards, bent like a bowl, symmetric
    let cs = await cards(page); let vis = visible(cs, W);
    assert(vis.length === 7, `geometry: 7 cards fully inside the stage at rest (${vis.length})`);
    const mid = vis[3], left = vis[0], right = vis[6];
    assert(Math.abs(mid.w / W - 0.105) < 0.004, `geometry: centre card is 10.5% of the stage wide (${(mid.w / W * 100).toFixed(2)}%)`);
    assert(Math.abs(mid.h / mid.w - 16 / 9) < 0.03, `geometry: centre card is 9:16 (${(mid.h / mid.w).toFixed(3)})`);
    assert(left.h / mid.h > 1.4 && right.h / mid.h > 1.4, `geometry: outer cards are >1.4x the centre card's height, curved (${(left.h / mid.h).toFixed(2)}, ${(right.h / mid.h).toFixed(2)})`);
    assert(vis[1].h > vis[2].h && vis[2].h > mid.h && vis[5].h > vis[4].h && vis[4].h > mid.h, 'geometry: height rises monotonically from the centre to both edges');
    assert(Math.abs((mid.l + mid.r) / 2 - W / 2) < 2, `geometry: centre card is centred (${((mid.l + mid.r) / 2).toFixed(1)})`);
    const gaps = vis.slice(1).map((c, i) => c.l - vis[i].r);
    assert(gaps.every(g => g > 2 && g < 0.05 * W), `geometry: gaps between cards stay positive and small ${JSON.stringify(gaps.map(g => Math.round(g)))}`);
    const pitch = (vis[4].l + vis[4].r) / 2 - (mid.l + mid.r) / 2;
    assert(Math.abs(pitch / W - 0.1384) < 0.008, `geometry: card pitch near the centre is 13.8% of the stage (${(pitch / W * 100).toFixed(2)}%)`);
    const top = await page.evaluate(() => { const r = document.querySelector('.radial-slider__stage').getBoundingClientRect(); return [...document.querySelectorAll('.radial-slider__card')].map(c => { const b = c.getBoundingClientRect(); return [b.top - r.top, r.bottom - b.bottom]; }); });
    assert(top.every(([t, b]) => t > -1 && b > -1), 'geometry: no card is clipped at the top or bottom of the stage');
    const ctl = await page.evaluate(() => { const c = document.querySelector('.radial-slider__controls').getBoundingClientRect(), st = document.querySelector('.radial-slider__stage').getBoundingClientRect(); return { cx: (c.left + c.right) / 2, below: c.top >= st.bottom - 0.01 * st.width, n: document.querySelectorAll('.radial-slider__dot').length, btn: document.querySelectorAll('.radial-slider__btn').length }; });
    assert(Math.abs(ctl.cx - 720) < 2 && ctl.below && ctl.n === 6 && ctl.btn === 2, `controls: prev/next + 6 dots centred under the row (${JSON.stringify(ctl)})`);

    // --- no auto movement
    const p0 = await api(page, () => document.querySelector('.radial-slider').__radialSlider.pos());
    await page.waitForTimeout(1600);
    const p1 = await api(page, () => document.querySelector('.radial-slider').__radialSlider.pos());
    assert(p0 === 0 && p1 === 0, `no auto-play: still at 0 after 1.6s (${p0} -> ${p1})`);

    // --- keyboard
    await page.focus('.radial-slider');
    await page.keyboard.press('ArrowRight'); await settle(page);
    let st = await api(page, () => { const a = document.querySelector('.radial-slider').__radialSlider; return [a.index(), a.pos(), document.querySelectorAll('.radial-slider__dot.is-active').length, [...document.querySelectorAll('.radial-slider__dot')].findIndex(d => d.classList.contains('is-active')), document.querySelector('.radial-slider__live').textContent]; });
    assert(st[0] === 1 && st[1] === 1, `keyboard: ArrowRight moves one card (index ${st[0]}, pos ${st[1]})`);
    assert(st[2] === 1 && st[3] === 1, `controls: exactly one active dot, and it follows the index (${st[3]})`);
    assert(st[4] === 'Beitrag 2 von 6', `a11y: live region says "${st[4]}"`);
    await page.keyboard.press('ArrowLeft'); await settle(page);
    assert(await api(page, () => document.querySelector('.radial-slider').__radialSlider.pos()) === 0, 'keyboard: ArrowLeft moves back');
    await page.click('.radial-slider__btn--next'); await settle(page);
    assert(await api(page, () => document.querySelector('.radial-slider').__radialSlider.pos()) === 1, 'buttons: next moves one card');
    await page.click('.radial-slider__btn--prev'); await settle(page);
    assert(await api(page, () => document.querySelector('.radial-slider').__radialSlider.pos()) === 0, 'buttons: prev moves back');

    // --- one step's timing: ease-out, about 0.75s (reference: 37/62/82/87/92/100% at 0.1..0.6s)
    const prof = await page.evaluate(() => new Promise(res => {
      const a = document.querySelector('.radial-slider').__radialSlider, out = [], t0 = performance.now(); a.next();
      (function f() { out.push([performance.now() - t0, a.pos()]); if (a.busy() && performance.now() - t0 < 2000) requestAnimationFrame(f); else res(out); })();
    }));
    // timed from the first frame that moved, so a slow start on a busy machine does not count against the curve
    const base = (prof.find(p => p[1] > 0.001) || [0])[0] - 16;
    const at = ms => { const q = prof.find(p => p[0] - base >= ms); return q ? q[1] : NaN; };
    assert(prof.length > 20, `step: sampled ${prof.length} frames`);
    assert(at(100) > 0.25 && at(100) < 0.5 && at(200) > 0.5 && at(200) < 0.75 && at(450) > 0.85 && at(700) > 0.97 && prof[prof.length - 1][1] === 1, `step: ease-out profile 100ms ${at(100).toFixed(2)}, 200ms ${at(200).toFixed(2)}, 450ms ${at(450).toFixed(2)}, 700ms ${at(700).toFixed(2)}, ends at ${prof[prof.length - 1][1]}`);
    await settle(page);
    await page.click('.radial-slider__btn--prev'); await settle(page);

    // --- infinite wrap: more than a full cycle (6 cards) each way, neighbours stay in order, nothing jumps
    const wrapRun = async dir => {
      const res = await page.evaluate(async d => {
        const root = document.querySelector('.radial-slider'), a = root.__radialSlider, st = root.querySelector('.radial-slider__stage'), cardsEl = [...st.children].filter(c => c.classList.contains('radial-slider__card'));
        const sr = st.getBoundingClientRect(); let maxJump = 0, frames = 0, prev = null, done = false;
        const snap = () => cardsEl.map(c => { const b = c.getBoundingClientRect(); return { l: b.left - sr.left, vis: c.style.opacity !== '0' && getComputedStyle(c).visibility === 'visible' && b.left >= sr.left && b.right <= sr.right }; });   // edge-on cards beyond the stage edge are excluded: their box swings wildly on a slow frame
        const loop = () => {
          const s = snap(); frames++;
          if (prev) s.forEach((c, i) => { if (c.vis && prev[i].vis) maxJump = Math.max(maxJump, Math.abs(c.l - prev[i].l)); });
          prev = s; if (!done) requestAnimationFrame(loop);
        };
        loop();
        for (let i = 0; i < 8; i++) { d > 0 ? a.next() : a.prev(); await new Promise(r => setTimeout(r, 120)); }
        while (a.busy()) await new Promise(r => setTimeout(r, 50));
        done = true; await new Promise(r => requestAnimationFrame(r));
        return { maxJump, frames, pos: a.pos(), index: a.index() };
      }, dir);
      return res;
    };
    let r = await wrapRun(1);
    assert(r.frames > 40 && r.pos === 8 && r.index === 2, `wrap +: 8 cards forward (more than the 6-card cycle): pos ${r.pos}, index ${r.index}, ${r.frames} frames sampled`);
    assert(r.maxJump < 0.10 * W, `wrap +: no card inside the stage jumps more than 10% of the stage between frames (max ${r.maxJump.toFixed(1)}px)`);
    cs = await cards(page); vis = visible(cs, W);
    assert(vis.length === 7 && vis.every((c, i) => i === 0 || (c.item - vis[i - 1].item + 6) % 6 === 1), `wrap +: the 7 visible cards are still consecutive items ${JSON.stringify(vis.map(c => c.item))}`);
    assert(vis[3].item === 2, `wrap +: centre card is item 2 after 8 steps (${vis[3].item})`);
    r = await wrapRun(-1);
    assert(r.pos === 0 && r.index === 0, `wrap -: 8 cards back to 0: pos ${r.pos}, index ${r.index}`);
    assert(r.maxJump < 0.10 * W, `wrap -: no visible card jumps (max ${r.maxJump.toFixed(1)}px)`);
    r = await wrapRun(-1);
    assert(r.pos === -8 && r.index === 4, `wrap -: past zero (pos ${r.pos}, index ${r.index})`);
    cs = await cards(page); vis = visible(cs, W);
    assert(vis.length === 7 && vis.every((c, i) => i === 0 || (c.item - vis[i - 1].item + 6) % 6 === 1) && vis[3].item === 4, `wrap -: order still consecutive, centre item 4 ${JSON.stringify(vis.map(c => c.item))}`);
    await page.focus('.radial-slider'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');  // back to a tidy spot for the next checks
    await settle(page);

    // --- no layout reads while it moves
    await api(page, () => {
      const root = document.querySelector('.radial-slider'); window.__reads = 0;
      const bump = () => { window.__reads++; };
      const gb = Element.prototype.getBoundingClientRect; Element.prototype.getBoundingClientRect = function () { bump(); return gb.apply(this, arguments); };
      const gc = window.getComputedStyle; window.getComputedStyle = function () { bump(); return gc.apply(this, arguments); };
      ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight', 'offsetLeft', 'offsetTop'].forEach(p => {
        const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, p) || Object.getOwnPropertyDescriptor(Element.prototype, p);
        Object.defineProperty(HTMLElement.prototype, p, { configurable: true, get() { bump(); return d.get.call(this); } });
      });
      window.__rest = () => { Element.prototype.getBoundingClientRect = gb; window.getComputedStyle = gc; };
    });
    const before = await api(page, () => document.querySelector('.radial-slider').__radialSlider.pos());
    await page.focus('.radial-slider');
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250); await page.keyboard.press('ArrowRight'); await settle(page);
    const after = await api(page, () => ({ pos: document.querySelector('.radial-slider').__radialSlider.pos(), reads: window.__reads }));
    await api(page, () => window.__rest());
    assert(after.pos === before + 2, `no layout reads: the slider really moved (${before} -> ${after.pos})`);
    assert(after.reads === 0, `no layout reads: 0 layout reads during the animation (${after.reads})`);

    // --- pointer drag follows 1:1, then flings and snaps
    const box = await sl.locator('.radial-slider__stage').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const startPos = await api(page, () => document.querySelector('.radial-slider').__radialSlider.pos());
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 12, cy); await page.mouse.move(cx - 12 - 276, cy, { steps: 6 });
    await page.waitForTimeout(60);
    const held = await api(page, () => ({ pos: document.querySelector('.radial-slider').__radialSlider.pos(), cls: document.querySelector('.radial-slider').classList.contains('is-dragging') }));
    assert(held.cls, 'drag: .is-dragging while the button is down');
    assert(Math.abs((held.pos - startPos) - 276 / 138 / 1.44) < 0.12, `drag: 276px of pointer moves the cards ${(held.pos - startPos).toFixed(2)} (expect ${(276 / 138 / 1.44).toFixed(2)} cards, 1:1 with the pointer)`);
    await page.waitForTimeout(400);   // a still hand: no fling
    await page.mouse.up(); await settle(page);
    const fin = await api(page, () => document.querySelector('.radial-slider').__radialSlider.pos());
    assert(Number.isInteger(fin) && fin !== startPos, `drag: release snaps to a whole card (${startPos} -> ${fin})`);
    // the same short 50px drag (0.25 card) snaps back when the hand is still, but a quick flick carries on by a card or more
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 12, cy); await page.mouse.move(cx + 12 + 50, cy, { steps: 2 });
    await page.waitForTimeout(400); await page.mouse.up(); await settle(page);
    const still = await api(page, () => document.querySelector('.radial-slider').__radialSlider.pos());
    assert(still === fin, `drag: a short drag with a still hand snaps back (${fin} -> ${still})`);
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 12, cy); await page.mouse.move(cx + 12 + 50, cy, { steps: 2 }); await page.mouse.up(); await settle(page);
    const fl = await api(page, () => document.querySelector('.radial-slider').__radialSlider.pos());
    assert(Number.isInteger(fl) && fin - fl >= 1, `drag: the same 50px as a quick flick carries at least one card back (${fin} -> ${fl})`);
    // click after a drag must not be treated as a click on whatever is under the pointer (the stage has no click action; the swallow flag must clear)
    assert(await api(page, () => document.querySelector('.radial-slider').classList.contains('is-dragging')) === false, 'drag: .is-dragging cleared after release');

    // --- the video slot takes a <video> with no other change
    const slot = await page.evaluate(() => {
      const c = document.querySelector('.radial-slider__card:not([data-clone])'), m = c.querySelector('.radial-slider__media');
      const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; m.appendChild(v);
      const cb = c.getBoundingClientRect(), vb = v.getBoundingClientRect();
      return { fit: getComputedStyle(v).objectFit, dw: Math.abs(vb.width - cb.width), dh: Math.abs(vb.height - cb.height), display: getComputedStyle(v).display };
    });
    assert(slot.fit === 'cover' && slot.dw < 1 && slot.dh < 1, `video slot: a <video> fills the card with object-fit: cover (${JSON.stringify(slot)})`);
    // it plays only while the slider is on screen
    await page.evaluate(() => {
      const v = document.querySelector('.radial-slider video'); window.__v = { play: 0, pause: 0 };
      v.play = () => { window.__v.play++; return Promise.resolve(); }; v.pause = () => { window.__v.pause++; };
    });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(() => window.__v.pause >= 1, null, { timeout: 4000 }).catch(() => {});
    const off = await page.evaluate(() => ({ ...window.__v, y: scrollY }));
    await page.evaluate(() => document.querySelector('.radial-slider').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForFunction(() => window.__v.play >= 1, null, { timeout: 4000 }).catch(() => {});
    const on = await page.evaluate(() => ({ ...window.__v }));
    assert(off.pause >= 1, `video: paused when the slider leaves the viewport (${JSON.stringify(off)})`);
    assert(on.play >= 1, `video: plays again when it returns (${JSON.stringify(on)})`);
  } finally { await close(); }
}

async function sizes() {
  for (const [w, h] of [[375, 812], [768, 1024], [1440, 900], [2560, 1300]]) {
    const { page, errors, close } = await openPage({ width: w, height: h });
    try {
      await page.waitForSelector('.radial-slider.is-enhanced');
      await page.locator('.radial-slider').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
      assert(await page.evaluate(() => innerWidth) === w, `${w}: viewport really is ${w} wide`);
      const m = await page.evaluate(() => { const st = document.querySelector('.radial-slider__stage').getBoundingClientRect(); return { W: st.width, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
      const cs = await cards(page), vis = visible(cs, m.W);
      assert(vis.length === 7, `${w}: 7 cards inside the stage (${vis.length})`);
      assert(Math.abs(vis[3].w / m.W - 0.105) < 0.004 && vis[0].h / vis[3].h > 1.4, `${w}: row scales with the stage: centre ${(vis[3].w / m.W * 100).toFixed(2)}% wide, edge ${(vis[0].h / vis[3].h).toFixed(2)}x tall`);
      assert(m.sw <= m.iw, `${w}: no horizontal overflow (${m.sw} <= ${m.iw})`);
      assert(errors.length === 0, `${w}: no page errors`);
    } finally { await close(); }
  }
}

async function touch() {
  const { page, close } = await openPage({ width: 375, height: 812, isMobile: true, hasTouch: true });
  try {
    await page.waitForSelector('.radial-slider.is-enhanced');
    assert(await page.evaluate(() => innerWidth) === 375, 'touch: layout viewport is 375 wide (viewport meta honoured)');
    const sl = page.locator('.radial-slider__stage'); await sl.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    const ta = await page.evaluate(() => getComputedStyle(document.querySelector('.radial-slider')).touchAction);
    assert(ta === 'pan-y', `touch: touch-action is pan-y (${ta})`);
    const cdp = await page.context().newCDPSession(page);
    const box = await sl.boundingBox(); const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
    // raw touch events (Input.synthesizeScrollGesture does not scroll this page in headless chromium, so it proves nothing)
    const swipeBy = async (sx, sy, ex, ey) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
      for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (ex - sx) * i / 12, y: sy + (ey - sy) * i / 12 }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const state = () => page.evaluate(() => ({ y: scrollY, pos: document.querySelector('.radial-slider').__radialSlider.pos() }));
    const s0 = await state();
    await swipeBy(x, y + 100, x, y - 100); await page.waitForTimeout(700);   // finger moves up: the page scrolls down
    const s1 = await state();
    assert(s1.y - s0.y > 100, `touch: a vertical swipe starting on the slider scrolls the page (${s0.y} -> ${s1.y})`);
    assert(s1.pos === s0.pos, `touch: and does not move the slider (${s0.pos} -> ${s1.pos})`);
    await sl.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    const b2 = await sl.boundingBox(); const x2 = Math.round(b2.x + b2.width / 2), y2 = Math.round(b2.y + b2.height / 2);
    const s2 = await state();
    await swipeBy(x2 + 75, y2, x2 - 75, y2);
    await page.waitForFunction(() => !document.querySelector('.radial-slider').__radialSlider.busy(), null, { timeout: 5000 });
    const s3 = await state();
    assert(Math.abs(s3.y - s2.y) < 3, `touch: a horizontal swipe does not scroll the page (${s2.y} -> ${s3.y})`);
    assert(s3.pos > s2.pos && Number.isInteger(s3.pos), `touch: a horizontal swipe moves the slider and snaps (${s2.pos} -> ${s3.pos})`);
  } finally { await close(); }
}

async function reduced() {
  const { page, close } = await openPage({ width: 1440, height: 900, reducedMotion: true });
  try {
    await page.waitForSelector('.radial-slider.is-enhanced');
    assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'reduced: the media query matches');
    await page.locator('.radial-slider').scrollIntoViewIfNeeded();
    const a = await page.evaluate(() => document.querySelector('.radial-slider').__radialSlider.pos());
    await page.waitForTimeout(1500);
    const b = await page.evaluate(() => { const s = document.querySelector('.radial-slider').__radialSlider; return [s.pos(), s.busy()]; });
    assert(a === 0 && b[0] === 0 && b[1] === false, `reduced: no auto movement (${a} -> ${b[0]}, busy ${b[1]})`);
    await page.focus('.radial-slider'); await page.keyboard.press('ArrowRight');
    const c = await page.evaluate(() => { const s = document.querySelector('.radial-slider').__radialSlider; return [s.pos(), s.busy()]; });
    assert(c[0] === 1 && c[1] === false, `reduced: manual control still works, and jumps without a tween (pos ${c[0]}, busy ${c[1]})`);
    await page.click('.radial-slider__btn--next');
    const d = await page.evaluate(() => document.querySelector('.radial-slider').__radialSlider.pos());
    assert(d === 2, `reduced: the next button works (${d})`);
    const cs = await cards(page); const vis = visible(cs, 1440);
    assert(vis.length === 7 && vis[3].item === 2, `reduced: still the curved row, centre item ${vis[3] && vis[3].item}`);
  } finally { await close(); }
}

async function noJs() {
  const { page, close } = await openPage({ width: 1440, height: 900, js: false });
  try {
    const r = await page.evaluate(() => { const c = [...document.querySelectorAll('.radial-slider__card')]; return { n: c.length, shown: c.every(e => { const b = e.getBoundingClientRect(); return b.width > 50 && getComputedStyle(e).visibility === 'visible'; }) }; });
    assert(r.n === 6 && r.shown, `no JS: six visible placeholder cards in a plain row (${JSON.stringify(r)})`);
  } finally { await close(); }
}

await desktop();
await sizes();
await touch();
await reduced();
await noJs();
await report();
