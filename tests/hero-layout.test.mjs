// Hero header (Figma Desktop_new 324:3096), updated frame 2026-11-16: the claim staggered over two lines.
// At 1512 every piece sits where Figma puts it (within 1px): "Friseurmeister in" 485 wide centred on 453.5 at top 334, extra light
// (200); "Nümbrecht & Waldbröl" 779 wide centred on 911.5 at top 391, black (900); both 64px, blended with difference; the white
// button 163x35 at 704/360; "Willkommen |" light 20px at 319/416; the Arabic 10 after it (446/416; Figma 441 with one l fewer); nav pill 418x50 at 547/10 with the vector
// logo 57x34 at 12/8 inside it. No rating card.
// 1024 and up (the same layout, scaled): the button right of the first line, "Willkommen |" and the Arabic left of the second, none
// of them overlapping. Below 1024 the phone layout: greetings stacked and centred above the claim, the button centred under it.
// Every width: the claim's two lines fit inside the viewport, nothing scrolls sideways.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t = 1) => Math.abs(a - b) <= t;

for (const [w, h, mobile] of [[1512, 806], [1440, 900], [1024, 768], [1100, 800], [1023, 768], [768, 1024], [375, 812, true], [390, 664, true], [2560, 1440]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1500);
  const r = await page.evaluate(() => {
    const b = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    const ink = s => { const g = document.createRange(); g.selectNodeContents(document.querySelector(s)); const r = g.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    const cs = s => getComputedStyle(document.querySelector(s));
    const logo = document.querySelector('.pill-nav__brand img');
    return {
      claim: b('.hero-claim'), light: ink('.hero-claim__light'), bold: ink('.hero-claim__bold'), hello: { ...b('.hero-hello__word'), fs: parseFloat(cs('.hero-hello').fontSize), fw: cs('.hero-hello').fontWeight }, helloInk: ink('.hero-hello__word'), helloText: document.querySelector('.hero-hello__word').innerText.trim(), lightBox: b('.hero-claim__light'), boldBox: b('.hero-claim__bold'), ar: b('.hero-arabic'), cta: b('.hero-cta'),
      plate: b('.pill-nav__plate'), logo: b('.pill-nav__brand img'), logoOk: logo.complete && logo.naturalWidth > 0 && /logo-pill\.svg$/.test(logo.src),
      fs: parseFloat(cs('.hero-claim').fontSize), helloFs: 0, wl: cs('.hero-claim__light').fontWeight, wb: cs('.hero-claim__bold').fontWeight, blend: cs('.hero-claim').mixBlendMode,
      rating: !!document.querySelector('.hero-rating'), sw: document.documentElement.scrollWidth, vw: innerWidth,
    };
  });
  if (w === 1512) {
    assert(near(r.lightBox.x + r.lightBox.w / 2, 453.5) && near(r.lightBox.w, 485) && near(r.lightBox.y, 334), `${tag}: "Friseurmeister in" 485 wide centred on 453.5 at 334 (${JSON.stringify(r.lightBox)})`);
    assert(near(r.boldBox.x + r.boldBox.w / 2, 911.5) && near(r.boldBox.w, 779) && near(r.boldBox.y, 391), `${tag}: "Nümbrecht & Waldbröl" 779 wide centred on 911.5 at 391 (${JSON.stringify(r.boldBox)})`);
    assert(near(r.fs, 64, 0.01) && r.wl === '200' && r.wb === '900' && r.blend === 'difference', `${tag}: 64px, extra light / black, difference (${r.fs} ${r.wl} ${r.wb} ${r.blend})`);
    assert(near(r.hello.x, 319) && near(r.hello.y, 416) && r.hello.fs === 20 && r.hello.fw === '300', `${tag}: "Willkommen |" light 20px at 319/416 (${r.hello.x}, ${r.hello.y})`);
    assert(near(r.ar.x, 446) && near(r.ar.y, 416) && near(r.ar.w, 80.76), `${tag}: arabic at 446/416, 10 after the bar as in Figma (441 there: Figma spells it Wilkommen) (${r.ar.x}, ${r.ar.y})`);
    assert(near(r.cta.x, 704) && near(r.cta.y, 360) && near(r.cta.w, 163) && near(r.cta.h, 35), `${tag}: button 163x35 at 704/360 (${JSON.stringify(r.cta)})`);
    assert(near(r.plate.x, 547) && near(r.plate.y, 10) && near(r.plate.w, 418) && near(r.plate.h, 50), `${tag}: nav pill 418x50 at 547/10`);
    assert(near(r.logo.x - r.plate.x, 12) && near(r.logo.y - r.plate.y, 8) && near(r.logo.w, 57) && near(r.logo.h, 34), `${tag}: logo 57x34 at 12/8 in the pill (${JSON.stringify(r.logo)})`);
  }
  assert(r.logoOk, `${tag}: the vector logo loads`);
  assert(!r.rating, `${tag}: no rating card`);
  assert(r.light.x >= 0 && r.bold.x >= 0 && r.bold.x + r.bold.w <= r.vw && r.light.x + r.light.w <= r.vw && r.bold.y > r.light.y, `${tag}: both claim lines fit the width, in order (${r.bold.x.toFixed(1)}..${(r.bold.x + r.bold.w).toFixed(1)})`);
  const apart = (a, b2) => a.x + a.w <= b2.x || b2.x + b2.w <= a.x || a.y + a.h <= b2.y || b2.y + b2.h <= a.y;
  if (w >= 1024) {
    assert(r.helloText === 'Willkommen |', `${tag}: it reads "Willkommen |" (${r.helloText})`);
    assert(r.cta.x >= r.light.x + r.light.w && r.cta.y < r.bold.y && r.helloInk.x + r.helloInk.w <= r.ar.x && r.ar.x + r.ar.w <= r.bold.x && r.cta.y + r.cta.h <= r.bold.y + 0.16 * r.bold.h && apart(r.ar, r.bold),   // the button's bottom may enter the second line's box by its top 16% (4 of 80 at 1512, as in Figma): its letters start 13 lower
      `${tag}: the button right of the first line, "Willkommen |" then the Arabic left of the second, nothing overlapping`);
  } else {
    assert(r.helloText === 'Willkommen.', `${tag}: it reads "Willkommen." (${r.helloText})`);
    assert(near(r.cta.x + r.cta.w / 2, r.claim.x + r.claim.w / 2, 1.5) && r.cta.y > r.bold.y + r.bold.h, `${tag}: the button is centred under the claim`);
  }
  assert(r.hello.y + r.hello.h <= r.bold.y + r.bold.h + 1 && r.ar.x + r.ar.w <= r.vw, `${tag}: hello and arabic inside the hero`);
  if (w < 1024) {   // cofounder, 2026-11-16: the Arabic stacked over "Willkommen.", both centred above the claim
    const cx = r.vw / 2, mid = b => b.x + b.w / 2;
    assert(Math.abs(mid(r.ar) - cx) < 1 && Math.abs(mid(r.hello) - cx) < 1, `${tag}: the Arabic and Willkommen centred (${mid(r.ar).toFixed(1)}, ${mid(r.hello).toFixed(1)} vs ${cx})`);
    assert(Math.abs(r.hello.y - (r.ar.y + r.ar.h) - 8) < 1 && Math.abs(r.claim.y - (r.hello.y + r.hello.h) - 12) < 1, `${tag}: the Arabic on top, Willkommen 8px under it, the claim 12px under that (${(r.hello.y - r.ar.y - r.ar.h).toFixed(1)}, ${(r.claim.y - r.hello.y - r.hello.h).toFixed(1)})`);
    assert(r.ar.y >= 70, `${tag}: the Arabic clears the nav pill (${r.ar.y.toFixed(0)})`);
  }
  assert(r.light.h < r.fs * 1.6 && r.bold.h < r.fs * 1.6, `${tag}: each claim line stays on one line (${r.light.h.toFixed(0)}, ${r.bold.h.toFixed(0)} at ${r.fs.toFixed(1)}px)`);
  assert(r.sw <= r.vw, `${tag}: no sideways scroll (${r.sw} <= ${r.vw})`);
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
