// Ornament strips (css/textures.css, assets/ornament.svg + assets/ornament-base.png, js/ornament.js), cofounder 2026-11-13: the red star
// of every rosette turns around its small black star as the strip passes through the viewport, neighbours in opposite directions like
// gears, a quarter turn over the whole pass, reversed on the way back. At 375, 768, 1440 and 2560:
//   1. three strips, each with a trigger from its top entering at the bottom of the screen to its bottom leaving at the top;
//   2. the turn follows the scroll linearly: --spin = 90deg x progress at 0, .25, .5, .75, 1 (within 1deg), and back the same way;
//   3. at rest (and after the quarter turn) the strip is Figma's own render (tests/fixtures/figma-pattern-strip-2x.png, the 2x export of
//      300:1859): no pixel off by more than 40 of 255, so no seams and nothing out of place; halfway it is visibly different (rings moved);
//   4. the tile file pairs every ring with its neighbour turning the other way (cw, ccw, cw, ... across the tile), each about its own
//      centre;
// and under reduced motion there is no trigger and the stars stay at rest.
import fs from 'node:fs';
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
const FIG = 'data:image/png;base64,' + fs.readFileSync(new URL('./fixtures/figma-pattern-strip-2x.png', import.meta.url)).toString('base64');

// 4: the tile file
{
  const svg = fs.readFileSync(new URL('../assets/ornament.svg', import.meta.url), 'utf8');
  const rings = [...svg.matchAll(/<g class="orn-ring orn-(cw|ccw)" style="[^"]*transform-origin:([\d.]+)px ([\d.]+)px;transform:rotate\((.*?)\)">/g)].map(m => ({ dir: m[1], x: +m[2], y: +m[3], rot: m[4] }))
    .sort((a, b) => a.x - b.x);
  const alt = rings.every((r, i) => r.dir === (i % 2 ? 'ccw' : 'cw') && (r.dir === 'cw' ? /^var\(--spin/.test(r.rot) : /\* -1/.test(r.rot)));
  const pitch = rings.slice(1).map((r, i) => r.x - rings[i].x);
  assert(rings.length === 8 && alt && pitch.every(p => Math.abs(p - 96.4) < 0.5) && rings.every(r => Math.abs(r.y - 65.5) < 0.2), `4: eight rings per tile, ${rings.map(r => r.dir).join(' ')}, ${pitch.map(p => p.toFixed(1)).join('/')} apart, centred at y ${rings.map(r => r.y).join(',')}`);
}

for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [375, 812, true], [2560, 1440, false]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1500);
  const trig = await page.evaluate(() => [0, 1, 2].map(i => { const t = ScrollTrigger.getById('ornament-' + i), s = document.querySelectorAll('.pattern-strip')[i];
    if (!t) return null; const b = s.getBoundingClientRect(), top = b.top + scrollY; return { s: t.start, e: t.end, wantS: top - innerHeight, wantE: top + b.height }; }));
  assert(trig.every(Boolean) && trig.every(t => Math.abs(t.s - t.wantS) <= 2 && Math.abs(t.e - t.wantE) <= 2), `${tag} 1: three strips, each turning from entering at the bottom to leaving at the top (${trig.map(t => t && `${t.s.toFixed(0)}..${t.e.toFixed(0)} vs ${t.wantS.toFixed(0)}..${t.wantE.toFixed(0)}`).join('; ')})`);
  if (!trig.every(Boolean)) { await close(); continue; }
  // the expected turn comes from where the page really is (a strip already on screen at load starts part way: its start is above
  // scroll 0), read once the 0.5s scrub has settled (two equal readings 150ms apart)
  const read = async () => { let a = -1, b = -2, n = 0; while (Math.abs(a - b) > 0.05 && n++ < 20) { a = b; await sleep(150); b = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.pattern-strip--about')).getPropertyValue('--spin')) || 0); }
    const y = await page.evaluate(() => scrollY); return { spin: b, want: 90 * Math.min(1, Math.max(0, (y - t.s) / (t.e - t.s))) }; };
  const t = trig[0], ps = [0, 0.25, 0.5, 0.75, 1], down = [], up = [];
  for (const p of ps) { await go(page, t.s + (t.e - t.s) * p); await sleep(600); down.push(await read()); }
  for (const p of [...ps].reverse()) { await go(page, t.s + (t.e - t.s) * p); await sleep(600); up.unshift(await read()); }
  assert([...down, ...up].every(r => Math.abs(r.spin - r.want) <= 1) && down[down.length - 1].spin > 89, `${tag} 2: a quarter turn, linear with the scroll, down and back (down ${down.map(r => r.spin.toFixed(1)).join(',')} | up ${up.map(r => r.spin.toFixed(1)).join(',')}; want ${down.map(r => r.want.toFixed(1)).join(',')})`);

  // 3 at every width: the turning rings sit exactly over the still picture: one SVG, the pattern and the first tile at the same x, tiles 771 apart
  const lay = await page.evaluate(() => [...document.querySelectorAll('svg.pattern-strip')].map(s => ({ vb: s.getAttribute('viewBox'), px: +s.querySelector('pattern').getAttribute('x'), pw: +s.querySelector('pattern').getAttribute('width'),
    xs: [...s.querySelectorAll('use')].map(u => +u.getAttribute('x')), ws: [...s.querySelectorAll('use')].map(u => +u.getAttribute('width')) })));
  assert(lay.length === 3 && lay.every(l => l.vb === '0 0 1440 139' && l.pw === 771 && l.xs.length === 3 && l.xs[0] === l.px && l.xs.every((x, i) => x === l.px + 771 * i) && l.ws.every(v => v === 771)),
    `${tag} 3: in each strip the rings line up with the picture under them (${lay.map(l => `pattern x ${l.px}, rings at ${l.xs.join('/')}`).join('; ')})`);
  // 3: pixels. The strip is parked in view with its turn stopped for good (its scrub would keep writing --spin) and smooth scrolling
  // paused; it is photographed at 0, 90 and 7.5deg, then turned into Figma's own render in place (Figma's 2x picture in its pattern, the
  // rings layer removed) and photographed again: the same spot on screen, so both are drawn on the same fraction of a pixel.
  await page.evaluate(() => { const s = document.querySelector('svg.pattern-strip--about'), st = ScrollTrigger.getById('ornament-0');
    st.animation.kill(); st.kill(false); gsap.killTweensOf(s); if (window.lenis) window.lenis.stop(); s.scrollIntoView({ block: 'center' }); });
  await sleep(400);
  const el = await page.$('svg.pattern-strip--about');
  const shot = async deg => { await page.evaluate(d => document.querySelector('svg.pattern-strip--about').style.setProperty('--spin', d + 'deg'), deg); await sleep(300); return (await el.screenshot()).toString('base64'); };
  const s0 = await shot(0), s90 = await shot(90), s7 = await shot(7.5);
  await page.evaluate(fig => { const s = document.querySelector('svg.pattern-strip--about'); s.querySelectorAll('use').forEach(u => u.remove()); s.querySelector('image').setAttribute('href', fig); }, FIG);
  await sleep(400);
  const ref = (await el.screenshot()).toString('base64');
  const stats = (a, b) => page.evaluate(async ([a, b]) => {
    const load = async src => { const i = new Image(); i.src = 'data:image/png;base64,' + src; await i.decode(); return i; };
    const A = await load(a), B = await load(b), c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const x = c.getContext('2d');
    x.drawImage(A, 0, 0); const P = x.getImageData(0, 0, A.width, A.height).data; x.clearRect(0, 0, A.width, A.height); x.drawImage(B, 0, 0); const Q = x.getImageData(0, 0, A.width, A.height).data;
    // blocks: compared as 3x3 averages (the rings are crisp vectors over a picture, so single edge pixels differ in sharpness even where
    // everything is in place; a ring out of its slot differs by far more than 40 over whole blocks); mean: the average difference per pixel
    const W = A.width, H = A.height, avg = (D, x0, y0, ch) => { let s = 0, n = 0; for (let y = Math.max(0, y0 - 1); y <= Math.min(H - 1, y0 + 1); y++) for (let xx = Math.max(0, x0 - 1); xx <= Math.min(W - 1, x0 + 1); xx++) { s += D[(y * W + xx) * 4 + ch]; n++; } return s / n; };
    let bad = 0, n = 0, sum = 0;
    for (let y = 1; y < H; y += 3) for (let xx = 1; xx < W; xx += 3) { n++; if (Math.max(...[0, 1, 2].map(ch => Math.abs(avg(P, xx, y, ch) - avg(Q, xx, y, ch)))) > 40) bad++; }
    for (let i = 0; i < P.length; i += 4) sum += (Math.abs(P[i] - Q[i]) + Math.abs(P[i + 1] - Q[i + 1]) + Math.abs(P[i + 2] - Q[i + 2])) / 3;
    return { bad, n, mean: sum / (P.length / 4) };
  }, [a, b]);
  const r0 = await stats(s0, ref), r90 = await stats(s90, ref), mv = await stats(s0, s7);
  // pixel match with Figma where the strip is big enough to judge (139px tall and up); on tablets and phones the strip is 36-74px tall and
  // the 1-3px triangles drawn as crisp vectors differ from the scaled-down picture almost everywhere in the rings, placed right or not
  if (w >= 1440) assert(r0.bad / r0.n < 0.005 && r90.bad / r90.n < 0.005, `${tag} 3: at rest and after the quarter turn the strip is Figma's render (${r0.bad} and ${r90.bad} of ${r0.n} 3x3 blocks off)`);
  assert(mv.mean > 2, `${tag} 3: part way through (7.5deg) the rings have visibly moved (average change ${mv.mean.toFixed(1)} of 255 per pixel against the rest state)`);
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

{
  const { page, close } = await openPage({ width: 1440, height: 900, reducedMotion: true });
  await sleep(1200);
  const r = await page.evaluate(() => ({ trig: !!(window.ScrollTrigger && ScrollTrigger.getById('ornament-0')), spin: getComputedStyle(document.querySelector('.pattern-strip')).getPropertyValue('--spin') }));
  assert(!r.trig && !r.spin, `@1440 reduced-motion: no trigger, the stars at rest (trigger ${r.trig}, --spin "${r.spin}")`);
  await close();
}
await report();
