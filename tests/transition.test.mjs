// Page transitions: the home loader's cover and reveal between pages, without the counter.
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Runs at document start of every page the context loads from here on; records one sample per frame.
// A sample is what a visitor could see: is the cover displayed, is the counter displayed, is scroll locked.
const SAMPLER = () => {
  window.__s = [];
  const shown = e => {
    if (!e) return false;
    const c = getComputedStyle(e);
    return c.display !== 'none' && c.visibility !== 'hidden' && parseFloat(c.opacity) > 0.01;
  };
  (function tick() {
    const h = document.documentElement;
    if (h) {
      const count = document.querySelector('.loader__count');
      window.__s.push({
        t: performance.now(),
        cover: shown(document.querySelector('.loader')),
        count: shown(count),
        loading: h.classList.contains('is-loading'),
      });
    }
    if (!h || window.__s.length < 8 || !h.classList.contains('is-loaded') || document.querySelector('.loader')) requestAnimationFrame(tick);
  })();
};
// Right before the page unloads, record whether a black cover really sits on the centre of the viewport.
const UNLOAD_PROBE = () => {
  addEventListener('beforeunload', () => {
    try {
      const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      const p = document.querySelector('.loader__panel');
      const r = p && p.getBoundingClientRect();
      sessionStorage.setItem('probe-unload', JSON.stringify({
        centreInCover: !!(e && e.closest('.loader')),
        panelCovers: !!r && r.top <= 1 && r.bottom >= innerHeight - 1 && r.left <= 1 && r.right >= innerWidth - 16 && getComputedStyle(document.documentElement).backgroundColor === 'rgb(0, 0, 0)',   // a classic scrollbar's reserved gutter (<= 15px) beside the panel shows html's black
      }));
    } catch (err) {}
  });
};

// addInitScript only reaches pages loaded from now on, so the probe is also run on the current document
async function arm(page, { unload = false } = {}) {
  await page.context().addInitScript(SAMPLER);
  if (unload) {
    await page.context().addInitScript(UNLOAD_PROBE);
    await page.evaluate(UNLOAD_PROBE);
  }
}
const loaded = (page, timeout) => page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout, polling: 20 });
const samples = page => page.evaluate(() => window.__s);
const flag = (page, k) => page.evaluate(k => { try { return sessionStorage.getItem(k); } catch (e) { return 'throws'; } }, k);
const isHome = page => /\/(index\.html)?(#.*)?$/.test(page.url());
const homeBase = page => page.url().replace(/[^/]*$/, '');

// a fresh home load, run to the end of the full loader
async function freshHome(width, height = 900, extra = {}) {
  const h = await openPage({ width, height, skipLoader: false, ...extra });
  await loaded(h.page, 9000);
  return h;
}

for (const [width, height] of [[1440, 900], [375, 812]]) {
  const tag = `@${width}`;

  // ---- fresh home: the counter plays --------------------------------------------------
  {
    const h = await openPage({ width, height, skipLoader: false });
    const { page, errors } = h;
    await page.waitForFunction(() => {
      const e = performance.getEntriesByName('mtm-loader-start')[0];
      return e && performance.now() - e.startTime >= 1000;
    }, null, { polling: 5 });
    const n = await page.evaluate(() => { const x = [...document.querySelectorAll('.loader__num')].pop(); return x ? x.textContent : null; });
    assert(/^\d+$/.test(n) && +n >= 1 && +n <= 99, `${tag} fresh home: counter shows an integer in [1,99] at ~1000ms (got ${n})`);
    assert(await flag(page, 'mtm-visited') === '1', `${tag} fresh home: mtm-visited is set once the loader starts`);
    await loaded(page, 9000);

    // ---- not internal: no cover, no flag --------------------------------------------
    await page.context().route(/planity\.com/, r => r.abort());
    const idle = async what => {
      await sleep(250);
      const s = await page.evaluate(() => ({
        cover: !!document.querySelector('.loader'),
        cls: document.documentElement.className,
        inert: document.querySelectorAll('header[inert], main[inert], footer[inert]').length,
        flag: (() => { try { return sessionStorage.getItem('mtm-transition'); } catch (e) { return 'throws'; } })(),
      }));
      assert(!s.cover && !/is-loading|is-transition/.test(s.cls) && s.inert === 0 && s.flag === null,
        `${tag} not internal (${what}): no cover, no inert, no mtm-transition flag (${JSON.stringify(s)})`);
    };
    await page.locator('a[target="_blank"][href*="planity"]').first().scrollIntoViewIfNeeded();
    await page.locator('a[target="_blank"][href*="planity"]').first().click();
    await idle('target=_blank');
    for (const p of page.context().pages()) if (p !== page) await p.close();
    assert(isHome(page), `${tag} not internal (target=_blank): still on home`);

    await page.locator('footer a.footer-cta[href="#standorte"]').click();
    await idle('same-page #hash');
    assert(isHome(page), `${tag} not internal (#hash): still on home (${page.url()})`);

    await page.locator('footer a[href="impressum.html"]').click({ modifiers: ['Control'] });
    await idle('ctrl-click');
    assert(isHome(page), `${tag} not internal (ctrl-click): original tab still on home`);
    for (const p of page.context().pages()) if (p !== page) await p.close();
    await page.evaluate(() => scrollTo(0, 0));
    await sleep(200);

    // ---- home -> impressum --------------------------------------------------------------
    await arm(page, { unload: true });
    const link = page.locator('footer a[href="impressum.html"]');
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await page.waitForURL(/impressum\.html$/, { timeout: 5000 });
    const probe = JSON.parse(await flag(page, 'probe-unload') || 'null');
    assert(probe && probe.centreInCover, `${tag} home -> impressum: before navigating, the viewport centre is inside the cover (${JSON.stringify(probe)})`);
    assert(probe && probe.panelCovers, `${tag} home -> impressum: before navigating, the black panel spans the full viewport (${JSON.stringify(probe)})`);
    const t0 = Date.now();
    await loaded(page, 2500);
    const el = Date.now() - t0;
    const s = await samples(page);
    assert(s.some(x => x.cover), `${tag} home -> impressum: impressum shows the cover (${s.filter(x => x.cover).length} of ${s.length} samples)`);
    assert(s.every(x => !x.count), `${tag} home -> impressum: the counter is never visible on impressum (${s.filter(x => x.count).length} samples)`);
    assert(el <= 2500, `${tag} home -> impressum: is-loaded within 2500ms of arriving (${el}ms)`);
    const end = await page.evaluate(() => ({
      gone: !document.querySelector('.loader'),
      inert: document.querySelectorAll('header[inert], main[inert], footer[inert]').length,
      flag: sessionStorage.getItem('mtm-transition'),
      overflow: getComputedStyle(document.documentElement).overflowY,
    }));
    assert(end.gone && end.inert === 0 && end.flag === null && end.overflow !== 'hidden',
      `${tag} home -> impressum: cover removed, inert lifted, flag consumed, scroll unlocked (${JSON.stringify(end)})`);
    assert(errors.length === 0, `${tag} home -> impressum: 0 console errors ${JSON.stringify(errors)}`);
    await h.close();
  }

  // ---- impressum -> home through "Standorte." ---------------------------------------
  {
    const h = await openPage({ width, height, path: 'impressum.html', skipLoader: false });
    const { page, errors } = h;
    await loaded(page, 3000);
    await arm(page, { unload: true });
    const link = page.locator('header a[href$="index.html#standorte"]:visible').first();
    await link.click();
    await page.waitForURL(/index\.html#standorte$/, { timeout: 5000 });
    const probe = JSON.parse(await flag(page, 'probe-unload') || 'null');
    assert(probe && probe.centreInCover && probe.panelCovers, `${tag} impressum -> home: covered before navigating (${JSON.stringify(probe)})`);
    const t0 = Date.now();
    await loaded(page, 2500);
    const el = Date.now() - t0;
    const s = await samples(page);
    assert(s.some(x => x.cover), `${tag} impressum -> home: home shows the cover (${s.filter(x => x.cover).length} of ${s.length} samples)`);
    assert(s.every(x => !x.count), `${tag} impressum -> home: no counter visible in any of ${s.length} frame samples`);
    assert(el <= 2500, `${tag} impressum -> home: is-loaded within 2500ms (${el}ms)`);
    await sleep(200);
    const top = await page.evaluate(() => ({ top: document.getElementById('standorte').getBoundingClientRect().top, ih: innerHeight }));
    assert(top.top >= -10 && top.top <= top.ih / 2, `${tag} impressum -> home: #standorte lands near the top (top ${top.top.toFixed(1)})`);
    assert(await flag(page, 'mtm-visited') === '1', `${tag} impressum -> home: the transition arrival counts as the home visit (mtm-visited set)`);
    assert(errors.length === 0, `${tag} impressum -> home: 0 console errors ${JSON.stringify(errors)}`);

    // a reload of home in the same session is a plain page
    await arm(page);
    await page.reload({ waitUntil: 'commit' });
    await loaded(page, 4000);
    const r = await samples(page);
    assert(r.every(x => !x.cover && !x.loading), `${tag} home reload in session: no loader at all (${r.filter(x => x.cover).length} cover samples)`);
    await h.close();
  }
}

// ---- direct load of a subpage: no cover at all --------------------------------------
{
  const h = await openPage({ width: 1440, path: 'impressum.html', skipLoader: false });
  const { page } = h;
  await arm(page);
  await page.goto(homeBase(page) + 'locations/nuembrecht.html', { waitUntil: 'commit' });
  const t0 = Date.now();
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 3000, polling: 10 });
  const ms = Date.now() - t0;
  const ready = await page.evaluate(() => Promise.race([window.mtmReady.then(() => 'resolved'), new Promise(r => setTimeout(() => r('pending'), 300))]));
  const s = await samples(page);
  assert(s.length > 0 && s.every(x => !x.cover && !x.loading), `direct subpage load: no cover in any of ${s.length} samples`);
  assert(ready === 'resolved' && ms < 1500, `direct subpage load: mtmReady resolves at once (${ready}, is-loaded after ${ms}ms from commit)`);
  await h.close();
}

// ---- every subpage carries the loader and keeps a clean direct load -------------------
for (const p of ['impressum.html', 'datenschutz.html', '404.html', 'locations/nuembrecht.html', 'locations/waldbroel.html']) {
  const h = await openPage({ width: 1440, path: p, skipLoader: false });
  const r = await h.page.evaluate(() => {
    const srcs = [...document.scripts].map(s => s.src).filter(Boolean);
    const count = re => srcs.filter(s => re.test(s)).length;
    return {
      gsap: count(/gsap\.min\.js/), st: count(/ScrollTrigger/), loader: count(/js\/loader\.js/),
      css: [...document.querySelectorAll('link[rel=stylesheet]')].filter(l => /css\/loader\.css/.test(l.href)).length,
    };
  });
  assert(r.gsap === 1 && r.st === 0 && r.loader === 1 && r.css === 1, `${p}: gsap once, no ScrollTrigger, loader.js once, loader.css once (${JSON.stringify(r)})`);
  assert(h.errors.length === 0, `${p}: 0 console errors ${JSON.stringify(h.errors)}`);
  await h.close();
}

// ---- 404 with its <base>: a transition from the 404 page resolves against the base ----
{
  const h = await openPage({ width: 1440, path: '404.html', skipLoader: false });
  const { page, errors } = h;
  await loaded(page, 3000);
  await page.locator('header a[href$="index.html#standorte"]:visible, header a.brand').first().click();
  await page.waitForURL(/\/(index\.html)?(#standorte)?$/, { timeout: 5000 });
  await loaded(page, 3000);
  assert(await page.evaluate(() => !!document.getElementById('standorte')), `404 -> home through the <base> lands on the home page (${page.url()})`);
  assert(errors.length === 0, `404 -> home: 0 console errors ${JSON.stringify(errors)}`);
  await h.close();
}

// ---- reduced motion: navigate at once, no cover anywhere ----------------------------
{
  const h = await openPage({ width: 1440, reducedMotion: true, skipLoader: false });
  const { page } = h;
  await loaded(page, 2000);
  await arm(page, { unload: true });
  await page.locator('footer a[href="impressum.html"]').click();
  await page.waitForURL(/impressum\.html$/, { timeout: 5000 });
  const probe = JSON.parse(await flag(page, 'probe-unload') || 'null');
  assert(probe && !probe.centreInCover && !probe.panelCovers, `reduced motion: no cover when leaving home (${JSON.stringify(probe)})`);
  await loaded(page, 1500);
  const s = await samples(page);
  assert(s.length > 0 && s.every(x => !x.cover && !x.loading), `reduced motion: impressum never shows a cover (${s.length} samples)`);
  assert(await flag(page, 'mtm-transition') === null, 'reduced motion: no mtm-transition flag is left behind');
  await h.close();
}

// ---- bfcache / back button: home is never left covered --------------------------------
{
  const h = await freshHome(1440);
  const { page } = h;
  await page.evaluate(() => { window.__persisted = []; addEventListener('pageshow', e => window.__persisted.push(e.persisted)); });
  await page.locator('footer a[href="impressum.html"]').click();
  await page.waitForURL(/impressum\.html$/, { timeout: 5000 });
  await loaded(page, 3000);
  await page.goBack({ waitUntil: 'load' });
  await sleep(500);
  const r = await page.evaluate(() => ({
    cover: !!document.querySelector('.loader') && getComputedStyle(document.querySelector('.loader')).display !== 'none',
    cls: document.documentElement.className,
    inert: document.querySelectorAll('header[inert], main[inert], footer[inert]').length,
    overflow: getComputedStyle(document.documentElement).overflowY,
  }));
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, 600);
  await sleep(500);
  const y = await page.evaluate(() => scrollY);
  assert(isHome(page) && !r.cover && !/is-loading|is-transition/.test(r.cls) && r.inert === 0 && r.overflow !== 'hidden',
    `back to home: not covered, nothing inert, scroll unlocked (${JSON.stringify(r)})`);
  assert(y > 100, `back to home: wheel scrolls the page (scrollY ${y})`);
  await h.close();
}

// ---- pageshow with persisted=true removes the cover-in state at once ------------------
{
  const h = await freshHome(1440);
  const { page } = h;
  await page.locator('footer a[href="impressum.html"]').scrollIntoViewIfNeeded();
  await page.locator('footer a[href="impressum.html"]').click({ noWaitAfter: true });
  await sleep(150);
  const mid = await page.evaluate(() => ({ cover: !!document.querySelector('.loader'), cls: document.documentElement.className }));
  assert(mid.cover && /is-loading/.test(mid.cls), `pageshow: precondition, the cover-in is under way (${mid.cls})`);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await sleep(60);
  const r = await page.evaluate(() => ({
    cover: !!document.querySelector('.loader'),
    cls: document.documentElement.className,
    inert: document.querySelectorAll('header[inert], main[inert], footer[inert]').length,
    flag: sessionStorage.getItem('mtm-transition'),
  }));
  await sleep(900);   // the cover-in would have navigated by now if it had survived
  assert(!r.cover && !/is-loading|is-transition/.test(r.cls) && r.inert === 0 && r.flag === null,
    `pageshow persisted: cover, classes, inert and flag cleared within 60ms (${JSON.stringify(r)})`);
  assert(isHome(page), `pageshow persisted: the interrupted navigation did not go through (${page.url()})`);
  await h.close();
}

// ---- navigation that never starts: the 3s safety timer uncovers the page ----------------
{
  const h = await freshHome(1440);
  const { page } = h;
  // a navigation that does not go through: a beforeunload handler that cancels it (Playwright dismisses the prompt, which stays on the page)
  page.on('dialog', d => d.dismiss());
  await page.evaluate(() => addEventListener('beforeunload', e => { e.preventDefault(); e.returnValue = ''; }));
  await page.locator('footer a[href="impressum.html"]').click({ noWaitAfter: true });
  await sleep(1500);
  const mid = await page.evaluate(() => ({ cover: !!document.querySelector('.loader'), cls: document.documentElement.className }));
  assert(mid.cover && /is-loading/.test(mid.cls), `safety timer: precondition, still covered at 1.5s while the navigation is blocked (${mid.cls})`);
  await sleep(2200);   // 3.7s after the click
  const r = await page.evaluate(() => ({
    cover: !!document.querySelector('.loader'),
    cls: document.documentElement.className,
    inert: document.querySelectorAll('header[inert], main[inert], footer[inert]').length,
    flag: sessionStorage.getItem('mtm-transition'),
  }));
  assert(!r.cover && !/is-loading|is-transition/.test(r.cls) && r.inert === 0 && r.flag === null && isHome(page),
    `safety timer: 3.7s after the click the cover is gone and the page is usable (${JSON.stringify(r)})`);
  await h.close();
}

// ---- sessionStorage throws: behave as a direct arrival, links still work ------------------
{
  const h = await openPage({ width: 1440, path: 'impressum.html', skipLoader: false });
  const { page, errors } = h;
  await loaded(page, 3000);
  await page.context().addInitScript(() => {
    const boom = () => { throw new DOMException('denied', 'SecurityError'); };
    Object.defineProperty(window, 'sessionStorage', { get: boom, configurable: true });
  });
  await page.locator('header a[href$="index.html#standorte"]:visible').first().click();
  await page.waitForURL(/index\.html#standorte$/, { timeout: 5000 });
  await loaded(page, 3000);
  const r = await page.evaluate(() => ({ cover: !!document.querySelector('.loader'), cls: document.documentElement.className }));
  assert(!r.cover && !/is-loading|is-transition/.test(r.cls), `sessionStorage throws: navigation still works, plain page on arrival (${r.cls})`);
  assert(errors.length === 0, `sessionStorage throws: 0 console errors ${JSON.stringify(errors)}`);
  await h.close();
}

// ---- the open logo menu goes under the cover ---------------------------------------------
{
  const h = await openPage({ width: 1440, path: 'impressum.html', skipLoader: false });
  const { page } = h;
  await loaded(page, 3000);
  await arm(page, { unload: true });
  await page.locator('.menu-btn').click();
  await page.waitForFunction(() => window.__lmDebug && window.__lmDebug.isOpen());
  await sleep(1200);
  await page.locator('.lm-link').first().click();
  await page.waitForURL(/index\.html#leistungen$/, { timeout: 5000 });
  const probe = JSON.parse(await flag(page, 'probe-unload') || 'null');
  assert(probe && probe.centreInCover && probe.panelCovers, `menu open: the cover goes over the menu (${JSON.stringify(probe)})`);
  await loaded(page, 2500);
  await h.close();
}

await report();
