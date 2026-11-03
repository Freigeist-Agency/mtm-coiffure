// Round 2 loader: logo + glow + counter against Figma (frames 92:10 desktop, 92:50 mobile), and the 0.7s exit.
// Geometry is read at ~600ms into the run (static: only the counter digits change). Pixels come from a screenshot read with PIL.
import { openPage, assert, report } from './harness.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const OUT = new URL('./out/r2-loader/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const FIGMA_DIR = '/home/eddie/.claude/projects/-home-eddie-Work-Amatsima-Code-Freigeist/a0d5abfc-9208-4090-a403-46a99108fe84/tool-results/';
const want = k => !process.env.R2_ONLY || process.env.R2_ONLY.split(',').includes(k);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function begin(opts = {}) {
  const h = await openPage({ ...opts, path: 'impressum.html', skipLoader: true });
  const base = h.page.url().replace(/impressum\.html.*$/, '');
  if (opts.before) await opts.before(h.page);
  await h.page.goto(base + 'index.html', { waitUntil: 'commit' });
  await h.page.waitForFunction(() => performance.getEntriesByName('mtm-loader-start').length > 0, null, { polling: 5 });
  return h;
}
const waitMs = (page, ms) => page.waitForFunction(m => performance.now() - performance.getEntriesByName('mtm-loader-start')[0].startTime >= m, ms, { polling: 5 });
const waitLogo = page => page.waitForFunction(() => { const i = document.querySelector('.loader__logo'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 });

// PIL helper: argv = png, then JSON list of [x, y] points; prints JSON [[r,g,b]...] and, for the column at x = W/2, the first non-white y
function pixels(png, pts, domeCols) {
  const code = `
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
pts = json.loads(sys.argv[2]); cols = json.loads(sys.argv[3])
out = {'px': [list(im.getpixel((x, y))) for x, y in pts], 'dome': {}}
for c, y in cols:
    while y < im.height and min(im.getpixel((c, y))) > 235: y += 1
    out['dome'][str(c)] = y
print(json.dumps(out))`;
  return JSON.parse(execFileSync('python3', ['-I', '-c', code, png, JSON.stringify(pts), JSON.stringify(domeCols)]).toString());
}

// the Figma gradient: centre (cx, cy), radii (rx, ry), stops by offset
const STOPS = [[0, 165, 115, 45], [0.19905, 124, 86, 34], [0.39809, 83, 58, 23], [0.49761, 62, 43, 17], [0.59714, 41, 29, 11], [0.69666, 21, 14, 6], [0.74642, 10, 7, 3], [0.79618, 0, 0, 0]];
function glow(x, y, f) {
  const t = Math.hypot((x - f.cx) / f.rx, (y - f.cy) / f.ry);
  if (t >= STOPS[STOPS.length - 1][0]) return [0, 0, 0];
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) {
    const a = STOPS[i - 1], b = STOPS[i], k = (t - a[0]) / (b[0] - a[0]);
    return [1, 2, 3].map(j => a[j] + (b[j] - a[j]) * k);
  }
}

// Figma frame metrics. fw = frame width, the viewport is fw x 1024 so every vh/vw maps 1:1 to the frame.
const FR = {
  1440: { fw: 1440, logo: [533, 111, 375, 223.5], count: 52, countY: 803.6, domeBottom: 458, domeCy: 172.33, domeRy: 286,
          g: { cx: 720, cy: 172.33, rx: 1010.6, ry: 597.7 }, name: 'FR1' },
  450: { fw: 450, logo: [99, 81, 253, 151], count: 52, countY: 803.5, domeBottom: 357, domeCy: 157, domeRy: 200,
         g: { cx: 225, cy: 172.33, rx: 315.8, ry: 597.7 }, name: 'FR3' },
};

// ---- loading state vs Figma ----------------------------------------------------------------------------------------
if (want('layout')) for (const w of [1440, 450]) {
  const F = FR[w];
  const { page, errors, close } = await begin({ width: w, height: 1024 });
  await waitLogo(page);
  await waitMs(page, 600);
  const m = await page.evaluate(() => {
    const r = e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
    const logo = document.querySelector('.loader__logo');
    const dome = document.querySelector('.loader__dome');
    const count = document.querySelector('.loader__count');
    return {
      vw: innerWidth, vh: innerHeight, logo: r(logo), count: r(count), fs: parseFloat(getComputedStyle(count).fontSize),
      domeT: new DOMMatrix(getComputedStyle(dome).transform).m42, logoOp: getComputedStyle(logo).opacity,
      src: logo.getAttribute('src'),
    };
  });
  assert(m.vw === w && m.vh === 1024, `layout@${w}: precondition, viewport is ${w}x1024 (${m.vw}x${m.vh}) and the dome is still at rest (ty ${m.domeT})`);
  assert(m.domeT === 0 && m.logoOp === '1', `layout@${w}: precondition, loader at rest (logo opacity ${m.logoOp})`);
  const d = m.logo.map((v, i) => v - F.logo[i]);
  assert(d.every(v => Math.abs(v) <= 4), `layout@${w}: logo x/y/w/h vs Figma ${F.name} off by [${d.map(v => v.toFixed(1))}] px, want each within 4 (got ${m.logo.map(v => v.toFixed(1))})`);
  assert(near(m.fs, F.count, 1), `layout@${w}: counter font-size ${m.fs.toFixed(1)}px vs Figma ${F.count}px`);
  const cy = m.count[1] + m.count[3] / 2;
  assert(near(cy, F.countY, 4), `layout@${w}: counter centre y ${cy.toFixed(1)} vs Figma ${F.countY} (within 4)`);
  assert(/loader-logo|logo-nav\.png/.test(m.src), `layout@${w}: logo comes from an assets/ file (${m.src})`);

  const png = `${OUT}loading-${w}.png`;
  await page.screenshot({ path: png });
  // dome edge: two columns off the logo (0.1w and 0.2w); both must sit on Figma's ellipse, which fixes its depth and width
  const g = F.g;
  const pts = [[Math.round(w / 2), Math.round(F.domeBottom + 40)], [Math.round(w * 0.2), Math.round(F.domeBottom + 30)], [Math.round(w / 2), 580]];
  const cols = [Math.round(w * 0.1), Math.round(w * 0.2)];
  const px = pixels(png, pts, cols.map(c => [c, 0]));
  for (const c of cols) {
    const ey = F.domeCy + F.domeRy * Math.sqrt(1 - ((c - w / 2) / (w / 2)) ** 2);
    assert(near(px.dome[c], ey, 5), `layout@${w}: white dome edge at x=${c} is y=${px.dome[c]}, Figma ellipse ${ey.toFixed(1)} (within 5)`);
  }
  pts.forEach(([x, y], i) => {
    const e = glow(x, y, g);
    const dev = Math.max(...px.px[i].map((v, j) => Math.abs(v - e[j])));
    assert(dev <= 10, `layout@${w}: glow pixel (${x},${y}) is rgb(${px.px[i]}), Figma gradient says rgb(${e.map(v => v.toFixed(0))}) (max channel diff ${dev.toFixed(0)}, want <= 10)`);
  });
  assert(errors.length === 0, `layout@${w}: no page errors ${JSON.stringify(errors)}`);
  await close();
}

// ---- loading state at the other widths: screenshots only for the eye, plus "nothing overflows, logo inside the dome" --
if (want('shots')) for (const [w, h] of [[375, 812], [768, 1024], [1440, 900], [2560, 1440]]) {
  const { page, close } = await begin({ width: w, height: h });
  await waitLogo(page);
  await waitMs(page, 600);
  const r = await page.evaluate(() => {
    const l = document.querySelector('.loader__logo').getBoundingClientRect();
    const c = document.querySelector('.loader__count').getBoundingClientRect();
    return { logoBottom: l.bottom, logoL: l.left, logoR: l.right, countTop: c.top, countBottom: c.bottom, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth };
  });
  await page.screenshot({ path: `${OUT}loading-${w}x${h}.png` });
  const px = pixels(`${OUT}loading-${w}x${h}.png`, [[2, 2]], [[Math.round(w / 2), Math.round(r.logoBottom) + 2]]);   // scan starts under the logo, which is dark
  const DOMEB = px.dome[Math.round(w / 2)];
  assert(r.vw === w && r.vh === h, `shots@${w}: precondition, viewport ${r.vw}x${r.vh}`);
  assert(r.logoBottom < DOMEB - 5 && r.logoL > 0 && r.logoR < w, `shots@${w}: logo (bottom ${r.logoBottom.toFixed(0)}) sits inside the white dome (its bottom at ${DOMEB}) and the viewport`);
  assert(r.countTop > DOMEB && r.countBottom < h, `shots@${w}: counter (${r.countTop.toFixed(0)} to ${r.countBottom.toFixed(0)}) is below the dome and inside the viewport`);
  assert(r.sw <= w, `shots@${w}: no horizontal overflow (scrollWidth ${r.sw})`);
  await close();
}

// ---- counter: 0 to 100 with the old timing; exit: duration, ease, order ---------------------------------------------
if (want('exit')) for (const w of [1440, 450]) {
  const { page, errors, close } = await begin({ width: w, height: 1024 });
  await waitLogo(page);
  const R = await page.evaluate(() => new Promise(res => {
    const start = performance.getEntriesByName('mtm-loader-start')[0].startTime;
    const frames = []; let hundredAt = null, nums = new Set();
    const dome = document.querySelector('.loader__dome'), panel = document.querySelector('.loader__panel');
    const count = document.querySelector('.loader__count'), logo = document.querySelector('.loader__logo');
    const domeH = dome.offsetHeight, panelH = panel.offsetHeight;
    const before = getComputedStyle(dome, '::before');
    const white = { h: parseFloat(before.height), ry: parseFloat(before.borderBottomLeftRadius.split(' ')[1]), w: innerWidth };   // the white part of the dome
    (function tick() {
      const t = performance.now() - start;
      if (!document.querySelector('.loader')) { frames.push({ t, gone: true }); return res({ frames, hundredAt, domeH, panelH, white, nums: [...nums] }); }
      const n = [...document.querySelectorAll('.loader__num')].pop();
      if (n) { nums.add(+n.textContent); if (n.textContent === '100' && hundredAt === null) hundredAt = t; }
      frames.push({
        t, dy: new DOMMatrix(getComputedStyle(dome).transform).m42, py: new DOMMatrix(getComputedStyle(panel).transform).m42,
        co: parseFloat(getComputedStyle(count).opacity), lo: parseFloat(getComputedStyle(logo).opacity),
        dt: dome.getBoundingClientRect().top, lr: (r => [r.left, r.top, r.width, r.height])(logo.getBoundingClientRect()),
      });
      if (t > 9000) return res({ frames, hundredAt, domeH, panelH, white, nums: [...nums], timeout: true });
      requestAnimationFrame(tick);
    })();
  }));
  assert(!R.timeout && R.frames.length > 60, `exit@${w}: precondition, ${R.frames.length} frames sampled and the loader ended`);
  assert(R.hundredAt !== null && R.hundredAt > 1900 && R.hundredAt < 2500, `exit@${w}: the counter reaches 100 at ${R.hundredAt && R.hundredAt.toFixed(0)}ms on the loader clock (old timing 2.0s count, want 1900 to 2500)`);
  assert(R.nums.includes(100) && R.nums.some(n => n > 10 && n < 90) && R.nums.length > 40, `exit@${w}: the counter passes through mid values to 100 (${R.nums.length} distinct values)`);
  const fr = R.frames, last = fr[fr.length - 1];
  const moved = f => !f.gone && (f.dy < -0.5 || f.py < -0.5 || f.co < 0.999);
  const first = fr.find(moved);
  assert(first && first.t > R.hundredAt, `exit@${w}: precondition, motion starts after 100 shows (${first && first.t.toFixed(0)} > ${R.hundredAt && R.hundredAt.toFixed(0)})`);
  const dur = last.t - first.t;
  assert(Math.abs(dur - 700) <= 50, `exit@${w}: first moved frame ${first.t.toFixed(0)}ms to loader gone ${last.t.toFixed(0)}ms = ${dur.toFixed(0)}ms (want 700 +- 50)`);
  // one ease: the dome's progress against time, through power3.inOut's inverse, is a straight line of slope 1/0.7s
  const inv = p => p < 0.5 ? (p / 8) ** 0.25 : 1 - ((1 - p) / 8) ** 0.25;   // gsap power3 is a quartic: p = 8x^4 up to the midpoint
  const dm = fr.filter(f => !f.gone && f.dy < 0).map(f => ({ t: f.t, x: inv(Math.min(1, -f.dy / R.domeH)), p: -f.dy / R.domeH })).filter(s => s.p > 0.04 && s.p < 0.96);
  const n = dm.length, mt = dm.reduce((a, s) => a + s.t, 0) / n, mx = dm.reduce((a, s) => a + s.x, 0) / n;
  const sxy = dm.reduce((a, s) => a + (s.t - mt) * (s.x - mx), 0), sxx = dm.reduce((a, s) => a + (s.t - mt) ** 2, 0), syy = dm.reduce((a, s) => a + (s.x - mx) ** 2, 0);
  const slope = sxy / sxx, r2 = sxy * sxy / (sxx * syy);
  assert(n >= 6, `exit@${w}: precondition, ${n} dome frames in the mid-flight range`);
  assert(r2 > 0.995 && near(slope * 1000, 1 / 0.7, 0.15), `exit@${w}: dome follows power3.inOut over 0.7s (linear fit of inverse progress: slope ${(slope * 1000).toFixed(2)}/s want 1.43, r2 ${r2.toFixed(4)})`);
  const pf = fr.find(f => !f.gone && f.py < -0.5);
  assert(pf && pf.t - first.t >= -1 && pf.t - first.t <= 80, `exit@${w}: the panel starts ${pf && (pf.t - first.t).toFixed(0)}ms after the first moved frame (want 0 to 80; it is set to 30)`);
  // the number fades in 0.3s; the logo does not fade, it rises with the dome
  const mid = fr.filter(f => !f.gone).find(f => f.t - first.t >= 350);
  assert(mid && mid.co < 0.05, `exit@${w}: the number is gone by mid-exit (opacity ${mid && mid.co.toFixed(2)})`);
  const live = fr.filter(f => !f.gone && f.t >= first.t - 1);
  const lg = live.filter(f => f.lr[1] + f.lr[3] > 0);   // frames where any of the logo is still on screen
  assert(live.length > 30 && lg.length > 8, `exit@${w}: precondition, ${live.length} exit frames sampled, the logo on screen in ${lg.length}`);
  assert(live.every(f => f.lo === 1), `exit@${w}: logo opacity is 1 in every exit frame (min ${Math.min(...live.map(f => f.lo))})`);
  let up = true, worst = 0;
  for (let i = 1; i < live.length; i++) { const d = live[i].lr[1] - live[i - 1].lr[1]; if (d > 0.01) up = false; worst = Math.max(worst, d); }
  assert(up, `exit@${w}: the logo's top never moves down between frames (largest step down ${worst.toFixed(2)}px)`);
  const risen = live[0].lr[1] - live[live.length - 1].lr[1];
  assert(risen > live[0].lr[3], `exit@${w}: the logo rises by more than its own height (${risen.toFixed(0)}px > ${live[0].lr[3].toFixed(0)}px) and ends above the viewport (bottom ${(live[live.length - 1].lr[1] + live[live.length - 1].lr[3]).toFixed(0)})`);
  const ar = live.map(f => f.lr[2] / f.lr[3]), arMin = Math.min(...ar), arMax = Math.max(...ar);
  assert(arMax - arMin < 0.002 && near(arMin, 708 / 422, 0.01), `exit@${w}: the logo's width/height is constant across the exit (${arMin.toFixed(4)} to ${arMax.toFixed(4)}, image is ${(708 / 422).toFixed(4)})`);
  // inside the white: all four corners of the logo's box are within the dome's white shape (top part + ellipse) in every frame
  const W = R.white, cx = W.w / 2;
  let outside = 0, worstOut = 0;
  for (const f of live) {
    const [l, t, wd, ht] = f.lr, edge = x => f.dt + (W.h - W.ry) + W.ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / cx) ** 2));
    for (const [x, y] of [[l, t], [l + wd, t], [l, t + ht], [l + wd, t + ht]]) {
      const over = y - Math.min(edge(x), f.dt + W.h);
      if (y > f.dt + W.h - 0.5 || over > 0.5) { outside++; worstOut = Math.max(worstOut, over); }
    }
  }
  assert(outside === 0, `exit@${w}: the logo's box stays inside the dome's white shape in every frame (${outside} corner samples outside, worst ${worstOut.toFixed(1)}px)`);
  // after: the page is usable
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'));
  const after = await page.evaluate(async () => {
    await window.mtmReady;
    const sel = 'a[href],button';
    return {
      inert: document.querySelectorAll('[inert]:not([data-clone])').length,
      overflow: getComputedStyle(document.documentElement).overflowY,
      gone: !document.querySelector('.loader'),
      topEl: document.elementFromPoint(innerWidth / 2, innerHeight / 2) && document.elementFromPoint(innerWidth / 2, innerHeight / 2).closest('.loader') === null,
    };
  });
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + '.' + a.className : null; });
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.move(w / 2, 500);
  await page.mouse.wheel(0, 700);
  await sleep(500);
  const y1 = await page.evaluate(() => scrollY);
  assert(after.inert === 0 && after.overflow !== 'hidden' && after.gone && after.topEl, `exit@${w}: page is interactive after (inert ${after.inert}, overflow ${after.overflow}, loader gone ${after.gone}, nothing of the loader under the centre ${after.topEl})`);
  assert(focus && /^(A|BUTTON)\b/.test(focus), `exit@${w}: Tab reaches a link or button on the page (${focus})`);
  assert(y1 > y0 + 100, `exit@${w}: a real wheel scroll moves the page (${y0} -> ${y1})`);
  assert(errors.length === 0, `exit@${w}: no page errors ${JSON.stringify(errors)}`);
  await close();
}

// ---- exit frames at 0/25/50/75/100% (seeked, not real-time), and the overlay on Figma --------------------------------
if (want('frames')) for (const w of [1440, 450]) {
  const F = FR[w];
  const { page, close } = await begin({ width: w, height: 1024 });
  await waitLogo(page);
  // wait until the 100 has finished rolling in (and before the hold ends at 2.15s), then freeze
  await page.waitForFunction(() => { const n = [...document.querySelectorAll('.loader__num')].pop(); return n && n.textContent === '100' && new DOMMatrix(getComputedStyle(n).transform).m42 === 0; }, null, { polling: 5 });
  await page.evaluate(() => { window.gsap.globalTimeline.pause(); });   // freeze at 100, then seek the loader's own timeline
  await sleep(100);
  await page.screenshot({ path: `${OUT}overlay-src-${w}.png` });
  const seeked = await page.evaluate(() => {
    const tl = window.gsap.globalTimeline.getChildren(false, false, true).find(t => t.duration() > 2.5);
    window.__tl = tl; return tl ? [tl.duration(), tl.labels.hold] : null;
  });
  assert(seeked && near(seeked[0] - seeked[1], 0.7, 0.01), `frames@${w}: precondition, the loader timeline's exit (hold to end) is ${seeked && (seeked[0] - seeked[1]).toFixed(3)}s`);
  const t0 = seeked[1];
  for (const f of [0, 25, 50, 75, 100]) {
    await page.evaluate(([t, f]) => { window.__tl.paused(true).time(Math.min(t, window.__tl.duration() - 0.0001)); }, [t0 + 0.7 * f / 100, f]);
    await sleep(60);
    await page.screenshot({ path: `${OUT}exit-${w}-${String(f).padStart(3, '0')}.png` });
  }
  await close();
  // overlay: my frame resampled to the Figma render's size, 50% blend + abs difference; the mean diff over the frame is the number reported
  const fig = FIGMA_DIR + (w === 1440 ? 'mcp-plugin_figma_figma-blob-1793697982777-1kbbjs.png' : 'mcp-plugin_figma_figma-blob-1793698010483-ivqocb.png');
  const code = `
import sys, json
from PIL import Image, ImageChops
a = Image.open(sys.argv[1]).convert('RGB'); b = Image.open(sys.argv[2]).convert('RGB')
a = a.resize(b.size, Image.LANCZOS)
Image.blend(a, b, 0.5).save(sys.argv[3]); ImageChops.difference(a, b).save(sys.argv[4])
d = ImageChops.difference(a, b).convert('L'); h = d.histogram(); n = sum(h)
print(json.dumps({'mean': sum(i*c for i, c in enumerate(h)) / n, 'over40': sum(h[41:]) / n}))`;
  const res = JSON.parse(execFileSync('python3', ['-I', '-c', code, `${OUT}overlay-src-${w}.png`, fig, `${OUT}overlay-${w}.png`, `${OUT}diff-${w}.png`]).toString());
  console.log(`overlay ${w}: ${JSON.stringify(res)}`);
  assert(res.over40 < 0.04, `frames@${w}: against Figma ${F.name} ${(res.over40 * 100).toFixed(2)}% of pixels differ by more than 40/255 (want < 4%; mean ${res.mean.toFixed(2)})`);
}

// ---- Figma FR2 (1440x891, 92:40) is a mid-exit frame: dome edge at y=166 (x centre), panel edge at 731. Seek to where it matches ----
if (want('fr2')) {
  const { page, close } = await begin({ width: 1440, height: 891 });
  await waitLogo(page);
  await page.waitForFunction(() => { const n = [...document.querySelectorAll('.loader__num')].pop(); return n && n.textContent === '100' && new DOMMatrix(getComputedStyle(n).transform).m42 === 0; }, null, { polling: 5 });
  await page.evaluate(() => { window.gsap.globalTimeline.pause(); });
  const hold = await page.evaluate(() => { const tl = window.gsap.globalTimeline.getChildren(false, false, true).find(t => t.duration() > 2.5); window.__tl = tl; return tl.labels.hold; });
  await page.evaluate(h => { window.__tl.paused(true).time(h + 0.34); }, hold);
  await sleep(60);
  await page.screenshot({ path: `${OUT}fr2-compare-1440x891.png` });
  const code = `
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); x = 288
y = 0
while y < im.height and min(im.getpixel((x, y))) > 235: y += 1
dome = y
y = 300
while y < im.height and max(im.getpixel((x, y))) < 40: y += 1
print(json.dumps({'dome': dome, 'panel': y}))`;
  const r = JSON.parse(execFileSync('python3', ['-I', '-c', code, `${OUT}fr2-compare-1440x891.png`]).toString());
  // Figma: dome ellipse centre -120, ry 286, so at x=288 (0.6 of the half-width off centre) the edge is -120 + 286*0.8; panel centre 445.67
  const wantDome = -120 + 286 * 0.8, wantPanel = 445.67 + 286 * 0.8;
  assert(near(r.dome, wantDome, 12), `fr2: dome edge at x=288 is y=${r.dome} at 0.34s into the exit, Figma FR2 has ${wantDome.toFixed(1)} (within 12)`);
  assert(near(r.panel, wantPanel, 25), `fr2: panel edge at x=288 is y=${r.panel} at 0.34s into the exit, Figma FR2 has ${wantPanel.toFixed(1)} (within 25)`);
  await close();
}

// ---- the page transition cover: same panel + dome, no logo, no counter ----------------------------------------------
if (want('transition')) {
  const { page, close } = await begin({
    width: 1440, height: 900,
    before: p => p.addInitScript(() => { try { sessionStorage.setItem('mtm-transition', '1'); sessionStorage.setItem('mtm-visited', '1'); } catch (e) {} }),
  });
  const r = await page.evaluate(() => {
    const d = e => e ? getComputedStyle(e).display : 'absent';
    return {
      loading: document.documentElement.className, cover: !!document.querySelector('.loader'),
      logo: d(document.querySelector('.loader__logo')), count: d(document.querySelector('.loader__count')),
      dome: d(document.querySelector('.loader__dome')),
    };
  });
  assert(/is-transition/.test(r.loading) && r.cover && r.dome === 'block', `transition: precondition, arrived as a transition with the cover up (${r.loading})`);
  assert(r.logo === 'none' && r.count === 'none', `transition: logo and counter are not shown on a page transition (logo ${r.logo}, counter ${r.count})`);
  await page.screenshot({ path: `${OUT}transition-cover-1440.png` });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 5000 });
  await close();
}

await report();
