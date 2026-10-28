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
        const rowVp = S.map(x => x.top - x.y);   // the row's viewport top: constant while it is pinned (the photo itself shifts a few px as the row scales)
        if (i === 0 && !reducedMotion && !short && (mobile || z.label)) {
          // the Nümbrecht row is itself pinned here (location stack, js/stack.js): label, button and photo all stand still
          assert(spread(rowVp) <= 2, `${t} ${z.what}: the row is pinned, so it stands still with its label and button ${JSON.stringify(rowVp.map(Math.round))}`);
        } else {
          assert(moved > 100, `${t} ${z.what}: photo moves under the pinned items (${Math.round(moved)}px)`);
        }
        assert(Math.abs(S[1].y - ys[1]) < 40, `${t} ${z.what}: real wheel scroll landed near its target (${S[1].y} vs ${ys[1]})`);
        if (!reducedMotion && (width === 1440 && !short || mobile)) await shot(page, `${width}-row${i + 1}-${z.label ? (mobile ? 'bar' : 'leaving') : 'entering'}.png`);
      }

      if (mobile) {
        const bar = await page.evaluate(i => {
          const row = document.querySelectorAll('.location-info')[i];
          const h = row.querySelector('h3').getBoundingClientRect(), b = row.querySelector('.btn').getBoundingClientRect();
          // the pinned Nümbrecht row is scaled once Waldbröl is rising, so measure from the bar's own edges
          const cover = [[h.left + 2, h.top + 2], [h.right - 2, h.bottom - 2], [b.right - 2, b.top + 2], [b.right - 2, b.bottom - 2], [(h.left + b.right) / 2, h.top + 2]]
            .map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && (e.closest('h3') === row.querySelector('h3') || e.closest('.btn') === row.querySelector('.btn')); });
          return { h: Math.max(h.bottom, b.bottom) - Math.min(h.top, b.top), btnIn: b.left >= 0 && b.right <= innerWidth && b.width > 40, cover, full: h.left <= 0.5 && b.right >= innerWidth - 0.5 };
        }, i);
        assert(bar.h <= 0.22 * height, `${t}: bar is <= 22vh (${Math.round(bar.h)} <= ${Math.round(0.22 * height)})`);
        assert(bar.btnIn, `${t}: button fully inside the viewport`);
        assert(bar.cover.every(Boolean), `${t}: bar paints above the photo ${JSON.stringify(bar.cover)}`);
        if (i === 1) assert(bar.full, `${t}: bar spans the full width`);   // (the Nümbrecht row is scaled down while Waldbröl rises over it)
      }
    }

    // handoff sweep: scroll through the whole handoff range in ~8px steps and read both rows' items at every step
    const infos0 = await rowsInfo(page);
    // the sweep runs on past the point where the Waldbröl row has covered the (pinned) Nümbrecht row
    const y0 = Math.max(0, Math.round(infos0[1].top - height - 50)), y1 = Math.round(infos0[1].top - (mobile ? navH : topLine) + 0.5 * height);
    const sweep = await page.evaluate(([y0, y1]) => {
      const rows = [...document.querySelectorAll('.location-info')];
      const out = [];
      for (let y = y0; y <= y1; y += 8) {
        scrollTo({ top: y, behavior: 'instant' });
        const g = r => rows[r].querySelector.bind(rows[r]);
        const R = e => e.getBoundingClientRect();
        const nb = R(g(0)('.btn')), nl = R(g(0)('h3'));
        const onTop = (r) => { const e = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return !!e && rows[0].contains(e); };
        out.push({
          y, nueLabelTop: nl.top, nueBtnTop: nb.top, nueBtnBottom: nb.bottom,
          walLabelTop: R(g(1)('h3')).top, walBtnTop: R(g(1)('.btn')).top, rowBottom: R(rows[0]).bottom, walRowTop: R(rows[1]).top,
          nueBtnOnTop: onTop(nb), nueLabelOnTop: onTop(nl), nueLabelMid: (nl.top + nl.bottom) / 2, nueBtnMid: (nb.top + nb.bottom) / 2, nueBtnVisible: nb.top > 60 && nb.bottom < innerHeight, nueLabelVisible: nl.top > 60 && nl.bottom < innerHeight,
        });
      }
      return out;
    }, [y0, y1]);
    assert(sweep.length > 40, `${tag} handoff sweep: enough steps (${sweep.length})`);
    if (!mobile) {
      // The Waldbröl row now rises OVER the pinned Nümbrecht row (location stack), so their rects overlap by design. What must
      // hold instead: whenever the Waldbröl row's top edge is above the Nümbrecht button, the button is not hit-testable on top.
      const covered = sweep.filter(x => x.walRowTop < x.nueBtnTop && x.nueBtnVisible);
      assert(covered.length >= 1 && covered.every(x => !x.nueBtnOnTop), `${tag} handoff sweep: Waldbröl covers the Nümbrecht button, which is never hit-testable above it (${covered.length} covered steps, ${covered.filter(x => x.nueBtnOnTop).length} leaking)`);
      // the Nümbrecht button holds still with its pinned row for several steps (a free-moving one moves every step), then leaves with it
      const plateau = {};
      for (const x of sweep) { const k = Math.round(x.nueBtnBottom); plateau[k] = (plateau[k] || 0) + 1; }
      const stuck = Math.max(...Object.values(plateau));
      assert(stuck >= 3, `${tag} handoff sweep: the Nümbrecht button stood still for at least 3 steps while its row was pinned (${stuck} steps)`);
      const left = sweep.filter(x => x.nueBtnBottom < botLine - 2).length;
      assert(left > 0, `${tag} handoff sweep: the Nümbrecht button then left with its row (${left} steps)`);
    } else {
      const barH = 0.09 * height, lo = navH - 2, hi = navH + barH;
      // the Waldbröl bar now slides over the pinned Nümbrecht bar, so both can share the nav band: then Waldbröl must be the one on top
      const both = sweep.filter(x => x.nueLabelTop >= lo && x.nueLabelTop < hi && x.walLabelTop >= lo && x.walLabelTop < hi);
      // (the centre of the Nümbrecht bar is covered once Waldbröl's top edge has passed it)
      const leak = both.filter(x => (x.walRowTop <= x.nueLabelMid && x.nueLabelOnTop) || (x.walRowTop <= x.nueBtnMid && x.nueBtnOnTop));
      assert(both.length >= 1 && leak.length === 0, `${tag} handoff sweep: whenever the Waldbröl bar's edge has passed the Nümbrecht bar it is on top of it (${both.length} steps share the band, ${leak.length} leaking)`);
      const nueStuck = sweep.filter(x => Math.abs(x.nueLabelTop - navH) <= 2).length, walStuck = sweep.filter(x => Math.abs(x.walLabelTop - navH) <= 2).length;
      assert(nueStuck >= 3 && walStuck >= 3, `${tag} handoff sweep: each bar was stuck under the nav at some step (${nueStuck}, ${walStuck})`);
    }
    const hy = Math.round(infos0[1].top - 0.45 * height);
    await goTo(page, hy, false, width, height);
    if (!reducedMotion && !short) await shot(page, `${width}-handoff.png`);

    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(sw[0] <= sw[1], `${tag}: no horizontal overflow (${sw[0]} <= ${sw[1]})`);
    assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);
  } finally { await close(); }
}

await stickyRun(1440, 900);
await stickyRun(1440, 520, { short: true });
await stickyRun(375, 812);
// reduced motion: the label and button are plain flow, not sticky (spec: "stack/sticky become plain flow")
for (const [width, height] of [[1440, 900], [375, 812]]) {
  const tag = `@${width}x${height} reduced-motion`;
  const { page, errors, close } = await openPage({ width, height, reducedMotion: true });
  try {
    const pos = await page.evaluate(() => [...document.querySelectorAll('.location-info')].flatMap(row => [row.querySelector('h3'), row.querySelector('.btn')].map(e => getComputedStyle(e).position)));
    assert(pos.length === 4 && pos.every(v => v === 'static'), `${tag}: both labels and both buttons are position:static ${JSON.stringify(pos)}`);
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
const menu = fs.readFileSync(path.join(ROOT, 'js/menu.js'), 'utf8');
assert(/label: 'Termin buchen', href: to\('#standorte'\)/.test(menu) && /function to\(hash\)\{ return HOME \? hash : ROOT \+ 'index\.html' \+ hash; \}/.test(menu), 'menu.js: Termin buchen item stays on #standorte (in-page on the home page, ROOT + index.html# elsewhere)');
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
