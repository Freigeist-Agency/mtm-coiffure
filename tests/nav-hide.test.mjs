// Header hide on scroll (js/nav-hide.js, css/nav-hide.css) with real wheel input (page.mouse.wheel) at 1440, 768, 375 and 2560 wide.
// Wheel deltas map 1:1 to CSS px in this harness, so every step's movement is exact and each precondition asserts it.
// Groups: A top visible + slide spec, B hidden after scrolling down, C shown again after a 12px scroll up,
// D 4px jitter does not toggle (shown or hidden), E focus inside keeps it shown, F reduced motion, G the other pages.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SETTLE = 400;                       // longer than the 250ms slide
const SIZES = [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 375, height: 812 }, { width: 2560, height: 1440 }];
const OTHER_PAGES = ['locations/nuembrecht.html', 'locations/waldbroel.html', 'impressum.html', 'datenschutz.html', '404.html'];
const HEADER_H = 50;                      // css/tokens.css --nav-h

const read = page => page.evaluate(() => {
  const h = document.querySelector('.site-header');
  const r = h.getBoundingClientRect();
  return { y: scrollY, iw: innerWidth, hidden: h.classList.contains('is-hidden'), top: r.top, bottom: r.bottom, focusIn: h.contains(document.activeElement) };
});
const shown = s => !s.hidden && Math.abs(s.bottom - HEADER_H) < 0.5;
const gone = s => s.hidden && s.bottom <= 0.5;

// real wheel input in notches of at most 120px; the sign of total sets the direction
async function wheelBy(page, total) {
  let rem = total;
  while (rem !== 0) {
    const step = Math.sign(rem) * Math.min(Math.abs(rem), 120);
    await page.mouse.wheel(0, step);
    await sleep(32);
    rem -= step;
  }
}

for (const { width, height } of SIZES) {
  const tag = `@${width}`;

  // A2: at scrollY = header height the header is shown even though the last direction was down (the top rule)
  {
    const { page, close } = await openPage({ width, height });
    await page.mouse.move(width / 2, height / 2);
    await wheelBy(page, 56); await sleep(SETTLE);
    const a = await read(page);
    assert(a.y === 56 && gone(a), `${tag} A2: hidden 56px down (y ${a.y}, bottom ${a.bottom})`);
    await wheelBy(page, -6); await sleep(SETTLE);
    const b = await read(page);
    assert(b.y === HEADER_H && shown(b), `${tag} A2: at scrollY = header height, shown again while still going up (y ${b.y}, bottom ${b.bottom})`);
    await close();
  }

  // A: visible at the top, transform-only 250ms ease-out slide, Home key back to the top shows it
  {
    const { page, errors, close } = await openPage({ width, height });
    await page.mouse.move(width / 2, height / 2);
    const s0 = await read(page);
    assert(s0.iw === width, `${tag} A precondition: viewport is ${width} wide (innerWidth ${s0.iw})`);
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    assert(scrollable > 2000, `${tag} A precondition: page scrolls (${scrollable}px of overflow)`);
    assert(s0.y === 0 && shown(s0), `${tag} A: header visible at the top (top ${s0.top}, bottom ${s0.bottom})`);
    const cs = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.site-header')); return [c.transitionProperty, c.transitionDuration, c.transitionTimingFunction]; });
    assert(cs[0] === 'transform' && cs[1] === '0.25s' && cs[2] === 'ease-out', `${tag} A: slide is transform 0.25s ease-out (${cs.join(' | ')})`);

    await wheelBy(page, 600); await sleep(SETTLE);
    const d = await read(page);
    assert(d.y === 600, `${tag} A precondition: wheel moved the page to 600 (scrollY ${d.y})`);
    assert(gone(d) && d.hidden, `${tag} A: hidden after scrolling down 600px (bottom ${d.bottom})`);

    await page.keyboard.press('Home'); await sleep(SETTLE);
    const home = await read(page);
    assert(home.y === 0 && shown(home), `${tag} A: back at the top, header shown again (y ${home.y}, bottom ${home.bottom})`);
    assert(errors.length === 0, `${tag} A: no page errors (${errors.length})`);
    await close();
  }

  // B, C, D: one continuous run from the top
  {
    const { page, errors, close } = await openPage({ width, height });
    await page.mouse.move(width / 2, height / 2);
    await wheelBy(page, 600); await sleep(SETTLE);
    const b = await read(page);
    assert(b.y === 600 && gone(b), `${tag} B: scrolled 600px down, header hidden (y ${b.y}, bottom ${b.bottom})`);

    await wheelBy(page, -12); await sleep(SETTLE);
    const c = await read(page);
    assert(c.y === 588, `${tag} C precondition: a 12px scroll up moved the page to 588 (y ${c.y})`);
    assert(shown(c), `${tag} C: a 12px scroll up shows the header again (bottom ${c.bottom})`);

    await wheelBy(page, 4); await sleep(SETTLE);
    const d1 = await read(page);
    assert(d1.y === 592, `${tag} D precondition: 4px jitter down moved the page to 592 (y ${d1.y})`);
    assert(shown(d1), `${tag} D: a 4px jitter down while shown does not hide it (bottom ${d1.bottom})`);

    await wheelBy(page, 120); await sleep(SETTLE);
    const d2 = await read(page);
    assert(d2.y === 712 && gone(d2), `${tag} D control: a real 120px scroll down hides it (y ${d2.y}, bottom ${d2.bottom})`);

    await wheelBy(page, -4); await sleep(SETTLE);
    const d3 = await read(page);
    assert(d3.y === 708, `${tag} D precondition: 4px jitter up moved the page to 708 (y ${d3.y})`);
    assert(gone(d3), `${tag} D: a 4px jitter up while hidden does not show it (bottom ${d3.bottom})`);
    assert(errors.length === 0, `${tag} B-D: no page errors (${errors.length})`);
    await close();
  }

  // E: keyboard focus inside the header keeps it shown while scrolling; leaving it hides it again
  {
    const { page, errors, close } = await openPage({ width, height });
    await page.mouse.move(width / 2, height / 2);
    await wheelBy(page, 600); await sleep(SETTLE);
    const hid = await read(page);
    assert(gone(hid), `${tag} E precondition: header hidden before focus (bottom ${hid.bottom})`);

    const focused = await page.evaluate(() => { const a = document.querySelector('.site-header a'); a.focus({ preventScroll: true }); return document.activeElement === a; });
    assert(focused, `${tag} E precondition: focus is on a link inside the header`);
    await sleep(SETTLE);
    const e1 = await read(page);
    assert(e1.focusIn && shown(e1), `${tag} E: focus inside the header shows it (hidden ${e1.hidden}, bottom ${e1.bottom})`);

    await wheelBy(page, 120); await sleep(SETTLE);
    const e2 = await read(page);
    assert(e2.y === 720 && shown(e2), `${tag} E: scrolling down with focus inside keeps it shown (y ${e2.y}, bottom ${e2.bottom})`);

    await page.evaluate(() => document.activeElement.blur()); await sleep(SETTLE);
    const e3 = await read(page);
    assert(!e3.focusIn && gone(e3), `${tag} E: after focus leaves, the header hides again (bottom ${e3.bottom})`);
    assert(errors.length === 0, `${tag} E: no page errors (${errors.length})`);
    await close();
  }

  // F: reduced motion has no transition; the state change is immediate
  {
    const rm = await openPage({ width, height, reducedMotion: true });
    await rm.page.mouse.move(width / 2, height / 2);
    const rmCs = await rm.page.evaluate(() => getComputedStyle(document.querySelector('.site-header')).transitionDuration);
    assert(rmCs === '0s', `${tag} F: reduced motion computes transition-duration 0s (${rmCs})`);
    await wheelBy(rm.page, 600); await sleep(SETTLE);
    await wheelBy(rm.page, -12); await sleep(60);
    const rmS = await read(rm.page);
    assert(rmS.y === 588 && shown(rmS), `${tag} F: reduced motion shows the header at once, 60ms after the scroll up (bottom ${rmS.bottom})`);
    await rm.close();

    // control: normal motion is still mid-slide at the same 60ms
    const nm = await openPage({ width, height });
    await nm.page.mouse.move(width / 2, height / 2);
    await wheelBy(nm.page, 600); await sleep(SETTLE);
    await wheelBy(nm.page, -12); await sleep(60);
    const nmS = await read(nm.page);
    assert(nmS.y === 588 && nmS.bottom > 1 && nmS.bottom < HEADER_H - 1, `${tag} F control: normal motion is still sliding 60ms in (bottom ${nmS.bottom})`);
    await nm.close();
  }

  // G: the other pages that share the header load the same CSS and JS
  for (const p of OTHER_PAGES) {
    const pt = `${tag} G ${p}`;
    // a shorter viewport gives the short pages (no overflow at 768x1024) room to scroll
    const { page, errors, close } = await openPage({ width, height: 500, path: p });
    await page.mouse.move(width / 2, height / 2);
    const css = await page.evaluate(() => getComputedStyle(document.querySelector('.site-header')).transitionDuration);
    assert(css === '0.25s', `${pt}: nav-hide.css applied (transition ${css})`);
    // the shortest page here has 371px of overflow, so 240px of wheel scroll fits on all of them
    const sh = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    assert(sh >= 240, `${pt} precondition: at least 240px of overflow (${sh}px)`);
    await wheelBy(page, 240); await sleep(SETTLE);
    const s = await read(page);
    assert(s.y === 240 && gone(s), `${pt}: scrolling down hides the header (y ${s.y}, bottom ${s.bottom})`);
    assert(errors.length === 0, `${pt}: no page errors (${errors.length})`);
    await close();
  }
}

await report();
