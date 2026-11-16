/* Hero shrink (cofounder, 2026-11-16): as the page starts to scroll, the whole hero (video, text, buttons) scales from 100% down to
   95% around its centre (first 85%; 95% since the same day) while its corners round from 0 to 20px, scrubbed by the scroll with sine in-out, and reverses scrolling back.
   The white page shows around it. Like the review card (js/review-grow.js):
   - 768px and up the hero is pinned while it shrinks (SHRINK_VH of a screen of scrolling), then the page moves on;
   - below 768 no pin (webflow-motion mobile law): it shrinks while it scrolls away (its top at the top of the screen to its bottom
     there).
   The corner is drawn on the unscaled box, so it ends at 20 / 0.95 for 20px on screen. Under reduced motion nothing moves and the hero
   just has its 20px corners (css/v2.css). */
(function () {
  'use strict';
  var TO = 0.95, RADIUS = 20, SHRINK_VH = 0.6, EASE = 'sine.inOut';   // 95% (cofounder, 2026-11-16: 85% was too much)

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger, hero = document.querySelector('.hero');
    if (!gsap || !ST || !hero) return;
    gsap.registerPlugin(ST);
    var mm = gsap.matchMedia();
    function shrink(pin) {
      var tw = gsap.fromTo(hero, { scale: 1, '--hero-r': 0 }, {   // the corner as a plain number in a CSS variable: GSAP rounds a border-radius to whole px (24 x 0.85 = 20.4)
        scale: TO, '--hero-r': RADIUS / TO, ease: EASE, transformOrigin: '50% 50%',
        scrollTrigger: pin
          ? { id: 'hero-shrink', trigger: hero, pin: true, start: 'top top', end: function () { return '+=' + window.innerHeight * SHRINK_VH; },
              scrub: 0.5, invalidateOnRefresh: true, refreshPriority: 2 }   // the page's first pin: measured before every trigger below it
          : { id: 'hero-shrink', trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.5 }
      });
      if (pin) ST.refresh();   // the triggers made earlier further down re-measure with the pin's space
      return function () { tw.scrollTrigger && tw.scrollTrigger.kill(); tw.kill(); gsap.set(hero, { clearProps: 'transform,--hero-r' }); };
    }
    mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', function () { return shrink(true); });
    mm.add('(max-width: 767px) and (prefers-reduced-motion: no-preference)', function () { return shrink(false); });
    window.heroShrink = { to: TO, radius: RADIUS };
  }

  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
