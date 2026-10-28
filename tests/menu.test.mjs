// Logo menu: closing it must not move the page, and in-page links on the home page must not reload it.
import { openPage, assert, report } from './harness.mjs';

// a real pointer click at the button's centre; page.click() would first scroll the element into view, which moves a page
// whose header sits inside the scroll-padding band, and so hides the very thing under test
const clickAt = async (page, sel) => {
  const b = await page.locator(sel).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
};
const wheelTo = async (page, goal) => {
  const vp = page.viewportSize();
  await page.mouse.move(vp.width / 2, vp.height / 2);
  for (let i = 0; i < 80; i++) {
    const y = await page.evaluate(() => scrollY);
    if (Math.abs(y - goal) < 3) break;
    await page.mouse.wheel(0, Math.max(-600, Math.min(600, goal - y)));
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(500);
};

// ---- 1. closing the menu keeps the scroll position and returns focus to the button ----
for (const p of ['index.html', 'impressum.html']) {
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    const tag = `${p} @${w}: menu close`;
    const { page, errors, close } = await openPage({ width: w, height: h, path: p });
    try {
      await page.evaluate(() => window.mtmReady);
      await page.waitForTimeout(300);
      const goal = await page.evaluate(() => Math.min(3000, document.documentElement.scrollHeight - innerHeight - 10));
      assert(goal > 300, `${tag}: page is tall enough to test (goal ${goal})`);
      await wheelTo(page, goal);
      const y0 = await page.evaluate(() => scrollY);
      await clickAt(page, '.menu-btn');
      await page.waitForFunction(() => window.__lmDebug && window.__lmDebug.isOpen());
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.lm-root').classList.contains('lm-open'), null, { timeout: 5000 });
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({ y: scrollY, focus: document.activeElement === document.querySelector('.menu-btn') }));
      assert(Math.abs(r.y - y0) <= 2, `${tag}: scrollY unchanged (${y0} -> ${r.y})`);
      assert(r.focus, `${tag}: focus is back on the menu button`);
      assert(errors.length === 0, `${tag}: no console errors ${errors.join('|')}`);
    } finally { await close(); }
  }
}

// ---- 3. in-page links on the home page stay on the document (no reload, no loader replay) ----
// root path, not index.html, and without ?skiploader's effect on the URL: the canonical URL is the server root
async function openRoot() {
  const o = await openPage({ width: 1440, height: 900, path: '' });
  await o.page.evaluate(() => window.mtmReady);
  await o.page.waitForTimeout(300);
  await o.page.evaluate(() => { window.__marker = 1; });
  return o;
}
const stayed = page => page.evaluate(() => ({
  marker: window.__marker === 1,
  top: document.getElementById('standorte').getBoundingClientRect().top,
  nav: document.querySelector('.site-header').getBoundingClientRect().bottom,
  hash: location.hash,
}));
const nearTop = r => r.top >= -2 && r.top <= r.nav + 80;
{
  for (const [label, sel] of [['header "Standorte."', '.site-header .nav-link'], ['header Termin buchen', '.site-header .btn'], ['footer Termin buchen', '.footer-cta']]) {
    const { page, close } = await openRoot();
    try {
      if (sel === '.footer-cta') {   // bring the footer button into view first (instant), then click it like a visitor would
        await page.evaluate(() => document.querySelector('.footer-cta').scrollIntoView({ behavior: 'instant', block: 'center' }));
        await page.waitForTimeout(300);
      }
      await clickAt(page, sel);
      await page.waitForTimeout(1800);
      const r = await stayed(page);
      assert(r.marker, `root /: ${label} does not reload the page`);
      assert(r.hash === '#standorte' && nearTop(r), `root /: ${label} scrolls #standorte to the top (top ${Math.round(r.top)}, nav ${Math.round(r.nav)}, ${r.hash})`);
    } finally { await close(); }
  }
  // menu links on the home page
  const { page, close } = await openRoot();
  try {
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('.lm-link')].map(a => a.getAttribute('href')));
    assert(JSON.stringify(hrefs) === JSON.stringify(['#leistungen', '#ueber-uns', '#standorte', '#standorte']), `home: menu links are in-page (${JSON.stringify(hrefs)})`);
    await clickAt(page, '.menu-btn');
    await page.waitForFunction(() => window.__lmDebug.isOpen());
    await page.waitForTimeout(1200);
    await clickAt(page, '.lm-link >> nth=0');
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => ({
      marker: window.__marker === 1, hash: location.hash,
      top: document.getElementById('leistungen').getBoundingClientRect().top,
      nav: document.querySelector('.site-header').getBoundingClientRect().bottom,
    }));
    assert(r.marker, 'root /: menu "Leistungen" does not reload the page');
    assert(r.hash === '#leistungen' && r.top >= -2 && r.top <= r.nav + 80, `root /: menu "Leistungen" scrolls #leistungen to the top (top ${Math.round(r.top)}, nav ${Math.round(r.nav)}, ${r.hash})`);
  } finally { await close(); }
}
// subpages keep absolute-to-home links
for (const p of ['impressum.html', 'datenschutz.html', '404.html']) {
  const { page, close } = await openPage({ width: 1440, height: 900, path: p });
  try {
    await page.evaluate(() => window.mtmReady);
    await page.waitForTimeout(300);
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('.lm-link')].map(a => a.href));
    const want = ['index.html#leistungen', 'index.html#ueber-uns', 'index.html#standorte', 'index.html#standorte'];
    assert(hrefs.length === 4 && hrefs.every((h, i) => h.endsWith('/' + want[i])), `${p}: menu links resolve to ${want[2]} etc. (${JSON.stringify(hrefs)})`);
  } finally { await close(); }
}
{
  const { page, close } = await openPage({ width: 1440, height: 900, path: 'locations/nuembrecht.html' });
  try {
    await page.evaluate(() => window.mtmReady);
    await page.waitForTimeout(300);
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('.lm-link')].map(a => a.getAttribute('href')));
    assert(hrefs[2] === '../index.html#standorte', `locations/: menu "Standorte" is ../index.html#standorte (${hrefs[2]})`);
  } finally { await close(); }
}
await report();
