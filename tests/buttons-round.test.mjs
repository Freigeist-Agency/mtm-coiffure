// Buttons, 2026-11-15 (cofounder): the social buttons (Instagram, TikTok) have 20px corners like the other buttons, clipped so the svg's
// own 5px corners do not show; the radial slider's previous/next buttons are round circles; the reviews card's button is the hero's
// white button (same svg, same size, same corners; it was the nav's black one for an hour). Every width.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [w, h, mobile] of [[1512, 900], [768, 1024], [375, 812, true], [2560, 1440]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1500);
  const r = await page.evaluate(() => {
    const cs = e => getComputedStyle(e);
    const soc = [...document.querySelectorAll('.social-links .btn--social')].map(a => ({ r: cs(a).borderTopLeftRadius, rb: cs(a).borderBottomRightRadius, of: cs(a).overflow, h: a.getBoundingClientRect().height }));
    const arrows = [...document.querySelectorAll('.radial-slider .radial-slider__btn')].map(b => { const r = b.getBoundingClientRect(); return { r: cs(b).borderTopLeftRadius, w: r.width, h: r.height }; });
    const nav = document.querySelector('.hero-cta'), rev = document.querySelector('.reviews__btn');
    const ni = nav.querySelector('img'), ri = rev.querySelector('img');
    return { soc, arrows, nav: { src: ni.getAttribute('src'), w: ni.getBoundingClientRect().width, h: ni.getBoundingClientRect().height, r: cs(nav).borderTopLeftRadius },
      rev: { src: ri.getAttribute('src'), w: parseFloat(cs(ri).width), h: parseFloat(cs(ri).height), r: cs(rev).borderTopLeftRadius, of: cs(rev).overflow, ok: ri.complete && ri.naturalWidth > 0 } };
  });
  assert(r.soc.length === 2 && r.soc.every(s => s.r === '20px' && s.rb === '20px' && s.of === 'hidden'), `${tag}: both social buttons have 20px corners, clipped (${JSON.stringify(r.soc)})`);
  assert(r.arrows.length === 2 && r.arrows.every(a => a.r === '50%' && Math.abs(a.w - a.h) < 0.5), `${tag}: the slider's two arrow buttons are circles (${JSON.stringify(r.arrows)})`);
  assert(r.rev.src === r.nav.src && /btn-white\.svg$/.test(r.rev.src) && r.rev.ok, `${tag}: the reviews button is the hero's white button (${r.rev.src})`);
  assert(Math.abs(r.rev.w - r.nav.w) < 0.5 && Math.abs(r.rev.h - r.nav.h) < 0.5 && r.rev.r === r.nav.r && r.rev.of === 'hidden', `${tag}: same size and corners as the hero's (${r.rev.w.toFixed(1)}x${r.rev.h.toFixed(1)} r ${r.rev.r} vs ${r.nav.w.toFixed(1)}x${r.nav.h.toFixed(1)} r ${r.nav.r})`);
  assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
