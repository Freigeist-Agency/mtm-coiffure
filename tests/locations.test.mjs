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

const rowsInfo = page => page.evaluate(() => [...document.querySelectorAll('.location-info')].map(row => {
  const r = e => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height, w: b.width }; };
  const rr = r(row);
  return { top: rr.top + scrollY, bottom: rr.bottom + scrollY, label: r(row.querySelector('h3')), img: r(row.querySelector('.location-img')), btn: r(row.querySelector('.btn')), y: scrollY };
}));

async function goTo(page, y, wheel, width, height) {
  if (wheel) { // real wheel scrolling
    await page.mouse.move(width / 2, height / 2);
    const cur = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, y - cur);
    await settle(page);
  } else {
    await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y);
    await page.waitForTimeout(150);
  }
}
const spread = a => Math.max(...a) - Math.min(...a);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });

async function stickyRun(width, height, { reducedMotion = false, short = false } = {}) {
  const tag = `@${width}x${height}${reducedMotion ? ' reduced-motion' : ''}`;
  const mobile = width <= 767;
  const names = ['nuembrecht', 'waldbroel'];
  const { page, errors, close } = await openPage({ width, height, reducedMotion });
  try {
    // 1. nothing between the sticky items and the body is a scroll container (hidden/auto/scroll kill sticky)
    const chain = await page.evaluate(() => {
      const bad = [], pos = [];
      for (const row of document.querySelectorAll('.location-info')) {
        for (const it of [row.querySelector('h3'), row.querySelector('.btn')]) {
          pos.push(getComputedStyle(it).position);
          for (let e = it.parentElement; e && e !== document.body; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (['hidden', 'auto', 'scroll'].some(v => cs.overflowX === v || cs.overflowY === v)) bad.push(`${e.tagName}.${e.className} ${cs.overflowX}/${cs.overflowY}`);
          }
        }
      }
      const h = getComputedStyle(document.documentElement);
      return { bad: [...new Set(bad)], htmlOverflow: `${h.overflowX}/${h.overflowY}`, pos };
    });
    assert(chain.bad.length === 0, `${tag}: no ancestor of the sticky label/button is a scroll container ${JSON.stringify(chain.bad)}`);
    assert(chain.htmlOverflow === 'visible/visible', `${tag}: html overflow is visible so body overflow-x propagates to the viewport (${chain.htmlOverflow})`);
    assert(chain.pos.length === 4 && chain.pos.every(v => v === 'sticky'), `${tag}: both labels and both buttons are position:sticky ${JSON.stringify(chain.pos)}`);

    const navH = await page.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().height);
    const topLine = mobile ? navH : navH + 0.02 * height;   // where a stuck label sits
    const botLine = height - 0.02 * height;                  // where a stuck button sits (desktop)

    for (let i = 0; i < 2; i++) {
      const n = names[i], t = `${tag} row ${i + 1} (${n})`;
      const info0 = (await rowsInfo(page))[i];
      const rowTop = info0.top, rowBottom = info0.bottom;
      const imgH = info0.img.h;

      if (!mobile) {
        // at rest: photo fully in view -> label on the photo's top edge, button on its bottom edge
        await goTo(page, Math.round(rowTop - (navH + 0.08 * height)), false, width, height);
        const rest = (await rowsInfo(page))[i];
        if (imgH + navH + 0.08 * height <= height) {
          assert(Math.abs(rest.label.top - rest.img.top) <= 0.03 * height, `${t}: at rest the label top is on the photo top (${(rest.label.top - rest.img.top).toFixed(1)}px)`);
          assert(Math.abs(rest.img.bottom - rest.btn.bottom) <= 0.03 * height, `${t}: at rest the button bottom is on the photo bottom (${(rest.img.bottom - rest.btn.bottom).toFixed(1)}px)`);
        }
        if (!reducedMotion && width === 1440 && !short) await shot(page, `${width}-row${i + 1}-rest.png`);
      }

      // Pinning zones. Desktop: label stuck once the photo top passes topLine; button stuck while the photo bottom is below botLine.
      // A 644px photo in a 900px viewport cannot satisfy both at once, so each is sampled in its own zone; in a viewport shorter than the photo both are sampled together.
      const zones = [];
      if (mobile) {
        zones.push({ what: 'bar', lo: rowTop - navH + 0.1 * (imgH + 0), hi: rowBottom - 0.09 * height - navH - 0.1 * imgH, label: true, btn: true });
      } else if (short) {
        zones.push({ what: 'label+button', lo: rowTop - topLine + 5, hi: rowBottom - botLine - 5, label: true, btn: true });
      } else {
        zones.push({ what: 'label (photo leaving)', lo: rowTop - topLine + 0.1 * imgH, hi: rowBottom - topLine - 0.35 * imgH, label: true, btn: false });
        zones.push({ what: 'button (photo entering)', lo: rowTop - 0.78 * height, hi: rowTop - 0.44 * height, label: false, btn: true });
      }
      for (const z of zones) {
        assert(z.hi - z.lo > 100, `${t} ${z.what}: sampling range is long enough (${Math.round(z.hi - z.lo)}px)`);
        const ys = [z.lo, (z.lo + z.hi) / 2, z.hi].map(Math.round);
        const S = [];
        for (let k = 0; k < 3; k++) {
          await goTo(page, ys[k], k === 1, width, height);   // middle sample uses the real wheel
          S.push((await rowsInfo(page))[i]);
        }
        if (z.label) {
          const tops = S.map(x => +x.label.top.toFixed(1));
          assert(spread(tops) <= 2, `${t} ${z.what}: label rect.top constant ${JSON.stringify(tops)} (stuck line ${topLine.toFixed(1)})`);
          assert(Math.abs(tops[1] - topLine) <= 2, `${t} ${z.what}: label sits at ${mobile ? 'nav' : 'nav + 2vh'} (${tops[1]} vs ${topLine.toFixed(1)})`);
        }
        if (z.btn) {
          if (mobile) {
            const tops = S.map(x => +x.btn.top.toFixed(1));
            assert(spread(tops) <= 2 && Math.abs(tops[1] - navH) <= 2, `${t} bar: button rect.top constant under the nav ${JSON.stringify(tops)}`);
          } else {
            const bots = S.map(x => +x.btn.bottom.toFixed(1));
            assert(spread(bots) <= 2, `${t} ${z.what}: button rect.bottom constant ${JSON.stringify(bots)}`);
            assert(Math.abs(bots[1] - botLine) <= 2, `${t} ${z.what}: button sits 2vh above the viewport bottom (${bots[1]} vs ${botLine})`);
          }
        }
        const moved = Math.abs(S[2].img.top - S[0].img.top);
        assert(moved > 100, `${t} ${z.what}: photo moves under the pinned items (${Math.round(moved)}px)`);
        assert(Math.abs(S[1].y - ys[1]) < 40, `${t} ${z.what}: real wheel scroll landed near its target (${S[1].y} vs ${ys[1]})`);
        if (!reducedMotion && (width === 1440 && !short || mobile)) await shot(page, `${width}-row${i + 1}-${z.label ? (mobile ? 'bar' : 'leaving') : 'entering'}.png`);
      }

      if (mobile) {
        const bar = await page.evaluate(i => {
          const row = document.querySelectorAll('.location-info')[i];
          const h = row.querySelector('h3').getBoundingClientRect(), b = row.querySelector('.btn').getBoundingClientRect();
          const cover = [[2, h.top + 2], [h.right - 2, h.bottom - 2], [innerWidth - 2, b.top + 2], [innerWidth - 2, b.bottom - 2], [innerWidth / 2, h.top + 2]]
            .map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && (e.closest('h3') === row.querySelector('h3') || e.closest('.btn') === row.querySelector('.btn')); });
          return { h: Math.max(h.bottom, b.bottom) - Math.min(h.top, b.top), btnIn: b.left >= 0 && b.right <= innerWidth && b.width > 40, cover };
        }, i);
        assert(bar.h <= 0.22 * height, `${t}: bar is <= 22vh (${Math.round(bar.h)} <= ${Math.round(0.22 * height)})`);
        assert(bar.btnIn, `${t}: button fully inside the viewport`);
        assert(bar.cover.every(Boolean), `${t}: bar spans the full width and paints above the photo ${JSON.stringify(bar.cover)}`);
      }
    }

    // handoff: row 1's items leave with row 1, row 2's items belong to row 2
    const infos0 = await rowsInfo(page);
    const hy = Math.round(infos0[1].top - 0.45 * height);
    await goTo(page, hy, false, width, height);
    const [r1, r2] = await rowsInfo(page);
    assert(r1.label.bottom <= r1.top - r1.y + r1.img.h + 1 + 0 && r1.btn.bottom <= (r1.bottom - r1.y) + 1, `${tag} handoff: Nümbrecht label and button stay inside row 1`);
    assert(r2.label.top >= (r2.top - r2.y) - 1, `${tag} handoff: Waldbröl label does not leave its own row`);
    if (!reducedMotion && !short) await shot(page, `${width}-handoff.png`);

    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(sw[0] <= sw[1], `${tag}: no horizontal overflow (${sw[0]} <= ${sw[1]})`);
    assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);
  } finally { await close(); }
}

await stickyRun(1440, 900);
await stickyRun(1440, 520, { short: true });
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
