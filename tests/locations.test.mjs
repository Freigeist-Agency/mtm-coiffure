// Standorte cards + Planity booking links.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, assert, report } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/out/locations');
fs.mkdirSync(OUT, { recursive: true });

const NUE = 'https://www.planity.com/de-DE/mtm-coiffure-by-mo-51588-numbrecht';
const WAL = 'https://www.planity.com/de-DE/mtm-coiffure-by-abdul-51545-waldbrol';

const settle = async (page, y) => {
  // wait until scrollY stops moving (wheel scrolling may be animated)
  let last = -1;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(60);
    const now = await page.evaluate(() => Math.round(scrollY));
    if (now === last) break;
    last = now;
  }
  await page.waitForTimeout(80);
};

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });

// Standorte cards (Figma 64:2): Figma's Glass render of the photo + the salon name centred, Planity link at the bottom edge, one generic button in the header row.
async function cardRun(width, height, { reducedMotion = false } = {}) {
  const tag = `@${width}x${height}${reducedMotion ? ' reduced-motion' : ''}`;
  const { page, errors, close } = await openPage({ width, height, reducedMotion });
  try {
    // nothing above the cards is a scroll container (hidden/auto/scroll would kill the sticky pin)
    const chain = await page.evaluate(() => {
      const bad = [];
      for (const row of document.querySelectorAll('.location-info')) {
        for (let e = row.parentElement; e && e !== document.body; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (['hidden', 'auto', 'scroll'].some(v => cs.overflowX === v || cs.overflowY === v)) bad.push(`${e.tagName}.${e.className} ${cs.overflowX}/${cs.overflowY}`);
        }
      }
      const h = getComputedStyle(document.documentElement);
      return { bad: [...new Set(bad)], htmlOverflow: `${h.overflowX}/${h.overflowY}` };
    });
    assert(chain.bad.length === 0, `${tag}: no ancestor of the cards is a scroll container ${JSON.stringify(chain.bad)}`);
    assert(chain.htmlOverflow === 'visible/visible', `${tag}: html overflow is visible so body overflow-x propagates to the viewport (${chain.htmlOverflow})`);

    for (let i = 0; i < 2; i++) {
      const t = `${tag} card ${i + 1}`;
      // scroll so the card sits whole under the nav (card 1 pinned; card 2 below it is not yet covering)
      await page.evaluate(i => { const c = document.querySelectorAll('.location-info')[i]; window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - 70, behavior: 'instant' }); }, i);
      await page.waitForTimeout(300);
      const c = await page.evaluate(i => {
        const row = document.querySelectorAll('.location-info')[i];
        const R = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const h3 = row.querySelector('h3'), img = row.querySelector('.location-img'), btn = row.querySelector('.btn');
        const br = R(btn);
        const hit = e => { const x = document.elementFromPoint((e.l + e.r) / 2, (e.t + e.b) / 2); return x; };
        return { row: R(row), h3: R(h3), img: R(img), btn: br, text: h3.textContent.trim(), noOverlay: getComputedStyle(row, '::after').content === 'none', glass: /\/location-card\.jpg$/.test(img.currentSrc || img.src), overflow: getComputedStyle(row).overflowX,
          hitBtn: !!hit(br) && !!hit(br).closest('.btn') && hit(br).closest('.btn') === btn, hitH3: !!hit(R(h3)) && !!hit(R(h3)).closest('h3'),
          order: [...row.children].map(x => x.tagName + (x.classList.contains('btn') ? '.btn' : '')).join(), scrollLeft: row.scrollLeft };
      }, i);
      assert(c.order === 'H3,IMG,A.btn', `${t}: children are label, photo, button in DOM order (${c.order})`);
      assert(Math.abs(c.img.w - c.row.w) <= 1 && Math.abs(c.img.h - c.row.h) <= 1, `${t}: the photo fills the card (${c.img.w.toFixed(0)}x${c.img.h.toFixed(0)} in ${c.row.w.toFixed(0)}x${c.row.h.toFixed(0)})`);
      assert(c.glass && c.noOverlay, `${t}: the photo is the baked Figma glass render with no second overlay on it (${c.glass}/${c.noOverlay})`);
      assert(c.overflow === 'clip', `${t}: overflow is clip, so the label and button can stick (${c.overflow})`);
      assert(Math.abs((c.h3.l + c.h3.r) / 2 - (c.row.l + c.row.r) / 2) <= 2 && Math.abs((c.h3.t + c.h3.b) / 2 - (c.row.t + c.row.b) / 2) <= 2, `${t}: the salon name is centred on the card`);
      assert(c.btn.b <= c.row.b + 0.5 && c.btn.t > (c.row.t + c.row.b) / 2 && Math.abs((c.btn.l + c.btn.r) / 2 - (c.row.l + c.row.r) / 2) <= 2, `${t}: the Planity button sits at the bottom edge, centred, inside the card`);
      assert(c.hitBtn && c.hitH3, `${t}: name and button paint above the photo (hit test ${c.hitH3}/${c.hitBtn})`);
      if (width >= 1200) {
        assert(Math.abs(c.row.w - 1400) <= 1 && Math.abs(c.row.h - 787) <= 1, `${t}: 1400x787 at 1440 (${c.row.w.toFixed(1)}x${c.row.h.toFixed(1)})`);
        assert(Math.abs(c.row.l - 20) <= 1, `${t}: x=20 (${c.row.l.toFixed(1)})`);
      }
      assert(Math.abs(c.row.w / c.row.h - 1400 / 787) <= 0.01, `${t}: aspect 1400:787 (${(c.row.w / c.row.h).toFixed(3)})`);
      if (!reducedMotion && width === 1440) await shot(page, `${width}-card${i + 1}.png`);
    }
    const names = await page.evaluate(() => [...document.querySelectorAll('.location-info h3')].map(h => h.textContent.trim()));
    assert(JSON.stringify(names) === JSON.stringify(['Nümbrecht.', 'Waldbröl']), `${tag}: names as in Figma ${JSON.stringify(names)}`);
    // header row: title left, one Termin Buchen button right
    const head = await page.evaluate(() => {
      const R = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top + scrollY, r: b.right, w: b.width, h: b.height }; };
      const h = document.querySelector('.locations__head h2'), b = document.querySelector('.locations__head .btn');
      return { h: R(h), b: R(b), fs: getComputedStyle(h).fontSize, href: b.getAttribute('href'), n: document.querySelectorAll('.locations__head .btn').length };
    });
    assert(head.n === 1 && head.href === '#standorte', `${tag}: one generic Termin Buchen button in the header row (${head.n}, ${head.href})`);
    if (width >= 1200) assert(Math.abs(head.h.l - 20) <= 1 && Math.abs(head.b.r - 1420) <= 1 && Math.abs(head.b.t - head.h.t) <= 1 && Math.abs(parseFloat(head.fs) - 52) <= 0.1, `${tag}: title x=20, button ends at x=1420, same top, 52px (${head.h.l}, ${head.b.r}, ${head.fs})`);
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(sw[0] <= sw[1], `${tag}: no horizontal overflow (${sw[0]} <= ${sw[1]})`);
    assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);
  } finally { await close(); }
}

await cardRun(1440, 900);
await cardRun(768, 1024);
await cardRun(375, 812);
// While a card is taller than the space left, its name stays under the nav and its button at the bottom of the viewport (ported from the live site)
for (const [width, height] of [[1440, 900], [1920, 1080], [375, 812]]) {
  const tag = `@${width}x${height} sticky label`;
  const { page, errors, close } = await openPage({ width, height });
  try {
    await page.evaluate(() => window.mtmReady);
    await page.waitForTimeout(300);
    const read = () => page.evaluate(() => {
      const rows = [...document.querySelectorAll('.location-info')], R = e => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom }; };
      return { rows: rows.map(R), h3: rows.map(r => R(r.querySelector('h3'))), btn: rows.map(r => R(r.querySelector('.btn'))),
        pos: rows.flatMap(r => [getComputedStyle(r.querySelector('h3')).position, getComputedStyle(r.querySelector('.btn')).position]),
        h3Top: rows.map(r => parseFloat(getComputedStyle(r.querySelector('h3')).top)), btnBottom: parseFloat(getComputedStyle(rows[0].querySelector('.btn')).bottom),
        hold: parseFloat(getComputedStyle(rows[1]).marginTop), ih: innerHeight, y: scrollY };
    });
    const s0 = await read();
    // name and button share a grid cell: across both cards' whole passage they never touch
    const pageY = s0.rows[0].t + s0.y, span = s0.rows[1].b - s0.rows[0].t + height;
    let touched = null, both = 0;
    for (let y = pageY - height; y <= pageY + span; y += Math.max(24, Math.round(height / 24))) {
      await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y);
      await page.waitForTimeout(25);
      const r = await read();
      for (const i of [0, 1]) {
        const onScreen = r.h3[i].b > 0 && r.h3[i].t < height && r.btn[i].b > 0 && r.btn[i].t < height;
        if (onScreen) both++;
        if (onScreen && r.h3[i].b > r.btn[i].t - 2 && r.btn[i].b > r.h3[i].t - 2 && !touched) touched = `y=${y} card ${i + 1} name ${r.h3[i].t.toFixed(1)}..${r.h3[i].b.toFixed(1)} button ${r.btn[i].t.toFixed(1)}..${r.btn[i].b.toFixed(1)}`;
      }
    }
    assert(both > 10, `${tag}: the sweep saw name and button on screen together (${both} samples)`);
    assert(!touched, `${tag}: name and button never touch${touched ? ' - ' + touched : ''}`);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(200);
    assert(s0.pos.every(v => v === 'sticky'), `${tag}: names and buttons are position:sticky ${JSON.stringify(s0.pos)}`);
    assert(Math.abs(s0.hold - 0.2 * height) <= 1, `${tag}: the pinned card stands alone for 20vh before the next rises (${s0.hold.toFixed(1)})`);
    // card 1 entering from below: its bottom is past the viewport, so the button holds the viewport's bottom edge
    const docTop = s0.rows[0].t + s0.y, cardH = s0.rows[0].b - s0.rows[0].t;
    if (cardH > height * 0.5) {
      await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), docTop - height + cardH * 0.6);
      await page.waitForTimeout(250);
      const a = await read();
      assert(a.rows[0].b > height + 20, `${tag}: card 1 still runs past the viewport (bottom ${a.rows[0].b.toFixed(1)})`);
      assert(Math.abs(a.btn[0].b - (height - s0.btnBottom)) <= 1.5, `${tag}: the button holds 2vh above the viewport bottom (${a.btn[0].b.toFixed(1)}, expected ${(height - s0.btnBottom).toFixed(1)})`);
      // card 2 past its middle: the name holds under the nav. Pin card 2 by scrolling its middle above the line
      const wal = (await read()).rows[1];
      const walDoc = wal.t + (await read()).y, line = s0.h3Top[1], h3H = s0.h3[1].b - s0.h3[1].t;
      await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), walDoc + cardH * 0.5 + 60 - line);
      await page.waitForTimeout(250);
      const b = await read();
      assert(b.rows[1].t < line - cardH * 0.5 && b.rows[1].b > line + h3H, `${tag}: card 2's middle is above the line and its bottom below it (${b.rows[1].t.toFixed(1)}..${b.rows[1].b.toFixed(1)})`);
      assert(Math.abs(b.h3[1].t - line) <= 1.5, `${tag}: the name holds at nav + 2vh (${b.h3[1].t.toFixed(1)}, expected ${line.toFixed(1)})`);
    }
    assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);
  } finally { await close(); }
}

// reduced motion: the cards are plain flow, not sticky (spec: "stack/sticky become plain flow")
for (const [width, height] of [[1440, 900], [375, 812]]) {
  const tag = `@${width}x${height} reduced-motion`;
  const { page, errors, close } = await openPage({ width, height, reducedMotion: true });
  try {
    const pos = await page.evaluate(() => [...document.querySelectorAll('.location-info')].map(row => getComputedStyle(row).position));
    assert(pos.length === 2 && pos.every(v => v === 'relative'), `${tag}: both cards are plain flow, not sticky ${JSON.stringify(pos)}`);
    const inner = await page.evaluate(() => [...document.querySelectorAll('.location-info h3, .location-info .btn')].map(e => getComputedStyle(e).position));
    assert(inner.length === 4 && inner.every(v => v === 'relative'), `${tag}: names and buttons are plain flow ${JSON.stringify(inner)}`);
    const off = await page.evaluate(() => [...document.querySelectorAll('.location-info')].map(r => { const c = r.getBoundingClientRect(), h = r.querySelector('h3').getBoundingClientRect(); return (h.top + h.bottom) / 2 - (c.top + c.bottom) / 2; }));
    assert(off.every(v => Math.abs(v) <= 1), `${tag}: the name sits at the card's centre (Figma), no sticky offset left on it ${JSON.stringify(off.map(v => +v.toFixed(1)))}`);
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(sw[0] <= sw[1], `${tag}: no horizontal overflow (${sw[0]} <= ${sw[1]})`);
    assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);
  } finally { await close(); }
}

// ---- in-page anchors clear the sticky nav
for (const width of [1440, 375]) {
  const height = width === 1440 ? 900 : 812;
  const probe = page => page.evaluate(() => ({
    h: document.querySelector('#loc-h').getBoundingClientRect().top,
    nav: document.querySelector('.site-header').getBoundingClientRect().bottom, y: scrollY,
  }));
  const loaded = page => page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 9000 });
  // (a) deep link, with the loader (its applyHash must respect scroll-padding too)
  {
    const { page, close } = await openPage({ width, height, path: 'index.html#standorte', skipLoader: false });
    try {
      await loaded(page);
      await page.waitForTimeout(500);
      const r = await probe(page);
      assert(r.y > 100 && r.h >= r.nav - 0.5, `@${width} index.html#standorte: #loc-h top ${r.h.toFixed(1)} >= nav bottom ${r.nav} (scrollY ${Math.round(r.y)})`);
    } finally { await close(); }
  }
  // (b) deep link without the loader (?skiploader: plain browser fragment navigation)
  {
    const { page, close } = await openPage({ width, height, path: '404.html' });
    try {
      await page.goto(page.url().replace('404.html', 'index.html') + '#standorte', { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const r = await probe(page);
      assert(r.y > 100 && r.h >= r.nav - 0.5, `@${width} skiploader#standorte: #loc-h top ${r.h.toFixed(1)} >= nav bottom ${r.nav} (scrollY ${Math.round(r.y)})`);
    } finally { await close(); }
  }
  // (c) clicking a generic Termin Buchen link on the already loaded page (in-page smooth scroll)
  {
    const { page, close } = await openPage({ width, height, skipLoader: false });
    try {
      await loaded(page);
      await page.locator('header.site-header a.btn[aria-label="Termin buchen"]').first().click();
      await settle(page); await page.waitForTimeout(400); await settle(page);
      const r = await probe(page);
      assert(r.y > 100 && r.h >= r.nav - 0.5, `@${width} click Termin buchen: #loc-h top ${r.h.toFixed(1)} >= nav bottom ${r.nav} (scrollY ${Math.round(r.y)})`);
    } finally { await close(); }
  }
}

// ---- index booking links
{
  const { page, close } = await openPage({ width: 1440 });
  try {
    const r = await page.evaluate(() => ({
      standorte: !!document.querySelector('#standorte'),
      info: [...document.querySelectorAll('.location-info .btn')].map(b => ({ label: b.getAttribute('aria-label'), href: b.getAttribute('href'), target: b.getAttribute('target'), rel: b.getAttribute('rel') })),
      generic: [...document.querySelectorAll('a.btn[aria-label="Termin buchen"]')].map(b => b.getAttribute('href')),
    }));
    assert(r.standorte, 'index: #standorte exists');
    assert(r.info.length === 2, `index: exactly 2 .location-info .btn (${r.info.length})`);
    assert(new Set(r.info.map(i => i.label)).size === 2 && r.info.every(i => i.label), 'index: the two location buttons have distinct aria-labels');
    const nue = r.info.find(i => /Nümbrecht/.test(i.label || '')), wal = r.info.find(i => /Waldbröl/.test(i.label || ''));
    assert(nue?.href === NUE, `index: Nümbrecht button -> Planity (${nue?.href})`);
    assert(wal?.href === WAL, `index: Waldbröl button -> Planity (${wal?.href})`);
    assert(r.info.every(i => i.target === '_blank' && /\bnoopener\b/.test(i.rel || '')), 'index: location buttons open in a new tab with rel=noopener');
    assert(r.generic.length >= 3 && r.generic.every(h => /^(index\.html)?#standorte$/.test(h)), `index: generic Termin buchen buttons stay on #standorte (${r.generic.length}: ${[...new Set(r.generic)]})`);
  } finally { await close(); }
}

// ---- subpages
for (const [p, url, name] of [['locations/nuembrecht.html', NUE, 'Nümbrecht'], ['locations/waldbroel.html', WAL, 'Waldbröl']]) {
  const { page, close } = await openPage({ width: 1440, path: p });
  try {
    const r = await page.evaluate(() => ({
      specific: [...document.querySelectorAll('a.btn[aria-label^="Termin buchen in"]')].map(b => ({ label: b.getAttribute('aria-label'), href: b.getAttribute('href'), target: b.getAttribute('target'), rel: b.getAttribute('rel') })),
      generic: [...document.querySelectorAll('a.btn[aria-label="Termin buchen"]')].map(b => b.getAttribute('href')),
    }));
    assert(r.specific.length >= 1 && r.specific.every(b => b.href === url && b.label === `Termin buchen in ${name}`), `${p}: page booking button(s) -> its own Planity page ${JSON.stringify(r.specific.map(b => b.href))}`);
    assert(r.specific.every(b => b.target === '_blank' && /\bnoopener\b/.test(b.rel || '')), `${p}: Planity link is target=_blank rel=noopener`);
    assert(r.generic.length >= 1 && r.generic.every(h => h === '../index.html#standorte'), `${p}: generic buttons stay on ../index.html#standorte (${r.generic})`);
  } finally { await close(); }
}

// ---- sources
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (['tests', 'docs', '.git', '.superpowers', 'node_modules'].includes(f.name)) continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else if (/\.(html|js|css)$/.test(f.name)) files.push(p);
  }
})(ROOT);
const left = files.filter(f => /TODO\(content\): (real )?booking URL/.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(ROOT, f));
assert(left.length === 0, `no "TODO(content): booking URL" comment remains ${JSON.stringify(left)}`);
const othersKept = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('TODO(content): address + phone are placeholders');
assert(othersKept, 'other TODO(content) comments are untouched');

await report();
