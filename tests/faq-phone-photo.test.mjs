// FAQ below 1024 (cofounder, 2026-11-15): the team photo with its glow sits between the questions and the two buttons, while the text
// keeps its 16px margins; since 2026-11-16 it is sized so the outer people's elbows are 5vw from the screen's edges (within 1px; the
// glow beyond the screen is cut off, nothing scrolls sideways); the glow fills the box (657 of 685 tall). 1024 and up keep Figma's
// layout (the photo at 186 from the section top, above the buttons). No sideways scroll.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t = 1) => Math.abs(a - b) <= t;
for (const [w, h, mobile] of [[375, 812, true], [390, 844, true], [768, 1024], [1023, 800], [1512, 900]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1200);
  await page.evaluate(async () => { document.querySelectorAll(".faq__person").forEach(i => i.loading = "eager"); await Promise.all([...document.querySelectorAll(".faq__person")].map(i => i.decode().catch(() => {}))); });
  const r = await page.evaluate(() => {
    const s = document.querySelector('.faq').getBoundingClientRect();
    const b = q => { const r = document.querySelector(q).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top - s.top, b: r.bottom - s.top, w: r.width, h: r.height }; };
    const t = document.querySelector('.faq__team');
    const ext = img => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; let l = 1e9, r = -1;
      for (let yy = 0; yy < c.height; yy += 2) for (let xx = 0; xx < c.width; xx++) if (d[(yy * c.width + xx) * 4 + 3] > 40) { if (xx < l) l = xx; if (xx > r) r = xx; }
      const b = img.getBoundingClientRect(), k = b.width / c.width, flip = getComputedStyle(img).scale.startsWith('-1');
      return flip ? { L: b.right - (r + 1) * k, R: b.right - l * k } : { L: b.left + l * k, R: b.left + (r + 1) * k }; };
    const elbow = { L: ext(document.querySelector('.faq__person--left')).L, R: ext(document.querySelector('.faq__person--right')).R };
    return { elbow, list: b('.faq__list'), team: b('.faq__team'), links: b('.pill-btn--mo'), about: b('.faq__about'), bgs: getComputedStyle(t).backgroundSize, vw: innerWidth, sw: document.documentElement.scrollWidth };
  });
  if (w < 1024) {
    assert(r.list.b <= r.team.t && r.team.b <= r.links.t, `${tag}: questions, then the photo, then the buttons (${r.list.b.toFixed(0)} <= ${r.team.t.toFixed(0)}, ${r.team.b.toFixed(0)} <= ${r.links.t.toFixed(0)})`);
    assert(near(r.elbow.L, r.vw * 0.05) && near(r.elbow.R, r.vw * 0.95), `${tag}: the outer elbows 5vw from the edges (${r.elbow.L.toFixed(1)} and ${(r.vw - r.elbow.R).toFixed(1)} from them, want ${(r.vw * 0.05).toFixed(1)})`);
    assert(near(r.list.l, 16) && near(r.list.w, r.vw - 32) && near(r.about.w, r.vw - 32, 1) || r.about.w < r.vw - 32, `${tag}: the text keeps its 16px margins (list ${r.list.l.toFixed(0)}..${r.list.r.toFixed(0)})`);
    assert(r.bgs === '100% 95.912%', `${tag}: the glow fills the photo box (${r.bgs})`);
  } else {
    assert(near(r.team.t, 186 * w / 1512) && r.team.b <= r.links.t, `${tag}: Figma's layout: the photo at 186 from the top, above the buttons`);
  }
  assert(r.sw <= r.vw, `${tag}: no sideways scroll (${r.sw})`);
  assert(errors.length === 0, `${tag}: 0 console errors`);
  await close();
}
await report();
