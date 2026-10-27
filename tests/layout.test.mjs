import { openPage, assert, report } from './harness.mjs';

const WIDTHS = [375, 768, 1440];
const PAGES = ['index.html', 'impressum.html', 'datenschutz.html', '404.html',
  'locations/nuembrecht.html', 'locations/waldbroel.html'];
const ORDER = ['.hero', '.intro', '.services', '.about', '.gallery', '.locations', '.social', '.news', 'footer'];

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
await report();
