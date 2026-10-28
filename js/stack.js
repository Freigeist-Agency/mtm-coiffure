/* Stacks (home page): news cards and the two Standorte rows. The layering itself is CSS (position: sticky, see "Stacked
   mode" and "Locations stack" in css/site.css). This file only adds depth: when layer N+1 rises over layer N, layer N
   scrubs to scale 0.92 and its CONTENT to opacity 0.35. The covered surface stays as it is (the news card keeps its opaque
   surface and Figma shadow so its peeking top edge stays visible).
   One ScrollTrigger per covered layer, scrub only, no pinning, no per-frame reads. initStack(container, layerSelector) is
   called once per stack; the scrub for layer N runs from "layer N+1 enters the viewport" to "layer N+1 reaches its stuck line".
   Those scroll positions are worked out from layout (stack top + heights and margin-tops of the layers up to it), not
   from the sticky element itself, whose rect moves while it is stuck. They are re-evaluated on every refresh.
   A layer that is not itself sticky (the second Standorte row, which simply scrolls up over the pinned first one) stops
   where the layer before it is pinned.
   The Standorte rows also publish the first row's measured height as --stack-row-h on the stack (set before every refresh,
   never per frame); the CSS uses it to choose the pin line so the whole photo stays in view.
   Without GSAP, none of this depth runs, but the CSS sticky stacking still applies (it needs only the html.js class from the
   head script, not this file or GSAP). Under prefers-reduced-motion neither runs: the CSS makes every stack plain flow. */
(function () {
  'use strict';
  var SCALE = 0.92, OPACITY = 0.35, EASE = 'sine.inOut';

  // container: the element whose children are the layers; layerSel: which children; opts.id names the ScrollTriggers,
  // opts.rowVar (a custom property) receives the first layer's measured height
  function initStack(container, layerSel, opts) {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    opts = opts || {};
    var layers = Array.prototype.slice.call(container.querySelectorAll(layerSel));
    if (layers.length < 2) return;

    // document y of layer k's top when it is NOT stuck (offsetHeight ignores transforms)
    function flowTop(k) {
      var y = container.getBoundingClientRect().top + window.pageYOffset;
      for (var j = 0; j <= k; j++) {
        y += parseFloat(getComputedStyle(layers[j]).marginTop) || 0;   // the run before a layer is its margin-top
        if (j < k) y += layers[j].offsetHeight;
      }
      return y;
    }
    // where layer k stops: its own sticky top, or (when it just scrolls up over the layer before it) that layer's
    function stuckTop(k) {
      if (k > 0 && getComputedStyle(layers[k]).position !== 'sticky') return stuckTop(k - 1);
      return parseFloat(getComputedStyle(layers[k]).top) || 0;
    }

    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', function () {
      if (getComputedStyle(layers[0]).position !== 'sticky') return;   // static layout (e.g. no stylesheet): leave it alone
      var measure = null;
      if (opts.rowVar) {
        measure = function () { container.style.setProperty(opts.rowVar, layers[0].offsetHeight + 'px'); };
        measure();
        ST.addEventListener('refreshInit', measure);   // before ScrollTrigger reads positions, so the pin line is current
      }
      for (var i = 0; i < layers.length - 1; i++) {
        (function (i) {
          var content = layers[i].children;
          var vars = {
            start: function () { return flowTop(i + 1) - window.innerHeight; },
            end: function () { return flowTop(i + 1) - stuckTop(i + 1); },
            scrub: true, invalidateOnRefresh: true
          };
          if (opts.id) vars.id = opts.id;
          var tl = gsap.timeline({ defaults: { ease: EASE, duration: 1 }, scrollTrigger: vars });
          tl.fromTo(layers[i], { scale: 1 }, { scale: SCALE }, 0)
            .fromTo(content, { opacity: 1 }, { opacity: OPACITY }, 0);
        })(i);
      }
      return function () {
        if (measure) { ST.removeEventListener('refreshInit', measure); container.style.removeProperty(opts.rowVar); }
      };
    });
  }

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap || !ST) return;
    gsap.registerPlugin(ST);
    var news = document.querySelector('.news .stack');
    if (news) initStack(news, ':scope > .stack__layer');
    var locations = document.querySelector('.locations__main');
    if (locations) initStack(locations, ':scope > .location-info', { id: 'stack-locations', rowVar: '--stack-row-h' });
  }

  window.initStack = initStack;
  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
