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
      }));
      assert(r.sw <= r.iw, `${tag}: no horizontal overflow (${r.sw} <= ${r.iw})`);
      assert(errors.length === 0, `${tag}: no page/console errors ${errors.join(' | ')}`);
      assert(r.broken.length === 0, `${tag}: all images loaded ${r.broken.join(',')}`);
      assert(r.nav, `${tag}: header nav exists`);
      assert(r.footer !== null && r.footer.includes('Nümbrecht') && r.footer.includes('Waldbröl'),
        `${tag}: footer lists both salons`);
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
