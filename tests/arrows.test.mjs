// Previous / next arrows on the click carousel (social; the team photos are the hover gallery now).
// ARROWS_ONLY=a,b runs just those blocks (used for the mutation runs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/arrows');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const want = k => !process.env.ARROWS_ONLY || process.env.ARROWS_ONLY.split(',').includes(k);
const mod = (a, n) => ((a % n) + n) % n;

const CASES = {
  social: { prev: 'Vorheriger Beitrag', next: 'Nächster Beitrag', word: 'Beitrag', n: 4, colour: 'rgb(0, 0, 0)' },
};
const sel = name => `.carousel[data-carousel="${name}"]`;
const arrow = (page, name, which) => page.locator(`${sel(name)} ~ .carousel__arrow--${which}`);

const reveal = async (page, name) => {
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center', behavior: 'instant' }), sel(name));
  await sleep(80);
};
const state = (page, name) => page.evaluate(s => {
  const root = document.querySelector(s), api = root.__carousel;
  const rr = root.getBoundingClientRect(), mid = rr.left + rr.width / 2;
  const items = [...root.querySelectorAll('.carousel__item')].map(el => { const r = el.getBoundingClientRect(); return { idx: +el.dataset.carouselIndex, cx: (r.left + r.right) / 2 }; });
  const c = items.reduce((a, b) => Math.abs(b.cx - mid) < Math.abs(a.cx - mid) ? b : a);
  return { index: api ? api.index() : null, live: root.querySelector('.carousel__live')?.textContent ?? null, centreIdx: c.idx, off: Math.abs(c.cx - mid), rw: rr.width };
}, sel(name));
const arrowInfo = (page, name) => page.evaluate(s => {
  const root = document.querySelector(s), rr = root.getBoundingClientRect();
  return [...root.parentElement.querySelectorAll(':scope > .carousel__arrow')].map(b => {
    const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return {
      tag: b.tagName, type: b.getAttribute('type'), label: b.getAttribute('aria-label'), cls: b.className,
      w: r.width, h: r.height, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, left: r.left, right: r.right,
      colour: cs.color, display: cs.display, visibility: cs.visibility, svg: !!b.querySelector('svg'),
      hitSelf: !!hit && b.contains(hit),
      afterRoot: !!(root.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING),
      rootCx: rr.left + rr.width / 2, rootCy: rr.top + rr.height / 2, rootW: rr.width,
    };
  });
}, sel(name));
const overflow = page => page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);

for (const width of [1440, 375]) {
  const height = width === 1440 ? 900 : 812;
  for (const name of Object.keys(CASES)) {
    const C = CASES[name], tag = `${name}@${width}`;

    if (want('main')) {
      const { page, errors, close } = await openPage({ width, height });
      try {
        await page.waitForSelector(`${sel(name)}.is-enhanced`, { timeout: 5000 }).catch(() => {});
        await reveal(page, name);
        const info = await arrowInfo(page, name);
        assert(info.length === 2, `${tag}: two arrows next to the carousel (${info.length})`);
        const [p, n] = [info.find(i => /--prev/.test(i.cls)), info.find(i => /--next/.test(i.cls))];
        assert(p && n, `${tag}: a prev and a next arrow exist`);
        if (p && n) {
          assert(p.tag === 'BUTTON' && n.tag === 'BUTTON' && p.type === 'button' && n.type === 'button', `${tag}: real <button type="button"> elements`);
          assert(p.label === C.prev && n.label === C.next, `${tag}: aria-labels "${p.label}" / "${n.label}"`);
          assert(p.svg && n.svg, `${tag}: each arrow draws an inline SVG chevron`);
          assert(p.w >= 44 && p.h >= 44 && n.w >= 44 && n.h >= 44, `${tag}: hit targets >= 44x44 (${p.w.toFixed(1)}x${p.h.toFixed(1)}, ${n.w.toFixed(1)}x${n.h.toFixed(1)})`);
          if (width >= 1200) assert(p.w >= 52 && p.w <= 60, `${tag}: about 56px on desktop (${p.w.toFixed(1)})`);
          assert(p.display !== 'none' && p.visibility === 'visible' && n.display !== 'none', `${tag}: arrows are displayed`);
          assert(p.left >= 0 && n.right <= width, `${tag}: arrows inside the viewport (${p.left.toFixed(1)}, ${n.right.toFixed(1)} of ${width})`);
          assert(p.cx < p.rootCx - p.rootW * 0.25 && n.cx > n.rootCx + n.rootW * 0.25, `${tag}: prev on the left edge, next on the right edge`);
          assert(Math.abs(p.cy - p.rootCy) <= 3 && Math.abs(n.cy - n.rootCy) <= 3, `${tag}: vertically centred on the cards (${p.cy.toFixed(1)}, ${n.cy.toFixed(1)} vs ${p.rootCy.toFixed(1)})`);
          assert(p.colour === C.colour && n.colour === C.colour, `${tag}: arrow colour ${p.colour} for this background`);
          assert(p.hitSelf && n.hitSelf, `${tag}: nothing covers the arrows (hit test lands on them)`);
          assert(p.afterRoot && n.afterRoot, `${tag}: Tab order is carousel, then prev, then next (both arrows follow the carousel in the DOM)`);
        }
        await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`) });

        // next/prev move the index by one; a full lap returns to the start; prev wraps below 0
        const s0 = await state(page, name), start = s0.index;
        let ok = true, seen = [];
        for (let k = 1; k <= C.n; k++) {
          await arrow(page, name, 'next').click();
          const i = (await state(page, name)).index;
          seen.push(i);
          if (i !== mod(start + k, C.n)) ok = false;
          await sleep(90);
        }
        assert(ok, `${tag}: ${C.n} clicks on next step the index +1 each and wrap back to the start ${JSON.stringify(seen)}`);
        await sleep(900);
        const afterLoop = await state(page, name);
        assert(afterLoop.index === start && afterLoop.centreIdx === start && afterLoop.off <= afterLoop.rw * 0.02, `${tag}: after the lap card ${start} is centred again`);

        await arrow(page, name, 'next').click();
        await sleep(900);
        const a1 = await state(page, name);
        assert(a1.index === mod(start + 1, C.n) && a1.live === `${C.word} ${mod(start + 1, C.n) + 1} von ${C.n}`, `${tag}: next announces "${a1.live}"`);
        await arrow(page, name, 'prev').click();
        await sleep(900);
        const a2 = await state(page, name);
        assert(a2.index === start && a2.live === `${C.word} ${start + 1} von ${C.n}`, `${tag}: prev announces "${a2.live}"`);
        assert(a2.centreIdx === start && a2.off <= a2.rw * 0.02, `${tag}: prev settles centred`);

        ok = true; seen = [];
        for (let k = 1; k <= C.n; k++) {
          await arrow(page, name, 'prev').click();
          const i = (await state(page, name)).index;
          seen.push(i);
          if (i !== mod(start - k, C.n)) ok = false;
          await sleep(90);
        }
        assert(ok, `${tag}: ${C.n} clicks on prev step the index -1 each, wrapping past 0 ${JSON.stringify(seen)}`);
        await sleep(900);

        // keyboard: Enter and Space on a focused arrow
        const k0 = (await state(page, name)).index;
        await arrow(page, name, 'next').focus();
        await page.keyboard.press('Enter');
        await sleep(120);
        const kEnter = (await state(page, name)).index;
        await page.keyboard.press('Space');
        await sleep(120);
        const kSpace = (await state(page, name)).index;
        assert(kEnter === mod(k0 + 1, C.n) && kSpace === mod(k0 + 2, C.n), `${tag}: Enter and Space on the focused next arrow each advance one (${k0} -> ${kEnter} -> ${kSpace})`);
        await arrow(page, name, 'prev').focus();
        await page.keyboard.press('Enter');
        await sleep(120);
        const kPrev = (await state(page, name)).index;
        assert(kPrev === mod(k0 + 1, C.n), `${tag}: Enter on the focused prev arrow goes back one (${kPrev})`);
        await sleep(800);

        // rapid clicks must not desync the loop
        const r0 = (await state(page, name)).index;
        for (let k = 0; k < 5; k++) await arrow(page, name, 'next').click();
        await sleep(1000);
        const r1 = await state(page, name);
        assert(r1.index === mod(r0 + 5, C.n) && r1.centreIdx === r1.index && r1.off <= r1.rw * 0.02, `${tag}: 5 rapid clicks -> index +5 and the card is centred (${r0} -> ${r1.index}, centre card ${r1.centreIdx}, off ${r1.off.toFixed(1)}px)`);

        const sw = await overflow(page);
        assert(sw[0] <= sw[1], `${tag}: no horizontal overflow (${sw[0]} <= ${sw[1]})`);
        assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);
      } finally { await close(); }
    }
  }
}

// ---- no JS: the scroll-snap row is all there is, no arrows -------------------------------------
if (want('nojs')) {
  for (const width of [1440, 375]) {
    const { page, close } = await openPage({ width, js: false });
    try {
      const r = await page.evaluate(() => ({ arrows: document.querySelectorAll('.carousel__arrow').length, wraps: document.querySelectorAll('.carousel-wrap').length }));
      assert(r.arrows === 0 && r.wraps === 0, `no-JS @${width}: no arrows and no wrapper (${r.arrows}/${r.wraps})`);
      const sw = await overflow(page);
      assert(sw[0] <= sw[1], `no-JS @${width}: no horizontal overflow (${sw[0]} <= ${sw[1]})`);
    } finally { await close(); }
  }
}

// ---- reduced motion: no enhancement, the arrows scroll the snap row by one item ----------------
if (want('reduced')) {
  for (const width of [1440, 375]) {
    const height = width === 1440 ? 900 : 812;
    const { page, errors, close } = await openPage({ width, height, reducedMotion: true });
    try {
      await sleep(400);
      for (const name of Object.keys(CASES)) {
        const C = CASES[name], t = `reduced-motion @${width} ${name}`;
        await reveal(page, name);
        const geo = await page.evaluate(s => {
          const root = document.querySelector(s), it = root.querySelectorAll('.carousel__item');
          // the snap position of the second item: start-aligned rows land one pitch along, centre-aligned ones centre it
          const centre = getComputedStyle(it[1]).scrollSnapAlign.includes('center');
          const next = centre ? Math.max(0, Math.min(root.scrollWidth - root.clientWidth, it[1].offsetLeft + it[1].offsetWidth / 2 - root.clientWidth / 2)) : it[1].offsetLeft - it[0].offsetLeft;
          return { pitch: next, max: root.scrollWidth - root.clientWidth, enhanced: root.classList.contains('is-enhanced'), api: !!root.__carousel };
        }, sel(name));
        assert(!geo.enhanced && !geo.api, `${t}: still the plain scroll-snap row`);
        const info = await arrowInfo(page, name);
        if (geo.max <= 2) {
          // all four social cards fit at 1440, so there is nothing to scroll and the arrows are not shown
          assert(info.every(i => i.display === 'none'), `${t}: row has nothing to scroll (max ${geo.max}px), arrows hidden`);
          continue;
        }
        assert(info.length === 2 && info.every(i => i.display !== 'none' && i.w >= 44 && i.h >= 44), `${t}: both arrows visible and >= 44x44 (${info.map(i => i.w.toFixed(0) + 'x' + i.h.toFixed(0))})`);
        assert(info.every(i => i.hitSelf), `${t}: nothing covers the arrows`);
        const x0 = await page.evaluate(s => document.querySelector(s).scrollLeft, sel(name));
        await arrow(page, name, 'next').click();
        await sleep(500);
        const x1 = await page.evaluate(s => document.querySelector(s).scrollLeft, sel(name));
        assert(Math.abs(x1 - x0 - geo.pitch) <= 3, `${t}: next scrolls the row by one item, to the next snap point (${x0} -> ${x1}, expected ${geo.pitch.toFixed(0)})`);
        await arrow(page, name, 'prev').click();
        await sleep(500);
        const x2 = await page.evaluate(s => document.querySelector(s).scrollLeft, sel(name));
        assert(Math.abs(x2 - x0) <= 3, `${t}: prev scrolls back (${x1} -> ${x2})`);
        await arrow(page, name, 'prev').click();
        await sleep(500);
        const x3 = await page.evaluate(s => document.querySelector(s).scrollLeft, sel(name));
        assert(x3 >= geo.max - 3, `${t}: prev at the start wraps to the end (${x3} of ${geo.max})`);
      }
      const sw = await overflow(page);
      assert(sw[0] <= sw[1], `reduced-motion @${width}: no horizontal overflow (${sw[0]} <= ${sw[1]})`);
      assert(errors.length === 0, `reduced-motion @${width}: no console errors ${errors.join('|')}`);
    } finally { await close(); }
  }
}

await report();
