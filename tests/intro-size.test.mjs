// The intro text ("Wir sind ein Familienfriseurbetrieb...") on phones (cofounder, 2026-11-16: one or two steps smaller, a shorter
// read): below 768 it is 9.6vw (36px at 375, was 11.56vw / 43px), no more than 11 lines at 375; tablets and up are unchanged
// (45.3px at 768, 85/1512 of the width from 1024); nothing scrolls sideways.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [w, h, mobile, want, maxLines] of [[375, 812, true, 36, 11], [390, 844, true, 37.44, 11], [768, 1024, false, 45.33, 99], [1512, 900, false, 85, 99]]) {
  const { page, errors, close } = await openPage({ width: w, height: h, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await sleep(1000);
  const r = await page.evaluate(() => { const e = document.querySelector('.intro-text'), cs = getComputedStyle(e); return { fs: parseFloat(cs.fontSize), lines: Math.round(e.getBoundingClientRect().height / parseFloat(cs.lineHeight)), sw: document.documentElement.scrollWidth, vw: innerWidth }; });
  assert(Math.abs(r.fs - want) < 0.1 && r.lines <= maxLines, `@${w}: the intro text ${r.fs.toFixed(2)}px (want ${want}), ${r.lines} lines`);
  assert(r.sw <= r.vw && errors.length === 0, `@${w}: no sideways scroll, no errors`);
  await close();
}
await report();
