/* Ornament strips (Figma 300:1107 / 300:1106 / 300:1858): the red star of every rosette turns around its small black star as the strip
   passes through the viewport (cofounder, 2026-11-13): from the strip's top entering at the bottom of the screen to its bottom leaving at
   the top, scrubbed, so scrolling back turns it back. Neighbouring rosettes turn in opposite directions, like gears (the tile in
   assets/ornament.svg turns its first ring per piece by +--spin and its second by -(--spin)).
   TURN is a quarter turn: the ring of 12 triangles repeats every 30deg, so the strip enters and leaves the screen in Figma's exact layout.
   ease none: gears turn at a steady rate with the scroll. Every width; under prefers-reduced-motion the stars stay still. */
(function () {
  'use strict';
  var TURN = 90;   // degrees over the strip's whole pass through the viewport

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    var strips = document.querySelectorAll('.pattern-strip');
    if (!gsap || !ST || !strips.length) return;
    gsap.registerPlugin(ST);
    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', function () {
      Array.prototype.forEach.call(strips, function (strip, i) {
        gsap.fromTo(strip, { '--spin': '0deg' }, {
          '--spin': TURN + 'deg', ease: 'none',
          scrollTrigger: { id: 'ornament-' + i, trigger: strip, start: 'top bottom', end: 'bottom top', scrub: 0.5, invalidateOnRefresh: true }
        });
      });
      return function () { gsap.set(strips, { clearProps: '--spin' }); };
    });
  }
  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
