// Review rotator (js/reviews.js, css/reviews.css, the .reviews__* rules in css/site.css, the reviews section of index.html).
// RV_ONLY=text,rotation,... runs just those blocks (used for the mutation runs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/reviews');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const want = k => !process.env.RV_ONLY || process.env.RV_ONLY.split(',').includes(k);
const SPEED = 25;   // gsap.globalTimeline.timeScale for the long rotation runs

// The client's list, copied here on purpose: the page must match it character for character, emoji included.
const EXPECTED = [
 {
  "name": "Stefan Teichrib",
  "text": "Meiner Meinung nach ist der Chef Abdul ein Künstler. Auch wenn ich mit meinem Neffen dorthin gehe wird sich wunderbar um die Kundschaft gekümmert und ich bin eigentlich nie unzufrieden wieder heraus gegangen."
 },
 {
  "name": "Nikolaj Penner",
  "text": "Es gibt immer einen tadellosen Service, eine freundliche Atmosphäre und vor allem vorhersehbar hervorragende Ergebnisse. Sie verlassen den Friseursalon nicht nur mit einem perfekten Haarschnitt, sondern auch mit bester Laune. Ich wünsche Ihrem Familienunternehmen Wohlstand und noch mehr dankbare Kunden!"
 },
 {
  "name": "Günter Heck",
  "text": "Ich war heute erst zum 2. Mal dort und bin mal wieder vollkommen zufrieden. Auch diesmal wieder ohne Voranmeldung keine Wartezeit. Im Salon herrscht eine entspannte Atmosphäre und das gesamte Team ist ausgesprochen freundlich und arbeitet professionell. Ich kann \"mtm\" nur empfehlen."
 },
 {
  "name": "Freudensprung- Jetzt",
  "text": "Es herrscht eine super nette Atmosphäre, auf meine speziellen Wünsche wurde geduldig eingegangen und ich bin happy mit meinem Haarschnitt! Herzlichen Dank!"
 },
 {
  "name": "Martina Giesen",
  "text": "Heute das erstemal spontan mit Junior dort gewesen. Super nettes Team, toller Haarschnitt und sehr Kinderfreundlich .Wir kommen gerne wieder."
 },
 {
  "name": "Lars Rütjes",
  "text": "Bester Friseur bei dem ich jemals war, der Chef lässt dich erst gehen wenn dein Kopf perfekt aussieht und du zufrieden bist👌"
 },
 {
  "name": "Stefan Teichrib",
  "text": "Ich bin sehr zufrieden mit dem Friseur. Ich war heute das erste mal dort und mir wurde direkt etwas zu trinken angeboten und auf meine Wünsche, was die Frisur betrifft, wurde komplett eingegangen. Ich werde definitiv wieder dorthin gehen."
 },
 {
  "name": "Anonym",
  "text": "Seit Jahren ein wunderschöner Laden und immer gut gelaunte Mitarbeiter. Ich liebe euren Friseurladen.❤️"
 },
 {
  "name": "Amy Groffner",
  "text": "Schneiden sehr gut wenig Wartezeiten und qualität top außerdem sind sie sehr höflich und man fühlt sich willkommen"
 },
 {
  "name": "viel Mühe",
  "text": "Ich gehe schon seit 3 Jahren bei Mohamad Haarschneiden und bin sehr zufrieden wirklich top Preise und top Qualität 👍🏻"
 },
 {
  "name": "Michael Beck",
  "text": "Echt ein sehr guter Frisör der beste in der ganzen Gegend, er versteht sein Handwerk, war heute Haare schneiden alles sehr gut drauf sehr herzlich bedient worden er ist auf jeden Fall zu empfehlen der Besuch lohnt sich 100%"
 }
];

const CARD = '.reviews__card', LIST = '.reviews__list', Q = '.reviews__quote';
const reveal = async page => {
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center', behavior: 'instant' }), CARD);
  await sleep(150);
};
// gsap's lag smoothing stretches the timeline when the machine stalls; the real-speed timing checks want wall-clock time
const noLag = page => page.evaluate(() => { window.gsap.ticker.lagSmoothing(0); });
const speed = (page, k) => page.evaluate(k => { window.gsap.globalTimeline.timeScale(k); }, k);
const api = page => page.evaluate(s => { const a = document.querySelector(s).__reviews; return a ? { i: a.index(), paused: a.paused(), r: a.reasons() } : null; }, LIST);
// in-page recorder: every change of the shown index, with the list/card heights and every figure's opacity / ty sampled on each frame
const startRecorder = page => page.evaluate(([L, C, Qs]) => {
  const list = document.querySelector(L), card = document.querySelector(C), items = [...document.querySelectorAll(Qs)];
  const rec = { changes: [], heights: new Set(), cardHeights: new Set(), samples: [], stop: false, t0: performance.now() };
  let last = list.__reviews.index();
  rec.changes.push({ i: last, t: 0 });
  const ty = el => { const m = getComputedStyle(el).transform; if (m === 'none') return 0; return new DOMMatrix(m).m42; };
  (function tick() {
    const t = performance.now() - rec.t0, now = list.__reviews.index();
    if (now !== last) { rec.changes.push({ i: now, t }); last = now; }
    rec.heights.add(list.getBoundingClientRect().height); rec.cardHeights.add(card.getBoundingClientRect().height);
    rec.samples.push({ t, op: items.map(e => parseFloat(getComputedStyle(e).opacity)), ty: items.map(ty), tr: items.map(e => getComputedStyle(e).transform), inl: items.map(e => e.style.transform) });
    if (!rec.stop) requestAnimationFrame(tick);
  })();
  window.__rec = rec;
}, [LIST, CARD, Q]);
const stopRecorder = page => page.evaluate(() => { window.__rec.stop = true; const r = window.__rec; return { changes: r.changes, heights: [...r.heights], cardHeights: [...r.cardHeights], samples: r.samples }; });
const waitChanges = async (page, n, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await page.evaluate(() => window.__rec.changes.length)) >= n) return true; await sleep(100); }
  return false;
};
const isPerm = (seq, n) => seq.length === n && new Set(seq).size === n;

// ---- 1. the 11 reviews are in the page, byte for byte --------------------------------------------
if (want('text')) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  EXPECTED.forEach((r, k) => {
    assert(html.includes(`<blockquote><p>${esc(r.text)}</p></blockquote>`), `source: review ${k + 1} text is in index.html byte-identical (${r.name})`);
    assert(html.includes(`<span class="reviews__name">${esc(r.name)}</span>`), `source: review ${k + 1} name is in index.html byte-identical`);
  });
  const { page, errors, close } = await openPage({ width: 1440 });
  try {
    const got = await page.evaluate(() => [...document.querySelectorAll('.reviews__quote')].map(f => ({
      text: f.querySelector('blockquote p').textContent, name: f.querySelector('.reviews__name').textContent,
      stars: f.querySelector('.reviews__stars .sr-only').textContent, n: f.querySelectorAll('blockquote, figcaption').length })));
    assert(got.length === EXPECTED.length, `DOM: ${got.length} reviews, expected ${EXPECTED.length}`);
    got.forEach((g, k) => {
      assert(g.text === EXPECTED[k].text, `DOM: review ${k + 1} text equals the list (${[...g.text].length} chars)`);
      assert(g.name === EXPECTED[k].name, `DOM: review ${k + 1} name equals "${EXPECTED[k].name}"`);
      assert(g.stars === '5 von 5 Sternen', `DOM: review ${k + 1} has the "5 von 5 Sternen" text`);
    });
    const dates = await page.evaluate(() => document.querySelector('.reviews').querySelectorAll('time').length);
    assert(dates === 0, 'no dates (no <time> elements)');
    assert(await page.evaluate(() => !document.querySelector('.reviews [aria-live]')), 'no aria-live region in the reviews section');
    assert(errors.length === 0, `no console errors (${errors.join('; ')})`);
  } catch (e) { console.log("ERR", e.message); assert(false, "block threw: " + e.message.split("\n")[0]); } finally { try { await close(); } catch {} }
}

// ---- 2. without JS: first review shows, box height is the same ------------------------------------
if (want('nojs')) {
  const heights = {};
  for (const js of [true, false]) {
    const { page, close } = await openPage({ width: 1440, js });
    try {
      await reveal(page);
      const m = await page.evaluate(([L, Qs]) => {
        const items = [...document.querySelectorAll(Qs)];
        return { vis: items.map(e => getComputedStyle(e).visibility), op: items.map(e => getComputedStyle(e).opacity), h: document.querySelector(L).getBoundingClientRect().height };
      }, [LIST, Q]);
      heights[js] = m.h;
      assert(m.vis.filter(v => v === 'visible').length === 1 && m.vis[0] === 'visible', `js=${js}: exactly one review visible at load, the first`);
      assert(m.op[0] === '1', `js=${js}: the first review is opaque`);
    } catch (e) { console.log("ERR", e.message); assert(false, "block threw: " + e.message.split("\n")[0]); } finally { try { await close(); } catch {} }
  }
  assert(Math.abs(heights[true] - heights[false]) < 0.5, `box height with and without JS: ${heights[true]} vs ${heights[false]}`);
}

// ---- 3. rotation: every review once per cycle, no repeat, box height constant ---------------------
if (want('rotation')) {
  const { page, errors, close } = await openPage({ width: 1440 });
  try {
    await reveal(page);
    const a0 = await api(page);
    assert(a0 && a0.i === 0, 'script ran: the first review is the one shown at the start');
    await speed(page, SPEED);
    await startRecorder(page);
    const ok = await waitChanges(page, 23, 40000);   // start + 22 swaps = two full cycles
    const r = await stopRecorder(page);
    assert(ok, `recorded 22 swaps (${r.changes.length - 1})`);
    const seq = r.changes.map(c => c.i).slice(0, 23);
    console.log('  order:', seq.join(' '));
    assert(isPerm(seq.slice(0, 11), 11), 'cycle 1: all 11 reviews shown once, the first one from the start');
    assert(isPerm(seq.slice(11, 22), 11), 'cycle 2: all 11 reviews shown once');
    assert(seq.every((v, k) => k === 0 || v !== seq[k - 1]), 'no review twice in a row, including across the cycle boundary');
    assert(JSON.stringify(seq.slice(0, 11)) !== JSON.stringify(seq.slice(11, 22)), 'the two cycles are in different order (random)');
    assert(r.heights.length === 1 && r.cardHeights.length === 1, `box and card height constant over ${r.samples.length} frames (box ${r.heights}, card ${r.cardHeights})`);
    // at rest exactly the shown review is visible
    await sleep(100);
    const end = await page.evaluate(([L, Qs]) => { const l = document.querySelector(L); return { i: l.__reviews.index(), hid: [...document.querySelectorAll(Qs)].map(e => e.getAttribute('aria-hidden')) }; }, [LIST, Q]);
    assert(end.hid.filter(h => h === null).length === 1 && end.hid[end.i] === null, 'aria-hidden is on every review except the shown one');
    assert(errors.length === 0, `no console errors (${errors.join('; ')})`);
  } catch (e) { console.log("ERR", e.message); assert(false, "block threw: " + e.message.split("\n")[0]); } finally { try { await close(); } catch {} }
}

// ---- 3b. many cycles at high speed: every cycle complete, no repeat at any cycle boundary --------------
if (want('cycles')) {
  const { page, close } = await openPage({ width: 1440 });
  try {
    await reveal(page);
    const CYCLES = 40;
    await speed(page, 150);
    const t0 = Date.now();
    let h = [];
    while (Date.now() - t0 < 80000) { h = await page.evaluate(s => document.querySelector(s).__reviews.history(), LIST); if (h.length >= 11 * CYCLES + 1) break; await sleep(250); }
    assert(h.length >= 11 * CYCLES + 1, `${CYCLES} cycles recorded (${h.length - 1} swaps in ${Date.now() - t0} ms)`);
    h = h.slice(0, 11 * CYCLES);
    let bad = 0, repeats = 0;
    for (let c = 0; c < CYCLES; c++) if (new Set(h.slice(c * 11, c * 11 + 11)).size !== 11) bad++;
    for (let k = 1; k < h.length; k++) if (h[k] === h[k - 1]) repeats++;
    assert(bad === 0, `every one of ${CYCLES} cycles shows all 11 reviews exactly once (${bad} incomplete)`);
    assert(repeats === 0, `no review twice in a row over ${h.length} swaps, ${CYCLES - 1} cycle boundaries included (${repeats} repeats)`);
    assert(new Set(h.slice(11).filter((_, k) => k % 11 === 0)).size > 3, 'cycles do not all open with the same review');
  } finally { await close(); }
}

// ---- 4. real-speed motion: durations, offsets, hold, outgoing ends before incoming starts ----------
if (want('motion')) {
  const { page, close } = await openPage({ width: 1440 });
  try {
    await reveal(page);
    await noLag(page);
    await startRecorder(page);
    const ok = await waitChanges(page, 3, 45000);   // two swaps at real speed
    const r = await stopRecorder(page);
    assert(ok, `two swaps recorded at real speed (${r.changes.length - 1})`);
    const [c0, c1, c2] = r.changes;
    const len = i => EXPECTED[i].text.length;   // astral emoji count as 2, the same as in JS
    const hold = i => Math.min(10, 4 + 0.04 * len(i)) * 1000;
    // hold of review 0 (capped at 10 s) runs from the start; the next hold starts after the 0.75 s swap
    assert(Math.abs(c1.t - hold(0)) < 350, `hold of review 1: swap at ${Math.round(c1.t)} ms, expected ${hold(0)} (capped at 10 s)`);
    assert(Math.abs((c2.t - c1.t) - (750 + hold(c1.i))) < 350, `hold of review ${c1.i + 1} (${len(c1.i)} chars): ${Math.round(c2.t - c1.t)} ms between swaps, expected ${Math.round(750 + hold(c1.i))}`);
    // transition 1: outgoing = c0.i, incoming = c1.i
    const win = r.samples.filter(s => s.t >= c1.t - 30 && s.t <= c1.t + 1000);
    const out = c0.i, inn = c1.i;
    const tOutEnd = win.find(s => s.op[out] <= 0.001)?.t - c1.t, tInEnd = win.find(s => s.t > c1.t + 400 && s.op[inn] >= 0.999)?.t - c1.t;
    const tInStart = win.find(s => s.op[inn] > 0.02)?.t - c1.t;
    assert(Math.abs(tOutEnd - 300) < 90, `outgoing fades out in ~300 ms (${Math.round(tOutEnd)} ms)`);
    assert(Math.abs(tInEnd - 750) < 90, `incoming is fully in after ~750 ms (${Math.round(tInEnd)} ms)`);
    assert(tInStart >= 250, `incoming starts only after the outgoing one ended (first visible at ${Math.round(tInStart)} ms)`);
    assert(win.every(s => s.op.filter(o => o > 0.03).length <= 1), 'never two reviews visible at once');
    const tyOut = win.map(s => s.ty[out]), tyIn = win.map(s => s.ty[inn]);
    assert(Math.min(...tyOut) < -6.5 && Math.min(...tyOut) >= -8.001 && Math.max(...tyOut) <= 0.001, `outgoing moves 0 -> -8px (min ${Math.min(...tyOut).toFixed(2)})`);
    assert(Math.max(...tyIn) > 6 && Math.max(...tyIn) <= 8.001 && Math.min(...tyIn) >= -0.001, `incoming moves 8px -> 0 (max ${Math.max(...tyIn).toFixed(2)})`);
    const settled = r.samples.filter(s => s.t >= c1.t + 900 && s.t <= c2.t - 100);
    assert(settled.length > 10 && settled.every(s => s.tr.every(t => t === 'none')), 'at rest no figure carries a transform');
  } catch (e) { console.log("ERR", e.message); assert(false, "block threw: " + e.message.split("\n")[0]); } finally { try { await close(); } catch {} }
}

// ---- 5. pause: hover, focus inside, offscreen, hidden tab ------------------------------------------
if (want('pause')) {
  const { page, close } = await openPage({ width: 1440 });
  try {
    await speed(page, SPEED);
    // offscreen at load (the card is far below the fold): must not rotate
    const off0 = await api(page);
    await sleep(1500);
    const off1 = await api(page);
    assert(off0.r.offscreen && off1.i === off0.i && off1.paused, `offscreen: does not rotate (index ${off0.i} -> ${off1.i}, reasons ${JSON.stringify(off1.r)})`);
    await reveal(page);
    // runs when on screen: precondition for every pause check
    await startRecorder(page);
    assert(await waitChanges(page, 3, 15000), 'on screen: it rotates (precondition)');
    await stopRecorder(page);
    const still = async (label, reason) => {
      const a = await api(page);
      await sleep(1800);   // 45 s of gsap time at this speed: several swaps if it were running
      const b = await api(page);
      assert(a.r[reason] === true && b.i === a.i && b.paused, `${label}: shown review stays ${a.i} -> ${b.i} for 1.8 s at x${SPEED} (reasons ${JSON.stringify(b.r)})`);
    };
    const moves = async label => {
      const a = await api(page);
      await startRecorder(page);
      const ok = await waitChanges(page, 2, 15000);
      await stopRecorder(page);
      assert(ok, `${label}: rotation resumes`);
    };
    const box = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, CARD);
    await page.mouse.move(box.x, box.y);
    await still('hover', 'hover');
    await page.mouse.move(5, 5);
    await moves('after hover');
    await page.evaluate(s => { const b = document.createElement('button'); b.id = 'rv-probe'; b.textContent = 'x'; document.querySelector(s).appendChild(b); b.focus(); }, CARD);
    await still('focus inside the card', 'focus');
    await page.evaluate(() => document.getElementById('rv-probe').blur());
    await moves('after focus leaves');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await sleep(300);
    await still('scrolled offscreen', 'offscreen');
    await reveal(page);
    await moves('after scrolling back');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await still('tab hidden', 'hidden');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await moves('tab visible again');
  } catch (e) { console.log("ERR", e.message); assert(false, "block threw: " + e.message.split("\n")[0]); } finally { try { await close(); } catch {} }
}

// ---- 6. reduced motion: instant swap, no transform, same hold ----------------------------------------
if (want('reduced')) {
  const { page, close } = await openPage({ width: 1440, reducedMotion: true });
  try {
    await reveal(page);
    assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'reduced-motion emulation is on (precondition)');
    await noLag(page);
    await startRecorder(page);
    const ok = await waitChanges(page, 3, 45000);
    const r = await stopRecorder(page);
    assert(ok, `two swaps at real speed (${r.changes.length - 1})`);
    assert(r.samples.every(s => s.tr.every(t => t === 'none') && s.inl.every(t => t === '')), `no transform on any figure in ${r.samples.length} frames`);
    assert(r.samples.every(s => s.op.every(o => o === 0 || o === 1)), 'opacity is only ever 0 or 1 (instant swap)');
    const hold = i => Math.min(10, 4 + 0.04 * EXPECTED[i].text.length) * 1000;
    assert(Math.abs(r.changes[1].t - hold(0)) < 350, `same hold: first swap at ${Math.round(r.changes[1].t)} ms, expected ${hold(0)}`);
    assert(Math.abs((r.changes[2].t - r.changes[1].t) - hold(r.changes[1].i)) < 350, `same hold, no swap time added: ${Math.round(r.changes[2].t - r.changes[1].t)} ms, expected ${Math.round(hold(r.changes[1].i))}`);
  } catch (e) { console.log("ERR", e.message); assert(false, "block threw: " + e.message.split("\n")[0]); } finally { try { await close(); } catch {} }
}

// ---- 7. fit: every review inside the box, the box inside the card, at 4 widths -------------------------
if (want('fit')) {
  for (const w of [375, 768, 1440, 2560]) {
    const { page, close } = await openPage({ width: w, height: w === 375 ? 812 : 900, isMobile: w === 375, hasTouch: w === 375 });
    try {
      await reveal(page);
      assert(await page.evaluate(() => innerWidth) === w, `@${w}: viewport is ${w}px wide (precondition)`);
      const m = await page.evaluate(([C, L, Qs]) => {
        const card = document.querySelector(C), list = document.querySelector(L), cr = card.getBoundingClientRect(), lr = list.getBoundingClientRect();
        const cs = getComputedStyle(list), padT = parseFloat(cs.paddingTop), padB = parseFloat(cs.paddingBottom), padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
        const inner = { w: lr.width - padL - padR, h: lr.height - padT - padB };
        const items = [...document.querySelectorAll(Qs)].map(f => {
          const r = f.getBoundingClientRect(), p = f.querySelector('p'), cap = f.querySelector('figcaption');
          const lines = Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight));
          return { top: r.top, left: r.left, h: r.height, w: r.width, pOver: p.scrollWidth - p.clientWidth, capOver: cap.scrollWidth - cap.clientWidth, lines, bottom: r.bottom, right: r.right };
        });
        return { card: { w: cr.width, h: cr.height, top: cr.top, bottom: cr.bottom, left: cr.left, right: cr.right }, list: { w: lr.width, h: lr.height, top: lr.top, bottom: lr.bottom, left: lr.left, right: lr.right }, inner, items, fs: getComputedStyle(document.querySelector(Qs + ' p')).fontSize, docW: document.documentElement.scrollWidth };
      }, [CARD, LIST, Q]);
      const tallest = Math.max(...m.items.map(i => i.h));
      console.log(`  @${w}: card ${m.card.w.toFixed(0)}x${m.card.h.toFixed(0)}, box ${m.list.w.toFixed(0)}x${m.list.h.toFixed(0)}, text ${m.fs}, tallest review ${tallest.toFixed(1)}px (inner height ${m.inner.h.toFixed(1)}), room above/below in card ${(m.list.top - m.card.top).toFixed(1)} / ${(m.card.bottom - m.list.bottom).toFixed(1)}`);
      m.items.forEach((i, k) => {
        assert(i.h <= m.inner.h + 0.5, `@${w}: review ${k + 1} (${i.lines} lines, ${i.h.toFixed(1)}px) fits the box inner height ${m.inner.h.toFixed(1)}px`);
        assert(i.pOver <= 0 && i.capOver <= 0, `@${w}: review ${k + 1} has no horizontal overflow (p ${i.pOver}, caption ${i.capOver})`);
      });
      assert(m.items.every(i => Math.abs(i.top - m.items[0].top) < 0.5 && Math.abs(i.left - m.items[0].left) < 0.5), `@${w}: all reviews are stacked in one cell (same top and left)`);
      assert(m.inner.h <= tallest + 1, `@${w}: the box is only as tall as the tallest review (${m.inner.h.toFixed(1)} vs ${tallest.toFixed(1)})`);
      assert(m.list.top >= m.card.top && m.list.bottom <= m.card.bottom && m.list.left >= m.card.left && m.list.right <= m.card.right, `@${w}: the box lies inside the card, nothing cut off by its overflow:hidden`);
      if (w >= 768) assert(Math.abs(m.card.h - m.card.w * 667 / 975) < 1, `@${w}: the card keeps the Figma 975:667 ratio (${m.card.w.toFixed(0)}x${m.card.h.toFixed(0)}), the text did not grow it`);
      assert(m.docW <= w, `@${w}: no horizontal page scroll (${m.docW})`);
      const r = await page.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: 0, y: Math.max(0, b.top - 20), width: innerWidth, height: Math.min(innerHeight - Math.max(0, b.top - 20), b.height + 40) }; }, CARD);
      await page.screenshot({ path: path.join(OUT, `reviews-${w}.png`), clip: r });
    } catch (e) { console.log("ERR", e.message); assert(false, "block threw: " + e.message.split("\n")[0]); } finally { try { await close(); } catch {} }
  }
}

await report();
