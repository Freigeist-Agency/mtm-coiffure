// Paper textures and pattern strips (css/textures.css), from Figma Desktop - 1 pulled again on 2026-11-13. At 375, 768, 1440 and 2560:
//   1. three pattern strips, full width, 139px tall at 1440 (9.6528vw), between about -> services, team row -> Standorte, social -> news;
//   2. the strip image is served and its pixels are the pattern's red, black and cream (not blank);
//   3. the light paper texture sits under services, reviews, social and news, the dark one under the intro and Standorte;
//   4. each textured section is a flat colour at its edges where Figma's gradient is solid (white or black), and grainy in between;
//   5. no console or page errors;
//   6. behind the team photo slider (.team-row) Figma's Standorte gradient runs from 21.68% black at its top to 94.83% at its bottom over the
//      dark texture (2026-11-13, cofounder): the texture shows above the photos, and the band is never a flat black.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIGHT = ['.services', '.reviews', '.social', '.news'], DARK = ['.intro', '.team-row', '.locations'];

for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [375, 812, true], [2560, 1440, false]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1200);
  const d = await page.evaluate(([LIGHT, DARK]) => {
    const strips = [...document.querySelectorAll('.pattern-strip')].map(s => ({ prev: s.previousElementSibling.className.split(' ')[0], next: s.nextElementSibling.className.split(' ')[0], w: s.getBoundingClientRect().width, h: s.getBoundingClientRect().height, bg: s.querySelector('image') ? s.querySelector('image').getAttribute('href') : '' }));   // 2026-11-13: the strip is an SVG, its still pattern an image in it
    const bg = sel => getComputedStyle(document.querySelector(sel)).backgroundImage;
    return { vw: document.documentElement.clientWidth, strips, light: LIGHT.map(s => [s, /paper-light\.jpg/.test(bg(s))]), dark: DARK.map(s => [s, /paper-dark\.jpg/.test(bg(s))]) };
  }, [LIGHT, DARK]);
  const order = d.strips.map(s => `${s.prev}>${s.next}`).join(', ');
  assert(order === 'about>services, team-row>locations, social>news', `${tag} 1: strips between about/services, team row/Standorte, social/news (${order})`);
  assert(d.strips.every(s => Math.abs(s.w - d.vw) <= 1 && Math.abs(s.h - d.vw * 139 / 1440) <= 0.6 && /ornament-base\.png/.test(s.bg)), `${tag} 1: each strip full width and 139/1440 of it tall (${d.strips.map(s => `${s.w.toFixed(0)}x${s.h.toFixed(1)}`).join(', ')})`);
  assert(d.light.every(x => x[1]) && d.dark.every(x => x[1]), `${tag} 3: light paper under ${d.light.filter(x => x[1]).map(x => x[0]).join(' ')}; dark under ${d.dark.filter(x => x[1]).map(x => x[0]).join(' ')}`);

  // 2 + 4: pixels. Screenshot each element on its own (header hidden), then read colours.
  await page.addStyleTag({ content: '.site-header { visibility: hidden !important; }' });
  const stats = async (sel, rows) => {
    const el = await page.$(sel); await el.scrollIntoViewIfNeeded(); await sleep(150);
    const png = await el.screenshot();
    return page.evaluate(async ([b64, rows]) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      return rows.map(fy => { const y = Math.min(img.height - 1, Math.round(fy * (img.height - 1))), d = x.getImageData(0, y, Math.min(img.width, 600), 1).data;
        let lo = 255, hi = 0, red = 0, dark = 0, cream = 0;
        for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; lo = Math.min(lo, v); hi = Math.max(hi, v);
          if (d[i] > 120 && d[i + 1] < 80 && d[i + 2] < 80) red++; if (v < 40) dark++; if (v > 225) cream++; }
        return { lo, hi, red, dark, cream }; });
    }, [png.toString('base64'), rows]);
  };
  const [mid] = await stats('.pattern-strip--about', [0.5]);
  assert(mid.red > 20 && mid.dark > 20 && mid.cream > 20, `${tag} 2: the strip shows the pattern: red ${mid.red}, black ${mid.dark}, cream ${mid.cream} of 600 pixels across its middle`);
  if (!mobile) {   // the edge/middle contrast needs the desktop section heights (on phones the sections are short and busy)
    const [top, centre] = await stats('.social', [0.004, 0.45]);
    assert(top.hi - top.lo <= 3 && top.lo >= 250, `${tag} 4: social's top edge is flat white (${top.lo.toFixed(0)}..${top.hi.toFixed(0)})`);
    assert(centre.hi - centre.lo >= 6, `${tag} 4: social's middle shows the paper grain (${centre.lo.toFixed(0)}..${centre.hi.toFixed(0)})`);
    const [ltop, lmid, lend] = await stats('.locations', [0.004, 0.62, 0.998]);
    assert(lmid.hi - lmid.lo >= 4 && lend.hi <= 3, `${tag} 4: Standorte: grain where Figma's black thins out (${lmid.lo.toFixed(0)}..${lmid.hi.toFixed(0)}), solid black at the bottom (max ${lend.hi.toFixed(0)}) (top ${ltop.lo.toFixed(0)}..${ltop.hi.toFixed(0)})`);
  }
  {
    const g = await page.evaluate(() => getComputedStyle(document.querySelector('.team-row')).backgroundImage);
    const al = (g.match(/^linear-gradient\(rgba\(0, 0, 0, ([\d.]+)\) 0%, rgba\(0, 0, 0, ([\d.]+)\) 100%\)/) || []).slice(1).map(Number);   // the browser keeps alpha in 1/255 steps
    assert(al.length === 2 && Math.abs(al[0] - 0.2168) <= 0.003 && Math.abs(al[1] - 0.9483) <= 0.003 && /paper-dark.jpg/.test(g), `${tag} 6: the slider band carries Figma's 21.68% -> 94.83% black over the dark texture (${g.slice(0, 120)})`);
    const el = await page.$('.team-row'); await el.scrollIntoViewIfNeeded(); await sleep(150);
    const png = await el.screenshot();
    const band = await page.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const g = document.querySelector('.team-row img').getBoundingClientRect(), t = document.querySelector('.team-row').getBoundingClientRect(), k = img.width / t.width;
      const rows = Math.max(1, Math.floor((g.top - t.top) * k) - 1); let distinct = new Set();
      for (let y = 0; y < Math.min(rows, 40); y++) { const d = x.getImageData(0, y, img.width, 1).data; for (let i = 0; i < d.length; i += 4) distinct.add(d[i] + d[i + 1] + d[i + 2]); }
      return { rows, distinct: distinct.size }; }, png.toString('base64'));
    if (band.rows > 4) assert(band.distinct > 3, `${tag} 6: above the photos the band shows texture, not flat black (${band.distinct} shades in the top ${Math.min(band.rows, 40)} rows)`);
  }
  assert(errors.length === 0, `${tag} 5: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

await report();
