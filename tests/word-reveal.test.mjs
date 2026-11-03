// Intro word-by-word stagger (js/word-reveal.js): inside a line the words start one after another, left to right,
// spread over ~12% of the viewport height of scroll; the enter/done rules win over the spread; portraits are unchanged since a7769df.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/r2-words');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WIDTHS = [1440, 768, 375, 2560];
const HEIGHT = w => (w === 375 ? 812 : 900);
const phone = w => ({ isMobile: w === 375, hasTouch: w === 375 });
const SEL = '.intro-text';

// Portrait ScrollTrigger windows [start, end] as measured on a7769df (round 1, live), per width. Portraits must not move.
const PORTRAITS_A7769DF = {
  375: [[843, 1642], [1278, 1642], [1642, 1666]],
  768: [[401, 1061], [651, 1061], [822, 1061]],
  1440: [[1370, 2238], [1831, 2238], [2142, 2238]],
  2560: [[2005, 2799], [2327, 2799], [2627, 2799]],
};

// Everything about the windows, read from the ScrollTriggers and from the layout (the test may read layout; the script may not while scrolling).
const WINDOWS = () => {
  const text = document.querySelector('.intro-text'), H = innerHeight;
  const fs = parseFloat(getComputedStyle(text).fontSize);
  const docTop = el => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
  const sEnd = docTop(text) + text.offsetHeight / 2 - H * 0.5;
  const els = [...text.querySelectorAll('.wr-word, img.intro-pic')];
  const items = els.map((e, i) => {
    const st = ScrollTrigger.getById('word-reveal-' + i);
    const y = docTop(e), h = e.offsetHeight;
    return { i, pic: e.tagName === 'IMG', t: e.tagName === 'IMG' ? '<img>' : e.textContent, s: st ? st.start : NaN, e: st ? st.end : NaN,
      left: e.getBoundingClientRect().left + scrollX, enter: y + 0.6 * fs - H + 0.03 * H, latest: Math.max(sEnd, y + h - H), mid: y + h / 2 };
  });
  return { H, iw: innerWidth, fs, sEnd, items, th: text.offsetHeight };
};
// word lines from the layout: neighbours whose vertical centres differ by < 0.4em share a line (portraits are skipped)
const linesOf = d => {
  const lines = []; let cur = null;
  for (const it of d.items) {
    if (it.pic) continue;
    if (!cur || Math.abs(it.mid - cur.mid) > 0.4 * d.fs) { cur = { mid: it.mid, words: [] }; lines.push(cur); }
    cur.words.push(it);
  }
  return lines;
};

const summary = {};
for (const w of WIDTHS) {
  const H = HEIGHT(w), tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: H, ...phone(w) });
  try {
    await page.waitForFunction(() => window.ScrollTrigger && ScrollTrigger.getById('word-reveal-28'));
    const d = await page.evaluate(WINDOWS);
    assert(d.iw === w && d.H === H, `${tag}: viewport really is ${d.iw}x${d.H} (set ${w}x${H})`);
    const pics = d.items.filter(i => i.pic), words = d.items.filter(i => !i.pic);
    assert(words.length === 26 && pics.length === 3 && d.items.every(i => Number.isFinite(i.s) && Number.isFinite(i.e)), `${tag}: precondition, 26 words + 3 portraits each have a ScrollTrigger window`);
    const lines = linesOf(d);
    assert(lines.length >= 5 && lines.reduce((a, l) => a + l.words.length, 0) === 26, `${tag}: precondition, ${lines.length} word lines found: ${lines.map(l => l.words.length).join('/')}`);
    const minSpan = 0.03 * H, want = 0.12 * H;

    // portraits: windows identical to the live site
    const pw = PORTRAITS_A7769DF[w];
    assert(pics.every((p, k) => Math.abs(p.s - pw[k][0]) < 0.5 && Math.abs(p.e - pw[k][1]) < 0.5),
      `${tag}: portrait windows unchanged vs a7769df: now ${pics.map(p => `[${p.s},${p.e}]`).join(' ')} then ${pw.map(p => `[${p[0]},${p[1]}]`).join(' ')}`);

    const rows = [];
    lines.forEach((ln, li) => {
      const ws = ln.words, n = ws.length;
      // left to right in layout order = reading order; starts strictly increase
      const ordered = ws.every((x, k) => k === 0 || x.left > ws[k - 1].left);
      assert(ordered, `${tag} line ${li + 1}: precondition, words are listed left to right (${ws.map(x => x.t).join(' ')})`);
      assert(ws.every((x, k) => k === 0 || x.s > ws[k - 1].s), `${tag} line ${li + 1}: word starts strictly increase left to right [${ws.map(x => Math.round(x.s)).join(', ')}]`);
      // rule 1: nothing starts before the word is inside the viewport (ENTER_MARGIN_VH); rule 2: nothing ends after the paragraph centre / fully-in-view point
      assert(ws.every(x => x.s >= x.enter - 0.5), `${tag} line ${li + 1}: no word starts before it is 3% vh inside the viewport (earliest slack ${Math.min(...ws.map(x => x.s - x.enter)).toFixed(1)}px)`);
      const base = Math.max(...ws.map(x => x.enter)), limit = Math.max(...ws.map(x => x.latest)), room = limit - base;
      const over = Math.max(...ws.map(x => x.e - x.latest));
      if (room >= minSpan) assert(over <= 0.5, `${tag} line ${li + 1}: every word is done by the centre rule (latest end overshoot ${over.toFixed(1)}px)`);
      const spread = n > 1 ? ws[n - 1].s - ws[0].s : 0;
      const allows12 = room - minSpan >= want;
      if (n > 1) {
        if (allows12) assert(spread >= 0.09 * H && spread <= want + 1.5, `${tag} line ${li + 1}: room ${Math.round(room)}px allows 12%, spread ${Math.round(spread)}px = ${(100 * spread / H).toFixed(1)}% vh (>= 9%)`);
        else assert(spread > 0 && spread <= Math.max(room - minSpan, n - 1) + 1.5, `${tag} line ${li + 1}: room ${Math.round(room)}px too small for 12%, spread compressed to ${Math.round(spread)}px = ${(100 * spread / H).toFixed(1)}% vh, order kept`);
      }
      rows.push({ line: li + 1, words: ws.map(x => x.t).join(' '), n, room: Math.round(room), spreadPx: Math.round(spread), spreadVh: +(100 * spread / H).toFixed(1), allows12 });
    });
    summary[w] = rows;
    assert(errors.length === 0, `${tag}: no page errors ${errors.join(' ; ')}`);
  } finally { await close(); }
}
console.log('\nSPREAD PER LINE (px of scroll between the first and last word of a line starting; vh = % of viewport height)');
for (const w of WIDTHS) {
  console.log(`  @${w} (H ${HEIGHT(w)}):`);
  for (const r of summary[w]) console.log(`    line ${r.line} [${r.n} words] "${r.words}": spread ${r.spreadPx}px = ${r.spreadVh}% vh, room ${r.room}px${r.n > 1 && !r.allows12 ? ' (compressed)' : ''}`);
}

// ---- behaviour with real wheel input at 1440: left words lead right words inside a line, a line is seen half-revealed, frames saved ----
{
  const w = 1440, H = 900;
  const { page, close } = await openPage({ width: w, height: H });
  try {
    const PROBE = () => {
      const docTop = el => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
      const els = [...document.querySelectorAll('.intro-text .wr-word')];
      return { sy: scrollY, hidden: document.hidden, items: els.map(e => ({ t: e.textContent, op: parseFloat(getComputedStyle(e).opacity), left: e.offsetLeft, y: docTop(e), top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom })) };
    };
    const startTop = await page.evaluate(() => document.querySelector('.intro-text').getBoundingClientRect().top + scrollY);
    // real wheel to just before the paragraph enters, then 10px steps to past the done point
    let sy = await page.evaluate(() => scrollY);
    while (sy < startTop - H - 20) { await page.mouse.wheel(0, Math.min(600, startTop - H - 20 - sy)); await sleep(150); sy = await page.evaluate(() => scrollY); }
    await sleep(300);
    const frames = [];
    let prev = -1, moved = 0;
    for (let f = 0; f < 140; f++) {
      await page.mouse.wheel(0, 10);
      for (let k = 0; k < 20; k++) { const y = await page.evaluate(() => scrollY); if (y === prev) break; prev = y; await sleep(30); }
      const p = await page.evaluate(PROBE);
      if (frames.length) moved += Math.abs(p.sy - frames[frames.length - 1].sy);
      frames.push(p);
      await page.screenshot({ path: path.join(OUT, `frame-${String(f).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 70 });
      if (p.items.every(i => i.op > 0.999) && f > 20) break;
    }
    assert(moved > 600 && frames.length > 30 && frames.every(p => !p.hidden), `1440: precondition, wheel moved the page ${Math.round(moved)}px over ${frames.length} frames, tab visible`);
    // group words into lines by layout y
    const lineKey = it => Math.round(it.y / 20);
    const byLine = new Map();
    frames[0].items.forEach((it, i) => { const k = lineKey(it); if (!byLine.has(k)) byLine.set(k, []); byLine.get(k).push(i); });
    const lineIdx = [...byLine.values()].filter(a => a.length > 1);
    let leadViolations = 0, seenHalf = 0;
    const half = [];   // per line: frames where it is visibly half-revealed (some word >= 0.8 and another <= 0.2)
    lineIdx.forEach((idx, li) => {
      const hf = [];
      frames.forEach((p, f) => {
        const ops = idx.map(i => p.items[i].op);
        for (let k = 1; k < ops.length; k++) if (ops[k] > ops[k - 1] + 0.02) leadViolations++;   // a word right of another is never ahead of it
        if (Math.max(...ops) >= 0.8 && Math.min(...ops) <= 0.2) hf.push(f);
      });
      if (hf.length) seenHalf++;
      half.push({ line: li + 1, words: idx.map(i => frames[0].items[i].t).join(' '), frames: hf });
    });
    assert(leadViolations === 0, `1440: while scrolling down no word is ahead of the word left of it on its line (${leadViolations} violations over ${frames.length} frames)`);
    assert(seenHalf === lineIdx.length, `1440: every multi-word line is seen visibly half-revealed (some word >= 0.8 while another <= 0.2) in at least one frame: ${seenHalf}/${lineIdx.length}`);
    const range = a => a.length ? `${a[0]}-${a[a.length - 1]} (${a.length} frames)` : 'none';
    console.log(`\nCAPTURE: ${frames.length} frames, 10px wheel steps, scrollY ${Math.round(frames[0].sy)}..${Math.round(frames[frames.length - 1].sy)}, saved to ${OUT}/frame-NNN.jpg`);
    console.log('Frames where a line is visibly half-revealed (some word >= 0.8 opacity and another <= 0.2):');
    for (const h of half) console.log(`  line ${h.line} "${h.words}": frames ${range(h.frames)}`);
    fs.writeFileSync(path.join(OUT, 'half-revealed.json'), JSON.stringify({ frames: frames.map(f => ({ sy: f.sy, ops: f.items.map(i => +i.op.toFixed(3)) })), half }, null, 1));
  } finally { await close(); }
}
await report();
