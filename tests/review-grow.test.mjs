// Review card pin-and-grow (js/review-grow.js), 2026-11-13. Figma: the card 68:18 (975x610) grows into 284:240 (1436x859 at 1440).
// At 1440x900, 768x1024 and 2560x1440 (motion on):
//   1. before the pin the visible frame is exactly the card's box;
//   2. the card pins with its centre at the centre of the strip below the header, and stays there for one viewport of scroll;
//   3. at the end the visible frame is the viewport less 2px at the sides and 4px below the header and above the bottom;
//   4. the visible box only grows on the way down and only shrinks on the way back (scrub, reversible);
//   5. the review text keeps its size; the reviews box ends 20px (at 1440, scaled) right of the frame's centre, as in 284:240;
//   6. the "Termin Buchen" button is hidden at the start and fully shown at the end;
//   7. pixels: at the end the top-left corner below the header is the frame, at the start it is the white page;
// and at 375 (phone) and under reduced motion nothing is live: the frame is the card and the button stays hidden.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const READ = () => {
  const card = document.querySelector('.reviews__card').getBoundingClientRect(), f = document.querySelector('.reviews__frame'), fr = f.getBoundingClientRect();
  const iv = (getComputedStyle(f).clipPath.match(/inset\(([^)]*?)(?: round [^)]*)?\)/) || [])[1];   // 1-4 values: the browser writes the shortest form
  const q = iv ? iv.trim().split(/\s+/).map(parseFloat) : null, m = q ? [null, q[0], q[1] ?? q[0], q[2] ?? q[0], q[3] ?? q[1] ?? q[0]] : null;
  const vis = m ? { l: fr.left + +m[4], t: fr.top + +m[1], r: fr.right - +m[2], b: fr.bottom - +m[3] } : { l: fr.left, t: fr.top, r: fr.right, b: fr.bottom };
  const box = document.querySelector('.reviews__row') || document.querySelector('.reviews__list'), list = box.getBoundingClientRect(), btn = getComputedStyle(document.querySelector('.reviews__btn'));
  const plain = document.querySelector('.reviews__list').getBoundingClientRect();
  return { card: { l: card.left, t: card.top, w: card.width, h: card.height }, vis: { l: vis.l, t: vis.t, w: vis.r - vis.l, h: vis.b - vis.t },
    listCx: list.left + list.width / 2, boxW: list.width, plainW: plain.width, fontPx: parseFloat(getComputedStyle(document.querySelector('.reviews__quote p')).fontSize),
    btnOp: +btn.opacity, btnVis: btn.visibility, over: document.querySelector('.site-header').classList.contains('is-over-review'), hdBg: getComputedStyle(document.querySelector('.site-header')).backgroundColor, live: document.querySelector('.reviews').classList.contains('reviews--live'),
    nav: document.querySelector('.site-header').offsetHeight, vw: document.documentElement.clientWidth, vh: innerHeight };
};
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

for (const [w, h] of [[1440, 900], [768, 1024], [2560, 1440]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  await sleep(1000);
  const st = await page.evaluate(() => { const t = window.ScrollTrigger && ScrollTrigger.getById('review-grow'); return t ? { s: t.start, e: t.end } : null; });
  assert(!!st, `${tag}: the review-grow trigger exists`);
  if (!st) { await close(); continue; }
  const at = async y => { await page.evaluate(y => window.scrollTo(0, y), Math.round(y)); await sleep(1100); return page.evaluate(READ); };

  const pre = await at(st.s - 300);
  assert(pre.live, `${tag}: live`);
  assert(near(pre.vis.l, pre.card.l) && near(pre.vis.t, pre.card.t) && near(pre.vis.w, pre.card.w) && near(pre.vis.h, pre.card.h), `${tag} 1: before the pin the visible frame is the card's box (${JSON.stringify(pre.vis)} vs ${JSON.stringify(pre.card)})`);
  const s0 = await at(st.s);
  const wantTop = s0.vh / 2 - s0.card.h / 2;   // 2026-11-13: centred on the screen (the grown card fills it)
  assert(near(s0.card.t, wantTop), `${tag} 2: pinned with its centre at the centre of the screen (top ${s0.card.t.toFixed(1)}, wanted ${wantTop.toFixed(1)})`);
  assert(s0.btnOp === 0 && s0.btnVis === 'hidden', `${tag} 6: the button is hidden at the start (${s0.btnOp}, ${s0.btnVis})`);

  // 4: sweep down and back, the visible width
  const ys = []; for (let i = 0; i <= 10; i++) ys.push(st.s + (st.e - st.s) * i / 10);
  const down = []; for (const y of ys) down.push(await at(y));
  const up = []; for (const y of [...ys].reverse()) up.push(await at(y));
  const tops = down.map(r => r.card.t);
  assert(tops.every(t => near(t, s0.card.t)), `${tag} 2: the card stays pinned for the whole run (tops ${Math.min(...tops).toFixed(1)}..${Math.max(...tops).toFixed(1)})`);
  let shrink = 0, grow = 0;
  for (let i = 1; i < down.length; i++) if (down[i].vis.w < down[i - 1].vis.w - 0.5) shrink++;
  for (let i = 1; i < up.length; i++) if (up[i].vis.w > up[i - 1].vis.w + 0.5) grow++;
  assert(shrink === 0 && grow === 0, `${tag} 4: grows on the way down, shrinks on the way back (down ${down.map(r => Math.round(r.vis.w)).join(',')} | up ${up.map(r => Math.round(r.vis.w)).join(',')})`);
  assert(near(up[up.length - 1].vis.w, s0.card.w), `${tag} 4: back at the start it is the card again (${up[up.length - 1].vis.w.toFixed(1)})`);

  // 3, 5, 6 at the end
  const e = await at(st.e);
  const want = { l: 0, t: 0, w: e.vw, h: e.vh };   // 2026-11-13 (cofounder): the whole screen
  assert(near(e.vis.l, want.l) && near(e.vis.t, want.t) && near(e.vis.w, want.w) && near(e.vis.h, want.h), `${tag} 3: at the end it fills the whole screen (${JSON.stringify(Object.fromEntries(Object.entries(e.vis).map(([k, v]) => [k, +v.toFixed(1)])))} vs ${JSON.stringify(want)})`);
  assert(e.fontPx === s0.fontPx && near(e.boxW, e.plainW, 0.5), `${tag} 5: the review text keeps its size (${s0.fontPx} -> ${e.fontPx}px; box ${e.boxW.toFixed(1)} wide, unscaled ${e.plainW.toFixed(1)})`);
  const wantCx = e.vis.l + e.vis.w / 2;   // 2026-11-13 (cofounder): the reviews in the centre of the image
  assert(near(e.listCx, wantCx, 2), `${tag} 5: the reviews box ends in the frame's centre (${e.listCx.toFixed(1)} vs ${wantCx.toFixed(1)})`);
  assert(e.btnOp === 1 && e.btnVis === 'visible', `${tag} 6: the button shows at the end (${e.btnOp}, ${e.btnVis})`);
  // 8 (the white header turning see-through over the grown card) retired 2026-11-15: Desktop_new's header is a floating pill, never a white bar

  // 7: pixels
  // 2026-11-15, Desktop_new: the point read is just above and left of the card's corner (inside the reviews section's white margin);
  // at the end the grown frame covers it, at the start the white page shows there. Near the window's top the new layout can show Standorte.
  const pix = async () => page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const k = img.width / innerWidth, card = document.querySelector('.reviews__card').getBoundingClientRect();
    return [...x.getImageData(Math.round(Math.max(2, card.left - 8) * k), Math.round(Math.max(2, card.top - 8) * k), 1, 1).data.slice(0, 3)];
  }, (await page.screenshot()).toString('base64'));
  const endPx = await pix();
  await at(st.s); const startPx = await pix();
  assert(Math.min(...endPx) < 200 && Math.min(...startPx) > 245, `${tag} 7: just outside the card's corner: the frame at the end (${endPx}), the white page at the start (${startPx})`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}


// ---- the row (Figma 284:240 -> 278:143 -> 278:157): five reviews from the page, one centred per step, the rest at 50% -------------
for (const [w, h] of [[1440, 900], [768, 1024]]) {
  const tag = `@${w}x${h} row`;
  const { page, errors, close } = await openPage({ width: w, height: h });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  await sleep(1000);
  const info = await page.evaluate(() => {
    const g = window.reviewGrow, t = ScrollTrigger.getById('review-grow'), all = [...document.querySelectorAll('.reviews__list .reviews__quote blockquote')].map(b => b.textContent);
    return { n: g.items.length, texts: g.items.map(i => i.querySelector('blockquote').textContent), all, s: t.start, e: t.end, at: [0, 1, 2, 3, 4].map(k => g.stepAt(k)),
      held: document.querySelector('.reviews__list').__reviews.reasons().row };
  });
  assert(info.n === 5 && new Set(info.texts).size === 5 && info.texts.every(x => info.all.includes(x)), `${tag}: five different reviews, all from the page (${info.n})`);
  assert(info.held, `${tag}: the rotation is held while the row shows`);
  const step = async k => { await page.evaluate(y => window.scrollTo(0, y), Math.round(info.s + (info.e - info.s) * info.at[k])); await sleep(1300);
    return page.evaluate(() => { const fr = document.querySelector('.reviews__frame').getBoundingClientRect(), plain = document.querySelector('.reviews__list .reviews__quote').getBoundingClientRect(), vw = document.documentElement.clientWidth;
      return { home: plain.left - fr.left, pitch: plain.width * 547 / 420, items: window.reviewGrow.items.map(i => ({ x: i.getBoundingClientRect().left - fr.left, op: +getComputedStyle(i).opacity, vis: getComputedStyle(i).visibility })) }; }); };
  for (let k = 0; k < 5; k++) {
    const r = await step(k);
    const placed = r.items.every((it, i) => Math.abs(it.x - (r.home + (i - k) * r.pitch)) <= 3);
    const ops = r.items.every((it, i) => Math.abs(it.op - (i === k ? 1 : 0.5)) < 0.02 && it.vis === 'visible');
    assert(placed && ops, `${tag} step ${k}: review ${k + 1} centred at full opacity, the others one pitch apart at 50% (${r.items.map(it => Math.round(it.x) + '@' + it.op).join(' ')}; home ${r.home.toFixed(0)}, pitch ${r.pitch.toFixed(0)})`);
  }
  const back = await step(0);
  assert(Math.abs(back.items[0].x - back.home) <= 3 && back.items[0].op === 1, `${tag}: scrolling back brings review 1 back to the centre (${Math.round(back.items[0].x)})`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

for (const [w, h, rm, mobile] of [[375, 812, false, true], [1440, 900, true, false]]) {
  const tag = `@${w}x${h}${rm ? ' reduced-motion' : ''}`;
  const { page, close } = await openPage({ width: w, height: h, reducedMotion: rm, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1000);
  const r = await page.evaluate(READ);
  const trig = await page.evaluate(() => !!(window.ScrollTrigger && ScrollTrigger.getById('review-grow')) || !!document.querySelector('.reviews__row'));
  assert(!r.live && !trig && near(r.vis.w, r.card.w) && near(r.vis.h, r.card.h) && r.btnVis === 'hidden', `${tag}: nothing live, the frame is the card, the button hidden (live ${r.live}, trigger ${trig}, ${r.vis.w.toFixed(0)}x${r.vis.h.toFixed(0)} vs ${r.card.w.toFixed(0)}x${r.card.h.toFixed(0)}, ${r.btnVis})`);
  await close();
}

await report();
