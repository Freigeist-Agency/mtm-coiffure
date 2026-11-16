// Hero title morph (js/hero-morph.js), 2026-11-13: "MTM Coiffure." stretches upward from the hero's bottom edge to twice its height (the
// cofounder's picture: 388 of 2000 px wide = 279 of 1440, against 140 now) as the hero scrolls away, on a sine in-out curve.
// At 375, 768, 1440 and 2560:
//   1. the range runs from the top of the page to the hero's bottom leaving the top of the viewport;
//   2. the stretch follows sine in-out: 1 + (1 - cos(pi p)) / 2 at p = 0, .25, .5, .75, 1 (within 0.02), and back the same way;
//   3. only the height changes: the word's centre and width stay put;
//   4. pixels, halfway: the letters' feet are on the hero's bottom edge and the word is 1.5x its resting height;
// under reduced motion nothing stretches.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const READ = () => {
  const s = document.querySelector('.hero-title span'), g = document.createRange(); g.selectNodeContents(s); const r = g.getBoundingClientRect();
  return { sy: new DOMMatrix(getComputedStyle(s).transform).d, cx: (r.left + r.right) / 2, w: r.width, heroBottom: document.querySelector('.hero').getBoundingClientRect().bottom };
};
const want = p => 1 + (1 - Math.cos(Math.PI * p)) / 2;

for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [375, 812, true], [2560, 1440, false]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1000);
  const t = await page.evaluate(() => { const t = window.ScrollTrigger && ScrollTrigger.getById('hero-morph'); return t ? { s: t.start, e: t.end, heroH: document.querySelector('.hero').offsetHeight } : null; });
  assert(!!t, `${tag}: the hero-morph trigger exists`);
  if (!t) { await close(); continue; }
  assert(Math.abs(t.s) < 1 && Math.abs(t.e - t.heroH) < 2, `${tag} 1: the range runs 0 -> the hero's height (${t.s} -> ${t.e}, hero ${t.heroH})`);
  const ps = [0, 0.25, 0.5, 0.75, 1], down = [], up = [];
  for (const p of ps) { await go(page, t.s + (t.e - t.s) * p); await sleep(900); down.push(await page.evaluate(READ)); }
  for (const p of [...ps].reverse()) { await go(page, t.s + (t.e - t.s) * p); await sleep(900); up.push(await page.evaluate(READ)); }
  const bad = ps.map((p, i) => Math.abs(down[i].sy - want(p))).filter(d => d > 0.02).length + ps.map((p, i) => Math.abs(up[ps.length - 1 - i].sy - want(p))).filter(d => d > 0.02).length;
  assert(bad === 0, `${tag} 2: sine in-out, down and back (down ${down.map(r => r.sy.toFixed(3)).join(',')} | up ${up.map(r => r.sy.toFixed(3)).join(',')}; want ${ps.map(p => want(p).toFixed(3)).join(',')})`);
  assert(down.every(r => Math.abs(r.cx - down[0].cx) < 0.5 && Math.abs(r.w - down[0].w) < 0.5), `${tag} 3: only the height changes (centre ${down.map(r => r.cx.toFixed(1)).join(',')}, width ${down.map(r => r.w.toFixed(1)).join(',')})`);

  // 4: halfway, pixels. The video and the texts hidden: only the word is white in the hero.
  await page.addStyleTag({ content: '.hero-media video, .site-header, .hero-intro > p, .hero-arabic, .hero-title small { visibility: hidden !important; }' });
  const measureInk = async () => {
    const png = await page.screenshot();
    return page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const k = img.width / innerWidth, hb = Math.min(innerHeight, document.querySelector('.hero').getBoundingClientRect().bottom), W = img.width;
      const d = x.getImageData(0, 0, W, Math.round(hb * k)).data; let top = -1, bot = -1;
      for (let y = 0; y < Math.round(hb * k); y++) { let n = 0; for (let i = 0; i < W; i++) { const o = (y * W + i) * 4; if (d[o] > 245 && d[o + 1] > 245 && d[o + 2] > 245) n++; } if (n > W * 0.25) { if (top < 0) top = y; bot = y; } }
      return { top: top / k, bot: bot / k, hb, edgeOnScreen: document.querySelector('.hero').getBoundingClientRect().bottom <= innerHeight, fs: parseFloat(getComputedStyle(document.querySelector('.hero-title span')).fontSize) };
    }, png.toString('base64'));
  };
  await go(page, t.s + (t.e - t.s) * 0.5); await sleep(1000);
  const mid = await measureInk();
  await go(page, 0); await sleep(1000);
  const rest = await measureInk();
  // the resting word: Badeen Display's capitals in this word are 0.7em tall (140 of 200px, measured with canvas measureText)
  const midH = mid.bot - mid.top + 1, restH = 0.7 * mid.fs;
  assert(mid.edgeOnScreen && Math.abs(mid.bot - mid.hb) <= 3, `${tag} 4: halfway, the letters' feet are on the hero's bottom edge (${mid.bot.toFixed(1)} vs ${mid.hb.toFixed(1)})`);
  if (rest.edgeOnScreen) assert(Math.abs(rest.bot - rest.hb) <= 3 && Math.abs((rest.bot - rest.top + 1) / restH - 1) < 0.05, `${tag} 4: at rest, the feet on the edge and the word 0.7em tall (${rest.bot.toFixed(1)} vs ${rest.hb.toFixed(1)}, ${(rest.bot - rest.top + 1).toFixed(0)} vs ${restH.toFixed(0)})`);
  assert(Math.abs(midH / restH - 1.5) < 0.05, `${tag} 4: halfway the word is 1.5x its resting height (${midH.toFixed(0)} / ${restH.toFixed(0)} = ${(midH / restH).toFixed(3)})`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

// ---- "Standorte." (2026-11-13: "the same animation"): the same stretch, from entering at the bottom of the viewport to leaving at the top,
//      about its own baseline; the button below and the word's width stay put, and the stretched word never reaches the section's top
for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [375, 812, true], [2560, 1440, false]]) {
  const tag = `@${w}x${h} Standorte`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1000);
  const t = await page.evaluate(() => { const t = window.ScrollTrigger && ScrollTrigger.getById('standorte-morph'); return t ? { s: t.start, e: t.end } : null; });
  assert(!!t, `${tag}: the standorte-morph trigger exists`);
  if (!t) { await close(); continue; }
  const RD = () => { const h2 = document.querySelector('.locations__head h2'), sec = document.querySelector('.locations').getBoundingClientRect(), btn = document.querySelector('.locations__head .btn').getBoundingClientRect();
    const g = document.createRange(); g.selectNodeContents(h2); const r = g.getBoundingClientRect();
    const m = document.createElement('span'); m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'; h2.appendChild(m); const base = m.getBoundingClientRect().top; m.remove();
    const fs = parseFloat(getComputedStyle(h2).fontSize), sy = new DOMMatrix(getComputedStyle(h2).transform).d;
    return { sy, base: base - sec.top, btn: btn.top - sec.top, w: r.width, top: base - 0.7 * fs * sy - sec.top }; };
  const ps = [0, 0.25, 0.5, 0.75, 1], rows = [];
  for (const p of ps) { await go(page, t.s + (t.e - t.s) * p); await sleep(900); rows.push(await page.evaluate(RD)); }
  assert(ps.every((p, i) => Math.abs(rows[i].sy - want(p)) <= 0.02), `${tag}: sine in-out to 2x (${rows.map(r => r.sy.toFixed(3)).join(',')})`);
  assert(rows.every(r => Math.abs(r.base - rows[0].base) < 0.6 && Math.abs(r.btn - rows[0].btn) < 0.6 && Math.abs(r.w - rows[0].w) < 0.6), `${tag}: the baseline, the button and the width stay put (baseline ${rows.map(r => r.base.toFixed(1)).join(',')}, button ${rows.map(r => r.btn.toFixed(1)).join(',')})`);
  assert(rows.every(r => r.top > 0), `${tag}: the stretched word stays inside the section (its top ${rows.map(r => r.top.toFixed(0)).join(',')}px below the section's top)`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

{
  const { page, close } = await openPage({ width: 1440, height: 900, reducedMotion: true });
  await sleep(1000);
  const has = await page.evaluate(() => !!(window.ScrollTrigger && (ScrollTrigger.getById('hero-morph') || ScrollTrigger.getById('standorte-morph'))));
  await go(page, 500); await sleep(600);
  const r = await page.evaluate(READ);
  assert(!has && Math.abs(r.sy - 1) < 1e-6, `@1440 reduced-motion: no morph (trigger ${has}, scaleY ${r.sy})`);
  await close();
}

await report();
