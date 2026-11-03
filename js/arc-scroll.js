/* Scroll-driven depth of the animated curved section edges on the home page: the white dome under the hero, the white
   ellipse over the top of Standorte (.locations), the curve under Standorte (before Social), the white ellipse over the top of the
   team photo (.finale, the bottom of the news section), and the white dome above the footer (.footer-top). The black footer dome has no moving edge.
   Reference: "Arc Scroll Transition" (Freigeist/references/hover-gallery-make/ScrollAnim.mp4, 1440x900 at 30fps), measured frame by
   frame (every edge sampled across the width, parabola fitted, sagitta = apex minus corners). Findings the mapping is built on:
     - the edge is a parabola; its depth (sagitta) is LINEAR in the position of the section boundary (the corner line), with no extra easing.
     - cover (a dome edge, the grey section rising over the photo): depth = K * q, flat while the boundary enters at the bottom of the
       viewport (q = 0), deepest as it reaches the top (q = 1). q is the boundary's position, 0 = bottom, 1 = top.
     - reveal (a smile edge, the grey section lifting off the photo): depth = K * (1 - q), deepest as the boundary enters, flat as it leaves.
     - K is a per-transition setting in the reference (0.195 / 0.423 W for the two covers, 0.156 / 0.085 W for the two reveals).
   Here K is fixed so the moving depth meets the designed one at the end of the travel where the section settles:
     dome   (Locations curve, footer):        depth = D * p      p = 0 when the edge enters at the bottom, 1 when it has settled
     smile  (hero, Standorte top, team photo): depth = D * (1 - p) p = 0 when the edge enters, 1 when it reaches the top
   The hero is a smile: the client wants it curved when the page loads, flattening as it scrolls out (its trigger starts at scrollY 0 when the
   hero is shorter than the viewport, so the first frame is the full depth either way).
   D is the designed (Figma) depth, so s = depth / D is the factor applied to the ellipse. For the footer dome, p runs from its centre
   line (the bottom edge of .footer-top) entering at the bottom to the end of the document, because the page ends before that line
   can reach the top.

   The depth follows the scroll position exactly, moving or not: there is no resting state, a stopped page shows the depth its
   position maps to.

   Every ellipse is scaled about the section edge it hangs from or rises off (transform-origin in site.css), never about its own centre line:
   scaling a full ellipse about a centre line that is not the edge pulls its sides in and leaves the section background showing as a wedge in the corners.
   Mechanism: one ScrollTrigger per curve (progress only, no pinning); its onUpdate draws. Rendering is a CSS variable (the ellipse
   pseudo-elements: scaleY; the team photo: the --arc-s in its mask, see site.css) and the ry attribute (the inlined curve SVG).
   The footer logo rides the white: it follows the dome's top edge down while the dome is shallow, so no pixel of it lies over the photo
   (translate and scale only, from geometry measured on refresh). No layout reads in any callback. Under prefers-reduced-motion, or without GSAP,
   nothing here runs and the static curves stay. */
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

  // The footer logo rides inside the white dome. Geometry in px from the top of .footer-top, measured on refresh:
  //   E the photo's bottom edge = the base of the dome (a half-ellipse, scaled about E), D its designed height, rx its half width;
  //   yb(s) the dome's top edge at the logo's side edges (the lowest point of the logo's top side) at depth factor s.
  // The logo's top follows yb(s) down to E (below E there is no photo), and it is scaled to stop short of the button when that pushes its bottom into it.
  function footerLogo(ft, logo, cta) {
    var g = null, last = '';
    var m = window.matchMedia('(min-width: 768px)');
    function measure() {
      g = null;
      if (!m.matches) return;                              // below 768px the footer does not overlap the photo and has no dome
      var cs = getComputedStyle(ft, '::before');
      var D = parseFloat(cs.height), rx = parseFloat(cs.width) / 2, hw = logo.offsetWidth / 2;
      if (!(D > 0) || !(rx > 0)) return;
      g = {
        E: parseFloat(cs.top) + D, D: D, T0: logo.offsetTop, H: logo.offsetHeight,
        f: Math.sqrt(Math.max(0, 1 - (hw / rx) * (hw / rx))),   // the dome's height at the logo's side edges, as a fraction of its apex
        gapTop: cta.getBoundingClientRect().top - ft.getBoundingClientRect().top - 16
      };
    }
    return {
      measure: measure,
      draw: function (s) {
        var v = '';
        if (g) {
          var yb = g.E - s * g.D * g.f;                    // the dome's top edge at the logo's sides
          var top = Math.min(g.E + 1, Math.max(g.T0, yb + 4));   // 4px clear of the edge: a flat dome is resampled by the compositor and its edge is soft
          var k = Math.max(0.2, Math.min(1, (g.gapTop - top) / g.H));
          if (top - g.T0 > 0.05 || k < 0.9995) v = 'translateY(' + (top - g.T0).toFixed(2) + 'px) scale(' + k.toFixed(4) + ')';
        }
        if (v !== last) { logo.style.transform = v; last = v; }
      },
      clear: function () { logo.style.transform = ''; last = ''; g = null; }
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
    var fin = document.querySelector('.news .stack > .finale');           // the team photo: the news section's white ellipse hangs over its top edge
    if (!hero && !about && !curve && !footTop && !fin) return;
    gsap.registerPlugin(ST);

    var mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', function () {
      var curves = [], triggers = [];

      // the edge under the hero: its bottom edge is the dome's centre line. Curved at load: clamp() keeps the start at scrollY 0 on a viewport taller than the hero
      if (hero) curves.push(varCurve('hero', hero, hero, 'smile', 'clamp(bottom bottom)', 'bottom top'));
      if (about) curves.push(varCurve('about', about, about, 'smile', 'top bottom', 'top top'));   // the Standorte top
      if (curve) curves.push(svgCurve(curve, 'dome'));
      // the team photo's top edge. It is position: sticky, whose rect moves while stuck, so its range comes from the layout (as js/stack.js does):
      // from entering at the bottom of the viewport to reaching its stuck line, where it settles
      if (fin && fin.parentElement) {
        var stack = fin.parentElement;
        var flowTop = function () {                        // document y of the photo's top when it is not stuck
          var y = stack.getBoundingClientRect().top + window.pageYOffset;
          for (var i = 0; i < stack.children.length; i++) {
            var el = stack.children[i];
            y += parseFloat(getComputedStyle(el).marginTop) || 0;
            if (el === fin) break;
            y += el.offsetHeight;
          }
          return y;
        };
        var stuck = function () { var cs = getComputedStyle(fin); return cs.position === 'sticky' ? parseFloat(cs.top) || 0 : 0; };
        curves.push(varCurve('finale', fin, stack, 'smile', function () { return flowTop() - window.innerHeight; }, function () { return flowTop() - stuck(); }));
      }
      // the white dome above the footer: its centre line is the bottom edge of .footer-top; the page ends before it reaches the top
      if (footTop) {
        var fc = varCurve('footer', footTop, footTop, 'dome', 'bottom bottom', 'max');
        var logo = document.querySelector('.footer-logo'), cta = document.querySelector('.footer-cta');
        if (logo && cta) {
          var ride = footerLogo(footTop, logo, cta), draw = fc.draw, clear = fc.clear;
          fc.draw = function (s) { draw(s); ride.draw(s); };
          fc.clear = function () { clear(); ride.clear(); };
          fc.measure = ride.measure;
        }
        curves.push(fc);
      }

      curves.forEach(function (c) {
        c.p = 0; c.last = null;
        function update(self) {
          c.p = self.progress;
          var s = target(c, c.p);
          if (c.last !== null && Math.abs(s - c.last) < EPS) return;
          c.draw(s); c.last = s;
        }
        function refresh(self) {                           // layout may have changed: re-measure, then draw whatever the progress now says
          if (c.measure) { c.measure(); c.last = null; }
          update(self);
        }
        triggers.push(ST.create({
          id: 'arc-' + c.name, trigger: c.trigger, start: c.start, end: c.end,
          onRefresh: refresh, onUpdate: update
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
