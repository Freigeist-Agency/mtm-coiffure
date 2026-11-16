/* Title morphs (cofounder, 2026-11-13): as the page scrolls, a Badeen Display title stretches upward to twice its height, the tall version of
   "MTM Coiffure." the cofounder sent (a 2000x388 picture: the word across the full width, 279px tall at 1440 against 140px now). Scroll-
   scrubbed with a sine in-out curve; scrolling back shrinks it again. Only the height changes: scaleY about the word's baseline, so the
   letters grow upward and their feet stay where they are. The origin is measured on refresh, never per frame.
   - "MTM Coiffure." (the hero): from the top of the page to the moment the hero has left the top of the viewport. Its baseline is the
     hero's bottom edge (Badeen Display has no descent in this word).
   - "Standorte." (the cofounder: "the same animation"): from the word entering at the bottom of the viewport to leaving at the top, so it
     is half way (1.5x) as it passes the middle. It grows into the black above it; the button below does not move.
   Every width (a transform, no pin); under reduced motion the words stay as they are.
   2026-11-15 (Desktop_new rebuild): the hero has no big title any more, so only "Standorte." stretches; it now sits across the two
   location cards (.locations__title), centred with the translate property, so the scaleY transform does not disturb its place. */
(function () {
  'use strict';
  var STRETCH = 2;   // 279 / 140 at 1440 (the picture: 388 of 2000 px at the viewport's 1440 width)

  function baseline(el) {   // the baseline's distance from the element's top: a zero-size inline-block sits on it
    var m = document.createElement('span');
    m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    el.appendChild(m);
    var y = m.offsetTop - el.offsetTop * (m.offsetParent === el ? 0 : 1);
    el.removeChild(m);
    return y;
  }

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap || !ST) return;
    gsap.registerPlugin(ST);
    var hero = document.querySelector('.hero'), heroWord = hero && hero.querySelector('.hero-title span');
    var loc = document.querySelector('.locations__title') || document.querySelector('.locations__head h2');   // Desktop_new (2026-11-15): the title across the two cards
    var items = [];
    if (heroWord) items.push({ id: 'hero-morph', el: heroWord, trigger: hero, start: 'top top', end: 'bottom top',
      origin: function () {   // the hero's bottom edge in the word's own box: offsets only, so the current stretch does not skew it
        var top = 0, el = heroWord;
        while (el && el !== hero) { top += el.offsetTop; el = el.offsetParent; }
        return hero.offsetHeight - top;
      } });
    if (loc) items.push({ id: 'standorte-morph', el: loc, trigger: loc, start: 'top bottom', end: 'bottom top',
      origin: function () { return baseline(loc); } });
    if (!items.length) return;

    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', function () {
      function origins() { items.forEach(function (it) { gsap.set(it.el, { transformOrigin: '50% ' + it.origin() + 'px' }); }); }
      origins();
      ST.addEventListener('refreshInit', origins);
      var tws = items.map(function (it) {
        return gsap.fromTo(it.el, { scaleY: 1 }, {
          scaleY: STRETCH, ease: 'sine.inOut',
          scrollTrigger: { id: it.id, trigger: it.trigger, start: it.start, end: it.end, scrub: 0.5 }   // a transform: lag reads as mass (webflow-motion section 7)
        });
      });
      return function () {
        ST.removeEventListener('refreshInit', origins);
        tws.forEach(function (tw) { if (tw.scrollTrigger) tw.scrollTrigger.kill(); tw.kill(); });
        items.forEach(function (it) { gsap.set(it.el, { clearProps: 'transform,transformOrigin' }); });
      };
    });
  }
  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
