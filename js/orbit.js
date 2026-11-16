/* Scroll-linked image orbit around the Services CTA (home page).
   The section's pass through the viewport ('top bottom' -> 'bottom top') drives one progress value p in 0..1:
     p 0 -> 0.5   ENTRY: each photo flies in from the side its slot is on (slot x < 50% from the left, > 50% from the right; the
                  centre pair: top from the left, bottom from the right), shrinking from scale 1.6 to 1.0 while it spirals onto
                  its Figma slot. A photo's position is polar around the orbit centre (angle, radius), both eased (sine.inOut) from the
                  off-screen start to the slot, so the path is a spiral. Lower photos start a little later so the ones still
                  below the fold are not wasted.
     From 768px up (2026-11-13, cofounder): the entry runs from the section's top entering to its centre reaching the viewport's centre;
                  there the section is PINNED and the ring makes one full turn (RING_PINNED = 360, sine.inOut) over PIN_VH viewports of scroll,
                  then the page carries on. A full turn ends on the Figma layout again. Phones keep the single pass below.
     p 0.5 -> 1   RING: a rigid turn of the whole ring by RING_DESKTOP degrees, sine.inOut over that span (90 = two 45deg slots, so the end state is a
                  permutation of the Figma layout). On mobile the amplitude is 0: the Figma mobile slots already bleed past the
                  viewport edges, so any turn about the section centre would push some diamond further out.
   The photos are oriented radially around the ring, so a face's net rotation is its Figma tilt plus how far its arm has
   turned (entry sweep + ring turn). Everything is a pure function of p, so scrubbing backwards is exact.

   Mechanism: ONE ScrollTrigger, one callback, gsap.quickSetter (x, y, rotation, scaleX, scaleY) on each <li> (the CSS rotate(--tilt) on
   the <li> is replaced by the inline transform while the controller is alive, and comes back when it is killed).
   Transforms only. Slot centres, radii and the off-screen start points are measured at init and on every ScrollTrigger
   refresh, never in the per-frame callback. Under prefers-reduced-motion, or without GSAP, nothing here runs and the static
   Figma layout stays. */
(function () {
  'use strict';
  var ENTRY_END = 0.5, START_SCALE = 1.6, RING_DESKTOP = 90, RING_MOBILE = 0, STAGGER = 0.14;
  var RING_PINNED = 360, PIN_VH = 1.5;   // 2026-11-13 (cofounder): from 768px up the section pins for one full turn of the ring, 1.5 viewports of scroll
  var RAD = Math.PI / 180;
  function wrap(a) { return ((((a + 180) % 360) + 360) % 360) - 180; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { return 0.5 - Math.cos(Math.PI * t) / 2; }   // sine.inOut, the site-wide ease; used for the entry and the ring turn

  function initOrbit(root, opts) {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    var orbit = root.querySelector('.orbit');
    var ring = (opts && opts.ring != null) ? opts.ring : RING_DESKTOP;
    var lis = Array.prototype.slice.call(orbit.children).filter(function (li) { return getComputedStyle(li).display !== 'none'; });
    var items = lis.map(function (li) {
      return {
        li: li, sx: 0, sy: 0, theta: 0, r: 0, tilt: 0, phi0: 0, r0: 0, delta: 0, start: 0, rNext: 0,
        setX: gsap.quickSetter(li, 'x', 'px'), setY: gsap.quickSetter(li, 'y', 'px'),
        setR: gsap.quickSetter(li, 'rotation', 'deg'),
        setSX: gsap.quickSetter(li, 'scaleX'), setSY: gsap.quickSetter(li, 'scaleY')   /* quickSetter(el, 'scale') silently does nothing in 3.12.5 */
      };
    });
    var last = -1, progress = 0, st = null, dead = false;

    // layout reads: only here (init + ScrollTrigger refresh), never per frame
    function measure() {
      var ob = orbit.getBoundingClientRect();
      var ow = orbit.offsetWidth, oh = orbit.offsetHeight;
      var cxView = ob.left + ow / 2;                       // orbit centre, viewport x (the orbit box is never transformed)
      var vw = document.documentElement.clientWidth;
      items.forEach(function (it) {
        var li = it.li;
        it.sx = li.offsetLeft + li.offsetWidth / 2 - ow / 2;   // slot centre relative to the orbit centre
        it.sy = li.offsetTop + li.offsetHeight / 2 - oh / 2;
        it.theta = Math.atan2(it.sy, it.sx) / RAD;
        it.r = Math.hypot(it.sx, it.sy);
        it.tilt = parseFloat(getComputedStyle(li).getPropertyValue('--tilt')) || 0;
        it.size = li.offsetWidth;
        var left = Math.abs(it.sx) < 1 ? it.sy < 0 : it.sx < 0;
        var ext = START_SCALE * it.size * 0.7072 + 2;          // half the diagonal of the scaled square: beyond this it is fully off-screen
        var x0 = left ? -(cxView + ext) : (vw - cxView + ext);
        it.phi0 = Math.atan2(it.sy, x0) / RAD;
        it.r0 = Math.hypot(x0, it.sy);
        it.delta = wrap(it.theta - it.phi0);                   // shortest sweep
        it.start = STAGGER * clamp01(it.sy / oh + 0.5);
      });
      items.forEach(function (it) {                            // radius of the slot the ring turn ends on
        it.rNext = it.r;
        if (!ring) return;
        var best = 5;
        items.forEach(function (o) {
          var d = Math.abs(wrap(o.theta - (it.theta + ring)));
          if (d < best) { best = d; it.rNext = o.r; }
        });
      });
    }

    // p: the progress the entry and the ring read. Unpinned (phones): one value for the section's pass, entry 0..ENTRY_END, ring after.
    // Pinned: entry and ring each have their own trigger; p is then ENTRY_END * entry + (1 - ENTRY_END) * ring, so the same maths serves both.
    function render(p) {
      if (dead || p === last) return;
      last = p; progress = p;
      var rho = ease(clamp01((p - ENTRY_END) / (1 - ENTRY_END)));   // eased ring progress: drives both the turn and the radius morph
      var turn = ring * rho;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var e = ease(clamp01((p - it.start) / (ENTRY_END - it.start)));
        var arm = it.phi0 + it.delta * e + turn;               // arm angle, degrees
        var rad = it.r0 + (it.r + (it.rNext - it.r) * rho - it.r0) * e;
        it.setX(rad * Math.cos(arm * RAD) - it.sx);
        it.setY(rad * Math.sin(arm * RAD) - it.sy);
        it.setR(it.tilt + (arm - it.theta));                   // radial: Figma tilt + how far the arm has turned
        var sc = START_SCALE + (1 - START_SCALE) * e;
        it.setSX(sc); it.setSY(sc);
      }
    }

    measure();
    var pinSt = null;
    if (opts && opts.pin) {
      // entry: the section's top entering at the bottom -> its centre on the viewport's centre, where it pins
      var pe = 0, pr = 0;
      var both = function () { render(ENTRY_END * pe + (1 - ENTRY_END) * pr); };
      st = ST.create({
        id: 'orbit-entry', trigger: root, start: 'top bottom', end: 'center center',
        onRefreshInit: measure,
        onRefresh: function (self) { pe = self.progress; last = -1; both(); },
        onUpdate: function (self) { pe = self.progress; both(); }
      });
      // the ring: pinned with its centre on the viewport's centre for one full turn, then the page carries on
      pinSt = ST.create({
        id: 'orbit-pin', trigger: root, pin: true, start: 'center center',
        end: function () { return '+=' + window.innerHeight * PIN_VH; },
        invalidateOnRefresh: true, refreshPriority: 1.5,   // below the About pin, above the review pin
        onRefresh: function (self) { pr = self.progress; last = -1; both(); },
        onUpdate: function (self) { pr = self.progress; both(); }
      });
      both();
    } else {
      st = ST.create({
        trigger: root, start: 'top bottom', end: 'bottom top',
        onRefreshInit: measure,
        onRefresh: function (self) { last = -1; render(self.progress); },
        onUpdate: function (self) { render(self.progress); }
      });
      render(st.progress);
    }

    var api = {
      progress: function () { return progress; },
      kill: function () {
        if (dead) return;
        dead = true;
        if (st) st.kill();
        if (pinSt) pinSt.kill();
        items.forEach(function (it) { gsap.set(it.li, { clearProps: 'transform' }); });
        if (root.__orbit === api) delete root.__orbit;
      }
    };
    root.__orbit = api;
    return api;
  }

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    var root = document.querySelector('.services');
    if (!gsap || !ST || !root || !root.querySelector('.orbit')) return;
    gsap.registerPlugin(ST);
    var mm = gsap.matchMedia();
    mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', function () {
      var o = initOrbit(root, { ring: RING_PINNED, pin: true });
      return function () { o.kill(); };
    });
    mm.add('(max-width: 767px) and (prefers-reduced-motion: no-preference)', function () {
      var o = initOrbit(root, { ring: RING_MOBILE });
      return function () { o.kill(); };
    });
  }

  window.initOrbit = initOrbit;
  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
