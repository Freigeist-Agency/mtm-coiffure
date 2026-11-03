/* Scroll-driven depth of the four animated white curved section edges on the home page: the white dome under the hero, the white
   ellipse over the top of Standorte (.locations), the curve under Standorte (before Social), and the white dome above the footer
   (.footer-top). The black footer dome and the full-width team photo have no moving edge.
   Reference: "Arc Scroll Transition" (Freigeist/references/hover-gallery-make/ScrollAnim.mp4, 1440x900 at 30fps), measured frame by
   frame (every edge sampled across the width, parabola fitted, sagitta = apex minus corners). Findings the mapping is built on:
     - the edge is a parabola; its depth (sagitta) is LINEAR in the position of the section boundary (the corner line), with no extra easing.
     - cover (a dome edge, the grey section rising over the photo): depth = K * q, flat while the boundary enters at the bottom of the
       viewport (q = 0), deepest as it reaches the top (q = 1). q is the boundary's position, 0 = bottom, 1 = top.
     - reveal (a smile edge, the grey section lifting off the photo): depth = K * (1 - q), deepest as the boundary enters, flat as it leaves.
     - K is a per-transition setting in the reference (0.195 / 0.423 W for the two covers, 0.156 / 0.085 W for the two reveals).
   Here K is fixed so the moving depth meets the designed one at the end of the travel where the section settles:
     dome   (hero, Locations curve, footer):  depth = D * p      p = 0 when the edge enters at the bottom, 1 when it has settled
     smile  (Standorte top):                  depth = D * (1 - p) p = 0 when the edge enters, 1 when it reaches the top
   D is the designed (Figma) depth, so s = depth / D is the factor applied to the ellipse. For the footer dome, p runs from its centre
   line (the bottom edge of .footer-top) entering at the bottom to the end of the document, because the page ends before that line
   can reach the top.

   The depth follows the scroll position exactly, moving or not: there is no resting state, a stopped page shows the depth its
   position maps to.

   Mechanism: one ScrollTrigger per curve (progress only, no pinning); its onUpdate draws. Rendering is a CSS variable (the ellipse
   pseudo-elements: scaleY about the ellipse's own centre line, so the section edge stays put and only the apex moves) and the ry
   attribute (the inlined curve SVG). No layout reads in any callback. Under prefers-reduced-motion, or without GSAP, nothing here
   runs and the static curves stay. */
(function () {
  'use strict';
  var MIN_S = 0.04;          // never a razor-flat ellipse: scaleY near 0 is degenerate and its antialiased edge can leave a hairline against the section beside it
  var CURVE_MIN_S = 0.5;     // the Social title sits on the white inside the curve: flatter and its ends land on the black above (needs 0.35 at 1440, 0.48 at 2560)
  var EPS = 0.0005;

  // A curve: where its progress comes from, how progress maps to the depth factor, how a factor is drawn.
  // pseudo-element curves: the ellipse is a ::before / ::after, its depth is a CSS variable on the owning element
  function varCurve(name, el, trigger, kind, start, end) {
    return {
      name: name, el: el, trigger: trigger, kind: kind, start: start, end: end,
      draw: function (s) { el.style.setProperty('--arc-s', s.toFixed(4)); el.classList.add('arc-live'); },
      clear: function () { el.classList.remove('arc-live'); el.style.removeProperty('--arc-s'); }
    };
  }
  function svgCurve(svg, kind) {                       // Locations curve: the ellipse's ry attribute
    var dome = svg.querySelector('.curve__dome');
    var ry0 = dome.getAttribute('ry'), base = parseFloat(ry0);
    return {
      name: 'curve', el: svg, trigger: svg, kind: kind, start: 'bottom bottom', end: 'bottom top',
      min: CURVE_MIN_S,
      draw: function (s) { dome.setAttribute('ry', (base * s).toFixed(2)); },
      clear: function () { dome.setAttribute('ry', ry0); }
    };
  }

  // depth factor the reference's mapping gives at progress p
  function target(c, p) {
    var m = c.kind === 'smile' ? 1 - p : p;
    var min = c.min || MIN_S;
    return m < min ? min : m;
  }

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap || !ST) return;
    var hero = document.querySelector('.hero');
    var about = document.querySelector('.locations');
    var curve = document.querySelector('svg.curve');
    var footTop = document.querySelector('html[data-home] .footer-top');   // its white ellipse exists from 768px up only
    if (!hero && !about && !curve && !footTop) return;
    gsap.registerPlugin(ST);

    var mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', function () {
      var curves = [], triggers = [];

      // the edge under the hero: its bottom edge is the dome's centre line
      if (hero) curves.push(varCurve('hero', hero, hero, 'dome', 'bottom bottom', 'bottom top'));
      if (about) curves.push(varCurve('about', about, about, 'smile', 'top bottom', 'top top'));   // the Standorte top
      if (curve) curves.push(svgCurve(curve, 'dome'));
      // the white dome above the footer: its centre line is the bottom edge of .footer-top; the page ends before it reaches the top
      if (footTop) curves.push(varCurve('footer', footTop, footTop, 'dome', 'bottom bottom', 'max'));

      curves.forEach(function (c) {
        c.p = 0; c.last = null;
        function update(self) {
          c.p = self.progress;
          var s = target(c, c.p);
          if (c.last !== null && Math.abs(s - c.last) < EPS) return;
          c.draw(s); c.last = s;
        }
        triggers.push(ST.create({
          id: 'arc-' + c.name, trigger: c.trigger, start: c.start, end: c.end,
          onRefresh: update, onUpdate: update
        }));
      });

      function find(k) {                                   // a curve by name or index
        if (typeof k === 'number') return curves[k];
        for (var i = 0; i < curves.length; i++) if (curves[i].name === k) return curves[i];
      }
      var api = {                                          // test hook
        factor: function (k) { var c = find(k); return c ? c.last : null; },
        progress: function (k) { var c = find(k); return c ? c.p : null; }
      };
      window.arcScroll = api;

      return function () {
        triggers.forEach(function (t) { t.kill(); });
        curves.forEach(function (c) { c.clear(); });
        if (window.arcScroll === api) delete window.arcScroll;
      };
    });
  }

  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
