// Social carousel videos (cofounder, 2026-11-15): the six videos in assets/social, one per card, in order.
// At 1512, 768, 375 and 2560:
//   1. every card holds its video (social-1..6.mp4, muted, looping, inline, with its still frame), the files load and are 360x640;
//   2. each video fills its card edge to edge (object-fit cover, the card's box);
//   3. with the slider on screen only the centre card's video plays (time moves on), every other one is paused on its still frame,
//      all silent (measured on this laptop's real browser: one playing video keeps the page at 60 frames a second, three drop it to
//      30); a step with the next button moves the playing video to the new centre card; scrolled far away every one pauses;
//   4. no page errors, no sideways scroll.
// Under reduced motion they stay paused on their still frames.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = (page, y) => page.evaluate(y => window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y), Math.round(y));
for (const [w, h, mobile] of [[1512, 900], [768, 1024], [375, 812, true], [2560, 1440]]) {
  const tag = `@${w}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1500);
  const top = await page.evaluate(() => document.querySelector('.radial-slider').getBoundingClientRect().top + scrollY - innerHeight / 4);
  await go(page, top); await sleep(2500);
  const a = await page.evaluate(() => [...document.querySelectorAll('.radial-slider__card')].map(c => { const v = c.querySelector('video'); if (!v) return null; const vr = v.getBoundingClientRect(), cr = c.querySelector('.radial-slider__media').getBoundingClientRect();
    return { src: v.getAttribute('src'), poster: v.getAttribute('poster'), muted: v.muted, loop: v.loop, inline: v.playsInline, vw: v.videoWidth, vh: v.videoHeight, fit: getComputedStyle(v).objectFit, t: v.currentTime, paused: v.paused, vol: v.muted || v.volume === 0,
      fills: Math.abs(vr.width - cr.width) < 1 && Math.abs(vr.height - cr.height) < 1 }; }));
  assert(a.length >= 6 && a.length % 6 === 0 && a.every((v, i) => v && v.src === `assets/social/social-${i % 6 + 1}.mp4` && v.poster === `assets/social/social-${i % 6 + 1}.jpg`), `${tag} 1: the six videos in order on the ${a.length} cards (the slider repeats its six for the loop)`);
  assert(a.every(v => v.muted && v.loop && v.inline), `${tag} 1: muted, looping, inline`);
  assert(a.every(v => v.vw === 360 && v.vh === 640), `${tag} 1: the files load, 360x640 (${a.map(v => v.vw + 'x' + v.vh)})`);
  assert(a.every(v => v.fit === 'cover' && v.fills), `${tag} 2: each fills its card`);
  await sleep(800);
  const centre = () => page.evaluate(() => { const vs = [...document.querySelectorAll('.radial-slider video')], mid = document.querySelector('.radial-slider').getBoundingClientRect(); const cx = (mid.left + mid.right) / 2;
    let best = -1, bd = 1e9; vs.forEach((v, i) => { const r = v.getBoundingClientRect(); const d = Math.abs((r.left + r.right) / 2 - cx); if (r.width > 0 && d < bd) { bd = d; best = i; } });
    return { best, playing: vs.map((v, i) => !v.paused ? i : -1).filter(i => i >= 0), t: vs.map(v => v.currentTime) }; });
  const c1 = await centre();
  await sleep(600);
  const c1b = await centre();
  assert(c1.playing.length === 1 && c1.playing[0] === c1.best && c1b.t[c1.best] > c1.t[c1.best], `${tag} 3: only the centre card's video plays (${c1.playing} vs centre ${c1.best})`);
  await page.locator('.radial-slider .radial-slider__btn').nth(1).click(); await sleep(1300);
  const c2 = await centre();
  assert(c2.best !== c1.best && c2.playing.length === 1 && c2.playing[0] === c2.best, `${tag} 3: after a step the new centre card plays instead (${c1.best} -> ${c2.best}, playing ${c2.playing})`);
  assert(a.every(v => v.vol), `${tag} 3: silent`);
  await go(page, 0); await sleep(800);
  const c = await page.evaluate(() => [...document.querySelectorAll('.radial-slider video')].map(v => v.paused));
  assert(c.every(Boolean), `${tag} 3: scrolled away they pause (${c})`);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert(sw <= 0 && errors.length === 0, `${tag} 4: no sideways scroll, no errors (${sw}, ${errors.join(' | ')})`);
  await close();
}
{
  const { page, close } = await openPage({ width: 1512, height: 900, reducedMotion: true });
  await sleep(1200);
  const top = await page.evaluate(() => document.querySelector('.radial-slider').getBoundingClientRect().top + scrollY - 200);
  await page.evaluate(y => scrollTo(0, y), top); await sleep(1500);
  const p = await page.evaluate(() => [...document.querySelectorAll('.radial-slider video')].map(v => v.paused && v.currentTime === 0));
  assert(p.length >= 6 && p.every(Boolean), `@1512 reduced motion: paused on their still frames (${p})`);
  await close();
}
await report();
