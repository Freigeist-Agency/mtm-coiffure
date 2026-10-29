// Frame-by-frame parity between the Figma Make hover gallery (React + GSAP 3.15) and js/hover-gallery.js (global GSAP 3.12.5).
// NOT part of run-all.sh: it needs the Make app built (see tests/make-parity-build.mjs; MAKE_DIST points at the output).
//   node --dns-result-order=ipv4first tests/make-parity.mjs            all paths
//   MP_ONLY=rest-6th,interrupt node ... tests/make-parity.mjs          some paths
//   HG_JS=/path/to/other/hover-gallery.js node ...                      serve a different script to the site (controls / mutants)
//
// Determinism: both pages get the same virtual clock (init script): requestAnimationFrame, performance.now and Date.now are
// frozen after load and advance only when this script steps them, 1/60 s per frame. A pointer event is therefore exactly at
// frame 0 and every later sample is exactly k/60 s after it in BOTH pages, so the two recordings are already on a common 60 fps
// timeline and need no interpolation. (Real-time rAF phase differs by up to 16.7 ms between two page loads, which at the
// peak width speed of ~590 px/s is ~10 px of pure jitter that says nothing about the logic.)
//
// DOM mapping: card i <-> card i (children of section.gallery in Make, children of .hover-gallery on the site);
// visual = the card's first child (div.gallery-visual / span.hover-gallery__visual); image = the img inside it.
// Make's photos are routed to the site's photos in the same order so the side-by-side screenshots show the same pictures.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { edgeBends, boundaryBends } from './clip-geometry.mjs';

const require = createRequire('/home/eddie/Work/Amatsima/Code/studio/node_modules/');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/make-parity');
const MAKE_DIST = process.env.MAKE_DIST || new URL('./.cache/make-dist', import.meta.url).pathname;
const CACHE = path.join(ROOT, 'tests/.cache');
const HG_JS = process.env.HG_JS || '';
const ONLY = process.env.MP_ONLY ? process.env.MP_ONLY.split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

const FRAME_MS = 1000 / 60, MOVE_FRAMES = 45;                  // 0.75 s
const TOL_PX = 1, TOL_OPACITY = 0.01;
const PHOTOS = ['dsc00642-1x1.jpg', 'dsc09979-1x1.jpg', 'dsc00512-1x1.jpg', 'dsc00126.jpg', 'dsc00155-1x1.jpg', 'dsc09804.jpg'];
const MAKE_PHOTOS = ['a794b', 'b61c3', 'f23b3', 'a0e50', 'ae034', '115a7'];

// ---- servers -------------------------------------------------------------------------------------
const procs = [];
function freePort() {
  return new Promise((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
}
async function serve(dir) {
  const port = await freePort();
  const p = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dir, stdio: 'ignore' });
  procs.push(p);
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).status) return base; } catch {} await new Promise(r => setTimeout(r, 50)); }
  throw new Error('http.server did not start for ' + dir);
}
process.on('exit', () => procs.forEach(p => { try { p.kill(); } catch {} }));

// ---- in-page code --------------------------------------------------------------------------------
// Virtual clock. Real until start() so page load (loader, lazy images, ScrollTrigger) runs normally.
function clockInit() {
  const realRaf = window.requestAnimationFrame.bind(window), realCaf = window.cancelAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance), realDate = Date.now.bind(Date);
  let virtual = false, vperf = 0, vdate = 0, id = 1e9;
  const q = new Map();
  performance.now = () => (virtual ? vperf : realNow());
  Date.now = () => (virtual ? vdate : realDate());
  window.requestAnimationFrame = cb => { if (!virtual) return realRaf(cb); q.set(++id, cb); return id; };
  window.cancelAnimationFrame = i => { if (!q.delete(i)) realCaf(i); };
  window.__clock = {
    start() { virtual = true; vperf = realNow(); vdate = realDate(); },
    jump(ms) { vperf += ms; vdate += ms; },
    step(n) {
      for (let k = 0; k < n; k++) {
        vperf += 1000 / 60; vdate += 1000 / 60;
        const batch = [...q]; q.clear();
        for (const [, cb] of batch) cb(vperf);
      }
    },
  };
}
// Snapshot of one gallery. Same code for both apps; only the selector differs.
function recorderInit(sel) {
  window.__snap = () => {
    const g = document.querySelector(sel), gr = g.getBoundingClientRect(), pl = parseFloat(getComputedStyle(g).paddingLeft);   // x is measured from the content box
    return [...g.children].map(card => {
      const r = card.getBoundingClientRect(), visual = card.firstElementChild, img = visual.querySelector('img'), ir = img.getBoundingClientRect();
      return { w: r.width, x: r.left - gr.left - pl, imgX: ir.left - r.left, imgW: ir.width, op: parseFloat(getComputedStyle(img).opacity),
        clip: visual.style.clipPath, pressed: card.getAttribute('aria-pressed') };
    });
  };
  window.__frames = n => { const out = []; for (let k = 0; k < n; k++) { window.__clock.step(1); out.push(window.__snap()); } return out; };
  window.__centre = i => { const g = document.querySelector(sel), r = g.children[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  window.__outside = () => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: innerWidth / 2, y: Math.max(2, r.top - 24) }; };
}

// ---- apps ----------------------------------------------------------------------------------------
const APPS = {
  make: { sel: 'section.gallery', url: base => base + 'index.html', ready: () => document.querySelectorAll('section.gallery > button').length === 6 && document.querySelector('section.gallery > button').style.width !== '' },
  site: { sel: '.hover-gallery', url: base => base + 'index.html?skiploader', ready: () => document.querySelector('.hover-gallery.is-enhanced') },
};
let browser, bases;
const versions = {};
async function openApp(name) {
  const app = APPS[name];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', deviceScaleFactor: 1 });
  await context.addInitScript(clockInit);
  if (name === 'make') {
    await context.route(/\/assets\/[0-9a-f]{5}\.png$/, route => {
      const i = MAKE_PHOTOS.findIndex(h => route.request().url().includes('/' + h + '.'));
      return i < 0 ? route.continue() : route.fulfill({ path: path.join(ROOT, 'assets', PHOTOS[i]), contentType: 'image/jpeg' });
    });
  } else {
    await context.route(/^https?:\/\/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, async route => {
      const key = crypto.createHash('sha256').update(route.request().url()).digest('hex');
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(CACHE, key + '.json'), 'utf8'));
        return await route.fulfill({ status: 200, headers: meta.headers, body: fs.readFileSync(path.join(CACHE, key + '.body')) });
      } catch { return route.continue(); }
    });
    if (HG_JS) await context.route('**/js/hover-gallery.js', route => route.fulfill({ path: HG_JS, contentType: 'text/javascript' }));
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(app.url(bases[name]), { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}' });
  await page.waitForFunction(app.ready, null, { timeout: 15000 });
  await page.evaluate(recorderInit, app.sel);
  if (name === 'site') {
    await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center', behavior: 'instant' }), app.sel);
  }
  await page.waitForFunction(() => [...document.images].filter(i => i.closest('section.gallery, .hover-gallery')).every(i => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));                 // let scroll / reveal / lazy work finish in real time
  // GSAP's ticker auto-sleeps after ~120 idle frames and wakes with a start time that is stale by however long it slept, so
  // whether a move begins 0, 2 or 6 frames "early" depends on how many real frames the page happened to render before the clock
  // froze. That is GSAP internals (identical code in 3.12.5 and 3.15.0), not the gallery logic, and it made runs flaky.
  // Pin both pages to the same state: ticker never sleeps (autoSleep 0), runs on the virtual clock, 1 s gap absorbed by lag smoothing.
  const ticks = await page.evaluate(() => {
    const g = window.gsap || window.__makeGsap;                  // site: the CDN global; Make: exposed by tests/make-parity-build.mjs
    window.__clock.start();
    g.config({ autoSleep: 0 }); g.ticker.wake();
    const f0 = g.ticker.frame; window.__clock.step(300); window.__clock.jump(1000); window.__clock.step(2);
    return { version: g.version, frames: g.ticker.frame - f0 };
  });
  if (ticks.frames < 250) throw new Error(`${name}: GSAP ticker did not run on the virtual clock (${ticks.frames} frames)`);
  versions[name] = ticks.version;
  return { page, errors, close: () => context.close() };
}

// ---- paths ---------------------------------------------------------------------------------------
// ops: ['hover', i] | ['out'] | ['adv', frames] (advance, not recorded) | ['rec'] (start recording; t = 0 is the next pointer move)
//      | ['run', frames] (advance and record) | ['shots'] (screenshot sequence after the last move; shots pass only)
const REC = 72;
const PATHS = {
  'rest-1st': [['rec'], ['hover', 0], ['run', REC]],
  'rest-6th': [['rec'], ['hover', 5], ['run', REC]],
  '1st-6th': [['hover', 0], ['adv', 12], ['rec'], ['hover', 5], ['run', REC]],
  '6th-1st': [['hover', 5], ['adv', 80], ['rec'], ['hover', 0], ['run', REC]],
  'rest-3rd': [['rec'], ['hover', 2], ['run', REC]],
  'interrupt': [['rec'], ['hover', 5], ['run', 12], ['hover', 0], ['run', REC]],     // 200 ms in, retarget
  'leave': [['hover', 5], ['adv', 80], ['rec'], ['out'], ['run', REC]],
};

async function movePointer(page, op) {
  const p = await page.evaluate(([kind, i]) => (kind === 'out' ? window.__outside() : window.__centre(i)), op[0] === 'out' ? ['out', 0] : ['hover', op[1]]);
  await page.mouse.move(p.x, p.y);
}
async function execute(name, ops, { shots = false } = {}) {
  const { page, errors, close } = await openApp(name);
  try {
    const samples = [];                         // {t, cards:[...]}
    let rec = false, frames = 0, shotFiles = [];
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k];
      if (op[0] === 'rec') { rec = true; continue; }
      if (op[0] === 'hover' || op[0] === 'out') {
        await movePointer(page, op);
        if (rec && samples.length === 0) samples.push({ t: 0, cards: await page.evaluate(() => window.__snap()) });   // after the event, before any tick
        const last = !ops.slice(k + 1).some(o => o[0] === 'hover' || o[0] === 'out');
        if (shots && last) {
          const clip = await page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 24), width: innerWidth, height: Math.min(r.height + 48, innerHeight - Math.max(0, r.top - 24)) }; }, APPS[name].sel);
          let done = 0;
          for (const pct of [0, 25, 50, 75, 100]) {
            const target = Math.round(MOVE_FRAMES * pct / 100);
            if (target > done) { await page.evaluate(n => window.__clock.step(n), target - done); done = target; }
            const file = path.join(OUT, `${shots}__${pct}__${name}.png`);
            await page.screenshot({ path: file, clip });
            shotFiles.push(file);
          }
          break;
        }
      } else if (op[0] === 'adv') {
        await page.evaluate(n => window.__clock.step(n), op[1]);
      } else if (op[0] === 'run') {
        const out = await page.evaluate(n => window.__frames(n), op[1]);
        for (const cards of out) { frames++; samples.push({ t: frames * FRAME_MS, cards }); }
      }
    }
    return { samples, errors, shotFiles };
  } finally { await close(); }
}

// ---- comparison ----------------------------------------------------------------------------------
const sgn = v => (Math.abs(v) < 0.01 ? 0 : Math.sign(v));
function compare(a, b) {
  const r = { frames: a.length, dW: 0, dX: 0, dImgX: 0, dImgW: 0, dOp: 0, dBend: 0, signMismatch: 0, peakBend: 0, peakDW: 0, bad: null, worst: null };
  if (a.length !== b.length) { r.bad = `frame count ${a.length} vs ${b.length}`; return r; }
  const base = a[0].cards.map(c => c.w);
  for (let f = 0; f < a.length; f++) {
    const ca = a[f].cards, cb = b[f].cards;
    for (let i = 0; i < ca.length; i++) {
      const A = edgeBends(ca[i].clip), B = edgeBends(cb[i].clip);
      if (!A || !B) { r.bad = `card ${i} frame ${f}: clip-path not in the Make shape (make ${!!A}, site ${!!B})`; return r; }
      const upd = (key, v, where) => { if (v > r[key]) { r[key] = v; if (key === 'dBend' || key === 'dW') r.worst = r.worst && r.worst.key === 'dBend' && key === 'dW' ? r.worst : { key, f, i, where }; } };
      upd('dW', Math.abs(ca[i].w - cb[i].w), `${ca[i].w.toFixed(2)} vs ${cb[i].w.toFixed(2)}`);
      r.dX = Math.max(r.dX, Math.abs(ca[i].x - cb[i].x));
      r.dImgX = Math.max(r.dImgX, Math.abs(ca[i].imgX - cb[i].imgX));
      r.dImgW = Math.max(r.dImgW, Math.abs(ca[i].imgW - cb[i].imgW));
      r.dOp = Math.max(r.dOp, Math.abs(ca[i].op - cb[i].op));
      for (const e of ['left', 'right']) {
        const d = Math.abs(A[e] - B[e]);
        if (d > r.dBend) { r.dBend = d; r.worst = { key: 'dBend', f, i, where: `${e}: make ${A[e].toFixed(2)} site ${B[e].toFixed(2)}` }; }
        if (sgn(A[e]) !== sgn(B[e])) r.signMismatch++;
        r.peakBend = Math.max(r.peakBend, Math.abs(A[e]));
      }
      r.peakDW = Math.max(r.peakDW, Math.abs(ca[i].w - base[i]));
      if (ca[i].pressed !== null && cb[i].pressed !== null && ca[i].pressed !== cb[i].pressed) r.pressedDiff = (r.pressedDiff || 0) + 1;
    }
  }
  return r;
}

// ---- main ----------------------------------------------------------------------------------------
async function composeSideBySide(pairs) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 200 } });
  const page = await ctx.newPage();
  for (const [make, site, out] of pairs) {
    const uri = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    await page.setContent(`<body style="margin:0;background:#222;color:#fff;font:12px monospace"><div>make (top)</div><img style="display:block" src="${uri(make)}"><div>site (bottom)</div><img style="display:block" src="${uri(site)}"></body>`);
    await page.setViewportSize({ width: 1440, height: 1 });
    await page.screenshot({ path: out, fullPage: true });
  }
  await ctx.close();
}

browser = await chromium.launch({ headless: true, args: ['--hide-scrollbars'] });
if (!fs.existsSync(path.join(MAKE_DIST, 'index.html'))) { console.error(`Make build not found at ${MAKE_DIST}; run tests/make-parity-build.mjs first`); process.exit(2); }
bases = { make: await serve(MAKE_DIST), site: await serve(ROOT) };

const rows = [];
const names = Object.keys(PATHS).filter(n => !ONLY || ONLY.includes(n));
for (const name of names) {
  const ops = PATHS[name];
  const [mk, st] = [await execute('make', ops), await execute('site', ops)];
  const a = mk.samples, b = st.samples;
  const r = compare(a, b);
  const moved = r.peakDW > 20;
  const moves = name !== 'rest-1st';
  const live = !moves || (moved && r.peakBend > 10);         // the Make recording must actually contain the motion, else the pass is vacuous
  const ok = !r.bad && r.dW <= TOL_PX && r.dX <= TOL_PX && r.dImgX <= TOL_PX && r.dBend <= TOL_PX && r.signMismatch === 0 && r.dOp <= TOL_OPACITY && live && mk.errors.length === 0 && st.errors.length === 0;
  rows.push({ name, r, ok, live, errs: [...mk.errors, ...st.errors] });
  if (!r.bad) {
    // boundary view of the Make recording at the end of the first half of the move, for the log
    const mid = a[Math.min(a.length - 1, 23)].cards.map(c => c.clip);
    r.midBoundaries = (boundaryBends(mid) || []).map(x => `${x.right.toFixed(1)}/${x.left.toFixed(1)}`).join(' ');
  }
  // screenshots: 0/25/50/75/100 % of the last move, both apps, then stacked
  const [sm, ss] = [await execute('make', ops, { shots: name }), await execute('site', ops, { shots: name })];
  const pairs = [0, 25, 50, 75, 100].map(p => [path.join(OUT, `${name}__${p}__make.png`), path.join(OUT, `${name}__${p}__site.png`), path.join(OUT, `${name}__${p}__side-by-side.png`)]);
  await composeSideBySide(pairs);
  process.stdout.write(`${name}: ${ok ? 'PASS' : 'FAIL'}\n`);
}

console.log(`GSAP: make ${versions.make}, site ${versions.site}`);
const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + [pad('path', 11), pad('frames', 7), pad('max|dW| px', 11), pad('max|dX| px', 11), pad('max|dImgX|', 11), pad('max|dBend| px', 14), pad('sign mismatch', 14), pad('max|dOp|', 9), pad('peak bend', 10), 'result'].join(' '));
for (const { name, r, ok, live } of rows) {
  console.log([pad(name, 11), pad(r.frames, 7), pad(r.dW.toFixed(3), 11), pad(r.dX.toFixed(3), 11), pad(r.dImgX.toFixed(3), 11), pad(r.dBend.toFixed(3), 14), pad(r.signMismatch, 14), pad(r.dOp.toFixed(4), 9), pad(r.peakBend.toFixed(1), 10), ok ? 'PASS' : 'FAIL'].join(' ') + (r.bad ? '  ' + r.bad : '') + (!live ? '  (no motion recorded in Make: vacuous)' : ''));
  if (!ok && r.worst) console.log(`    worst ${r.worst.key} at frame ${r.worst.f} card ${r.worst.i}: ${r.worst.where}`);
}
for (const row of rows) if (row.errs.length) console.log(`page errors in ${row.name}: ${row.errs.join(' | ')}`);
await browser.close();
procs.forEach(p => { try { p.kill(); } catch {} });
process.exitCode = rows.every(x => x.ok) ? 0 : 1;
