// The top section with the Google card (Figma 204:50 / 278:178, pulled again 2026-11-13). At 375, 768, 1440 and 2560:
//   1. the blurred MTM logo behind the text is gone (none in the page, none drawn);
//   2. the about text is Figma's 48px at 1440 (3.3333vw from 768px up; phones keep their own lead size);
//   3. the card carries Figma's dark paper and radial black: the texture shows near the middle-lower part, the corners are near black;
//   4. "4,7" is 20px and "171 Bewertungen" 16px of the 239px card, the count's top at 106 of 253 (scaled with the card);
//   5. no console or page errors.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [375, 812, true], [2560, 1440, false]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1200);
  const d = await page.evaluate(() => {
    const c = document.querySelector('.rating-card'), cb = c.getBoundingClientRect(), k = cb.width / 239;
    const fs = s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
    return { logo: document.querySelectorAll('.about-logo, img[src*="logo-blur"]').length, text: fs('.about-text'), vw: document.documentElement.clientWidth,
      score: fs('.rating-card__score') / k, count: fs('.rating-card__count') / k, countTop: (document.querySelector('.rating-card__count').getBoundingClientRect().top - cb.top) / k,
      bg: getComputedStyle(c).backgroundImage };
  });
  assert(d.logo === 0, `${tag} 1: no blurred MTM logo in the page (${d.logo})`);
  if (w >= 768) assert(Math.abs(d.text - d.vw * 48 / 1440) <= 0.5, `${tag} 2: the about text is 48/1440 of the width (${d.text.toFixed(1)}px, want ${(d.vw * 48 / 1440).toFixed(1)})`);
  assert(Math.abs(d.score - 20) <= 0.2 && Math.abs(d.count - 16) <= 0.2 && Math.abs(d.countTop - 106) <= 1, `${tag} 4: 4,7 at ${d.score.toFixed(1)}px, the count at ${d.count.toFixed(1)}px with its top at ${d.countTop.toFixed(1)} (card px)`);
  {   // 6 (2026-11-13: "shrink it", then "match the spacing"): the content (text and card) starts below the hero's bottom (where "MTM
      // Coiffure." ends) as far as the first ornament strip starts below the content (208/1440 of the width from 768 up, 60px on phones);
      // the 40svh of room for the orbit's photos stays, below the strip
    const f = await page.evaluate(() => { const y = s => { const b = document.querySelector(s).getBoundingClientRect(); return [b.top, b.bottom]; };
      const hero = y('.hero'), t = y('.about-text'), c = y('.rating-card'), st = y('.pattern-strip--about'), sv = y('.services');
      return { above: Math.min(t[0], c[0]) - hero[1], below: st[0] - Math.max(t[1], c[1]), room: sv[0] - st[1], vw: document.documentElement.clientWidth, svh: (() => { const p = document.createElement('div'); p.style.cssText = 'position:fixed;height:100svh'; document.body.appendChild(p); const v = p.getBoundingClientRect().height; p.remove(); return v; })() }; });
    const want = w >= 768 ? f.vw * 208 / 1440 : 60;
    assert(Math.abs(f.above - want) <= 1 && Math.abs(f.below - f.above) <= 1, `${tag} 6: as much space under the content to the ornament (${f.below.toFixed(1)}) as above it from the hero (${f.above.toFixed(1)}, want ${want.toFixed(1)})`);
    assert(Math.abs(f.room - 0.4 * f.svh) <= 1, `${tag} 6: the 40svh room stays, below the ornament (${f.room.toFixed(1)}, want ${(0.4 * f.svh).toFixed(1)})`);
  }
  assert(/radial-gradient/.test(d.bg) && /paper-dark\.jpg/.test(d.bg), `${tag} 3: the card has the radial black over the dark paper (${d.bg.slice(0, 90)})`);
  const el = await page.$('.rating-card'); await el.scrollIntoViewIfNeeded(); await sleep(150);
  const px = await page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const box = (fx, fy, fw, fh) => { const d = x.getImageData(Math.round(fx * img.width), Math.round(fy * img.height), Math.round(fw * img.width), Math.round(fh * img.height)).data; let lo = 255, hi = 0, sum = 0; for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; } return { lo, hi, mean: sum / (d.length / 4) }; };
    return { mid: box(0.55, 0.52, 0.35, 0.12), corner: box(0.02, 0.9, 0.06, 0.08) };   // right of the text, above the button / the bottom-left corner
  }, (await el.screenshot()).toString('base64'));
  assert(px.mid.hi - px.mid.lo >= 6 && px.corner.mean < px.mid.mean && px.corner.hi <= 12, `${tag} 3: grain in the middle (${px.mid.lo.toFixed(0)}..${px.mid.hi.toFixed(0)}), near black in the corner (max ${px.corner.hi.toFixed(0)})`);
  assert(errors.length === 0, `${tag} 5: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}
await report();
