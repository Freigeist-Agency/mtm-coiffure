// The loader, updated frames (Figma 92:10 "Loader FR 1", 92:50 "Loader FR 3"; cofounder, 2026-11-16).
// At 1512x900 and 375x812, on the home page, a location page and Impressum:
//   1. the first page of a visit plays the full loader: the white dome with the logo, plain black under it (no glow), and the counter
//      in Google Sans Flex black, running off the screen as in the frame; the whole frame fits the screen (cofounder: "the entire frame
//      from figma is visible"): positions across are shares of the width, positions down shares of the height (1440 x 1024; 450 x 1024
//      on a phone), sizes one frame pixel x s = the tighter of width/1440 and height/1024: the dome ends 458/1024 down (357), the logo
//      375 s wide (253 s), centred, its top 111/1024 down (81), the counter 300 s, centred on 1276/1440 across (258/450), its top
//      804/1024 down (761); the cover spans the whole width; it counts up and the page is shown within 6.5s;
//   2. following a link to another page: the cover comes down with the logo, without the counter, and lifts on the new page;
//   3. opening a page by its address later in the visit: no loader.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t) => Math.abs(a - b) <= t;

const read = page => page.evaluate(() => {
  const h = document.documentElement, L = document.querySelector('.loader');
  const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const c = document.querySelector('.loader__count'), num = document.querySelector('.loader__num'), logo = document.querySelector('.loader__logo');
  const cr = c && c.getBoundingClientRect(), cs = c && getComputedStyle(c);
  return { loading: h.classList.contains('is-loading'), transition: h.classList.contains('is-transition'), shown: vis(L), logo: vis(logo),
    count: vis(c), fam: cs && cs.fontFamily.split(',')[0].replace(/["']/g, ''), fw: cs && cs.fontWeight, fs: cs && parseFloat(cs.fontSize), cx: cr && cr.left + cr.width / 2, top: cr && cr.top,
    num: num && num.textContent, glow: L && getComputedStyle(document.querySelector('.loader__dome')).backgroundImage, vw: innerWidth, vh: innerHeight,
    dome: document.querySelector('.loader__dome') ? document.querySelector('.loader__dome').getBoundingClientRect().bottom : null, cover: L && L.getBoundingClientRect().width,
    lg: logo && (() => { const r = logo.getBoundingClientRect(); return { cx: r.left + r.width / 2, t: r.top, w: r.width }; })() };
});

for (const [w, h, mobile] of [[1440, 1024], [1512, 860], [1920, 960], [375, 812, true], [390, 664, true]]) {
  for (const path of ['index.html', 'locations/waldbroel.html', 'impressum.html']) {
    const tag = `${path} @${w}`;
    const { page, errors, close } = await openPage({ width: w, height: h, path, skipLoader: false, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    await sleep(150);
    const a = await read(page);
    const ph = w < 768, sc = ph ? Math.min(a.vw / 450, a.vh / 1024) : Math.min(a.vw / 1440, a.vh / 1024);
    const k = ph ? { cx: 258 / 450, top: 761 / 1024, dome: 357 / 1024, lt: 81 / 1024, lw: 253 } : { cx: 1276 / 1440, top: 804 / 1024, dome: 458 / 1024, lt: 111 / 1024, lw: 375 };
    assert(a.loading && !a.transition && a.shown && a.logo && a.count, `${tag} 1: the full loader on the first page of a visit (loading ${a.loading}, logo ${a.logo}, count ${a.count})`);
    assert(a.glow === 'none', `${tag} 1: plain black under the dome, no glow (${a.glow.slice(0, 30)})`);
    assert(a.fam === 'Google Sans Flex' && a.fw === '900' && near(a.fs, 300 * sc, 1) && near(a.cx, a.vw * k.cx, 1.5) && near(a.top, a.vh * k.top, 2),
      `${tag} 1: the counter black ${(300 * sc).toFixed(0)}px, centred on ${(a.vw * k.cx).toFixed(0)}, top ${(a.vh * k.top).toFixed(0)} (${a.fam} ${a.fw} ${a.fs.toFixed(0)}, ${a.cx.toFixed(0)}, ${a.top.toFixed(0)})`);
    assert(near(a.dome, a.vh * k.dome, 1.5) && near(a.lg.cx, a.vw / 2, 1.5) && near(a.lg.t, a.vh * k.lt, 1.5) && near(a.lg.w, k.lw * sc, 1.5) && near(a.cover, a.vw, 0.5),
      `${tag} 1: the frame fitted: dome to ${(a.vh * k.dome).toFixed(0)} (${a.dome.toFixed(0)}), logo ${(k.lw * sc).toFixed(0)} wide at ${(a.vh * k.lt).toFixed(0)} (${a.lg.w.toFixed(0)}, ${a.lg.t.toFixed(0)}), cover ${a.cover} wide`);
    await sleep(900);
    const mid = await read(page);
    assert(+mid.num > +a.num, `${tag} 1: it counts up (${a.num} -> ${mid.num})`);
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-loading'), null, { timeout: 6500 }).catch(() => {});
    assert(!(await read(page)).loading, `${tag} 1: the page is shown within 6.5s`);
    // 2. a link to another page
    const link = await page.evaluate(() => { const here = location.pathname.split('/').pop(), a = [...document.querySelectorAll('a[href]')].find(a => /(impressum|datenschutz)\.html$/.test(a.getAttribute('href')) && a.getAttribute('href').split('/').pop() !== here); /* a different page */ return a ? a.getAttribute('href') : null; });
    await page.evaluate(href => { const a = [...document.querySelectorAll('a[href]')].find(x => x.getAttribute('href') === href); a.scrollIntoView({ block: 'center' }); }, link);
    await sleep(300);
    const target = link.split('/').pop();   /* wait for the new address itself: a navigation event can be missed between the cover and the load */
    await Promise.all([page.waitForURL(u => String(u).split('?')[0].endsWith('/' + target), { timeout: 8000, waitUntil: 'commit' }).catch(() => {}), page.click(`a[href="${link}"]`)]);
    await sleep(80);
    const t = await read(page);
    assert(t.loading && t.transition && t.logo && !t.count, `${tag} 2: on the next page the cover shows the logo, no counter (loading ${t.loading}, transition ${t.transition}, logo ${t.logo}, count ${t.count})`);
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-loading'), null, { timeout: 5000 }).catch(() => {});
    assert(!(await read(page)).loading, `${tag} 2: and lifts`);
    // 3. later, by address
    await page.goto(page.url().replace(/[^/]*$/, '') + 'datenschutz.html');
    await sleep(150);
    assert(!(await read(page)).loading, `${tag} 3: no loader for a page opened by address later in the visit`);
    assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
    await close();
  }
}
await report();
