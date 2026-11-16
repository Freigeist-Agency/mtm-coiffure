/* Services section: the title ("Die besten Haarschnitte / im Oberbergischen.", top left) slides in from the left edge and the text (bottom
   right) from the right edge, driven by scroll, as the photo ring pins and starts its turn (cofounder, 2026-11-13).
   The slide starts on the same scroll position as the ring's pin (js/orbit.js, 'orbit-pin': the section's centre at the viewport's
   centre) and runs over the first SLIDE_SHARE of the pin, while the ring begins to turn. Each starts just past its own screen edge
   (measured on refresh, so it works at any width), eases in with the site's sine.inOut and the same 0.5s scrub lag as the other scrubbed
   motion; scrolling back slides them out again.
   768px and up with motion allowed, where the ring pins. Phones (no pin, the copy in the flow) and reduced motion: the text stays put. */
(function () {
  'use strict';
  var SLIDE_SHARE = 0.3;   // share of the pin's length the slide takes
  var PIN_VH = 1.5;        // the pin's length in viewport heights: js/orbit.js PIN_VH
  var GAP = 0.02;          // the start is this much of the viewport's width beyond the screen edge, so nothing peeks in before

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    var root = document.querySelector('.services'), title = root && root.querySelector('.services-copy h2'), text = root && root.querySelector('.services-copy p');
    if (!gsap || !ST || !title || !text) return;
    gsap.registerPlugin(ST);
    gsap.matchMedia().add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', function () {
      var vw = function () { return document.documentElement.clientWidth; };
      var tl = gsap.timeline({
        defaults: { ease: 'sine.inOut', duration: 1 },
        scrollTrigger: {
          id: 'services-copy', trigger: root, start: 'center center',
          end: function () { return '+=' + window.innerHeight * PIN_VH * SLIDE_SHARE; },
          scrub: 0.5, invalidateOnRefresh: true, refreshPriority: 1   // after the ring's pin (1.5), so its start sees the pinned layout
        }
      });
      tl.fromTo(title, { x: function () { return -(title.offsetLeft + title.offsetWidth + GAP * vw()); } }, { x: 0 }, 0)
        .fromTo(text, { x: function () { return vw() - text.offsetLeft + GAP * vw(); } }, { x: 0 }, 0);
      return function () { gsap.set([title, text], { clearProps: 'transform' }); };
    });
  }
  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
