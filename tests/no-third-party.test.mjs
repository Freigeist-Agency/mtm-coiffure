// Every file from this site (cofounder, 2026-11-19, for the privacy policy: no visitor IP may go to Google Fonts or a code CDN).
// On each page (home, both location pages, Impressum, Datenschutz, the error page), at 1512 and on a phone:
//   1. every request the page makes goes to this site's own server (links that are only clicked, like Planity or Instagram, are no
//      requests); none to fonts.googleapis.com, fonts.gstatic.com, cdnjs.cloudflare.com or cdn.jsdelivr.net;
//   2. the Geom font is loaded from the site, and GSAP and ScrollTrigger run (the animations still work);
//   3. no console errors.
// The harness itself routes no request here (the test opens pages with live: true, so nothing is answered from tests/.cache).
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [w, h, mobile] of [[1512, 900], [375, 812, true]]) {
  for (const path of ['index.html', 'locations/nuembrecht.html', 'locations/waldbroel.html', 'impressum.html', 'datenschutz.html', '404.html']) {
    const tag = `${path} @${w}`;
    const { page, errors, close } = await openPage({ width: w, height: h, path, live: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    const seen = [];
    page.on('request', r => seen.push(r.url()));
    await page.reload({ waitUntil: 'load' });   // record from the first request on
    await sleep(1500);
    const own = new URL(page.url()).origin;
    const outside = [...new Set(seen.filter(u => !u.startsWith(own) && !u.startsWith('data:') && !u.startsWith('blob:')))];
    assert(outside.length === 0, `${tag} 1: no request leaves the site (${outside.join(' ') || 'none'})`);
    const r = await page.evaluate(async () => { await document.fonts.ready; return { geom: document.fonts.check('300 16px Geom'), gsap: !!window.gsap, st: !!window.ScrollTrigger }; });
    assert(r.geom, `${tag} 2: Geom is loaded`);
    if (!/impressum|datenschutz|404/.test(path)) assert(r.gsap && r.st, `${tag} 2: GSAP and ScrollTrigger run`);
    assert(errors.length === 0, `${tag} 3: 0 console errors (${errors.join(' | ')})`);
    await close();
  }
}
await report();
