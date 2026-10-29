// Task 6: stacked news cards with depth (sticky layers + scrubbed scale/opacity), plus the static fallback.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/stack');
fs.mkdirSync(OUT, { recursive: true });

const settle = page => page.waitForTimeout(160);

const layerInfo = page => page.evaluate(() => {
  const stack = document.querySelector('.news .stack');
  const sr = stack.getBoundingClientRect();
  const layers = [...stack.querySelectorAll(':scope > .stack__layer')].map(el => {
    const cs = getComputedStyle(el), b = el.getBoundingClientRect();
    const m = cs.transform === 'none' ? null : new DOMMatrix(cs.transform);
    const content = el.firstElementChild;   // card: its <p>; video: its poster <img>
    return {
      position: cs.position, top: parseFloat(cs.top), opacity: parseFloat(getComputedStyle(content).opacity), surface: parseFloat(cs.opacity),
      scale: m ? m.a : 1, hasTransform: cs.transform !== 'none',
      rect: { top: b.top, bottom: b.bottom, left: b.left, right: b.right },
    };
  });
  const footer = document.querySelector('.site-footer').getBoundingClientRect();
  return { layers, stack: { top: sr.top, bottom: sr.bottom, h: sr.height, docTop: sr.top + scrollY }, footerTop: footer.top, y: scrollY, ih: innerHeight, st: window.ScrollTrigger ? window.ScrollTrigger.getAll().filter(t => t.trigger !== document.querySelector('.services') && t.vars.id !== 'stack-locations' && !/^arc-/.test(t.vars.id || '')).length : -1   /* the services orbit owns one more, the Standorte stack another (tests/location-stack.test.mjs), js/arc-scroll.js three (ids arc-*) */ };
});

// scroll so that layer `idx` sits at its sticky top (it is still unstuck at the start of the search)
async function toLayer(page, idx) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  for (let i = 0; i < 6; i++) {
    const s = await layerInfo(page);
    const delta = s.layers[idx].rect.top - s.layers[idx].top;
    if (Math.abs(delta) <= 0.5) break;
    await page.evaluate(d => window.scrollBy({ top: d, behavior: 'instant' }), delta);
    await settle(page);
  }
  await settle(page);
  return layerInfo(page);
}

const near = (v, t, tol) => Math.abs(v - t) <= tol;

const stacked = async (width, height) => {
  const tag = `${width}x${height}`;
  const { page, errors, close } = await openPage({ width, height });
  try {
    await page.evaluate(() => window.mtmReady);
    await settle(page);
    const s0 = await layerInfo(page);
    const navH = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')));
    assert(s0.layers.length === 3, `${tag}: three stack layers`);
    assert(s0.layers.every(l => l.position === 'sticky'), `${tag}: every layer is position:sticky (${s0.layers.map(l => l.position)})`);
    const exp = i => navH + 0.04 * height + i * 0.025 * height;
    assert(s0.layers.every((l, i) => near(l.top, exp(i), 1)), `${tag}: sticky tops are nav + 4vh + i*2.5vh (${s0.layers.map(l => l.top.toFixed(1))} vs ${[0, 1, 2].map(i => exp(i).toFixed(1))})`);
    const travel = s0.stack.h - (s0.layers[2].rect.bottom - s0.layers[2].rect.top);
    assert(travel <= 2.5 * height, `${tag}: sticky travel (stack ${s0.stack.h.toFixed(0)} - video) ${travel.toFixed(0)} <= 2.5*innerHeight (${2.5 * height})`);
    assert(travel >= 1.5 * height, `${tag}: sticky travel ${travel.toFixed(0)} >= 1.5*innerHeight (about a viewport per layer)`);
    assert(s0.st === 2, `${tag}: exactly 2 ScrollTriggers (one per covered layer) (${s0.st})`);
    const cardW = s0.layers[0].rect.right - s0.layers[0].rect.left;
    const cx = (s0.layers[0].rect.left + s0.layers[0].rect.right) / 2;
    assert(near(cx, width / 2, 1), `${tag}: cards are centred (${cx})`);
    if (width >= 1200) assert(near(cardW, 460, 8), `${tag}: card width ~460 (${cardW.toFixed(1)})`);
    else if (width >= 768) assert(cardW >= 355 && cardW <= 465, `${tag}: card width at least ~360 (${cardW.toFixed(1)})`);
    else assert(near(cardW, width - 40, 1), `${tag}: card width is viewport minus padding (${cardW.toFixed(1)})`);
    assert(s0.layers.slice(0, 2).every(l => l.surface === 1), `${tag}: card surfaces stay opaque`);
    assert(s0.layers[2].rect.left <= 0.5 && s0.layers[2].rect.right >= width - 0.5, `${tag}: video layer is full-bleed`);

    // before anything has been covered, layer 1 is untouched
    const a = await layerInfo(page);
    assert(a.layers[0].opacity === 1 && near(a.layers[0].scale, 1, 0.001), `${tag}: at the top layer 1 is opacity 1 scale 1`);

    // layer 2 reaches its sticky top = end of the scrub on layer 1
    const c2 = await toLayer(page, 1);
    const [l1, l2] = c2.layers;
    assert(near(l1.opacity, 0.35, 0.05), `${tag}: layer 2 covers layer 1 -> layer 1 opacity ${l1.opacity.toFixed(3)} ~ 0.35`);
    assert(near(l1.scale, 0.92, 0.01), `${tag}: layer 2 covers layer 1 -> layer 1 scale ${l1.scale.toFixed(3)} ~ 0.92`);
    assert(l2.opacity === 1 && near(l2.scale, 1, 0.001), `${tag}: layer 2 itself is opacity 1 scale 1 while it covers (${l2.opacity}/${l2.scale})`);
    assert(l2.rect.top - l1.rect.top >= 10, `${tag}: layer 1's top edge peeks ${(l2.rect.top - l1.rect.top).toFixed(1)}px above layer 2`);
    assert(l1.rect.bottom <= l2.rect.bottom + 0.5 && l1.rect.left >= l2.rect.left - 0.5 && l1.rect.right <= l2.rect.right + 0.5, `${tag}: layer 2 hides the body of layer 1`);
    await page.screenshot({ path: path.join(OUT, `card2-covers-card1-${width}.png`) });

    // halfway through the scrub the values are between the ends (not a snap)
    const startY = c2.y + (c2.layers[1].rect.top - height);          // layer 2 top at viewport bottom
    const endY = c2.y;
    const mid = (startY + endY) / 2;
    await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), mid);
    await settle(page);
    const m = await layerInfo(page);
    assert(m.layers[0].opacity > 0.5 && m.layers[0].opacity < 0.85, `${tag}: mid-scrub layer 1 opacity ${m.layers[0].opacity.toFixed(3)} is between 0.35 and 1`);
    assert(m.layers[0].scale > 0.935 && m.layers[0].scale < 0.985, `${tag}: mid-scrub layer 1 scale ${m.layers[0].scale.toFixed(3)} is between 0.92 and 1`);
    await page.evaluate(v => window.scrollTo({ top: v - 150, behavior: 'instant' }), startY);
    await settle(page);
    const pre = await layerInfo(page);
    assert(pre.layers[0].opacity === 1 && near(pre.layers[0].scale, 1, 0.001), `${tag}: before layer 2 enters, layer 1 is still opacity 1 scale 1`);

    // layer 3 (video) reaches its sticky top
    const c3 = await toLayer(page, 2);
    const [k1, k2, k3] = c3.layers;
    assert(near(k2.opacity, 0.35, 0.05) && near(k2.scale, 0.92, 0.01), `${tag}: video covers layer 2 -> layer 2 opacity ${k2.opacity.toFixed(3)} scale ${k2.scale.toFixed(3)}`);
    assert(k1.opacity <= l1.opacity + 0.001 && k1.scale <= l1.scale + 0.001, `${tag}: layer 1 is no brighter/larger than before (${k1.opacity.toFixed(3)}/${k1.scale.toFixed(3)} vs ${l1.opacity.toFixed(3)}/${l1.scale.toFixed(3)})`);
    assert(k3.opacity === 1 && near(k3.scale, 1, 0.001), `${tag}: video layer ends opacity 1 scale 1`);
    assert(near(k2.rect.top, k2.top, 1), `${tag}: when the video reaches its sticky top, card 2 is still stuck (top ${k2.rect.top.toFixed(1)} vs ${k2.top.toFixed(1)})`);
    assert(k3.rect.top < k2.rect.bottom - 10 && k3.rect.bottom > k2.rect.top, `${tag}: the video overlaps card 2 (video top ${k3.rect.top.toFixed(1)} < card 2 bottom ${k2.rect.bottom.toFixed(1)})`);
    assert(k2.rect.bottom > 0 && k3.rect.top > 0 && k3.rect.top < height, `${tag}: card 2 and the video are both on screen at that frame`);
    assert(k3.rect.left <= k2.rect.left && k3.rect.right >= k2.rect.right, `${tag}: the video is wider than the cards`);
    assert(k1.surface === 1 && k2.surface === 1, `${tag}: covered card surfaces stay opaque (${k1.surface}/${k2.surface})`);
    await page.screenshot({ path: path.join(OUT, `video-covers-both-${width}.png`) });
    // and mid-cover: the video's top edge half way down card 2
    const back = (k2.rect.top + (k2.rect.bottom - k2.rect.top) / 2) - k3.rect.top;
    await page.evaluate(d => window.scrollBy({ top: -d, behavior: 'instant' }), back);
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `video-half-covers-card2-${width}.png`) });
    await page.evaluate(d => window.scrollBy({ top: d, behavior: 'instant' }), back);
    await settle(page);

    // the stack ends cleanly: past it the footer never sits under a stuck layer
    const sweep = [];
    for (let y = c3.y; y <= (await page.evaluate(() => document.documentElement.scrollHeight)) ; y += 120) {
      await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y);
      await page.waitForTimeout(25);
      const s = await layerInfo(page);
      sweep.push(s.layers.every(l => l.rect.bottom <= s.stack.bottom + 0.5) && s.footerTop >= Math.max(...s.layers.map(l => l.rect.bottom)) - 0.5);
    }
    assert(sweep.length > 3 && sweep.every(Boolean), `${tag}: across ${sweep.length} scroll steps past the video, no layer extends below the stack and the footer top is >= every layer bottom`);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await settle(page);
    const end = await layerInfo(page);
    assert(end.footerTop >= end.layers[2].rect.bottom - 0.5, `${tag}: at the very bottom footer top ${end.footerTop.toFixed(1)} >= last layer bottom ${end.layers[2].rect.bottom.toFixed(1)}`);
    assert(errors.length === 0, `${tag}: no page errors ${JSON.stringify(errors)}`);
  } finally { await close(); }
};

const baseline = async (label, opts) => {
  const { page, errors, close } = await openPage(opts);
  const tag = `${label} ${opts.width}`;
  try {
    await settle(page);
    const s = await layerInfo(page);
    assert(s.layers.length === 3, `${tag}: three layers`);
    assert(s.layers.every(l => l.position !== 'sticky' && l.position !== 'absolute' && l.position !== 'fixed'), `${tag}: no layer is sticky/absolute/fixed (${s.layers.map(l => l.position)})`);
    assert(s.layers.every(l => !l.hasTransform && l.opacity === 1 && l.surface === 1), `${tag}: no layer carries a transform or reduced opacity`);
    let overlap = false;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = s.layers[i].rect, b = s.layers[j].rect;
      if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlap = true;
    }
    assert(!overlap, `${tag}: no two layers' rects overlap`);
    assert(s.st <= 0, `${tag}: no ScrollTrigger exists (${s.st})`);
    if (opts.width >= 1200) assert(near(s.layers[0].rect.top, s.layers[1].rect.top, 1) && s.layers[1].rect.left > s.layers[0].rect.right, `${tag}: the two cards sit side by side`);
    assert(s.layers[2].rect.left <= 0.5 && s.layers[2].rect.right >= opts.width - 0.5, `${tag}: video block is full-bleed`);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight / 2, behavior: 'instant' }));
    await settle(page);
    const t = await layerInfo(page);
    assert(t.layers.every(l => !l.hasTransform && l.opacity === 1 && l.surface === 1), `${tag}: still no transform/opacity change after scrolling`);
    assert(errors.length === 0, `${tag}: no page errors ${JSON.stringify(errors)}`);
  } finally { await close(); }
};

await stacked(1440, 900);
await stacked(768, 1024);
await stacked(375, 812);

// in-between widths: the video is shorter or taller than a card here, card 2 must still be stuck under it
for (const [w, h] of [[600, 900], [767, 1024], [1024, 768], [1280, 800]]) {
  const { page, close } = await openPage({ width: w, height: h });
  try {
    await page.evaluate(() => window.mtmReady);
    await settle(page);
    const c = await toLayer(page, 2);
    const [, k2, k3] = c.layers;
    assert(near(k2.rect.top, k2.top, 1) && k3.rect.top < k2.rect.bottom - 10, `${w}x${h}: video reaches its sticky top while card 2 is still stuck beneath it (card 2 ${k2.rect.top.toFixed(0)}..${k2.rect.bottom.toFixed(0)}, video top ${k3.rect.top.toFixed(0)})`);
  } finally { await close(); }
}

// sticky travel budget across target viewports
for (const [w, h] of [[1440, 789], [1366, 768], [1440, 600], [1920, 1080]]) {
  const { page, close } = await openPage({ width: w, height: h });
  try {
    await page.evaluate(() => window.mtmReady);
    await settle(page);
    const s = await layerInfo(page);
    const travel = s.stack.h - (s.layers[2].rect.bottom - s.layers[2].rect.top);
    assert(travel <= 2.5 * h && travel >= 1.5 * h, `${w}x${h}: sticky travel ${travel.toFixed(0)} within [1.5, 2.5] x innerHeight (${1.5 * h}..${2.5 * h})`);
    if (w === 1920) { const cw = s.layers[0].rect.right - s.layers[0].rect.left; assert(cw <= 625, `${w}x${h}: card width capped (${cw.toFixed(1)})`); }
  } finally { await close(); }
}

// real wheel scrolling: drive until layer 2 reaches its sticky top, then read layer 1
for (const [w, h] of [[1440, 900], [375, 812]]) {
  const { page, close } = await openPage({ width: w, height: h });
  try {
    await page.evaluate(() => window.mtmReady);
    await page.mouse.move(w / 2, h / 2);
    let s = await layerInfo(page), n = 0;
    while (n++ < 60 && s.layers[1].rect.top - s.layers[1].top > 0.5) {
      await page.mouse.wheel(0, Math.min(400, Math.max(40, s.layers[1].rect.top - s.layers[1].top)));
      await page.waitForTimeout(90);
      s = await layerInfo(page);
    }
    await page.waitForTimeout(250);
    s = await layerInfo(page);
    assert(near(s.layers[1].rect.top, s.layers[1].top, 1.5), `wheel ${w}: layer 2 reached its sticky top (${s.layers[1].rect.top.toFixed(1)} vs ${s.layers[1].top.toFixed(1)})`);
    assert(near(s.layers[0].opacity, 0.35, 0.05) && near(s.layers[0].scale, 0.92, 0.01), `wheel ${w}: layer 1 opacity ${s.layers[0].opacity.toFixed(3)} scale ${s.layers[0].scale.toFixed(3)} after real wheel scrolling`);
  } finally { await close(); }
}

// static fallbacks
await baseline('no-JS', { width: 1440, js: false });
await baseline('no-JS', { width: 375, height: 812, js: false });
await baseline('reduced-motion', { width: 1440, reducedMotion: true });
await baseline('reduced-motion', { width: 375, height: 812, reducedMotion: true });

// sources
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
const order = ['gsap.min.js', 'ScrollTrigger.min.js', 'js/loader.js', 'js/stack.js'].map(n => srcs.findIndex(s => s.endsWith(n)));
assert(order.every(i => i >= 0) && order.every((v, i) => !i || v > order[i - 1]), `index scripts: gsap, ScrollTrigger, loader, stack in order (${order})`);
assert(srcs.filter(s => /gsap(\.min)?\.js/.test(s)).length === 1 && srcs.filter(s => /ScrollTrigger/.test(s)).length === 1, 'index scripts: no duplicate GSAP / ScrollTrigger tags');
assert(fs.existsSync(path.join(ROOT, 'js/stack.js')), 'js/stack.js exists');

await report();
