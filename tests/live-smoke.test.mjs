// The one test that hits the real CDN and Google Fonts (live: true skips the harness cache).
import { openPage, assert, report } from './harness.mjs';

const { page, errors, close } = await openPage({ width: 1440, live: true });
await page.evaluate(() => document.fonts.ready);
const r = await page.evaluate(() => ({
  gsap: window.gsap && window.gsap.version,
  st: typeof window.ScrollTrigger,
  font: document.fonts.check('16px Geom'),
}));
assert(r.gsap === '3.12.5', `live: window.gsap.version is 3.12.5 (got ${r.gsap})`);
assert(r.st !== 'undefined', 'live: window.ScrollTrigger is defined');
assert(r.font === true, "live: document.fonts.check('16px Geom')");
assert(errors.length === 0, `live: 0 console errors (got ${errors.length}: ${errors.join(' | ')})`);
await close();
await report();
