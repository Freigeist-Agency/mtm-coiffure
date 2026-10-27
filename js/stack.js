/* News stack (home page). The layering itself is CSS (position: sticky, see "Stacked mode" in css/site.css).
   This file only adds depth: when layer N+1 rises over layer N, layer N scrubs to scale 0.92 / opacity 0.35.
   One ScrollTrigger per covered layer (2), scrub only, no pinning, no per-frame reads.
   The scrub for layer N runs from "layer N+1 enters the viewport" to "layer N+1 reaches its sticky top".
   Those scroll positions are worked out from layout (stack top + heights + margins of the layers before it), not
   from the sticky element itself, whose rect moves while it is stuck. They are re-evaluated on every refresh.
   Under prefers-reduced-motion, or without GSAP, nothing here runs and the static layout stays. */
(function () {
  'use strict';
  var SCALE = 0.92, OPACITY = 0.35, EASE = 'sine.inOut';

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    var stack = document.querySelector('.news .stack');
    if (!gsap || !ST || !stack) return;
    gsap.registerPlugin(ST);
    var layers = Array.prototype.slice.call(stack.querySelectorAll(':scope > .stack__layer'));
    if (layers.length < 2) return;

    // document y of layer k's top when it is NOT stuck (offsetHeight ignores transforms)
    function flowTop(k) {
      var y = stack.getBoundingClientRect().top + window.pageYOffset;
      for (var j = 0; j < k; j++) y += layers[j].offsetHeight + (parseFloat(getComputedStyle(layers[j]).marginBottom) || 0);
      return y;
    }
    function stuckTop(k) { return parseFloat(getComputedStyle(layers[k]).top) || 0; }

    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', function () {
      if (getComputedStyle(layers[0]).position !== 'sticky') return;   // static layout (e.g. no stylesheet): leave it alone
      for (var i = 0; i < layers.length - 1; i++) {
        (function (i) {
          gsap.fromTo(layers[i], { scale: 1, opacity: 1 }, {
            scale: SCALE, opacity: OPACITY, ease: EASE, overwrite: 'auto',
            scrollTrigger: {
              start: function () { return flowTop(i + 1) - window.innerHeight; },
              end: function () { return flowTop(i + 1) - stuckTop(i + 1); },
              scrub: true, invalidateOnRefresh: true
            }
          });
        })(i);
      }
    });
  }

  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
