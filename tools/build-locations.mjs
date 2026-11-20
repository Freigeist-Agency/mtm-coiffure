// Builds the two location pages (locations/nuembrecht.html, locations/waldbroel.html) from the home page (cofounder, 2026-11-16):
//   - the location hero (Figma 369:4477 "Hero Location": the salon's film, its name, the white "Termin Buchen" button, address and hours),
//   - then the home page from the news section down, with the photo gallery moved above the news heading and cards
//     (.news--swapped), the FAQ, the team photo and the footer;
//   - every "Termin buchen" button on the page (nav, hero, footer) opens that salon's Planity page.
// Run it after changing the home page: node tools/build-locations.mjs. The pages it writes are not edited by hand.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// The address, hours and booking link come from the home page, not from this file: the client can change them in Forge
// (.forge-edit.json; the parts marked data-edit), and a change there is written into every page, these two included.
// Reading them here keeps a rebuild from putting old values back.
function marked(re, what) {
  const m = re.exec(home);
  if (!m) throw new Error('not found in index.html: ' + what);
  return m;
}
function salonText(key) {
  const m = marked(new RegExp(`<p class="loc-card__info" data-edit="${key}\\.hours" data-edit-as="lines-br" data-edit-lead="${key}\\.address"><strong>([^<]*)</strong><br>([^]*?)</p>`), key + ' location card');
  return { adr: m[1], hours: m[2].split(/<br\s*\/?>/) };
}
const booking = (key, cls) => marked(new RegExp(`<a class="pill-btn ${cls}" data-edit="${key}\\.booking" data-edit-as="attr:href" href="([^"]*)"`), key + ' booking link')[1];

const SALONS = [
  { key: 'nb', slug: 'nuembrecht', name: 'Nümbrecht', by: 'Mo', ...salonText('nb'), planity: booking('nb', 'pill-btn--mo'),
    film: { poster: 'assets/hero-poster.jpg', phone: 'assets/hero-960.mp4', wide: 'assets/hero-1600.mp4', note: 'the salon pan, as on the home page' } },
  { key: 'wb', slug: 'waldbroel', name: 'Waldbröl', by: 'Abdul', ...salonText('wb'), planity: booking('wb', 'pill-btn--abdul'),
    film: { poster: 'assets/waldbroel-hero-poster.jpg', phone: 'assets/waldbroel-hero-phone.mp4', wide: 'assets/waldbroel-hero-1600.mp4', note: '"Sequenz 01_11": 1600x900, and its middle 540x900 for phones' } },
];

function cut(from, to) {   // the home page between two markers (from included, to excluded)
  const a = home.indexOf(from), b = home.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error('marker not found in index.html: ' + (a < 0 ? from : to));
  return home.slice(a, b);
}
// relative URLs move one folder up; absolute ones, in-page anchors, tel:, mailto: and data: stay
const up = u => /^(https?:|\/\/|#|tel:|mailto:|data:|\.\.\/)/.test(u) || u === '' ? u : '../' + u;
function rebase(html) {
  return html
    .replace(/\b(src|href|poster)="([^"]*)"/g, (m, a, u) => `${a}="${up(u)}"`)
    .replace(/\bsrcset="([^"]*)"/g, (m, list) => 'srcset="' + list.split(',').map(p => { const [u, ...rest] = p.trim().split(/\s+/); return [up(u), ...rest].join(' '); }).join(', ') + '"');
}

for (const s of SALONS) {
  const book = `data-edit="${s.key}.booking" data-edit-as="attr:href" href="${s.planity}" target="_blank" rel="noopener"`;
  let head = cut('<!doctype html>', '<body>')
    .replace('<html lang="de" data-root="" data-home>', `<html lang="de" data-root="../" data-home data-location="${s.slug}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>MTM Coiffure ${s.name} – Friseurmeister</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="MTM Coiffure by ${s.by} in ${s.name}: ${s.adr}. Öffnungszeiten und Termin buchen.">`)
    // canonical and share preview (the home page's tags, with this salon's address, title, text and still)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="https://mtmcoiffure.de/locations/${s.slug}.html">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="https://mtmcoiffure.de/locations/${s.slug}.html">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="MTM Coiffure ${s.name} – Friseurmeister">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="MTM Coiffure by ${s.by} in ${s.name}: ${s.adr}. Öffnungszeiten und Termin buchen.">`)
    ;   // the loader as on the home page: the first page of a visit plays it in full, later pages get the cover between pages

  let top = cut('<body>', '<main>')
    .replace('<a class="btn btn--sm pill-nav__cta" href="#standorte" aria-label="Termin buchen">', `<a class="btn btn--sm pill-nav__cta" ${book} aria-label="Termin in ${s.name} buchen">`);
  if (!top.includes(s.planity)) throw new Error('nav button not found');

  const hero = `<main>
  <section class="hero hero--loc" aria-label="${s.name}"><!-- Figma 369:4477 "Hero Location" -->
    <div class="hero-media">
      <!-- ${s.film.note}; silent -->
      <video autoplay muted loop playsinline preload="metadata" poster="${s.film.poster}" aria-hidden="true">
        <source src="${s.film.phone}" type="video/mp4" media="(max-width: 767px)">
        <source src="${s.film.wide}" type="video/mp4">
      </video>
      <script>/* prefers-reduced-motion: show the still poster instead of the moving clip */
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) { var hv = document.currentScript.previousElementSibling; hv.removeAttribute('autoplay'); hv.pause(); }
      </script>
    </div>
    <h1 class="loc-hero__title"><span class="sr-only">MTM Coiffure by ${s.by} in </span>${s.name}</h1>
    <a class="btn btn--white hero-cta" ${book} aria-label="Termin in ${s.name} buchen"><img src="assets/v2/btn-white.svg" alt="" width="163" height="35"></a>
    <p class="loc-hero__info" data-edit="${s.key}.hours" data-edit-as="lines-br" data-edit-lead="${s.key}.address"><strong>${s.adr}</strong><br>${s.hours.join('<br>')}</p><!-- from the salon's Planity page, 2026-11-16 -->
  </section>

`;

  // the news section with its gallery first
  let news = cut('  <section class="news"', '  <section class="faq"');
  const row = news.slice(news.indexOf('    <div class="team-row"'), news.indexOf('  </section>'));
  news = news.replace(row, '').replace('<section class="news"', '<section class="news news--swapped"').replace('    <div class="news-head">', row + '    <div class="news-head">');
  if (news.indexOf('team-row') > news.indexOf('news-head')) throw new Error('gallery not moved');

  const rest = cut('  <section class="faq"', '</html>')
    .replace('<a class="btn footer-cta" href="#standorte" aria-label="Termin buchen">', `<a class="btn footer-cta" ${book} aria-label="Termin in ${s.name} buchen">`);
  if (!rest.includes(s.planity)) throw new Error('footer button not found');

  let page = head + top + hero + news + rest + '</html>\n';
  page = page.replace('<!doctype html>', `<!doctype html>\n<!-- built by tools/build-locations.mjs from index.html: change the home page or that script, not this file -->`);
  page = rebase(page);
  fs.writeFileSync(path.join(ROOT, 'locations', s.slug + '.html'), page);
  console.log('wrote locations/' + s.slug + '.html', page.length, 'chars');
}
