/* Salon details for search engines (schema.org HairSalon, JSON-LD), built in the browser from the footer, so it always
   matches what the owner last changed in Forge: the address (nb.address / wb.address), the opening hours (nb.hours /
   wb.hours) and the booking link (nb.booking / wb.booking). Google reads JSON-LD that a script adds. If an hours line is
   not in the "Mo – Fr: 9 – 18 Uhr" form, the hours are left out rather than guessed. */
(function () {
  'use strict';
  var SITE = 'https://mtmcoiffure.de/';
  var SALONS = [
    { key: 'nb', name: 'MTM Coiffure by Mo', slug: 'nuembrecht', image: 'assets/hero-poster.jpg' },
    { key: 'wb', name: 'MTM Coiffure by Abdul', slug: 'waldbroel', image: 'assets/waldbroel-poster.jpg' }
  ];
  var DAYS = { Mo: 'Monday', Di: 'Tuesday', Mi: 'Wednesday', Do: 'Thursday', Fr: 'Friday', Sa: 'Saturday', So: 'Sunday' };
  var ORDER = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  function text(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function time(t) { var m = /^(\d{1,2})(?::(\d{2}))?$/.exec(t); return m ? ('0' + m[1]).slice(-2) + ':' + (m[2] || '00') : null; }

  // "Mo – Fr: 9 – 18 Uhr" | "Sa: 8:30 – 14 Uhr" | "So: geschlossen"  ->  spec, null (closed) or undefined (unreadable)
  function hoursLine(line) {
    var m = /^(Mo|Di|Mi|Do|Fr|Sa|So)(?:\s*[–-]\s*(Mo|Di|Mi|Do|Fr|Sa|So))?\s*:\s*(.+)$/.exec(line);
    if (!m) return undefined;
    if (/^geschlossen$/i.test(m[3].trim())) return null;
    var t = /^(\d{1,2}(?::\d{2})?)\s*[–-]\s*(\d{1,2}(?::\d{2})?)\s*(?:Uhr)?$/.exec(m[3].trim());
    if (!t || !time(t[1]) || !time(t[2])) return undefined;
    var a = ORDER.indexOf(m[1]), b = m[2] ? ORDER.indexOf(m[2]) : a;
    if (b < a) return undefined;
    return { '@type': 'OpeningHoursSpecification', dayOfWeek: ORDER.slice(a, b + 1).map(function (d) { return DAYS[d]; }),
      opens: time(t[1]), closes: time(t[2]) };
  }

  var graph = [];
  SALONS.forEach(function (s) {
    var adr = text(document.querySelector('p[data-edit="' + s.key + '.address"]'));
    var a = /^(.+),\s*(\d{5})\s+(.+)$/.exec(adr);
    if (!a) return;   // no readable address: leave this salon out rather than publish a wrong one
    var salon = {
      '@type': 'HairSalon', name: s.name, url: SITE + 'locations/' + s.slug + '.html', image: SITE + s.image,
      address: { '@type': 'PostalAddress', streetAddress: a[1], postalCode: a[2], addressLocality: a[3], addressCountry: 'DE' },
      parentOrganization: { '@type': 'Organization', name: 'MTM Coiffure', url: SITE }
    };
    var lines = Array.prototype.map.call(document.querySelectorAll('ul[data-edit="' + s.key + '.hours"] li'), text);
    var specs = lines.map(hoursLine);
    if (lines.length && specs.every(function (x) { return x !== undefined; })) salon.openingHoursSpecification = specs.filter(Boolean);
    var book = document.querySelector('a[data-edit="' + s.key + '.booking"]');
    if (book && /^https:\/\//.test(book.href)) salon.potentialAction = { '@type': 'ReserveAction', target: book.href };
    graph.push(salon);
  });
  if (!graph.length) return;
  var tag = document.createElement('script');
  tag.type = 'application/ld+json';
  tag.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  document.head.appendChild(tag);
})();
