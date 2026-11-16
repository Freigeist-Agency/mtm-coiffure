// Standorte cards (css/v2.css .loc-card since Desktop_new; was css/site.css .location-info), 2026-11-13 (cofounder): "center the text and wrap the entire video card with a link to the
// page linked on the location names". At 375, 768, 1440 and 2560, for both cards:
//   1. the salon name's text is centred on the card, both ways (within 1.5px);
//   2. a click anywhere on the card (its four corners 4px in, the middles of its edges, its centre) lands on the card's link, and the link
//      goes to that salon's page (Nümbrecht -> locations/nuembrecht.html, Waldbröl -> locations/waldbroel.html);
//   3. one link per card, named by the salon (no extra links for screen readers to wade through);
//   4. a real click on a corner of the card opens the salon page;
//   5. the video still shows under the 50% black (the link layer is see-through).
//   6. the name is never underlined, also with the mouse over the card.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const WANT = [['Nümbrecht.', 'locations/nuembrecht.html'], ['Waldbröl.', 'locations/waldbroel.html']];

for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [375, 812, true], [2560, 1440, false]]) {
  const tag = `@${w}x${h}`;
  const { page, errors, close } = await openPage({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1000);
  for (let k = 0; k < 2; k++) {
    await page.evaluate(k => { const c = document.querySelectorAll('.loc-card')[k]; const y = c.getBoundingClientRect().top + scrollY - (innerHeight - c.offsetHeight) / 2;
      window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y); }, k);
    await sleep(700);
    const r = await page.evaluate(k => {
      const card = document.querySelectorAll('.loc-card')[k], c = card.getBoundingClientRect(), a = card.querySelector('.loc-card__name a');
      const g = document.createRange(); g.selectNodeContents(a); const t = g.getBoundingClientRect();
      const L = Math.max(c.left, 0) + 4, R = Math.min(c.right, innerWidth) - 4, T = Math.max(c.top, 0) + 4, B = Math.min(c.bottom, innerHeight) - 4, X = (L + R) / 2, Y = (T + B) / 2;
      const pts = [[L, T], [R, T], [L, B], [R, B], [X, T], [X, B], [L, Y], [R, Y], [X, Y]];
      const hits = pts.map(([x, y]) => { const e = document.elementFromPoint(x, y), l = e && e.closest('a'); return l && card.contains(l) ? l.getAttribute('href') : (e ? e.tagName + '.' + e.className : 'none'); });
      return { text: a.textContent.trim(), dx: (t.left + t.right) / 2 - (c.left + c.right) / 2, dy: (t.top + t.bottom) / 2 - (c.top + c.bottom) / 2,
        hits, links: [...card.querySelectorAll('a')].filter(l => !l.href.startsWith('tel:')).length, tel: [...card.querySelectorAll('a[href^="tel:"]')].map(l => { const b = l.getBoundingClientRect(), e = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2); return e === l || l.contains(e); }), name: a.textContent.trim(), corner: [L, B], whole: c.bottom <= innerHeight && c.top >= 0 };
    }, k);
    const [name, href] = WANT[k], t = `${tag} card ${k + 1}`;
    assert(r.text === name, `${t}: it is ${name} (${r.text})`);
    assert(Math.abs(r.dx) <= 1.5, `${t} 1: the name is centred across the card (off by ${r.dx.toFixed(1)} px; Desktop_new puts it low, not in the middle)`);
    assert(r.hits.every(x => x === href), `${t} 2: every point of the card links to ${href} (${r.hits.join(', ')})`);
    assert(r.links === 1 && r.name === name, `${t} 3: one salon link, named "${r.name}" (${r.links})`);
    assert(r.tel.every(Boolean), `${t} 3b: any phone number stays its own tap-to-call link, on top of the card link (none since 2026-11-16: Planity lists no number, the placeholders went)`);
    await page.evaluate(() => document.querySelectorAll(".locations__title, .site-header, .loc-card__name, .loc-card__info, .locations__checker").forEach(e => e.style.visibility = "hidden"));   // the white text over the card is not the video
    const px = await page.evaluate(async ([b64, k]) => {   // 5: the card's pixels, left of the name: the video darkened, not flat black
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      const s = img.width / innerWidth, c = document.querySelectorAll('.loc-card')[k].getBoundingClientRect();
      const y0 = Math.max(c.top, 0), y1 = Math.min(c.bottom, innerHeight), d = x.getImageData(Math.round((c.left + 8) * s), Math.round((y0 + 8) * s), Math.round(c.width * 0.3 * s), Math.round((y1 - y0 - 16) * s)).data;
      let lo = 255, hi = 0; for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; lo = Math.min(lo, v); hi = Math.max(hi, v); } return { lo, hi };
    }, [(await page.screenshot()).toString('base64'), k]);
    await page.evaluate(() => document.querySelectorAll('.locations__title, .site-header, .loc-card__name, .loc-card__info, .locations__checker').forEach(e => e.style.visibility = ''));
    assert(px.hi - px.lo > 20 && px.hi < 140, `${t} 5: the video shows under the black (brightness ${px.lo.toFixed(0)}..${px.hi.toFixed(0)})`);
    await page.mouse.move(r.corner[0], r.corner[1]); await sleep(200);   // 6: no underline, even with the mouse over the card (cofounder, 2026-11-13)
    const deco = await page.evaluate(k => getComputedStyle(document.querySelectorAll(".loc-card__name a")[k]).textDecorationLine, k);
    assert(deco === "none", `${t} 6: no underline on the name, mouse over the card (${deco})`);
    if (k === 1) {   // 4: a real click on the bottom-left corner
      await Promise.all([page.waitForURL(u => u.pathname.endsWith('/' + href), { timeout: 5000 }).catch(() => {}), page.mouse.click(r.corner[0], r.corner[1])]);
      const url = page.url();
      assert(url.endsWith('/' + href), `${t} 4: clicking the card's corner opens ${href} (${url})`);
    }
  }
  assert(errors.length === 0, `${tag}: 0 console/page errors (${errors.join(' | ')})`);
  await close();
}

await report();
