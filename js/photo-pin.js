/* Team photo, pinned (css/photo-pin.css). The photo stays put while the footer slides over it, and the image pans up inside its box so
   the bottom of the picture (Mo's chair) is in view before the footer covers it. 768px and up with motion allowed; otherwise nothing here runs.
   The pan runs against the footer's top edge in viewport terms: it begins when that edge is half a screen below the fold and is finished once
   the edge has climbed to 85% of the screen. Change PAN_START / PAN_END to move it.
   The footer height and the box height are measured before every ScrollTrigger refresh, never per frame; the pan distance is read the same way
   (a function value, invalidated on refresh). Runs before js/stack.js and js/arc-scroll.js so their start/end see the pinned layout. */
(function () {
  'use strict';
  var PAN_START = 'top bottom+=50%', PAN_END = 'top 85%';
  // 2026-11-13 (cofounder): every face stays in view. The tallest head's hair starts 4% down the picture (65 of 1600px, measured), so the
  // pan stops once that hair is HEAD_MARGIN px below the top of the screen, even if more of the picture's bottom could still come into view.
  var HEAD_TOP = 0.04, HEAD_MARGIN = 16;

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap || !ST) return;
    var html = document.documentElement;
    var footer = document.querySelector('.site-footer');
    var finale = document.querySelector('.news .stack > .finale');
    var img = finale && finale.querySelector('img');
    if (!footer || !img) return;
    gsap.registerPlugin(ST);

    gsap.matchMedia().add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', function () {
      function measure() {
        html.style.setProperty('--fh', footer.offsetHeight + 'px');
        html.style.setProperty('--box-h', finale.offsetHeight + 'px');
      }
      html.classList.add('photo-pin');
      measure();
      ST.addEventListener('refreshInit', measure);
      var pan = gsap.fromTo(img, { y: 0 }, {
        y: function () { var ih = img.getBoundingClientRect().height, pin = parseFloat(getComputedStyle(finale).top) || 0;
          return -Math.max(0, Math.min(ih - finale.getBoundingClientRect().height, pin + HEAD_TOP * ih - HEAD_MARGIN)); },   // the full pan, capped so the heads stay in view   // heights only: a translate does not change them, and rounded offsetHeight leaves a fraction of a pixel short
        ease: 'none',
        scrollTrigger: { id: 'pan', trigger: footer, start: PAN_START, end: PAN_END, scrub: true, invalidateOnRefresh: true }
      });
      return function () {
        ST.removeEventListener('refreshInit', measure);
        if (pan.scrollTrigger) pan.scrollTrigger.kill();
        pan.kill();
        gsap.set(img, { clearProps: 'transform,willChange' });
        html.classList.remove('photo-pin');
        html.style.removeProperty('--fh');
        html.style.removeProperty('--box-h');
      };
    });
  }

  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
