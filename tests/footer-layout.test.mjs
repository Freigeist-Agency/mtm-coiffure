// Footer (cofounder, 2026-11-16): the new Termin button, the FRED badge linking to freigeist.agency, and on phones the layout of
// the cofounder's screenshot. On the home page, a location page and Impressum:
//   1. the footer's button is assets/v2/btn-black.svg, 184x39 from 768 up, its corners rounded (10 on 151 x 32); it books where the
//      page books (the home page and Impressum: the Standorte; a location page: its Planity page);
//   2. the FRED badge links to https://www.freigeist.agency/de/ in a new tab;
//   3. phones (375, 390, 320): the logo 36% of the width, the button 59.2% wide 34px under it, the black curve 94px under the button,
//      the first heading 98px under the curve and 14.7% in from the left, the addresses on one line (from 360), the FRED badge to the
//      right of "Folge uns" level with it, under a line inset 5.6% each side the copyright with the legal links on their own line below;
//   4. nothing scrolls sideways (320 included), no console errors.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t = 1) => Math.abs(a - b) <= t;
const FRED = 'https://www.freigeist.agency/de/';
const BOOK = { 'index.html': '#standorte', 'impressum.html': null, 'locations/waldbroel.html': 'https://www.planity.com/de-DE/mtm-coiffure-by-abdul-51545-waldbrol' };

for (const path of Object.keys(BOOK)) {
  for (const [w, h, mobile] of [[1512, 900], [768, 1024], [375, 812, true], [390, 844, true], [320, 640, true]]) {
    const tag = `${path} @${w}`;
    const { page, errors, close } = await openPage({ width: w, height: h, path, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    await sleep(1200);
    await page.evaluate(() => document.querySelectorAll('.footer-fred, .footer-logo img').forEach(i => i.loading = 'eager'));
    await page.evaluate(async () => { await Promise.all([...document.querySelectorAll('.footer-fred, .footer-logo img')].map(i => i.decode().catch(() => {}))); });
    const r = await page.evaluate(() => {
      const body = document.querySelector('.footer-body').getBoundingClientRect(), vw = innerWidth;
      const b = s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top - body.top, b: r.bottom - body.top, w: r.width, h: r.height }; };
      const cta = document.querySelector('.footer-cta'), img = cta.querySelector('img'), fred = document.querySelector('.footer-fred-link');
      const cols = [...document.querySelectorAll('.footer-col')], last = cols[cols.length - 1];
      const adr = cols.slice(0, 2).map(c => { const p = c.querySelector('p'), g = document.createRange(); g.selectNodeContents(p); return Math.round(g.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight)); });
      const bottom = document.querySelector('.footer-bottom'), copy = bottom.querySelector('span').getBoundingClientRect(), nav = bottom.querySelector('nav').getBoundingClientRect(), br = bottom.getBoundingClientRect();
      return { vw, src: img.getAttribute('src'), iw: img.getBoundingClientRect().width, ih: img.getBoundingClientRect().height, rad: getComputedStyle(cta).borderTopLeftRadius, of: getComputedStyle(cta).overflow, href: cta.getAttribute('href'),
        fred: fred && { href: fred.getAttribute('href'), target: fred.getAttribute('target'), img: !!fred.querySelector('img.footer-fred') }, logo: b('.footer-logo'), cta: b('.footer-cta'),
        dome: parseFloat(getComputedStyle(document.querySelector('.footer-body'), '::before').top), h3: b('.footer-col h3'), adr,
        fh3: (() => { const e = last.querySelector('h3').getBoundingClientRect(); return { l: e.left, r: e.right, t: e.top }; })(), fb: (() => { const e = document.querySelector('.footer-fred').getBoundingClientRect(); return { l: e.left, r: e.right, t: e.top }; })(),
        copy: { t: copy.top, b: copy.bottom, l: copy.left }, nav: { t: nav.top, l: nav.left }, line: { l: br.left, r: br.right }, sw: document.documentElement.scrollWidth };
    });
    assert(r.src === 'assets/v2/btn-black.svg' || r.src === '../assets/v2/btn-black.svg', `${tag} 1: the new button (${r.src})`);
    if (w >= 768) assert(near(r.iw, 184) && near(r.ih, 39), `${tag} 1: 184x39 (${r.iw.toFixed(0)}x${r.ih.toFixed(0)})`);
    assert(r.of === 'hidden' && r.rad.includes('%') || parseFloat(r.rad) > 0, `${tag} 1: rounded corners (${r.rad})`);
    if (BOOK[path]) assert(r.href === BOOK[path], `${tag} 1: it books where the page books (${r.href})`);
    assert(r.fred && r.fred.href === FRED && r.fred.target === '_blank' && r.fred.img, `${tag} 2: FRED links to ${FRED} in a new tab`);
    if (w < 768) {
      const vw = r.vw, bot = r.cta.b;
      assert(near(r.logo.w, vw * 0.36, 1) && near(r.cta.w, vw * 0.592, 1) && near(r.cta.t - r.logo.b, 34, 1.5), `${tag} 3: logo 36%, button 59.2% wide 34px under it (${r.logo.w.toFixed(0)}, ${r.cta.w.toFixed(0)}, ${(r.cta.t - r.logo.b).toFixed(1)})`);
      assert(near(r.dome - bot, 94, 1) && near(r.h3.t - r.dome, 98, 1) && near(r.h3.l, vw * 0.147, 1), `${tag} 3: curve 94 under the button, heading 98 under the curve, 14.7% in (${(r.dome - bot).toFixed(1)}, ${(r.h3.t - r.dome).toFixed(1)}, ${r.h3.l.toFixed(1)})`);
      if (w >= 360) assert(r.adr.every(n => n === 1), `${tag} 3: each address on one line (${r.adr})`);
      assert(r.fb.l > r.fh3.r && r.fb.r <= vw && Math.abs(r.fb.t - r.fh3.t) < 12, `${tag} 3: FRED to the right of "Folge uns", level with it (${r.fb.l.toFixed(0)} > ${r.fh3.r.toFixed(0)}, tops ${r.fb.t.toFixed(0)} / ${r.fh3.t.toFixed(0)})`);
      assert(near(r.line.l, vw * 0.056, 1) && near(vw - r.line.r, vw * 0.056, 1) && r.nav.t >= r.copy.b && near(r.nav.l, r.copy.l, 1), `${tag} 3: the line inset 5.6%, the copyright above the legal links, both from the left`);
    }
    assert(r.sw <= r.vw, `${tag} 4: no sideways scroll (${r.sw})`);
    assert(errors.length === 0, `${tag} 4: 0 console errors (${errors.join(' | ')})`);
    await close();
  }
}
await report();
