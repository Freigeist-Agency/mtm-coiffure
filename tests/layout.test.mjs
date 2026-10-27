import { openPage, assert, report } from './harness.mjs';

const WIDTHS = [375, 768, 1440];
const PAGES = ['index.html', 'impressum.html', 'datenschutz.html', '404.html',
  'locations/nuembrecht.html', 'locations/waldbroel.html'];
const ORDER = ['.hero', '.intro', '.services', '.about', '.gallery', '.locations', '.social', '.news', 'footer'];


// Lazy images that sit off-axis (carousel items, hidden mobile orbit items) never load from a vertical scroll;
// force them to load so "all images loaded" still catches missing files.
async function loadAllImages(page) {
  await page.evaluate(async () => {
    const imgs = [...document.images];
    imgs.forEach(i => { i.loading = 'eager'; });
    await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.addEventListener('load', r); i.addEventListener('error', r); setTimeout(r, 4000); })));
  });
}

for (const width of WIDTHS) {
  for (const p of PAGES) {
    const tag = `${p} @${width}`;
    const { page, errors, close } = await openPage({ width, path: p });
    try {
      // scroll to the bottom in steps so lazy images load
      await page.evaluate(async () => {
        for (let y = 0; y <= document.documentElement.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 40));
        }
        window.scrollTo(0, document.documentElement.scrollHeight);
      });
      await loadAllImages(page);
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        broken: [...document.images].filter(i => !(i.naturalWidth > 0)).map(i => i.getAttribute('src')),
        nav: !!document.querySelector('header nav'),
        footer: document.querySelector('footer')?.textContent || null,
        headerPos: (h => h && getComputedStyle(h).position)(document.querySelector('header.site-header')),
        headerH: document.querySelector('header.site-header')?.getBoundingClientRect().height ?? 0,
        navH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')),
        logo: (i => i ? { loaded: i.naturalWidth > 0, w: i.getBoundingClientRect().width } : null)(
          document.querySelector('header.site-header .brand img')),
        footerBody: !!document.querySelector('footer .footer-body'),
        cols: [...document.querySelectorAll('footer .footer-cols > *')].map(c => { const b = c.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; }),
      }));
      assert(r.sw <= r.iw, `${tag}: no horizontal overflow (${r.sw} <= ${r.iw})`);
      assert(errors.length === 0, `${tag}: no page/console errors ${errors.join(' | ')}`);
      assert(r.broken.length === 0, `${tag}: all images loaded ${r.broken.join(',')}`);
      assert(r.nav, `${tag}: header nav exists`);
      assert(r.footer !== null && r.footer.includes('Nümbrecht') && r.footer.includes('Waldbröl'),
        `${tag}: footer lists both salons`);
      assert(r.headerPos === 'sticky', `${tag}: header is sticky (${r.headerPos})`);
      const wantH = width <= 767 ? 50 : 49;
      assert(r.navH === wantH && Math.abs(r.headerH - wantH) <= 1,
        `${tag}: header height ~${wantH}px, --nav-h=${r.navH}, rendered ${r.headerH}`);
      assert(r.logo !== null && r.logo.loaded && r.logo.w > 40, `${tag}: .brand logo present and loaded ${JSON.stringify(r.logo)}`);
      assert(r.footerBody, `${tag}: footer has .footer-body`);
      assert(r.cols.length === 3, `${tag}: .footer-cols has 3 children (${r.cols.length})`);
      const C = r.cols, n = C.length === 3;
      const near = (a, b2, tol) => Math.abs(a - b2) <= tol;
      if (width >= 768) {
        assert(n && C.every(c => near(c.t, C[0].t, 2)) && C[1].l >= C[0].r && C[2].l >= C[1].r,
          `${tag}: footer columns in a row, same top, no overlap ${JSON.stringify(C)}`);
      } else {
        assert(n && C.every(c => near(c.l, C[0].l, 2)) && C[1].t >= C[0].b && C[2].t >= C[1].b,
          `${tag}: footer columns stacked, same x, no overlap ${JSON.stringify(C)}`);
      }
      if (p === 'index.html') {
        const order = await page.evaluate((sels) => {
          const els = sels.map(s => document.querySelector(s));
          if (els.some(e => !e)) return { missing: sels.filter((s, i) => !els[i]) };
          const ok = els.every((e, i) => i === 0 || (els[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
          return { ok };
        }, ORDER);
        assert(order.ok === true, `${tag}: section order ${order.missing ? 'missing ' + order.missing.join(',') : ''}`);
      }
    } finally { await close(); }
  }
}

// ---------- Home page hooks and static layout (Figma v2) ----------
import fs from 'node:fs';
const indexSrc = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert(indexSrc.includes('TODO(video)'), 'index.html: hero keeps the TODO(video) comment');

for (const width of WIDTHS) {
  const tag = `index.html @${width}`;
  const { page, errors, close } = await openPage({ width, path: 'index.html' });
  try {
    await page.evaluate(async () => {
      for (let y = 0; y <= document.documentElement.scrollHeight; y += 400) {
        window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
    await loadAllImages(page);
    await page.waitForTimeout(300);
    const h = await page.evaluate(() => {
      const q = (s, r = document) => [...r.querySelectorAll(s)];
      const box = e => { const b = e.getBoundingClientRect(); return { l: b.left + scrollX, r: b.right + scrollX, t: b.top + scrollY, b: b.bottom + scrollY, w: b.width, h: b.height }; };
      const orbit = q('.services .orbit')[0];
      const items = orbit ? q('.orbit__item > img', orbit) : [];
      const orbitItems = orbit ? q('.orbit__item', orbit) : [];
      const heading = q('.services h2')[0], cta = q('.services .btn')[0];
      const team = q('.about .carousel[data-carousel="team"]')[0];
      const teamImgs = team ? q('.carousel__item > img', team) : [];
      const social = q('.social .carousel[data-carousel="social"]')[0];
      const aside = q('.locations .locations__aside')[0], media = q('.locations .locations__media')[0];
      const stack = q('.news .stack')[0];
      const layers = stack ? q('.stack__layer', stack) : [];
      const imgs = q('.hero img, .intro img, .services img, .about img');
      return {
        orbit: !!orbit, orbitItems: orbitItems.length, orbitImgs: items.length,
        tilts: orbitItems.map(i => i.style.getPropertyValue('--tilt').trim() || getComputedStyle(i).getPropertyValue('--tilt').trim()),
        itemBoxes: orbitItems.map(box), orbitBox: orbit && box(orbit),
        headBox: heading && box(heading), ctaBox: cta && box(cta),
        team: !!team, teamImgs: teamImgs.length,
        teamRatios: teamImgs.map(i => { const b = i.getBoundingClientRect(); return { rect: b.width / b.height, nat: i.naturalWidth / i.naturalHeight, w: i.naturalWidth }; }),
        teamAlt: teamImgs.every(i => (i.getAttribute('alt') || '').trim().length > 3),
        teamAttrs: teamImgs.every(i => i.getAttribute('width') && i.getAttribute('height')),
        itemsInTeam: team ? q('.carousel__item', team).length : 0,
        social: !!social, socialItems: social ? q('.carousel__item', social).length : 0,
        aside: !!aside, media: !!media,
        asideBeforeMedia: !!(aside && media && (aside.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING)),
        mediaImgs: media ? q('img', media).map(i => { const b = i.getBoundingClientRect(); return b.width / b.height; }) : [],
        stack: !!stack, layers: layers.length,
        videoLayer: layers.some(l => q('[aria-label="Video folgt"]', l).length || l.getAttribute('aria-label') === 'Video folgt'),
        imgAttrs: imgs.every(i => i.hasAttribute('width') && i.hasAttribute('height') && i.hasAttribute('alt')),
        sw: document.documentElement.scrollWidth, iw: innerWidth,
      };
    });
    assert(errors.length === 0, `${tag}: no console errors`);
    // Part A hooks
    assert(h.orbit && h.orbitItems === 8 && h.orbitImgs === 8, `${tag}: .services .orbit has 8 .orbit__item > img (${h.orbitItems}/${h.orbitImgs})`);
    assert(h.tilts.length === 8 && h.tilts.every(t => t !== '' && !isNaN(parseFloat(t))), `${tag}: every orbit item has a numeric --tilt ${JSON.stringify(h.tilts)}`);
    assert(h.team && h.teamImgs === 8 && h.itemsInTeam === 8, `${tag}: .about carousel[data-carousel=team] has 8 .carousel__item > img (${h.teamImgs})`);
    assert(h.teamRatios.length === 8 && h.teamRatios.every(r => Math.abs(r.rect - 1) <= 0.02 && Math.abs(r.nat - 1) <= 0.02),
      `${tag}: team images 1:1 (rendered and natural) ${JSON.stringify(h.teamRatios.map(r => +r.rect.toFixed(3)))}`);
    assert(h.teamAlt && h.teamAttrs, `${tag}: team images have German alt text and width/height`);
    assert(h.imgAttrs, `${tag}: hero..about images have width, height and alt`);
    if (h.orbitBox && h.itemBoxes.length === 8) {
      const B = h.itemBoxes, hb = h.headBox, cb = h.ctaBox;
      const cy = b => (b.t + b.b) / 2, cx = b => (b.l + b.r) / 2;
      const inside = B.every(b => b.l >= -1 && b.r <= h.iw + 1);
      const above = [0, 1, 2].every(i => cy(B[i]) < hb.t), below = [5, 6, 7].every(i => cy(B[i]) > cb.b);
      assert(above && below, `${tag}: orbit order 3 above heading, 3 below the button`);
      if (width > 767) {
        const beside = [3, 4].every(i => cy(B[i]) > hb.t && cy(B[i]) < cb.b + 40);
        assert(beside && cx(B[3]) < hb.l && cx(B[4]) > hb.r, `${tag}: orbit items 3 and 4 sit left and right of the copy`);
        assert(inside, `${tag}: orbit items inside the viewport`);
        assert(cx(B[1]) > h.iw / 2 - 5 && cx(B[1]) < h.iw / 2 + 5, `${tag}: top orbit item centred`);
      } else {
        // Mobile frame 76:222: the two side items are not part of the static layout; side diamonds bleed off the edges
        assert(B.some(b => b.l < 0) && B.some(b => b.r > h.iw), `${tag}: mobile top diamonds bleed past the viewport edges as in Figma`);
      }
    }
    // Part B hooks (not built yet: expected to fail until part B)
    assert(h.social && h.socialItems === 4, `${tag}: .social carousel[data-carousel=social] has 4 .carousel__item (${h.socialItems})`);
    assert(h.aside && h.media && h.asideBeforeMedia, `${tag}: .locations__aside precedes .locations__media`);
    assert(h.mediaImgs.length === 2 && h.mediaImgs.every(r => Math.abs(r - 16 / 9) <= 0.03), `${tag}: locations media has two 16:9 images ${JSON.stringify(h.mediaImgs.map(r => +r.toFixed(2)))}`);
    assert(h.stack && h.layers === 3 && h.videoLayer, `${tag}: .news .stack has 3 .stack__layer, one aria-label="Video folgt" (${h.layers})`);
    assert(h.sw <= h.iw, `${tag}: no horizontal overflow (${h.sw} <= ${h.iw})`);
  } finally { await close(); }
}

// Without JS the team carousel is a horizontal scroll-snap row
for (const width of [1440, 375]) {
  const { page, close } = await openPage({ width, path: 'index.html', js: false });
  try {
    const c = await page.evaluate(() => {
      const el = document.querySelector('.about .carousel[data-carousel="team"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { ox: cs.overflowX, snap: cs.scrollSnapType, scrollable: el.scrollWidth > el.clientWidth };
    });
    assert(c && c.ox === 'auto' && c.snap.includes('x') && c.snap.includes('mandatory') && c.scrollable,
      `no-JS @${width}: team carousel is a scroll-snap row ${JSON.stringify(c)}`);
  } finally { await close(); }
}
await report();
