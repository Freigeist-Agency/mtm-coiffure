// Team hover gallery (js/hover-gallery.js, css/hover-gallery.css).
// HG_ONLY=a,b runs just those blocks (used for the mutation runs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/hover-gallery');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const want = k => !process.env.HG_ONLY || process.env.HG_ONLY.split(',').includes(k);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const SEL = '.hover-gallery';
const CARD = `${SEL} .hover-gallery__card`;

// in-page snapshot: root content width, every card's width / pressed state / clip-path / photo opacity
const snap = page => page.evaluate(s => {
  const root = document.querySelector(s), cs = getComputedStyle(root);
  const rr = root.getBoundingClientRect();
  const cards = [...root.querySelectorAll('.hover-gallery__card')].map(b => {
    const r = b.getBoundingClientRect(), v = b.querySelector('.hover-gallery__visual'), img = b.querySelector('img');
    return { w: r.width, left: r.left, h: r.height, pressed: b.getAttribute('aria-pressed'), clip: v.style.clipPath || getComputedStyle(v).clipPath,
      op: parseFloat(getComputedStyle(img).opacity), imgW: img.offsetWidth };
  });
  return { n: cards.length, cards, inner: root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    h: root.clientHeight, sl: root.scrollLeft, sw: root.scrollWidth, cw: root.clientWidth, top: rr.top, left: rr.left, rw: rr.width, rh: rr.height,
    api: root.__hoverGallery ? root.__hoverGallery.index() : null, enhanced: root.classList.contains('is-enhanced') };
}, SEL);

// a clip-path is a plain rectangle when its path has at most two distinct x and two distinct y values
const isRect = clip => {
  const nums = (clip.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  const xs = new Set(), ys = new Set();
  nums.forEach((v, i) => (i % 2 ? ys : xs).add(Math.round(v * 100)));
  return nums.length >= 8 && xs.size <= 2 && ys.size <= 2;
};
const centre = (page, i) => page.evaluate(([s, i]) => {
  const r = document.querySelectorAll(s)[i].getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, [CARD, i]);
const reveal = async page => {
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center', behavior: 'instant' }), SEL);
  await sleep(80);
};
const hover = async (page, i) => { const c = await centre(page, i); await page.mouse.move(c.x, c.y); };
// screenshot of the gallery's box (page coordinates of the current scroll position) with a little air around it
const shot = async (page, file) => {
  const r = await page.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: 0, y: Math.max(0, b.top - 16), width: innerWidth, height: Math.min(innerHeight - Math.max(0, b.top - 16), b.height + 32) }; }, SEL);
  await page.screenshot({ path: path.join(OUT, file), clip: r });
};
const wait = (page) => page.waitForSelector(`${SEL}.is-enhanced`, { timeout: 5000 }).catch(() => {});

// ---- markup, images, desktop behaviour ---------------------------------------------------------
for (const width of [1440, 768, 375]) {
  if (!want('basic')) break;
  const tag = `@${width}`;
  const { page, errors, close } = await openPage({ width, height: width === 375 ? 812 : 900 });
  try {
    await wait(page);
    await reveal(page);
    const s0 = await snap(page);
    assert(s0.enhanced && s0.api === 0, `${tag}: script ran (is-enhanced, index 0)`);
    const m = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.hover-gallery > button')];
      return { n: b.length, types: b.every(x => x.type === 'button'), labels: b.every(x => (x.getAttribute('aria-label') || '').trim().length > 3),
        pressed: b.map(x => x.getAttribute('aria-pressed')), alts: [...document.querySelectorAll('.hover-gallery img')].every(i => (i.alt || '').trim().length > 3) };
    });
    assert(m.n === 6 && m.types && m.labels, `${tag}: 6 button[type=button] cards with aria-label (${m.n})`);
    assert(JSON.stringify(m.pressed) === JSON.stringify(['true', 'false', 'false', 'false', 'false', 'false']), `${tag}: only card 0 is aria-pressed=true ${JSON.stringify(m.pressed)}`);
    const loaded = await page.waitForFunction(() => [...document.querySelectorAll('.hover-gallery img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }).then(() => true, () => false);
    assert(loaded && m.alts, `${tag}: all 6 images loaded (naturalWidth > 0) with non-empty alt`);
    const ov = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(ov[0] <= ov[1], `${tag}: no horizontal page overflow (${ov[0]} <= ${ov[1]})`);
    assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);

    if (width > 720) {
      const ratio = 460 / 178, gap = 10;
      const inactive = (s0.inner - 5 * gap) / (5 + ratio), activeW = inactive * ratio;
      if (width === 1440) {
        assert(near(s0.inner, 1400, 2), `${tag}: gallery inner width 1400 (${s0.inner})`);
        assert(near(s0.h, 460, 2), `${tag}: gallery height 460 (${s0.h})`);
        assert(near(s0.cards[0].w, 460, 3), `${tag}: active card 460 wide (${s0.cards[0].w.toFixed(1)})`);
        assert(s0.cards.slice(1).every(c => near(c.w, 178, 3)), `${tag}: inactive cards 178 wide (${s0.cards.slice(1).map(c => c.w.toFixed(1))})`);
      } else {
        assert(near(s0.cards[0].w, activeW, 3) && s0.cards.slice(1).every(c => near(c.w, inactive, 3)),
          `${tag}: active ${activeW.toFixed(0)} / inactive ${inactive.toFixed(0)} from the width formula (${s0.cards.map(c => c.w.toFixed(0))})`);
      }
      assert(near(s0.cards[0].op, 1, 0.01) && s0.cards.slice(1).every(c => near(c.op, 0.78, 0.01)), `${tag}: photo opacity 1 active / 0.78 inactive`);
      assert(s0.cards.every(c => isRect(c.clip)), `${tag}: at rest every clip-path is a plain rectangle`);
      assert(s0.cards.every(c => near(c.imgW, s0.cards[0].w, 1)), `${tag}: every photo is as wide as the active card`);
      // the five gaps are 10px
      assert(s0.cards.slice(1).every((c, i) => near(c.left - (s0.cards[i].left + s0.cards[i].w), 10, 1.5)), `${tag}: 10px between cards`);

      await shot(page, width === 1440 ? 'desktop-1440-rest.png' : 'tablet-768-rest.png');
      // hover card 3 and sample the clip-paths every frame from the move on
      await page.evaluate(() => {
        window.__bend = { t0: 0, samples: [] };
        const cards = [...document.querySelectorAll('.hover-gallery__visual')];
        const tick = () => { window.__bend.samples.push({ t: performance.now() - window.__bend.t0, clips: cards.map(v => v.style.clipPath) }); if (window.__bend.samples.length < 400) requestAnimationFrame(tick); };
        window.__bend.start = () => { window.__bend.t0 = performance.now(); requestAnimationFrame(tick); };
      });
      await page.evaluate(() => window.__bend.start());
      await hover(page, 3);
      await sleep(375);
      const mid = await snap(page);
      assert(mid.cards.some(c => !isRect(c.clip)), `${tag}: mid-animation (~375ms) some clip-path is bent`);
      assert(mid.cards[3].w > s0.cards[3].w + 20 && mid.cards[3].w < s0.cards[0].w - 20, `${tag}: card 3 is part-way wide at ~375ms (${mid.cards[3].w.toFixed(0)})`);
      if (width === 1440) await shot(page, 'desktop-1440-mid-hover.png');
      await sleep(525);
      const s1 = await snap(page);
      assert(near(s1.cards[3].w, activeW, 3) && near(s1.cards[0].w, inactive, 3), `${tag}: after hovering card 3, card 3 is ${activeW.toFixed(0)} and card 0 ${inactive.toFixed(0)} (${s1.cards[3].w.toFixed(1)} / ${s1.cards[0].w.toFixed(1)})`);
      assert(s1.cards.map(c => c.pressed).join() === 'false,false,false,true,false,false', `${tag}: card 3 aria-pressed=true, others false (${s1.cards.map(c => c.pressed)})`);
      assert(s1.cards.every(c => isRect(c.clip)), `${tag}: after 900ms every clip-path is a plain rectangle again`);
      assert(near(s1.cards[3].op, 1, 0.01) && near(s1.cards[0].op, 0.78, 0.01), `${tag}: opacities follow (${s1.cards[3].op}, ${s1.cards[0].op})`);
      const smp = await page.evaluate(() => window.__bend.samples);
      const bent = smp.filter(s => s.clips.some(c => !isRect(c)));
      assert(bent.length > 5 && bent.some(s => s.t > 250 && s.t < 500), `${tag}: the bend is visible over many frames, including 250-500ms (${bent.length} frames)`);
      assert(smp.length && smp[smp.length - 1].clips.every(c => isRect(c)), `${tag}: the last sampled frame is straight`);
      function isRect(clip) { const nums = (clip.match(/-?\d+(\.\d+)?/g) || []).map(Number); const xs = new Set(), ys = new Set(); nums.forEach((v, i) => (i % 2 ? ys : xs).add(Math.round(v * 100))); return nums.length >= 8 && xs.size <= 2 && ys.size <= 2; }

      // leaving the gallery returns to card 0
      await page.mouse.move(5, 5);
      await sleep(900);
      const s2 = await snap(page);
      assert(s2.api === 0 && s2.cards[0].pressed === 'true' && near(s2.cards[0].w, activeW, 3), `${tag}: pointer leaving the gallery returns to card 0 (${s2.api})`);

      // interrupting mid-animation retargets: hover 3, then 1 after 200ms
      await hover(page, 3); await sleep(200);
      const c1 = await centre(page, 1); await page.mouse.move(c1.x, c1.y);
      await sleep(950);
      const s3 = await snap(page);
      assert(s3.api === 1 && near(s3.cards[1].w, activeW, 3) && s3.cards.filter((c, i) => i !== 1).every(c => near(c.w, inactive, 3)) && s3.cards.every(c => isRect(c.clip)),
        `${tag}: an interrupted move retargets cleanly (${s3.cards.map(c => c.w.toFixed(0))})`);
      const tot = s3.cards.reduce((a, c) => a + c.w, 0) + 50;
      assert(near(tot, s3.inner, 2), `${tag}: widths + gaps fill the gallery after the interruption (${tot.toFixed(1)} vs ${s3.inner})`);
      await page.mouse.move(5, 5); await sleep(900);

      // click activates
      await page.mouse.click((await centre(page, 5)).x, (await centre(page, 5)).y);
      await sleep(900);
      assert((await snap(page)).api === 5, `${tag}: a click activates card 5`);
      await page.mouse.move(5, 5); await sleep(900);

      // keyboard
      await page.locator(CARD).nth(4).focus();
      await sleep(900);
      const s4 = await snap(page);
      assert(s4.api === 4 && s4.cards[4].pressed === 'true' && near(s4.cards[4].w, activeW, 3), `${tag}: focusing card 4 activates it (${s4.api}, ${s4.cards[4].w.toFixed(0)})`);
      await page.keyboard.press('Tab'); await sleep(900);
      assert((await snap(page)).api === 5, `${tag}: Tab moves the active card to 5`);
      await page.evaluate(() => document.activeElement.blur());
      await page.mouse.move(5, 5);

      if (width === 1440) {
        // resize re-lays out instantly at the current index
        await page.locator(CARD).nth(2).focus(); await sleep(900);
        await page.setViewportSize({ width: 1100, height: 900 });
        await sleep(150);
        const s5 = await snap(page), inner2 = s5.inner, in2 = (inner2 - 50) / (5 + ratio);
        assert(s5.api === 2 && near(s5.cards[2].w, in2 * ratio, 3) && s5.cards.every(c => isRect(c.clip)), `${tag}: resize to 1100 re-lays out at index 2 with no animation (${s5.cards[2].w.toFixed(0)} vs ${(in2 * ratio).toFixed(0)})`);
        await page.setViewportSize({ width: 1440, height: 900 });
      }
    } else {
      // phone scroller
      assert(s0.sw > s0.cw + 20, `${tag}: gallery scrolls horizontally (${s0.sw} > ${s0.cw})`);
      assert(near(s0.cards[0].w, 0.66 * width, 3), `${tag}: active card ~66vw (${s0.cards[0].w.toFixed(1)} vs ${(0.66 * width).toFixed(1)})`);
      assert(near(s0.cards[0].h, width * 460 / 450, 2), `${tag}: cards as tall as Figma's mobile variant, 460 in a 450 frame (${s0.cards[0].h.toFixed(1)} vs ${(width * 460 / 450).toFixed(1)})`);
      assert(s0.cards.every(c => near(c.imgW, s0.cards[0].w, 1)), `${tag}: every photo is as wide as the active card (${s0.cards.map(c => c.imgW)})`);
      assert(s0.cards.slice(1).every(c => near(c.w, 0.15 * width, 3)), `${tag}: inactive cards ~15vw (${s0.cards.slice(1).map(c => c.w.toFixed(1))})`);
      const cs = await page.evaluate(s => { const c = getComputedStyle(document.querySelector(s)); return { ox: c.overflowX, snap: c.scrollSnapType, gap: c.columnGap, sb: c.scrollbarWidth }; }, SEL);
      assert(cs.ox === 'auto' && cs.snap.includes('mandatory') && cs.gap === '7px' && cs.sb === 'none', `${tag}: scroll-snap scroller, 7px gap, no scrollbar ${JSON.stringify(cs)}`);
      await shot(page, `phone-${width}-rest.png`);
      const c1 = await centre(page, 1);
      await page.mouse.click(c1.x, c1.y);
      await sleep(950);
      const s1 = await snap(page);
      assert(s1.api === 1 && s1.cards[1].pressed === 'true' && near(s1.cards[1].w, 0.66 * width, 3) && near(s1.cards[0].w, 0.15 * width, 3), `${tag}: tapping card 1 makes it 66vw (${s1.cards.map(c => c.w.toFixed(0))})`);
      assert(near(s1.cards[1].left, 20, 3) && s1.cards[1].left + s1.cards[1].w <= width + 2, `${tag}: the tapped card scrolled to the start of the scroller, fully in view (left ${s1.cards[1].left.toFixed(0)} vs 20)`);
      await page.mouse.move(5, 5); await sleep(900);
      assert((await snap(page)).api === 1, `${tag}: moving off the phone gallery does not reset it`);
      await shot(page, `phone-${width}-card1.png`);
    }
  } finally { await close(); }
}

// ---- viewport crossing the 720px breakpoint switches layout live -------------------------------
if (want('breakpoint')) {
  const { page, close } = await openPage({ width: 1000, height: 900 });
  try {
    await wait(page); await reveal(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await sleep(300);
    const s = await snap(page);
    assert(near(s.cards[0].w, 0.66 * 375, 3) && s.sw > s.cw, `1000 -> 375: phone widths and scroller (${s.cards[0].w.toFixed(0)})`);
    await page.setViewportSize({ width: 1000, height: 900 });
    await sleep(300);
    const d = await snap(page), inactive = (d.inner - 50) / (5 + 460 / 178);
    assert(near(d.cards[0].w, inactive * 460 / 178, 3) && near(d.cards[1].w, inactive, 3), `375 -> 1000: desktop widths again (${d.cards[0].w.toFixed(0)})`);
  } finally { await close(); }
}

// ---- reduced motion: final layout at once, no bend ---------------------------------------------
if (want('reduced')) {
  const { page, errors, close } = await openPage({ width: 1440, height: 900, reducedMotion: true });
  try {
    await wait(page); await reveal(page);
    await page.evaluate(() => {
      window.__rm = { bent: 0 };
      const vs = [...document.querySelectorAll('.hover-gallery__visual')];
      const tick = () => { vs.forEach(v => { const nums = (v.style.clipPath.match(/-?\d+(\.\d+)?/g) || []); if (nums.length > 8) window.__rm.bent++; }); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await hover(page, 3);
    await sleep(50);
    const s = await snap(page);
    const inactive = (s.inner - 50) / (5 + 460 / 178);
    assert(s.api === 3 && near(s.cards[3].w, inactive * 460 / 178, 3) && near(s.cards[0].w, inactive, 3), `reduced-motion: hover sets the final widths within 50ms (${s.cards[3].w.toFixed(0)} / ${s.cards[0].w.toFixed(0)})`);
    await sleep(300);
    assert((await page.evaluate(() => window.__rm.bent)) === 0, 'reduced-motion: no frame ever carried a bent clip-path');
    assert(errors.length === 0, `reduced-motion: no console errors ${errors.join('|')}`);
  } finally { await close(); }
}

// ---- no JS: static row, all six photos visible -------------------------------------------------
if (want('nojs')) {
  const { page, close } = await openPage({ width: 1440, js: false });
  try {
    const s = await snap(page);
    assert(s.n === 6 && s.cards.every(c => c.w > 50 && c.h > 300) && s.cards[0].w > s.cards[1].w * 2, `no-JS: six cards in a static row, first one wide (${s.cards.map(c => c.w.toFixed(0))})`);
  } finally { await close(); }
}

await report();
