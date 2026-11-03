// Intro paragraph (index.html .intro-text): forced break before "fünfte", no spacer hole, and the scroll-scrubbed word-by-word pop-up (js/word-reveal.js).
// Layout is measured with JS off (the plain HTML) and with JS on; the split must not move a single word.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/intro');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WIDTHS = [375, 768, 1440, 2560];
const HEIGHT = w => (w === 375 ? 812 : 900);
const phone = w => ({ isMobile: w === 375, hasTouch: w === 375 });   // 375 = a real mobile viewport
const SEL = '.intro-text';

// Items in reading order: every word piece (split at whitespace and after a hyphen) and every portrait.
// Split page: the .wr-word spans. Plain page: Range rects of the text nodes. Positions are relative to the paragraph.
const ITEMS = () => {
  const root = document.querySelector('.intro-text');
  const rr = root.getBoundingClientRect();
  const out = [];
  const push = (t, r, ot) => out.push({ t, l: r.left - rr.left, r: r.right - rr.left, top: r.top - rr.top, bottom: r.bottom - rr.top, ot });
  if (root.querySelector('.wr-word')) {
    root.querySelectorAll('.wr-word, img.intro-pic').forEach(e => push(e.tagName === 'IMG' ? '<img>' : e.textContent, e.getBoundingClientRect(), e.offsetTop));
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === 1) { if (n.tagName === 'IMG') push('<img>', n.getBoundingClientRect(), n.offsetTop); continue; }
      const re = /[^\s-]+-?|-/g; let m;
      while ((m = re.exec(n.nodeValue))) {
        const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        push(m[0], rg.getBoundingClientRect(), null);
      }
    }
  }
  const cs = getComputedStyle(root);
  return { items: out, h: rr.height, w: rr.width, iw: innerWidth, spaceW: (() => { const c = document.createElement('canvas').getContext('2d'); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; return c.measureText(' ').width; })() };
};
const read = page => page.evaluate(ITEMS);

// line index of every word piece (portraits excluded: they sit at a different height than the text)
const lineIdx = (items, key) => {
  const words = items.filter(i => i.t !== '<img>');
  const tops = [...new Set(words.map(i => Math.round(i[key])))].sort((a, b) => a - b);
  const rank = []; tops.forEach((t, i) => rank.push(i && t - tops[i - 1] <= 10 ? rank[i - 1] : (i ? rank[i - 1] + 1 : 0)));
  return words.map(i => rank[tops.indexOf(Math.round(i[key]))]);
};
const texts = items => items.map(i => i.t).join('|');

const opac = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s)].map(e => parseFloat(getComputedStyle(e).opacity)), sel);
const ty = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s)].map(e => { const t = getComputedStyle(e).transform; return t === 'none' ? 0 : new DOMMatrix(t).m42; }), sel);
const topOf = page => page.evaluate(s => document.querySelector(s).getBoundingClientRect().top, SEL);
const wheelTo = async (page, target, tol = 12) => {      // real wheel until the paragraph top is at `target` px from the viewport top
  for (let i = 0; i < 60; i++) {
    const d = (await topOf(page)) - target;
    if (Math.abs(d) <= tol) return;
    await page.mouse.wheel(0, Math.max(-600, Math.min(600, d)));
    await sleep(120);
  }
};
const IDENT = `${SEL} .wr-word, ${SEL} .intro-pic`;
const isDone = page => page.evaluate(s => { const e = [...document.querySelectorAll(s)]; return e.length > 0 && e.every(x => { const c = getComputedStyle(x), m = new DOMMatrix(c.transform === 'none' ? 'matrix(1,0,0,1,0,0)' : c.transform); return parseFloat(c.opacity) >= 0.999 && Math.abs(m.m42) < 0.01 && Math.abs(m.a - 1) < 0.001; }); }, IDENT);
const waitPlayed = async (page, ms = 3000) => {   // every word and portrait at opacity 1, y 0, scale 1
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await isDone(page)) return true; await sleep(100); }
  return false;
};
// real wheel until the paragraph centre is 100px above the viewport centre: past the point where everything must be in
const toDone = async page => {
  const target = await page.evaluate(s => (innerHeight - document.querySelector(s).getBoundingClientRect().height) / 2 - 100, SEL);
  await wheelTo(page, target); await sleep(200);
};

// ---- 1. markup, break before "fünfte", no hole (plain HTML, JS off, and the live page) -------------------------------------
for (const mode of ['plain', 'js']) {
  for (const w of WIDTHS) {
    const tag = `${mode}@${w}`;
    const { page, close } = await openPage({ width: w, height: HEIGHT(w), js: mode === 'js', ...phone(w) });
    try {
      await page.locator(SEL).scrollIntoViewIfNeeded();
      if (mode === 'js') { await toDone(page); await waitPlayed(page); }
      const iw = await page.evaluate(() => innerWidth);
      assert(iw === w, `${tag}: viewport is really ${w}px wide (got ${iw})`);
      const r = await read(page);
      const ws = r.items.filter(i => i.t !== '<img>');
      const iF = ws.findIndex(i => i.t === 'fünfte');
      assert(iF > 0 && ws[iF + 1].t === 'Generation.', `${tag}: found "fünfte Generation." in the text`);
      assert(ws[iF].top - ws[iF - 1].top > 20, `${tag}: "fünfte" starts a new line (${ws[iF - 1].t} is ${Math.round(ws[iF].top - ws[iF - 1].top)}px above it)`);
      const isPhone = w === 375;     // phones wrap "fünfte Generation." normally (white-space: normal), so it may take two lines there
      assert(isPhone || Math.abs(ws[iF].top - ws[iF + 1].top) < 3, `${tag}: "fünfte Generation." share one line${isPhone ? ' (not required on a phone)' : ''}`);
      assert(ws[iF - 1].t === 'die', `${tag}: the line before it ends with "die"`);
      // last line: the TEXT "fünfte Generation." is centred (the invisible twin spacer balances the hanging portrait); phones hide the spacer, so there the line incl. portrait is centred
      const iG = isPhone && Math.abs(ws[iF].top - ws[iF + 1].top) > 3 ? iF + 1 : iF;
      const lastItems = r.items.slice(r.items.findIndex(i => i === ws[iG]));
      assert(lastItems[lastItems.length - 1].t === '<img>' && lastItems.length >= 2, `${tag}: last line ends with the portrait`);
      if (!isPhone) {
        const t0 = ws[iF].l, t1 = ws[iF + 1].r;
        assert(Math.abs((t0 + t1) / 2 - r.w / 2) < 3, `${tag}: "fünfte Generation." (text only) is centred (centre ${((t0 + t1) / 2).toFixed(1)} vs ${(r.w / 2).toFixed(1)})`);
        assert(lastItems[lastItems.length - 1].l > t1, `${tag}: the portrait hangs outside the centred text, on its right`);
      } else {
        const l0 = Math.min(...lastItems.map(i => i.l)), r1 = Math.max(...lastItems.map(i => i.r));
        assert(Math.abs((l0 + r1) / 2 - r.w / 2) < 3, `${tag}: last line (no spacer on a phone) is centred as a whole (centre ${((l0 + r1) / 2).toFixed(1)} vs ${(r.w / 2).toFixed(1)})`);
      }
      // no hole before the break: "die" is one normal space away from the word before it
      const sameLine = Math.abs(ws[iF - 1].top - ws[iF - 2].top) < 3, gapDie = ws[iF - 1].l - ws[iF - 2].r;
      assert(sameLine ? Math.abs(gapDie - r.spaceW) < 1.5 : ws[iF - 1].l < r.w / 2, sameLine
        ? `${tag}: gap between "${ws[iF - 2].t}" and "die" is a normal space (${gapDie.toFixed(1)}px vs ${r.spaceW.toFixed(1)}px)`
        : `${tag}: "die" starts its own line here, so no gap can open next to it`);
      // "die" line: no hole inside it, and it is centred too
      const dieLine = ws.filter(i => Math.abs(i.top - ws[iF - 1].top) < 10);
      const dl = Math.min(...dieLine.map(i => i.l)), dr = Math.max(...dieLine.map(i => i.r));
      assert(Math.abs((dl + dr) / 2 - r.w / 2) < 6, `${tag}: "…die" line is centred (centre ${((dl + dr) / 2).toFixed(1)} vs ${(r.w / 2).toFixed(1)})`);
      // every whitespace gap between neighbouring words on a line is one normal space (portraits excluded)
      let checked = 0, worst = 0;
      for (let i = 0; i < r.items.length - 1; i++) {
        const a = r.items[i], b = r.items[i + 1];
        if (a.t === '<img>' || b.t === '<img>' || Math.abs(a.top - b.top) > 10 || a.t.endsWith('-')) continue;
        checked++; worst = Math.max(worst, Math.abs(b.l - a.r - r.spaceW));
      }
      assert(checked >= 3 && worst < 1.5, `${tag}: ${checked} word gaps are a normal space (${r.spaceW.toFixed(1)}px), worst deviation ${worst.toFixed(2)}px`);
      if (mode === 'js') await page.locator('.intro').screenshot({ path: path.join(OUT, `${w}.png`) });
    } finally { await close(); }
  }
}

// ---- 1b. line 6 against Figma 73:60 at 1440: ink box of "fünfte Generation. [portrait]" is x 366-1223 (measured on the Figma render, dark pixels < 140) ----
{
  const { page, close } = await openPage({ width: 1440, height: 1000, js: false });
  try {
    await page.evaluate(() => document.querySelectorAll('header').forEach(h => { h.style.visibility = 'hidden'; }));
    await page.locator('.intro').scrollIntoViewIfNeeded(); await sleep(400);
    const r = await read(page);
    const ws = r.items.filter(i => i.t !== '<img>'), iF = ws.findIndex(i => i.t === 'fünfte');
    const box = await page.evaluate(() => document.querySelector('.intro').getBoundingClientRect());
    const png = path.join(OUT, 'line6-1440.png');
    await page.locator('.intro').screenshot({ path: png });
    const textTop = await page.evaluate(() => document.querySelector('.intro-text').getBoundingClientRect().top - document.querySelector('.intro').getBoundingClientRect().top);
    const top = Math.round(textTop + ws[iF].top - 5);
    const py = `import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('L')\nW,H=im.size\ng=im.crop((0,int(sys.argv[2]),W,H)).point(lambda v:255 if v<140 else 0)\nb=g.getbbox()\nprint(b[0],b[2])`;
    const out = spawnSync('python3', ['-I', '-c', py, png, String(top)], { encoding: 'utf8' });
    const [x0, x1] = out.stdout.trim().split(' ').map(Number);
    assert(box.width === 1440 && Number.isFinite(x0), `1440: precondition, screenshot ${Math.round(box.width)}px wide, ink box measured (${out.stdout.trim()}) ${out.stderr}`);
    assert(Math.abs(x0 - 366) <= 4 && Math.abs(x1 - 1223) <= 4, `1440: line 6 ink box x ${x0}-${x1} matches Figma 366-1223 within 4px (${x0 - 366}, ${x1 - 1223})`);
  } finally { await close(); }
}

// ---- 2. the split does not change wrapping (and resizing afterwards still wraps like a fresh load) ------------------------
for (const w of WIDTHS) {
  const tag = `@${w}`;
  const plainP = await openPage({ width: w, height: HEIGHT(w), js: false, ...phone(w) });
  const jsP = await openPage({ width: w, height: HEIGHT(w), ...phone(w) });
  try {
    const plain = await read(plainP.page);
    const pre = await read(jsP.page);                       // split, hidden, not yet played
    assert(pre.items.length === plain.items.length && texts(pre.items) === texts(plain.items), `${tag}: same ${plain.items.length} items in the same order before/after the split`);
    assert(JSON.stringify(lineIdx(plain.items, 'top')) === JSON.stringify(lineIdx(pre.items, 'ot')), `${tag}: line (offsetTop) of every word identical before/after: ${lineIdx(plain.items, 'top').join('')} vs ${lineIdx(pre.items, 'ot').join('')}`);
    assert(Math.abs(pre.h - plain.h) < 1, `${tag}: paragraph height unchanged (${plain.h.toFixed(1)} vs ${pre.h.toFixed(1)})`);
    await jsP.page.locator(SEL).scrollIntoViewIfNeeded(); await toDone(jsP.page);
    assert(await waitPlayed(jsP.page), `${tag}: everything in`);
    const post = await read(jsP.page);
    let worst = 0;
    plain.items.forEach((a, i) => { worst = Math.max(worst, Math.abs(a.l - post.items[i].l), Math.abs(a.r - post.items[i].r)); });
    assert(worst < 1, `${tag}: every word's left/right edge identical after playing (worst ${worst.toFixed(2)}px)`);
    assert(JSON.stringify(lineIdx(plain.items, 'top')) === JSON.stringify(lineIdx(post.items, 'top')), `${tag}: lines identical after playing`);
  } finally { await plainP.close(); await jsP.close(); }
}
{
  // resize after the animation, 1440 -> 768 -> 375: wraps like a fresh plain load at that width
  const { page, close } = await openPage({ width: 1440, height: 900 });
  try {
    await page.locator(SEL).scrollIntoViewIfNeeded(); await toDone(page);
    assert(await waitPlayed(page), 'resize: everything in at 1440');
    for (const [w, h] of [[768, 900], [375, 812], [2560, 900]]) {
      await page.setViewportSize({ width: w, height: h }); await sleep(400);
      const now = await read(page);
      const fresh = await openPage({ width: w, height: h, js: false });
      const ref = await read(fresh.page); await fresh.close();
      assert(now.iw === w, `resize: viewport is ${w}`);
      // offsetTop, not the bounding rect: words that have not played yet at this scroll position carry a 0.6em transform offset
      assert(JSON.stringify(lineIdx(ref.items, 'top')) === JSON.stringify(lineIdx(now.items, 'ot')), `resize to ${w}: words wrap like a fresh load: ${lineIdx(now.items, 'ot').join('')}`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `resize to ${w}: no horizontal overflow`);
      await toDone(page);   // windows are re-measured for the new layout: past the centre point everything is in
      assert(await waitPlayed(page, 1500), `resize to ${w}: with the paragraph centre 100px above the viewport centre every word is in (windows re-measured)`);
    }
  } finally { await close(); }
}

// ---- 3. scrubbed reveal: hidden until JS runs, no word visible off screen, all in by paragraph-centre = viewport-centre, reversible ------
// one probe = everything the checks need about one scroll position (layout reads are fine here, this is the test)
const PROBE = () => {
  const root = document.querySelector('.intro-text'), rr = root.getBoundingClientRect(), H = innerHeight;
  const docTop = el => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
  const items = [...root.querySelectorAll('.wr-word, img.intro-pic')].map(e => {
    const r = e.getBoundingClientRect(), c = getComputedStyle(e), m = new DOMMatrix(c.transform === 'none' ? 'matrix(1,0,0,1,0,0)' : c.transform);
    const rest = docTop(e) - scrollY;
    return { t: e.tagName === 'IMG' ? '<img>' : e.textContent, op: parseFloat(c.opacity), y: m.m42, sc: m.a, top: r.top, bottom: r.bottom, restTop: rest, restBottom: rest + e.offsetHeight };
  });
  return { sy: scrollY, H, iw: innerWidth, tTop: rr.top, th: rr.height, items };
};
const probe = page => page.evaluate(PROBE);
const settle = async page => {      // scrollY stable across two reads (the page has scroll-behavior: smooth)
  let prev = -1;
  for (let i = 0; i < 20; i++) { const y = await page.evaluate(() => scrollY); if (y === prev) return y; prev = y; await sleep(40); }
  return prev;
};
const sum = p => p.items.reduce((a, i) => a + i.op, 0);

{
  const plain = await openPage({ width: 1440, height: 900, js: false });
  const nw = await plain.page.evaluate(() => document.querySelectorAll('.wr-word, .wr-sr').length);
  const o = await opac(plain.page, `${SEL}, ${SEL} .intro-pic`);
  assert(nw === 0 && o.every(v => v === 1), 'JS off: no split, text and portraits fully visible');
  const txt = await plain.page.evaluate(s => document.querySelector(s).textContent.replace(/\s+/g, ' ').trim(), SEL);
  assert(txt === 'Wir sind ein Familienfriseur-betrieb aus dem Oberbergischen Kreis in der vierten Generation mit Blick auf die Zukunft bereits auf dem Weg in die fünfte Generation.', `JS off: the HTML is the plain sentence (${txt})`);
  await plain.close();
}

const conflictWidths = [];
for (const w of WIDTHS) {
  const tag = `scrub@${w}`, H = HEIGHT(w);
  const { page, errors, close } = await openPage({ width: w, height: H, ...phone(w) });
  try {
    const p0 = await probe(page);
    assert(p0.iw === w && p0.H === H, `${tag}: viewport is ${p0.iw}x${p0.H} as set`);
    assert(await page.evaluate(() => !!(window.gsap && window.ScrollTrigger)), `${tag}: GSAP and ScrollTrigger loaded`);
    const words = p0.items.filter(i => i.t !== '<img>'), pics = p0.items.filter(i => i.t === '<img>');
    const em = await page.evaluate(s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize), SEL);
    assert(words.length >= 20 && pics.length === 3, `${tag}: split into ${words.length} words + 3 portraits`);
    assert(p0.items.every(i => i.op === 0), `${tag}: at the top of the page every word and portrait is hidden (opacity 0)`);
    assert(words.every(i => Math.abs(i.y - 0.6 * em) < 0.5) && pics.every(i => Math.abs(i.sc - 0.6) < 0.01), `${tag}: hidden state = words 0.6em (${(0.6 * em).toFixed(1)}px) low, portraits at scale 0.6`);
    const conflict = p0.th > H;      // paragraph taller than the viewport: some words are still below the fold when its centre hits the viewport centre
    if (conflict) conflictWidths.push(w);

    // forward sweep with real wheel input, 40px at a time, from just before the paragraph enters to just after it left
    await wheelTo(page, H + 120, 30);
    const sy0 = await settle(page);
    const fwd = [], back = [];
    let moved = 0, prevY = sy0;
    for (let i = 0; i < 120; i++) {
      await page.mouse.wheel(0, 40);
      const y = await settle(page);
      if (y > prevY) moved += y - prevY;
      prevY = y;
      const p = await probe(page);
      fwd.push(p);
      if (p.tTop + p.th < -60) break;
    }
    assert(moved > H && fwd.length > 20, `${tag}: precondition, the wheel moved the page ${moved}px in ${fwd.length} steps`);
    for (let i = 0; i < 160; i++) {
      await page.mouse.wheel(0, -40);
      await settle(page);
      const p = await probe(page);
      back.push(p);
      if (p.tTop > H + 100) break;
    }
    assert(back.length > 20, `${tag}: precondition, scrolled back up in ${back.length} steps`);

    const violations = (probes, label) => {
      const va = [], vb = [];
      for (const p of probes) {
        for (const i of p.items) {
          const intersects = i.bottom > 0 && i.top < p.H;
          if ((i.op > 0.01 && i.top >= p.H) || (i.op > 0.01 && i.op < 0.99 && !intersects)) va.push(`${label} sy=${Math.round(p.sy)} "${i.t}" op=${i.op.toFixed(2)} top=${Math.round(i.top)}`);
        }
        if (p.tTop + p.th / 2 <= p.H / 2) {
          for (const i of p.items) {
            const must = conflict ? (i.restTop >= 0 && i.restBottom <= p.H) : (i.bottom > 0 && i.top < p.H);
            if (must && (i.op < 0.999 || Math.abs(i.y) > 0.5 || Math.abs(i.sc - 1) > 0.001)) vb.push(`${label} sy=${Math.round(p.sy)} "${i.t}" op=${i.op.toFixed(2)} y=${i.y.toFixed(1)}`);
          }
        }
      }
      return { va, vb };
    };
    const f = violations(fwd, 'down'), b = violations(back, 'up');
    assert(f.va.length + b.va.length === 0, `${tag} (a): no word is visible below the fold or half-revealed off screen, ${fwd.length + back.length} steps ${[...f.va, ...b.va].slice(0, 3).join(' | ')}`);
    const centred = fwd.filter(p => p.tTop + p.th / 2 <= p.H / 2).length;
    assert(centred >= 5, `${tag}: precondition, ${centred} steps with the paragraph centre at or above the viewport centre`);
    assert(f.vb.length + b.vb.length === 0, `${tag} (b): once the paragraph centre is at/above the viewport centre every ${conflict ? 'fully visible' : 'visible'} word is at opacity 1 / y 0 / scale 1 ${[...f.vb, ...b.vb].slice(0, 3).join(' | ')}`);
    const partial = fwd.filter(p => p.items.some(i => i.op > 0.02 && i.op < 0.98)).length;
    assert(partial >= 5, `${tag}: precondition, the reveal was observed mid-way in ${partial} steps (it is scrubbed, not a jump)`);
    // grows while scrolling down, in reading order (non-conflict widths: all windows end together, so earlier words are never behind later ones)
    let growing = true, order = true;
    for (let k = 1; k < fwd.length; k++) {
      if (sum(fwd[k]) < sum(fwd[k - 1]) - 0.05) growing = false;
      // per line: since the 12% line spread can exceed the line pitch, the next line's first word may start before this line's last one (js/word-reveal.js)
      const ws = fwd[k].items.filter(i => i.t !== '<img>');
      for (let j = 1; j < ws.length; j++) if (Math.abs(ws[j].restTop - ws[j - 1].restTop) < 10 && ws[j].op > ws[j - 1].op + 0.02) order = false;
    }
    assert(growing, `${tag}: total reveal never shrinks while scrolling down`);
    if (!conflict) assert(order, `${tag}: words reveal in reading order within a line (no word ahead of the one left of it)`);
    // (c) scrolling back up undoes it
    let shrinking = true;
    for (let k = 1; k < back.length; k++) if (sum(back[k]) > sum(back[k - 1]) + 0.05) shrinking = false;
    const peak = Math.max(...fwd.map(sum)), n = p0.items.length;
    assert(Math.abs(peak - n) < 0.05, `${tag}: at full reveal the opacities sum to ${peak.toFixed(2)} of ${n}`);
    assert(shrinking, `${tag} (c): total reveal never grows while scrolling back up`);
    assert(sum(back[back.length - 1]) === 0, `${tag} (c): back above the paragraph everything is hidden again (sum ${sum(back[back.length - 1])})`);
    const mid = back.find(p => p.tTop + p.th / 2 > p.H / 2 + 250);
    assert(mid && sum(mid) < peak - 1, `${tag} (c): 250px back up from the full reveal the sum fell from ${peak.toFixed(1)} to ${mid ? sum(mid).toFixed(1) : 'n/a'}`);
    if (w === 1440) {
      await wheelTo(page, 40); await sleep(200); await page.screenshot({ path: path.join(OUT, 'scrub-1440-top40.png') });
    }
    assert(errors.length === 0, `${tag}: no page errors ${errors.join(' ; ')}`);
  } finally { await close(); }
}
console.log(`INFO paragraph taller than the viewport (off-screen rule overrides the centre rule): ${conflictWidths.join(', ') || 'none'}`);

// ---- 4. screen readers: the sentence once, plainly --------------------------------------------------------------------------
for (const js of [false, true]) {
  const { page, close } = await openPage({ width: 1440, height: 900, js });
  try {
    const snap = await page.locator('.intro').ariaSnapshot();
    const hits = (snap.match(/fünfte Generation\./g) || []).length;
    const wordNodes = (snap.match(/- (generic|text)[^\n]*: (Wir|sind|ein|Familienfriseur-|betrieb)\b/g) || []).length;
    assert(hits === 1, `${js ? 'JS on' : 'JS off'}: screen-reader tree reads the sentence once (${hits}x): ${snap.replace(/\n\s*/g, ' ')}`);
    assert(wordNodes === 0, `${js ? 'JS on' : 'JS off'}: no per-word nodes in the accessibility tree`);
  } finally { await close(); }
}

// ---- 5. reduced motion: no split, everything visible at once ---------------------------------------------------------------
{
  const { page, close } = await openPage({ width: 1440, height: 900, reducedMotion: true });
  try {
    const mq = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    assert(mq, 'precondition: prefers-reduced-motion is reduce');
    await sleep(300);
    const info = await page.evaluate(() => ({ words: document.querySelectorAll('.wr-word, .wr-sr').length, aria: document.querySelector('.intro-text').getAttribute('aria-hidden') }));
    assert(info.words === 0 && info.aria === null, 'reduced motion: text is not split or hidden from assistive tech');
    const o = await opac(page, `${SEL}, ${SEL} .intro-pic`);
    assert(o.every(v => v === 1), 'reduced motion: text and portraits visible at once (before scrolling to them)');
    await wheelTo(page, 300); await sleep(200);
    assert((await opac(page, `${SEL}, ${SEL} .intro-pic`)).every(v => v === 1), 'reduced motion: still visible in view');
  } finally { await close(); }
}

// ---- 6. reload / deep link mid-page: the state matches the scroll position ---------------------------------------------------
{
  const { page, close } = await openPage({ width: 1440, height: 900 });
  try {
    await page.locator(SEL).scrollIntoViewIfNeeded(); await wheelTo(page, 360, 20); await sleep(300);
    const before = await probe(page);
    const part = before.items.filter(i => i.op > 0.02 && i.op < 0.98).length;
    assert(part >= 2 && before.items.some(i => i.op === 0), `reload mid-reveal: precondition, ${part} items half-revealed and some still hidden (scrollY ${Math.round(before.sy)})`);
    await page.reload({ waitUntil: 'load' }); await sleep(600);
    const after = await probe(page);
    assert(Math.abs(after.sy - before.sy) < 2, `reload mid-reveal: precondition, scroll restored (${Math.round(before.sy)} -> ${Math.round(after.sy)})`);
    const worst = Math.max(...after.items.map((i, k) => Math.abs(i.op - before.items[k].op)));
    assert(worst < 0.03, `reload mid-reveal: every word shows the state of the scroll position (worst opacity difference ${worst.toFixed(3)})`);
  } finally { await close(); }
  for (const [label, delta] of [['far below it', 6]]) {
    const { page, close } = await openPage({ width: 1440, height: 900 });
    try {
      await page.locator(SEL).scrollIntoViewIfNeeded(); await toDone(page);
      for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 400); await sleep(120); }
      await sleep(500);
      await page.reload({ waitUntil: 'load' }); await sleep(600);
      const p = await probe(page);
      assert(p.sy > 1000 && p.tTop + p.th < 0, `reload ${label}: precondition, scroll restored below the paragraph (scrollY ${Math.round(p.sy)}, paragraph bottom ${Math.round(p.tTop + p.th)})`);
      assert(await isDone(page), `reload ${label}: every word visible (opacity 1, y 0)`);
    } finally { await close(); }
  }
  {
    const { page, close } = await openPage({ width: 1440, height: 900 });
    try {
      await page.locator(SEL).scrollIntoViewIfNeeded(); await toDone(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await sleep(300);
      await page.reload({ waitUntil: 'load' }); await sleep(500);
      const p = await probe(page);
      assert(p.sy === 0 && p.items.every(i => i.op === 0), 'reload at the top: words hidden until scrolled to (as on first load)');
    } finally { await close(); }
  }
}

await report();
