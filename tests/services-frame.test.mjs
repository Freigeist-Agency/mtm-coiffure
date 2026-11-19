// Services section, new frame (Figma Desktop_new 324:3998, 2026-11-15; the frame sits at x=-2, so page x = Figma x - 2).
// At 1512 (within 1px, relative to the section): section 995 tall; Google rating card 384x61 at 134/103 with the wordmark, stars and
// "171 Bewertungen" at 13/17, 119/8, 252/21; title at 758/148 (64px, light over black); photos at 9/290, 258/332, 509/378, 759/423,
// 1010/466, 1261/511; text 399 wide at 134/823; the black button 151x32 at 134/942 using Figma's svg.
// Below 1024: the rating card comes first and fits the width, each title line stays on one line inside the viewport, no sideways scroll.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t = 1) => Math.abs(a - b) <= t;

for (const [w, h, mobile] of [[1512, 900], [1440, 900], [768, 1024], [375, 812, true], [2560, 1440]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1500);
  const r = await page.evaluate(() => {
    const s = document.querySelector('.services').getBoundingClientRect();
    const b = q => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, vx: r.left, vr: r.right }; };
    const ink = q => { const g = document.createRange(); g.selectNodeContents(document.querySelector(q)); const r = g.getBoundingClientRect(); return { y: r.top - s.top, h: r.height, l: r.left, r: r.right }; };
    const btn = document.querySelector('.services-cta img');
    return {
      sh: s.height, rating: b('.svc-rating'), g: b('.svc-rating__google'), st: b('.svc-rating__stars'), cnt: b('.svc-rating__count'),
      title: b('.services-title'), light: ink('.services-title .headline__light'), bold: ink('.services-title .headline__bold'),
      fs: parseFloat(getComputedStyle(document.querySelector('.services-title')).fontSize),
      cuts: [...document.querySelectorAll('.cuts li:not(.is-clone)')].map(li => { const r = li.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top }; }),
      text: b('.services-text'), cta: b('.services-cta'), btnSrc: btn.getAttribute('src'), btnOk: btn.complete && btn.naturalWidth > 0,
      firstChildIsRating: (() => { const kids = [...document.querySelector('.services').children].filter(e => getComputedStyle(e).display !== 'none'); return kids.map(e => e.getBoundingClientRect().top).every(t => t >= document.querySelector('.svc-rating').getBoundingClientRect().top - 0.5); })(),
      sw: document.documentElement.scrollWidth, vw: innerWidth,
    };
  });
  if (w === 1512) {
    assert(near(r.sh, 995), `${tag}: section 995 tall (${r.sh})`);
    assert(near(r.rating.x, 134) && near(r.rating.y, 103) && near(r.rating.w, 384) && near(r.rating.h, 61), `${tag}: rating card 384x61 at 134/103 (${JSON.stringify(r.rating)})`);
    assert(near(r.g.x - r.rating.x, 13) && near(r.g.y - r.rating.y, 17) && near(r.st.x - r.rating.x, 119) && near(r.st.y - r.rating.y, 8) && near(r.cnt.x - r.rating.x, 252) && near(r.cnt.y - r.rating.y, 21),
      `${tag}: wordmark, stars, count inside the card at Figma's spots`);
    assert(near(r.title.x, 758) && near(r.title.y, 148) && near(r.fs, 64, 0.01), `${tag}: title 64px at 758/148 (${r.title.x}, ${r.title.y})`);
    const want = [[9, 290], [258, 332], [509, 378], [759, 423], [1010, 466], [1261, 511]];
    assert(r.cuts.length === 6 && r.cuts.every((c, i) => near(c.x, want[i][0]) && near(c.y, want[i][1])), `${tag}: six photos step down at Figma's spots (${r.cuts.map(c => `${c.x.toFixed(0)}/${c.y.toFixed(0)}`).join(' ')})`);
    assert(near(r.text.x, 134) && near(r.text.y, 823) && near(r.text.w, 399), `${tag}: text 399 wide at 134/823`);
    assert(near(r.cta.x, 134) && near(r.cta.y, 942) && near(r.cta.w, 151) && near(r.cta.h, 32), `${tag}: button 151x32 at 134/942 (${JSON.stringify(r.cta)})`);
  }
  assert(/btn-black\.svg$/.test(r.btnSrc) && r.btnOk, `${tag}: the button is Figma's 151x32 svg and loads`);
  assert(r.rating.vx >= 0 && r.rating.vr <= r.vw, `${tag}: the rating card fits the width (${r.rating.vx.toFixed(0)}..${r.rating.vr.toFixed(0)})`);
  assert(r.light.h < r.fs * 1.6 && r.bold.h < r.fs * 1.6 && r.light.l >= 0 && r.bold.l >= 0 && r.light.r <= r.vw && r.bold.r <= r.vw, `${tag}: each title line on one line inside the viewport (${r.light.h.toFixed(0)}/${r.bold.h.toFixed(0)} at ${r.fs.toFixed(1)}px, right ${r.light.r.toFixed(0)}/${r.bold.r.toFixed(0)})`);
  if (w < 1024) assert(r.firstChildIsRating, `${tag}: the rating card comes first`);
  assert(r.sw <= r.vw, `${tag}: no sideways scroll (${r.sw} <= ${r.vw})`);
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
