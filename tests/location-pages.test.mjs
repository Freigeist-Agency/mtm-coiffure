// Location pages (tools/build-locations.mjs; cofounder, 2026-11-16) and the salon details across the site.
// Each of locations/nuembrecht.html and locations/waldbroel.html, at 1512, 1024, 768, 375 and 2560:
//   1. loads with no console errors (so no missing file: a 404 logs one) and no sideways scroll;
//   2. the hero (Figma 369:4477): the salon's name as the h1, its own film playing, at 1512 the name 128px light centred on 756 with its
//      line ending at 439, the white button 163x35 at 670/517, address and hours 14px light, 388 wide, centred, from 630 (within 1px);
//   3. every "Termin buchen" (menu bar, hero, footer) opens that salon's Planity page in a new tab; the FAQ's "MTM by Mo" opens
//      Nümbrecht's and "MTM by Abdul" Waldbröl's;
//   4. below the hero the home page from the news down, the photo gallery first: gallery above the heading above the cards, then the
//      FAQ, the team photo and the footer; at 1024 and up 165 (x width/1512) from the gallery to the heading, as on the home page from
//      the cards to the gallery;
//   5. Planity's address and hours in the hero and the footer, no placeholder address or phone anywhere;
//   6. arriving fresh (no ?skiploader, the first page of a visit) it plays the full loader with its counter, as every page does since
//      2026-11-16 (tests/loader-v2.test.mjs checks the loader itself).
// And the home page, Impressum, Datenschutz and the error page carry the new details and none of the old.
import fs from 'node:fs';
import { openPage, assert, report } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t = 1) => Math.abs(a - b) <= t;
const N = { slug: 'nuembrecht', name: 'Nümbrecht', adr: 'Lindchenweg 3, 51588 Nümbrecht', hours: ['Mo – Fr: 9 – 18 Uhr', 'Sa: 8:30 – 14 Uhr', 'So: geschlossen'], planity: 'https://www.planity.com/de-DE/mtm-coiffure-by-mo-51588-numbrecht', film: 'hero-' };
const W = { slug: 'waldbroel', name: 'Waldbröl', adr: 'Kaiserstraße 61, 51545 Waldbröl', hours: ['Mo – Fr: 9 – 19 Uhr', 'Sa: 9 – 17 Uhr', 'So: geschlossen'], planity: 'https://www.planity.com/de-DE/mtm-coiffure-by-abdul-51545-waldbrol', film: 'waldbroel-hero-' };
const OLD = /Hauptstraße|0229[13] 0{6}|Di – Fr/;   // the old dummy numbers; the real 02291 9159374 from the legal pages is fine

for (const s of [N, W]) {
  for (const [w, h, mobile] of [[1512, 900], [1024, 768], [768, 1024], [375, 812, true], [2560, 1440]]) {
    const tag = `${s.slug} @${w}`;
    const { page, errors, close } = await openPage({ width: w, height: h, path: `locations/${s.slug}.html`, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    await sleep(2500);
    const r = await page.evaluate(() => {
      const hero = document.querySelector('.hero--loc'), hb = hero.getBoundingClientRect();
      const b = sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left - hb.left, y: r.top - hb.top, w: r.width, h: r.height, t: r.top + scrollY, bt: r.bottom + scrollY }; };
      const t = document.querySelector('.loc-hero__title'), v = hero.querySelector('video');
      const links = sel => [...document.querySelectorAll(sel)].map(a => ({ href: a.getAttribute('href'), target: a.getAttribute('target') }));
      return { h1: t.textContent.replace(/\s+/g, ' ').trim(), h1s: document.querySelectorAll('h1').length, title: b('.loc-hero__title'), fs: parseFloat(getComputedStyle(t).fontSize), fw: getComputedStyle(t).fontWeight,
        cta: b('.hero--loc .hero-cta'), info: b('.loc-hero__info'), infoFs: parseFloat(getComputedStyle(document.querySelector('.loc-hero__info')).fontSize), infoText: document.querySelector('.loc-hero__info').innerText,
        film: v.currentSrc.split('/').pop(), filmReady: v.readyState, book: links('.pill-nav__cta, .hero--loc .hero-cta, .footer-cta'), mo: links('.pill-btn--mo')[0], abdul: links('.pill-btn--abdul')[0],
        row: b('.news--swapped .team-row'), head: b('.news--swapped .news-head h2'), cards: b('.news--swapped .news-cards'), faq: b('.faq'), photo: b('.finale-photo'), footer: b('.site-footer'),
        footerText: document.querySelector('.site-footer').innerText, html: document.documentElement.outerHTML, sw: document.documentElement.scrollWidth, vw: innerWidth };
    });
    assert(r.h1s === 1 && r.h1.endsWith(s.name), `${tag} 2: the h1 is the salon's name (${r.h1})`);
    assert(r.film.startsWith(s.film) && r.filmReady >= 2, `${tag} 2: its own film loads (${r.film}, ready ${r.filmReady})`);
    if (w === 1512) {
      assert(near(r.title.x + r.title.w / 2, 756) && near(r.title.y + r.title.h, 439) && r.fs === 128 && r.fw === '300', `${tag} 2: the name 128 light, centred on 756, ending at 439 (${(r.title.x + r.title.w / 2).toFixed(1)}, ${(r.title.y + r.title.h).toFixed(1)}, ${r.fs} ${r.fw})`);
      assert(near(r.cta.x, 670) && near(r.cta.y, 517) && near(r.cta.w, 163) && near(r.cta.h, 35), `${tag} 2: the button at 670/517 (${r.cta.x.toFixed(1)}, ${r.cta.y.toFixed(1)})`);
      assert(near(r.info.x + r.info.w / 2, 756) && near(r.info.y, 630) && near(r.info.w, 388) && r.infoFs === 14, `${tag} 2: address and hours 388 wide from 630 (${r.info.y.toFixed(1)}, ${r.info.w.toFixed(1)})`);
    } else {
      assert(r.title.x >= 0 && r.title.x + r.title.w <= r.vw && r.cta.y > r.title.y + r.title.h - 1 && r.info.y > r.cta.y + r.cta.h, `${tag} 2: the name fits the width, the button under it, the details under that`);
    }
    assert(r.book.length === 3 && r.book.every(l => l.href === s.planity && l.target === '_blank'), `${tag} 3: menu bar, hero and footer buttons open ${s.slug}'s Planity page in a new tab (${r.book.map(l => l.href.slice(-14))})`);
    assert(r.mo.href === N.planity && r.abdul.href === W.planity, `${tag} 3: "MTM by Mo" books Nümbrecht, "MTM by Abdul" Waldbröl`);
    assert(r.row.t < r.head.t && r.head.t < r.cards.t && r.cards.bt <= r.faq.t + 1 && r.faq.t < r.photo.t && r.photo.t < r.footer.t, `${tag} 4: gallery, heading, cards, FAQ, team photo, footer in that order`);
    if (w >= 1024) assert(near(r.head.t - r.row.bt, 165 * w / 1512, 1.5), `${tag} 4: 165 from the gallery to the heading (${(r.head.t - r.row.bt).toFixed(1)})`);
    assert(r.infoText.includes(s.adr) && s.hours.every(x => r.infoText.includes(x)), `${tag} 5: the hero shows Planity's address and hours`);
    assert(r.footerText.includes(N.adr) && r.footerText.includes(W.adr), `${tag} 5: the footer has both new addresses`);
    assert(!OLD.test(r.html), `${tag} 5: no placeholder address, phone or hours left (${(r.html.match(OLD) || [])[0]})`);
    assert(r.sw <= r.vw, `${tag} 1: no sideways scroll (${r.sw})`);
    assert(errors.length === 0, `${tag} 1: 0 console errors (${errors.join(' | ')})`);
    await close();
  }
  const fresh = await openPage({ width: 1512, height: 900, path: `locations/${s.slug}.html`, skipLoader: false });
  await sleep(600);
  const cls = await fresh.page.evaluate(() => ({ c: document.documentElement.className, count: !!document.querySelector('.loader__count') && getComputedStyle(document.querySelector('.loader__count')).display !== 'none' && document.documentElement.classList.contains('is-loading') }));
  assert(cls.count, `${s.slug} 6: the full loader with its counter when arriving fresh (${cls.c})`);
  await fresh.close();
}

// the rest of the site
for (const f of ['index.html', 'impressum.html', 'datenschutz.html', '404.html']) {
  const t = fs.readFileSync(f, 'utf8');
  assert(t.includes(N.adr) && t.includes(W.adr) && N.hours.concat(W.hours).every(x => t.includes(x)) && !OLD.test(t), `${f}: both salons' Planity address and hours, nothing old (${(t.match(OLD) || [])[0] || 'clean'})`);
}
{
  const { page, errors, close } = await openPage({ width: 1512, height: 900 });
  await sleep(1200);
  const r = await page.evaluate(() => ({ cards: [...document.querySelectorAll('.loc-card__info')].map(p => p.innerText), mo: document.querySelector('.pill-btn--mo').getAttribute('href'), abdul: document.querySelector('.pill-btn--abdul').getAttribute('href'), cardLinks: [...document.querySelectorAll('.loc-card__name a')].map(a => a.getAttribute('href')) }));
  assert(r.cards[0].includes(N.adr) && r.cards[1].includes(W.adr), 'home: the Standorte cards show the new addresses');
  assert(r.mo === N.planity && r.abdul === W.planity, 'home: "MTM by Mo" / "MTM by Abdul" book at their salons on Planity');
  assert(r.cardLinks[0] === 'locations/nuembrecht.html' && r.cardLinks[1] === 'locations/waldbroel.html', 'home: the Standorte cards still open the location pages');
  assert(errors.length === 0, `home: 0 console errors (${errors.join(' | ')})`);
  await close();
}
await report();
