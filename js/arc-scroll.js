/* Scroll-driven depth of the three curved section edges on the home page: the white ellipse over the top of About, the curve
   under Locations (before Social), and the black dome of the footer.
   Reference: "Arc Scroll Transition" (Freigeist/references/hover-gallery-make/ScrollAnim.mp4, 1440x900 at 30fps), measured frame by
   frame (every edge sampled across the width, parabola fitted, sagitta = apex minus corners). Findings the mapping is built on:
     - the edge is a parabola; its depth (sagitta) is LINEAR in the position of the section boundary (the corner line), with no extra easing.
     - cover (a dome edge, the grey section rising over the photo): depth = K * q, flat while the boundary enters at the bottom of the
       viewport (q = 0), deepest as it reaches the top (q = 1). q is the boundary's position, 0 = bottom, 1 = top.
     - reveal (a smile edge, the grey section lifting off the photo): depth = K * (1 - q), deepest as the boundary enters, flat as it leaves.
     - K is a per-transition setting in the reference (0.195 / 0.423 W for the two covers, 0.156 / 0.085 W for the two reveals).
   Here K is fixed so the moving depth meets the designed one at the end of the travel where the section settles:
     dome   (Locations curve, footer):  depth = D * p          p = 0 when the edge enters at the bottom, 1 when it has settled
     smile  (About top):                depth = D * (1 - p)    p = 0 when the edge enters, 1 when it reaches the top
   D is the designed (Figma) depth, so s = depth / D is the factor applied to the ellipse. For the footer, p runs from the dome's
   centre line entering at the bottom to the end of the document, because the page ends before that line can reach the top.

   Resting: whenever scrolling has stopped the factor is exactly 1 (the designed shape), wherever the edge is in the viewport.
   A gate g in 0..1 rises to 1 within ~90ms of scrolling and falls back to 0 over ~500ms after it stops; the shown factor is
   s = 1 + g * (mapping(p) - 1). So a visitor sees the reference's shape while moving and the Figma shape when stopped.

   Mechanism: three ScrollTriggers (progress only, no pinning), one passive scroll listener (stamps the time) and one gsap.ticker
   callback that runs only while the gate is open or closing. Rendering is a CSS variable (About, footer: scaleY of the ellipse
   pseudo-element about its own centre line, so the section edge stays put and only the apex moves) and the ry attribute (the
   inlined curve SVG). No layout reads in any callback; the footer's centre-line offset is read inside ScrollTrigger's own refresh.
   Under prefers-reduced-motion, or without GSAP, nothing here runs and the static curves stay. */
(function () {
  'use strict';
  var MIN_S = 0.04;          // never a razor-flat edge: below ~0.016 the footer dome would leave a hairline gap above its black rect
  var HOLD = 140;            // ms after the last scroll event during which the gate stays open
  var RISE = 90, FALL = 500; // ms for the gate to open / close
  var EPS = 0.0005;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // A curve: where its progress comes from, how progress maps to the depth factor, how a factor is drawn.
  function varCurve(name, el, trigger, kind, start, end) {   // About / footer: the ellipse is a ::before, depth = a CSS variable
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
      draw: function (s) { dome.setAttribute('ry', (base * s).toFixed(2)); },
      clear: function () { dome.setAttribute('ry', ry0); }
    };
  }

  // depth factor the reference's mapping gives at progress p
  function target(c, p) {
    var m = c.kind === 'smile' ? 1 - p : p;
    return m < MIN_S ? MIN_S : m;
  }

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap || !ST) return;
    var about = document.querySelector('.about');
    var curve = document.querySelector('svg.curve');
    var footer = document.querySelector('.footer-body');
    if (!about && !curve && !footer) return;
    gsap.registerPlugin(ST);

    var mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', function () {
      var curves = [], triggers = [], g = 0, lastScroll = -1e9, ticking = false, held = false;

      if (about) curves.push(varCurve('about', about, about, 'smile', 'top bottom', 'top top'));
      if (curve) curves.push(svgCurve(curve, 'dome'));
      if (footer) {
        // the dome's centre line (where its corners sit) is the footer's moving edge: read once per refresh, not per frame
        curves.push(varCurve('footer', footer, footer, 'dome', function () {
          var cs = getComputedStyle(footer, '::before');
          return 'top+=' + (parseFloat(cs.top) + parseFloat(cs.height) / 2) + ' bottom';
        }, 'max'));
      }

      curves.forEach(function (c) {
        c.p = 0; c.last = 1; c.live = false;
        triggers.push(ST.create({
          id: 'arc-' + c.name, trigger: c.trigger, start: c.start, end: c.end,
          onRefresh: function (self) { c.p = self.progress; },
          onUpdate: function (self) { c.p = self.progress; }
        }));
      });

      function render() {
        var e = g * g * (3 - 2 * g);                         // smoothstep, so the depth eases in and out of the move
        for (var i = 0; i < curves.length; i++) {
          var c = curves[i];
          if (e === 0) { if (c.live) { c.clear(); c.live = false; c.last = 1; } continue; }
          var s = 1 + e * (target(c, c.p) - 1);
          if (c.live && Math.abs(s - c.last) < EPS) continue;
          c.draw(s); c.last = s; c.live = true;
        }
      }

      function tick(time, dt) {
        var open = held || (performance.now() - lastScroll) < HOLD;
        if (open) g = Math.min(1, g + dt / RISE);
        else g = Math.max(0, g - dt / FALL);
        render();
        if (!open && g === 0) { gsap.ticker.remove(tick); ticking = false; }
      }
      function wake() {
        lastScroll = performance.now();
        if (!ticking) { ticking = true; gsap.ticker.add(tick); }
      }
      window.addEventListener('scroll', wake, { passive: true });

      var api = {
        // capture/test hook: keep the gate open (or release it) without scrolling
        hold: function (on) { held = !!on; if (on) wake(); },
        factor: function (i) { return curves[i] ? curves[i].last : null; },
        progress: function (i) { return curves[i] ? curves[i].p : null; }
      };
      window.arcScroll = api;

      return function () {
        window.removeEventListener('scroll', wake);
        gsap.ticker.remove(tick);
        triggers.forEach(function (t) { t.kill(); });
        curves.forEach(function (c) { c.clear(); });
        if (window.arcScroll === api) delete window.arcScroll;
      };
    });
  }

  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
