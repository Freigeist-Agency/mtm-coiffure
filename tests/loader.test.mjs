import { openPage, assert, report } from './harness.mjs';
import fs from 'node:fs';

const OUT = new URL('./out/loader/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readNum = page => page.evaluate(() => {
  const n = [...document.querySelectorAll('.loader__num')].pop();
  return n ? n.textContent : null;
});

// Start index.html without waiting for window.load (the loader's own clock starts at the
// 'mtm-loader-start' mark, which loader.js sets as soon as it runs).
async function begin(opts = {}) {
  const h = await openPage({ ...opts, path: 'impressum.html', skipLoader: true });
  const base = h.page.url().replace(/impressum\.html.*$/, '');
  await h.page.goto(base + 'index.html' + (opts.hash || ''), { waitUntil: 'commit' });
  await h.page.waitForFunction(() => performance.getEntriesByName('mtm-loader-start').length > 0, null, { polling: 5 });
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
    at: performance.now() - performance.getEntriesByName('mtm-loader-start')[0].startTime,
  }));
  assert(done.gone, '.loader is removed from the DOM when finished');
  assert(/\bis-loaded\b/.test(done.cls) && !/\bis-loading\b/.test(done.cls), `html has is-loaded and not is-loading (${done.cls})`);
  assert(done.ready, 'window.mtmReady is a Promise');
  assert(done.overflow !== 'hidden', 'scroll is unlocked after the loader');
  assert(done.at < 5000, `finished by 5000ms on the loader clock (${done.at.toFixed(0)}ms)`);
  assert(errors.length === 0, `no page errors ${JSON.stringify(errors)}`);
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
  const live = probe.filter(p => !p.gone);
  assert(live.length > 0 && live.every(p => !p.inside), 'document.activeElement is never inside .loader while it runs');
  assert(live.every(p => p.focusables === 0 && p.hidden === 'true'), 'the loader has no focusable descendants and is aria-hidden');
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

// ---- hard timeout (assets hang forever, so window.load never fires) -----
{
  const { page, close } = await openPage({ width: 1440 });
  await page.route('**/assets/**', () => { /* never answered */ });
  const t0 = Date.now();
  await page.goto(page.url().replace(/\?skiploader/, ''), { waitUntil: 'commit' });
  await sleep(4500);
  const still = await page.evaluate(() => !!document.querySelector('.loader'));
  assert(still, 'hardTimeoutClears: with hung assets the loader is still up at 4.5s (gate on load is real)');
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 2500, polling: 50 });
  const el = Date.now() - t0;
  assert(el <= 6500, `hardTimeoutClears: is-loaded by 6500ms (${el}ms)`);
  const ready = await page.evaluate(async () => { await window.mtmReady; return !document.querySelector('.loader'); });
  assert(ready, 'hardTimeoutClears: mtmReady resolved and loader removed');
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
