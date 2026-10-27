import { openPage, assert, report } from './harness.mjs';
import fs from 'node:fs';

const OUT = new URL('./out/loader/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
// LOADER_ONLY=late,finish runs just those blocks (used for the mutation runs)
const want = k => !process.env.LOADER_ONLY || process.env.LOADER_ONLY.split(',').includes(k);
const readNum = page => page.evaluate(() => {
  const n = [...document.querySelectorAll('.loader__num')].pop();
  return n ? n.textContent : null;
});

// Start index.html without waiting for window.load (the loader's own clock starts at the
// 'mtm-loader-start' mark, which loader.js sets as soon as it runs).
async function begin(opts = {}) {
  const h = await openPage({ ...opts, path: 'impressum.html', skipLoader: true });
  const base = h.page.url().replace(/impressum\.html.*$/, '');
  if (opts.before) await opts.before(h.page);
  await h.page.goto(base + 'index.html' + (opts.hash || ''), { waitUntil: 'commit' });
  if (!opts.noMark) await h.page.waitForFunction(() => performance.getEntriesByName('mtm-loader-start').length > 0, null, { polling: 5 });
  return h;
}
const waitMs = (page, ms) => page.waitForFunction(m => performance.now() - performance.getEntriesByName('mtm-loader-start')[0].startTime >= m, ms, { polling: 5 });

// ---- timeline on desktop -------------------------------------------------
{
  const { page, errors, close } = await begin({ width: 1440 });
  const visible = await page.evaluate(() => {
    const l = document.querySelector('.loader');
    return !!l && getComputedStyle(l).display !== 'none' && getComputedStyle(l).visibility !== 'hidden'
      && l.getBoundingClientRect().height > 0;
  });
  assert(visible, '.loader is visible at ~100ms into the run');

  await waitMs(page, 1000);
  const mid = await readNum(page);
  assert(/^\d+$/.test(mid) && +mid >= 1 && +mid <= 99, `at ~1000ms the counter shows an integer in [1,99] (got ${mid})`);

  // poll until 100 shows, and check the dome has not started to leave
  let sawHundred = null;
  for (let i = 0; i < 400 && !sawHundred; i++) {
    sawHundred = await page.evaluate(() => {
      const n = [...document.querySelectorAll('.loader__num')].pop();
      if (!n || n.textContent !== '100') return null;
      const d = document.querySelector('.loader__dome').getBoundingClientRect();
      return { domeTop: d.top, domeH: d.height };
    });
    if (!sawHundred) await sleep(15);
  }
  assert(!!sawHundred, 'the counter reaches 100');
  assert(sawHundred && sawHundred.domeTop > -sawHundred.domeH * 0.05,
    `100 shows before the dome starts to leave (dome top ${sawHundred && sawHundred.domeTop.toFixed(1)})`);

  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 5000 });
  const done = await page.evaluate(() => ({
    gone: !document.querySelector('.loader'),
    cls: document.documentElement.className,
    ready: window.mtmReady instanceof Promise,
    overflow: getComputedStyle(document.documentElement).overflowY,
    inert: document.querySelectorAll('[inert]').length,
    at: performance.now() - performance.getEntriesByName('mtm-loader-start')[0].startTime,
  }));
  assert(done.gone, '.loader is removed from the DOM when finished');
  assert(/\bis-loaded\b/.test(done.cls) && !/\bis-loading\b/.test(done.cls), `html has is-loaded and not is-loading (${done.cls})`);
  assert(done.ready, 'window.mtmReady is a Promise');
  assert(done.overflow !== 'hidden', 'scroll is unlocked after the loader');
  assert(done.inert === 0, `inert is removed from the page after the loader (${done.inert} left)`);
  assert(done.at < 5000, `finished by 5000ms on the loader clock (${done.at.toFixed(0)}ms)`);
  assert(errors.length === 0, `no page errors ${JSON.stringify(errors)}`);
  await close();
}

// ---- the counter roll ----------------------------------------------------
{
  const { page, close } = await begin({ width: 1440 });
  const seen = await page.evaluate(() => new Promise(res => {
    const t0 = performance.now();
    let coexist = false, translated = false;
    (function tick() {
      const spans = [...document.querySelectorAll('.loader__num')];
      if (spans.length >= 2) coexist = true;
      for (const sp of spans) {
        const m = getComputedStyle(sp).transform;
        const ty = m && m !== 'none' ? parseFloat(m.replace(/^matrix\(|\)$/g, '').split(',')[5]) : 0;
        if (Math.abs(ty) > 0.5) translated = true;
      }
      if (performance.now() - t0 < 450) requestAnimationFrame(tick); else res({ coexist, translated });
    })();
  }));
  assert(seen.coexist && seen.translated, `counterRolls: in the first ~450ms two spans coexist AND one is translated (${JSON.stringify(seen)})`);
  await close();
}

// ---- scroll lock + focus while running -----------------------------------
{
  const { page, close } = await begin({ width: 1440 });
  const lock = await page.evaluate(() => getComputedStyle(document.documentElement).overflowY);
  assert(lock === 'hidden', `scroll is locked while the loader runs (${lock})`);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const probe = [];
  for (let i = 0; i < 6; i++) {
    probe.push(await page.evaluate(() => {
      const l = document.querySelector('.loader');
      if (!l) return { gone: true };
      return {
        inside: l.contains(document.activeElement),
        focusables: l.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').length,
        hidden: l.getAttribute('aria-hidden'),
      };
    }));
    await sleep(200);
  }
  // the page behind the cover must not be reachable by Tab either: every focusable outside .loader is inert
  const behind = await page.evaluate(() => {
    if (!document.querySelector('.loader')) return null;
    const sel = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    return [...document.querySelectorAll(sel)].filter(e => !e.closest('.loader') && !e.closest('[inert]') && getComputedStyle(e).visibility !== 'hidden').length;  // visibility:hidden (the closed menu overlay) is already out of the tab order
  });
  assert(behind === 0, `while loading, focusable elements outside .loader that are not inert: ${behind} (want 0)`);
  const gutter = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter);
  assert(/stable/.test(gutter), `scrollbar-gutter is stable while the loader locks scroll (${gutter})`);
  const live = probe.filter(p => !p.gone);
  assert(live.length > 0 && live.every(p => !p.inside), 'document.activeElement is never inside .loader while it runs');
  assert(live.every(p => p.focusables === 0 && p.hidden === 'true'), 'the loader has no focusable descendants and is aria-hidden');
  await close();
}

// ---- malformed hash must not strand mtmReady -------------------------------
{
  const { page, close } = await begin({ width: 1440, hash: '#%E0%A4%A' });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 7000 });
  const r = await page.evaluate(() => Promise.race([
    window.mtmReady.then(() => 'resolved'),
    new Promise(res => setTimeout(() => res('pending'), 1000)),
  ]));
  assert(r === 'resolved', `malformedHashResolves: mtmReady resolves for #%E0%A4%A (${r})`);
  await close();
}

// ---- mtmReady exists from the head, and resolves even if loader.js never loads ---
{
  const { page, close } = await begin({
    width: 1440, noMark: true,
    before: p => p.route('**/js/loader.js', r => r.abort()),
  });
  const early = await page.evaluate(() => window.mtmReady instanceof Promise);
  assert(early, 'mtmReady is defined by the inline head script (loader.js blocked)');
  const t0 = Date.now();
  await sleep(1500);
  const inertBefore = await page.evaluate(() => document.querySelectorAll('[inert]').length);
  assert(inertBefore > 0 && !(await page.evaluate(() => document.documentElement.classList.contains('is-loaded'))),
    `inert is set (${inertBefore}) while the cover is up and the fallback has not fired`);
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 9000 });
  const r = await page.evaluate(() => Promise.race([
    window.mtmReady.then(() => 'resolved'),
    new Promise(res => setTimeout(() => res('pending'), 500)),
  ]));
  const inert = await page.evaluate(() => document.querySelectorAll('[inert]').length);
  assert(r === 'resolved' && inert === 0, `head fallback resolves mtmReady and clears inert with loader.js missing (${r}, inert ${inert}, ${Date.now() - t0}ms)`);
  await close();
}

// Delay js/loader.js until `ms` after navigation start, and sample .loader every frame from the very start.
function delayLoader(ms, { instantFonts = false } = {}) {
  return async p => {
    if (instantFonts) {
      // fonts.ready resolves at once, so the reveal end lands at a fixed time (loader.js start + 3.35s)
      await p.addInitScript(() => {
        try { Object.defineProperty(document.fonts, 'ready', { get: () => Promise.resolve(document.fonts) }); } catch (e) {}
      });
    }
    await p.addInitScript(() => {
      window.__samples = [];
      (function tick() {
        const l = document.querySelector('.loader');
        window.__samples.push([performance.now(), !l ? null : getComputedStyle(l).display === 'none' ? -1 : parseFloat(getComputedStyle(l).opacity)]);
        if (!(document.documentElement && document.documentElement.classList.contains('is-loaded'))) requestAnimationFrame(tick);
      })();
    });
    const t0 = Date.now();
    await p.route('**/js/loader.js', async r => {
      await sleep(Math.max(0, ms - (Date.now() - t0)));
      await r.continue();
    });
  };
}
async function fadeOf(page) {
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 12000 });
  await sleep(100);
  return page.evaluate(() => {
    const vis = window.__samples.filter(s => s[1] !== null && s[1] >= 0);
    const last = vis[vis.length - 1];
    const loaded = window.__samples[window.__samples.length - 1][0];
    return { lastOp: last ? last[1] : null, mid: vis.filter(s => s[1] > 0.02 && s[1] < 0.98).length, loadedAt: loaded };
  });
}

// ---- loader.js arrives after the 6s stop: the fade is not cut by the head fallback ----
if (want('late')) {
  // loader.js starts at ~6.5s, the head fallback would fire at 6.6s: a cut then lands at opacity > 0.7
  const { page, close } = await begin({ width: 1440, noMark: true, before: delayLoader(6500) });
  const f = await fadeOf(page);
  const startedAt = await page.evaluate(() => performance.getEntriesByName('mtm-loader-start')[0].startTime);
  assert(startedAt >= 6400 && startedAt < 6590, `lateLoaderFadesSmoothly: precondition, loader.js started inside the 6.4 to 6.59s window (${startedAt.toFixed(0)}ms)`);
  assert(f.lastOp !== null && f.lastOp < 0.05 && f.mid >= 3,
    `lateLoaderFadesSmoothly: opacity goes down through ${f.mid} frames and the last visible frame is ${f.lastOp} (want < 0.05, >= 3 mid frames)`);
  assert(f.loadedAt >= 6700, `lateLoaderFadesSmoothly: is-loaded only after the fade (${f.loadedAt.toFixed(0)}ms)`);
  await close();
}

// ---- the timeline's own finish() must not fire in the middle of the hard-stop fade ----
if (want('finish')) {
  // loader.js at ~2.8s with fonts.ready resolved: the reveal ends at start + 3.35s = ~6.15s, inside the 6.0 to 6.3s fade
  const { page, close } = await begin({ width: 1440, noMark: true, before: delayLoader(2800, { instantFonts: true }) });
  const f = await fadeOf(page);
  const startedAt = await page.evaluate(() => performance.getEntriesByName('mtm-loader-start')[0].startTime);
  assert(startedAt + 3350 > 6050 && startedAt + 3350 < 6250, `finishNotMidFade: precondition, the timeline's finish would land mid-fade (${(startedAt + 3350).toFixed(0)}ms)`);
  assert(f.lastOp !== null && f.lastOp < 0.05,
    `finishNotMidFade: the last visible frame before is-loaded is transparent (${f.lastOp}, want < 0.05)`);
  assert(f.loadedAt >= 6250, `finishNotMidFade: is-loaded not before the fade ends (${f.loadedAt.toFixed(0)}ms, want >= 6250)`);
  await close();
}

// ---- webfont hangs: the 850ms cap still starts the reveal in time ----------
{
  const { page, close } = await begin({
    width: 1440,
    before: async p => {
      await p.route('**/fonts.googleapis.com/**', r => r.fulfill({
        status: 200, contentType: 'text/css',
        body: "@font-face{font-family:'Geom';font-weight:300;font-display:swap;src:url(https://fonts.gstatic.com/hung.woff2) format('woff2')}",
      }));
      await p.route('**/fonts.gstatic.com/**', () => { /* never answered */ });
    },
  });
  const reveal = await page.evaluate(() => new Promise(res => {
    const start = performance.getEntriesByName('mtm-loader-start')[0].startTime;
    (function tick() {
      const d = document.querySelector('.loader__dome');
      if (!d || d.getBoundingClientRect().top < -2) return res(performance.now() - start);
      if (performance.now() - start > 7000) return res(-1);
      requestAnimationFrame(tick);
    })();
  }));
  assert(reveal >= 2800 && reveal <= 3500, `fontHangCap: with the webfont hung the reveal starts at the 850ms cap, within 3.5s of the loader mark (${reveal.toFixed(0)}ms)`);
  await close();
}

// ---- other pages ---------------------------------------------------------
for (const p of ['impressum.html', 'datenschutz.html', '404.html', 'locations/nuembrecht.html', 'locations/waldbroel.html']) {
  const { page, close } = await openPage({ width: 1440, path: p, skipLoader: false });
  const r = await page.evaluate(async () => ({
    loader: !!document.querySelector('.loader'),
    ready: window.mtmReady instanceof Promise && (await window.mtmReady) === undefined,
    loading: document.documentElement.classList.contains('is-loading'),
  }));
  assert(!r.loader && !r.loading, `${p} has no .loader and never enters is-loading`);
  assert(r.ready, `${p} window.mtmReady resolves`);
  await close();
}

// ---- no JS ---------------------------------------------------------------
{
  const { page, close } = await openPage({ width: 1440, js: false, skipLoader: false });
  const r = await page.evaluate(() => {
    const m = document.querySelector('main');
    const l = document.querySelector('.loader');
    return {
      mainVisible: m.getBoundingClientRect().height > 0 && getComputedStyle(m).visibility === 'visible',
      loaderDisplay: l ? getComputedStyle(l).display : 'absent',
    };
  });
  assert(r.mainVisible, 'js:false -> main is visible');
  assert(r.loaderDisplay === 'none', `js:false -> .loader computed display none (${r.loaderDisplay})`);
  await close();
}

// ---- skiploader ----------------------------------------------------------
{
  const { page, close } = await openPage({ width: 1440 });
  const r = await page.evaluate(async () => {
    await window.mtmReady;
    return { gone: !document.querySelector('.loader'), cls: document.documentElement.className };
  });
  assert(r.gone && /\bis-loaded\b/.test(r.cls), `?skiploader -> no loader, is-loaded, mtmReady resolved (${r.cls})`);
  await close();
}

// ---- reduced motion ------------------------------------------------------
{
  const { page, close } = await openPage({ width: 1440, reducedMotion: true, skipLoader: false });
  const t0 = Date.now();
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 2000 });
  const el = Date.now() - t0;
  const gone = await page.evaluate(() => !document.querySelector('.loader'));
  assert(el <= 600 && gone, `reducedMotion: is-loaded within 600ms of load, loader removed (${el}ms)`);
  await close();
}

// ---- deep link -----------------------------------------------------------
for (const width of [1440, 375]) {
  const { page, close } = await openPage({ width, path: 'index.html#standorte', skipLoader: false });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 6000 });
  await sleep(150);
  const r = await page.evaluate(() => ({ top: document.getElementById('standorte').getBoundingClientRect().top, ih: innerHeight }));
  assert(r.top >= -10 && r.top <= r.ih / 2, `deepLinkLandsOnStandorte @${width}: #standorte top ${r.top.toFixed(1)} in [-10, ${r.ih / 2}]`);
  await close();
}

// ---- assets hang forever: the reveal does not wait for window.load -------
{
  const { page, close } = await begin({
    width: 1440,
    before: p => p.route('**/assets/**', () => { /* never answered */ }),
  });
  const t0 = Date.now();
  const reveal = await page.evaluate(() => new Promise(res => {
    const start = performance.getEntriesByName('mtm-loader-start')[0].startTime;
    (function tick() {
      const d = document.querySelector('.loader__dome');
      if (!d || d.getBoundingClientRect().top < -2) return res(performance.now() - start);
      if (performance.now() - start > 7000) return res(-1);
      requestAnimationFrame(tick);
    })();
  }));
  assert(reveal > 0 && reveal <= 3500, `revealStartsWithHungAssets: reveal starts within 3.5s of the loader mark (${reveal.toFixed(0)}ms)`);
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 4000, polling: 50 });
  const el = Date.now() - t0;
  assert(el <= 6500, `hardTimeoutClears: is-loaded by 6500ms with assets blocked (${el}ms)`);
  const ready = await page.evaluate(async () => { await window.mtmReady; return !document.querySelector('.loader'); });
  assert(ready, 'hardTimeoutClears: mtmReady resolved and loader removed');
  await close();
}

// ---- hard stop while the timeline is still running: 0.3s fade, then finish ----
{
  const { page, close } = await begin({ width: 1440 });
  await page.evaluate(() => { window.gsap.globalTimeline.pause(); });   // freeze the timeline, as a stalled main thread would
  const r = await page.evaluate(() => new Promise(res => {
    const start = 0;   // the 6s hard stop is measured from navigation start, so this test uses performance.now() directly
    let partial = false, opaqueAt5s = null;
    (function tick() {
      const t = performance.now() - start;
      const l = document.querySelector('.loader');
      if (l) {
        const o = parseFloat(getComputedStyle(l).opacity);
        if (t > 5500 && t < 5900) opaqueAt5s = o;
        if (o > 0.03 && o < 0.97) partial = true;
      }
      if (document.documentElement.classList.contains('is-loaded')) return res({ partial, opaqueAt5s, doneAt: t });
      if (t > 9000) return res({ partial, opaqueAt5s, doneAt: -1 });
      requestAnimationFrame(tick);
    })();
  }));
  assert(r.opaqueAt5s === 1, `hardStopFades: still fully opaque at ~5.7s (${r.opaqueAt5s})`);
  assert(r.partial, 'hardStopFades: opacity is seen part-way (a fade, not a cut)');
  assert(r.doneAt > 5900 && r.doneAt <= 6600, `hardStopFades: is-loaded 0.3s after the 6s stop, on the navigation clock (${r.doneAt.toFixed(0)}ms)`);
  await close();
}

// ---- frames --------------------------------------------------------------
for (const [width, height] of [[1440, 900], [375, 812]]) {
  const { page, close } = await begin({ width, height });
  for (const ms of [200, 1000, 2200, 2800]) {
    await page.waitForFunction(m => {
      const e = performance.getEntriesByName('mtm-loader-start')[0];
      return e && performance.now() - e.startTime >= m;
    }, ms, { polling: 5 });
    const at = await page.evaluate(() => performance.now() - performance.getEntriesByName('mtm-loader-start')[0].startTime);
    await page.screenshot({ path: `${OUT}loader-${width}-${ms}.png` });
    console.log(`frame ${width} target ${ms}ms, evaluated at ${at.toFixed(0)}ms`);
  }
  await close();
}

await report();
