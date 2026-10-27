// Task 5: sticky Standorte aside + Planity booking links.
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

const geom = page => page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); };
  const aside = r('.locations__aside'), main = r('.locations__main'), img = r('.locations__media .location-img');
  return { asideTop: aside.top, asideH: aside.height, imgTop: img.top, mainTopAbs: main.top + scrollY, mainH: main.height, y: scrollY };
});

async function stickyRun(width, height, { reducedMotion = false } = {}) {
  const tag = `@${width}${reducedMotion ? ' reduced-motion' : ''}`;
  const { page, errors, close } = await openPage({ width, height, reducedMotion });
  try {
    // 1. aside is not inside any scroll container (overflow hidden/auto/scroll breaks sticky)
    const chain = await page.evaluate(() => {
      const bad = [];
      for (let e = document.querySelector('.locations__aside').parentElement; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (['hidden', 'auto', 'scroll'].some(v => cs.overflowX === v || cs.overflowY === v)) bad.push(`${e.tagName}.${e.className} ${cs.overflowX}/${cs.overflowY}`);
      }
      const h = getComputedStyle(document.documentElement);
      return { bad, htmlOverflow: `${h.overflowX}/${h.overflowY}`, pos: getComputedStyle(document.querySelector('.locations__aside')).position };
    });
    assert(chain.bad.length === 0, `${tag}: no ancestor of .locations__aside is a scroll container ${JSON.stringify(chain.bad)}`);
    assert(chain.htmlOverflow === 'visible/visible', `${tag}: html overflow is visible so body overflow-x propagates to the viewport (${chain.htmlOverflow})`);
    assert(chain.pos === 'sticky', `${tag}: .locations__aside is position:sticky (${chain.pos})`);

    // 2. three scroll samples inside the stuck range
    const g0 = await geom(page);
    const navH = await page.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().height);
    const range = g0.mainH - g0.asideH;
    assert(range > 300, `${tag}: stuck range is long enough to sample (${Math.round(range)}px)`);
    const first = await page.evaluate(() => { const t = getComputedStyle(document.querySelector('.locations__aside')).top; return parseFloat(t) || 0; });
    const stuckStart = g0.mainTopAbs - first;
    const targets = [0.15, 0.5, 0.85].map(f => Math.round(stuckStart + f * range));
    const samples = [];
    for (let i = 0; i < 3; i++) {
      if (i === 1) { // real wheel scrolling for the middle sample
        await page.mouse.move(width / 2, height / 2);
        const cur = await page.evaluate(() => scrollY);
        await page.mouse.wheel(0, targets[i] - cur);
        await settle(page);
      } else {
        await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), targets[i]);
        await page.waitForTimeout(150);
      }
      const g = await geom(page);
      samples.push(g);
      await page.screenshot({ path: path.join(OUT, `${width}${reducedMotion ? '-rm' : ''}-pos${i + 1}.png`) });
    }
    const tops = samples.map(s => Math.round(s.asideTop * 10) / 10);
    assert(Math.max(...tops) - Math.min(...tops) <= 2, `${tag}: aside rect.top is constant at 3 scroll positions ${JSON.stringify(tops)}`);
    const d = Math.abs(samples[2].imgTop - samples[0].imgTop);
    assert(d > 100, `${tag}: first photo moves under the aside (${Math.round(d)}px)`);
    const wheelMoved = Math.abs(samples[1].y - targets[1]) < 40;
    assert(wheelMoved, `${tag}: real wheel scroll landed near target (${samples[1].y} vs ${targets[1]})`);
    if (width > 767) {
      const want = navH + 0.02 * height;
      assert(Math.abs(tops[1] - want) <= 2, `${tag}: aside sits at nav + 2vh (${tops[1]} vs ${want})`);
    } else {
      assert(Math.abs(tops[1] - navH) <= 2, `${tag}: bar sits directly under the nav (${tops[1]} vs ${navH})`);
      assert(samples[1].asideH <= 0.22 * height, `${tag}: bar is <= 22vh (${Math.round(samples[1].asideH)} <= ${Math.round(0.22 * height)})`);
      const inside = await page.evaluate(() => {
        const a = document.querySelector('.locations__aside').getBoundingClientRect();
        return [...document.querySelectorAll('.location-info .btn')].map(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= a.top - 1 && r.bottom <= a.bottom + 1 && r.width > 40; });
      });
      assert(inside.length === 2 && inside.every(Boolean), `${tag}: both buttons are fully inside the bar and the viewport ${JSON.stringify(inside)}`);
      const cover = await page.evaluate(() => {
        const a = document.querySelector('.locations__aside').getBoundingClientRect();
        // the topmost element at the bar's corners must be the bar (photos scroll beneath it)
        return [[a.left + 2, a.top + 2], [innerWidth - 2, a.top + 2], [innerWidth - 2, a.bottom - 2]].map(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.locations__aside'));
      });
      assert(cover.every(Boolean), `${tag}: bar spans the full width and paints above the photos ${JSON.stringify(cover)}`);
    }
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(sw[0] <= sw[1], `${tag}: no horizontal overflow (${sw[0]} <= ${sw[1]})`);
    assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);
  } finally { await close(); }
}

await stickyRun(1440, 900);
await stickyRun(375, 812);
await stickyRun(1440, 900, { reducedMotion: true });
await stickyRun(375, 812, { reducedMotion: true });

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
const menu = fs.readFileSync(path.join(ROOT, 'js/menu.js'), 'utf8');
assert(/label: 'Termin buchen', href: ROOT \+ 'index\.html#standorte'/.test(menu), 'menu.js: Termin buchen item stays on #standorte');
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
