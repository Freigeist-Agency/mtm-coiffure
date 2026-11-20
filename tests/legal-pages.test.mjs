// Impressum and Datenschutz with the client's text (Word files, November 2026; cofounder, 2026-11-19). At 1512, 768 and 375:
//   1. Impressum: its 8 sections (Angaben gemäß § 5 DDG ... Verbraucherstreitbeilegung), the owner and both addresses, phone and
//      e-mail as links, USt-IdNr. DE465089066, Handwerkskammer zu Köln with Betriebsnummer 1246815, the social profiles linking to
//      the real Instagram and TikTok accounts;
//   2. Datenschutz: its 16 numbered sections in order, the Planity and STRATO references linked, the NRW supervisory authority,
//      "Stand: November 2026", its lists as lists;
//   3. no bracketed placeholder from the Word files is left ("[Link ...", "[Weitere Plattform ...");
//   4. readable: nothing wider than the screen, body text at least 15px, the footer still there; no console errors.
import { openPage, assert, report } from './harness.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IMP = ['Angaben gemäß § 5 DDG', 'Kontakt', 'Umsatzsteuer-Identifikationsnummer', 'Berufsrechtliche Angaben', 'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV', 'Haftung für Inhalte', 'Social-Media-Auftritte', 'Verbraucherstreitbeilegung'];
for (const [w, h, mobile] of [[1512, 900], [768, 1024], [375, 812, true]]) {
  for (const path of ['impressum.html', 'datenschutz.html']) {
    const tag = `${path} @${w}`;
    const { page, errors, close } = await openPage({ width: w, height: h, path, reducedMotion: true, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    await sleep(800);
    const r = await page.evaluate(() => {
      const m = document.querySelector('main.legal');
      return { h1: m.querySelector('h1').textContent.trim(), h2: [...m.querySelectorAll('h2')].map(e => e.textContent.trim()), text: m.innerText,
        links: [...m.querySelectorAll('a')].map(a => a.getAttribute('href')), lists: m.querySelectorAll('ul li').length,
        fs: parseFloat(getComputedStyle(m.querySelector('p')).fontSize), sw: document.documentElement.scrollWidth, vw: innerWidth, footer: !!document.querySelector('.site-footer') };
    });
    if (path === 'impressum.html') {
      assert(r.h1 === 'Impressum' && JSON.stringify(r.h2) === JSON.stringify(IMP), `${tag} 1: the 8 sections in order (${r.h2.join(' | ')})`);
      assert(['Mohamad Ali', 'Kaiserstraße 61', '51545 Waldbröl', 'Lindchenweg 3', '51588 Nümbrecht', 'DE465089066', 'Handwerkskammer zu Köln', '1246815', 'Friseurmeister'].every(x => r.text.includes(x)), `${tag} 1: owner, both addresses, USt-IdNr., chamber and Betriebsnummer`);
      assert(['tel:+4922919159374', 'mailto:info@mtmcoiffure.de', 'https://www.instagram.com/mtm_coiffure/', 'https://www.tiktok.com/@mtmbyabdul'].every(x => r.links.includes(x)), `${tag} 1: phone, e-mail, Instagram and TikTok are links (${r.links.join(' ')})`);
    } else {
      const nums = r.h2.map(t => parseInt(t, 10));
      assert(r.h1 === 'Datenschutzerklärung' && r.h2.length === 16 && nums.every((n, i) => n === i + 1), `${tag} 2: the 16 numbered sections in order (${r.h2.length})`);
      assert(r.links.includes('https://www.planity.com/de-DE/privacy-policy') && r.links.includes('https://www.strato.de/datenschutz/') && r.links.includes('mailto:info@mtmcoiffure.de'), `${tag} 2: Planity, STRATO and the e-mail linked`);
      assert(['Planity GmbH', 'Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen', 'Stand: November 2026', 'TikTok'].every(x => r.text.includes(x)) && r.lists >= 17, `${tag} 2: Planity, the authority, the date, TikTok; ${r.lists} list items`);
    }
    assert(!/\[(Link|Weitere)/.test(r.text), `${tag} 3: no bracketed placeholder left`);
    assert(r.sw <= r.vw && r.fs >= 15 && r.footer, `${tag} 4: fits the screen, text ${r.fs}px, footer there (${r.sw})`);
    assert(errors.length === 0, `${tag}: 0 console errors (${errors.join(' | ')})`);
    await close();
  }
}
await report();
