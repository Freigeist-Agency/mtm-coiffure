/* Hero text on load and the services' entrance (cofounder, 2026-11-16, from a screen recording of a reference site).
   1. Hero text, on load (home and location pages): every line slides up into place from behind its own bottom edge (a mask: the
      line's box clips it, so it appears out of nothing), one line after the other. Measured on the recording: each line takes about
      0.6s, fast first and settling slowly (power4.out over LINE_S), the next line starting STAGGER later. It starts when the loader
      has lifted (window.mtmReady), or at once when there is none.
        home:      "Friseurmeister in", then "Nümbrecht & Waldbröl" with "Willkommen |" and the Arabic greeting
        location:  the salon's name, then the address and hours line by line
   2. The services section (the second section), on scroll: its Google card, the heading (line by line, the same masked rise) and the
      six photos (one after another, left to right) rise into place from below as they come into view (their top RISE_AT of the screen
      from the top), and sink back when the page is scrolled back above them.
   The text is split into masks once, by this script; the layout does not change (each mask is the line's own box). Under reduced
   motion, or without GSAP, nothing moves and nothing is split. */
(function () {
  'use strict';
  var LINE_S = 0.9, STAGGER = 0.2, EASE = 'power4.out';
  var RISE_Y = 80, RISE_S = 0.9, RISE_EASE = 'power3.out', RISE_AT = '88%', PHOTO_STAGGER = 0.08;

  // wrap an element's content in an inner span that can move while the element itself clips it (a mask the size of the line)
  function mask(el) {
    if (!el || el.__masked) return null;
    el.__masked = true;
    if (el.tagName === 'IMG') {   // an image is wrapped instead: the wrapper takes its place and clips it
      var w = document.createElement('span');
      w.className = 'hl-mask hl-mask--img';
      el.parentNode.insertBefore(w, el); w.appendChild(el);
      return el;
    }
    var inner = document.createElement('span');
    inner.className = 'hl-in';
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner);
    el.classList.add('hl-mask');
    return inner;
  }
  // a paragraph of <br>-separated lines becomes one mask per line
  function maskLines(p) {
    if (!p || p.__masked) return [];
    p.__masked = true;
    var groups = [[]];
    Array.prototype.slice.call(p.childNodes).forEach(function (n) { if (n.nodeName === 'BR') { groups.push([]); n.remove(); } else groups[groups.length - 1].push(n); });
    return groups.filter(function (g) { return g.length; }).map(function (g) {
      var line = document.createElement('span'), inner = document.createElement('span');
      line.className = 'hl-mask hl-line'; inner.className = 'hl-in';
      g.forEach(function (n) { inner.appendChild(n); });
      line.appendChild(inner); p.appendChild(line);
      return inner;
    });
  }

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // 1. hero text
    var steps = [];
    if (document.querySelector('.hero-claim')) {
      steps = [[mask(document.querySelector('.hero-claim__light'))],
               [mask(document.querySelector('.hero-claim__bold')), mask(document.querySelector('.hero-hello__word')), mask(document.querySelector('.hero-arabic'))]];
    } else if (document.querySelector('.loc-hero__title')) {
      steps = [[mask(document.querySelector('.loc-hero__title'))]].concat(maskLines(document.querySelector('.loc-hero__info')).map(function (l) { return [l]; }));
    }
    steps = steps.map(function (s) { return s.filter(Boolean); }).filter(function (s) { return s.length; });
    var hero = gsap.timeline({ paused: true });
    steps.forEach(function (s, i) { hero.fromTo(s, { yPercent: 105 }, { yPercent: 0, duration: LINE_S, ease: EASE }, i * STAGGER); });
    gsap.set(steps.flat ? steps.flat() : [].concat.apply([], steps), { yPercent: 105 });   // hidden under their masks until the loader lifts
    window.introMotion = { hero: hero, steps: steps.length };
    var ready = window.mtmReady || Promise.resolve();
    ready.then(function () { hero.play(); }, function () { hero.play(); });

    // 2. the services section on scroll
    var svc = document.querySelector('.services');
    if (svc && ST) {
      gsap.registerPlugin(ST);
      var heads = [mask(svc.querySelector('.services-title .headline__light')), mask(svc.querySelector('.services-title .headline__bold'))].filter(Boolean);
      var card = svc.querySelector('.svc-rating'), photos = Array.prototype.slice.call(svc.querySelectorAll('.cuts li'));
      var rise = function (targets, vars, trigger) {
        return gsap.fromTo(targets, { y: RISE_Y, opacity: 0 }, Object.assign({ y: 0, opacity: 1, duration: RISE_S, ease: RISE_EASE,
          scrollTrigger: { trigger: trigger, start: 'top ' + RISE_AT, toggleActions: 'play none none reverse' } }, vars));
      };
      var tws = [];
      if (card) tws.push(rise(card, {}, card));
      if (heads.length) tws.push(gsap.fromTo(heads, { yPercent: 105 }, { yPercent: 0, duration: LINE_S, ease: EASE, stagger: STAGGER,
        scrollTrigger: { trigger: svc.querySelector('.services-title'), start: 'top ' + RISE_AT, toggleActions: 'play none none reverse' } }));
      if (photos.length) tws.push(rise(photos, { stagger: PHOTO_STAGGER }, svc.querySelector('.cuts')));
      window.introMotion.services = tws;
    }
  }

  // the masks are made at once (before the loader lifts), so the hero text is hidden under them from the first revealed frame
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
