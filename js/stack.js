/* News stack (home page). The layering itself is CSS (position: sticky, see "Stacked mode" in css/site.css).
   This file only adds depth: when layer N+1 rises over layer N, layer N scrubs to scale 0.92 and its CONTENT to
   opacity 0.35. The card surface stays opaque (with its Figma shadow) so its peeking top edge stays visible.
   One ScrollTrigger per covered layer (2, each driving a two-tween timeline), scrub only, no pinning, no per-frame reads.
   The scrub for layer N runs from "layer N+1 enters the viewport" to "layer N+1 reaches its sticky top".
   Those scroll positions are worked out from layout (stack top + heights and margin-tops of the layers up to it), not
   from the sticky element itself, whose rect moves while it is stuck. They are re-evaluated on every refresh.
   Without GSAP, none of this depth runs, but the CSS sticky stacking still applies (it needs only the html.js class from the
   head script, not this file or GSAP). Under prefers-reduced-motion neither runs: the CSS makes the stack plain flow. */
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
      for (var j = 0; j <= k; j++) {
        y += parseFloat(getComputedStyle(layers[j]).marginTop) || 0;   // the run before a layer is its margin-top
        if (j < k) y += layers[j].offsetHeight;
      }
      return y;
    }
    function stuckTop(k) { return parseFloat(getComputedStyle(layers[k]).top) || 0; }

    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', function () {
      if (getComputedStyle(layers[0]).position !== 'sticky') return;   // static layout (e.g. no stylesheet): leave it alone
      for (var i = 0; i < layers.length - 1; i++) {
        (function (i) {
          var content = layers[i].children;
          var tl = gsap.timeline({
            defaults: { ease: EASE, duration: 1 },
            scrollTrigger: {
              start: function () { return flowTop(i + 1) - window.innerHeight; },
              end: function () { return flowTop(i + 1) - stuckTop(i + 1); },
              scrub: true, invalidateOnRefresh: true
            }
          });
          tl.fromTo(layers[i], { scale: 1 }, { scale: SCALE }, 0)
            .fromTo(content, { opacity: 1 }, { opacity: OPACITY }, 0);
        })(i);
      }
    });
  }

  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
