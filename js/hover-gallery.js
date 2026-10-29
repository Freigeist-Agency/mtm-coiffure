/* Hover accordion gallery: .hover-gallery > button.hover-gallery__card (home page, team photos).
   One card is wide, the rest are narrow; hovering, focusing or clicking a card makes it the wide one and the gallery
   returns to the first card when the pointer leaves. Widths, the photo offset inside each card and its opacity are
   tweened together with the global gsap (loaded in index.html; no second GSAP tag).
   Edge bend: while a card's width changes, its .hover-gallery__visual gets a clip-path whose left and right edges bow
   sideways (sin curve, peak at half the move, exactly 0 again at the end). At rest the clip is a plain rectangle.
   Desktop (> 720px): the widths fill the row, active : inactive = 460 : 178. Phone (<= 720px): a snap scroller with
   66vw / 15vw cards, tap to activate, no hover and no reset.
   Without JS, with a failed GSAP load or with prefers-reduced-motion the layout is set at once; css/hover-gallery.css
   already shows a static row. */
(function () {
  'use strict';
  var DURATION = 0.75, EASE = 'sine.inOut';
  var ACTIVE_RATIO = 460 / 178;       // active card width / inactive card width on desktop
  var INACTIVE_OPACITY = 0.78;
  var PHONE_ACTIVE_VW = 66, PHONE_INACTIVE_VW = 15;
  var CLIP_OVERFLOW = 72;             // the visual is this much wider than the card on each side (css: inset 0 -72px)
  var CURVE_STEPS = 24;               // points down each bent edge
  var MIN_TRANSITION_BEND = 10;       // a card that moves less than this px does not bend
  var BEND_MIN = 22, BEND_MAX = 56, BEND_PER_PX = 0.24;
  var SETTLE = 0.12;                  // the bend is faded to exactly 0 over the last 0.12s of the move

  var phoneMQ = window.matchMedia ? window.matchMedia('(max-width: 720px)') : { matches: false };
  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function listen(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  }

  // clip-path for a visual that is (w + 2 * CLIP_OVERFLOW) wide and h tall. bend > 0 bows both edges outward, < 0 inward.
  function clipPath(w, h, bend) {
    var l = CLIP_OVERFLOW, r = CLIP_OVERFLOW + w, k, t, s;
    if (!bend) return 'path("M' + l + ' 0 L' + r.toFixed(2) + ' 0 L' + r.toFixed(2) + ' ' + h + ' L' + l + ' ' + h + ' Z")';
    var d = 'M' + l.toFixed(2) + ' 0';
    for (k = 0; k <= CURVE_STEPS; k++) {              // right edge, top to bottom
      t = k / CURVE_STEPS; s = bend * Math.sin(Math.PI * t);
      d += ' L' + (r + s).toFixed(2) + ' ' + (h * t).toFixed(2);
    }
    for (k = CURVE_STEPS; k >= 0; k--) {              // left edge, bottom to top
      t = k / CURVE_STEPS; s = bend * Math.sin(Math.PI * t);
      d += ' L' + (l - s).toFixed(2) + ' ' + (h * t).toFixed(2);
    }
    return 'path("' + d + ' Z")';
  }

  function initGallery(root) {
    if (root.__hoverGallery) return root.__hoverGallery;
    var els = Array.prototype.slice.call(root.querySelectorAll('.hover-gallery__card'));
    var n = els.length;
    if (!n) return null;
    var gsap = window.gsap;
    var active = 0, geo = null, cardH = 0, scrollTween = null;
    var cards = els.map(function (el) {
      return { el: el, visual: el.querySelector('.hover-gallery__visual'), img: el.querySelector('img'),
        w: 0, x: 0, o: 1, b: 0, b0: 0, amp: 0, p: 0 };
    });

    // widths of the two card kinds, the photo width (always the active width) and the gap, from the live layout
    function measure() {
      var cs = getComputedStyle(root);
      var gap = parseFloat(cs.columnGap) || 0, padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
      if (phoneMQ.matches) {
        var vw = document.documentElement.clientWidth;
        return { phone: true, gap: gap, pad: padL, active: vw * PHONE_ACTIVE_VW / 100, inactive: vw * PHONE_INACTIVE_VW / 100 };
      }
      var inner = root.clientWidth - padL - padR;
      var inactive = (inner - (n - 1) * gap) / ((n - 1) + ACTIVE_RATIO);
      return { phone: false, gap: gap, pad: padL, active: inactive * ACTIVE_RATIO, inactive: inactive };
    }

    function target(i, isActive) {
      return isActive
        ? { w: geo.active, x: 0, o: 1 }
        : { w: geo.inactive, x: (geo.inactive - geo.active) / 2, o: INACTIVE_OPACITY };
    }

    function render(c) {
      c.el.style.width = c.w.toFixed(2) + 'px';
      c.img.style.transform = 'translate3d(' + c.x.toFixed(2) + 'px,0,0)';
      c.img.style.opacity = c.o.toFixed(3);
      c.visual.style.clipPath = clipPath(c.w, cardH, c.b);
    }

    function setBend(c) {
      var secs = c.p * DURATION;
      var fade = secs > DURATION - SETTLE ? Math.max(0, (DURATION - secs) / SETTLE) : 1;
      // c.b0 is the bend a move was interrupted at; it fades out linearly so a retarget does not jump
      c.b = (c.b0 * (1 - c.p) + c.amp * Math.sin(Math.PI * c.p)) * fade;
    }

    function killAll() {
      cards.forEach(function (c) { if (gsap) gsap.killTweensOf(c); c.p = 0; c.b = 0; c.b0 = 0; c.amp = 0; });
      if (scrollTween) { scrollTween.kill(); scrollTween = null; root.style.scrollSnapType = ''; }
    }

    // scrollLeft that puts the active card at the start of the scroller (phone only; the content width is constant)
    function scrollTarget() {
      var left = geo.pad + active * (geo.inactive + geo.gap);
      var max = geo.pad * 2 + geo.active + (n - 1) * geo.inactive + (n - 1) * geo.gap - root.clientWidth;
      return Math.max(0, Math.min(left - geo.pad, max));
    }

    // Lay every card out for the current active index. animate=false: at once, no bend.
    function layout(animate) {
      geo = measure();
      cardH = cards[0].el.offsetHeight;
      var go = animate && gsap && !reduceMQ.matches;
      if (!go) {
        killAll();
        cards.forEach(function (c, i) {
          var t = target(i, i === active);
          c.w = t.w; c.x = t.x; c.o = t.o;
          c.img.style.width = geo.active.toFixed(2) + 'px';
          c.el.style.flex = '0 0 auto';
          render(c);
        });
        if (geo.phone) root.scrollLeft = scrollTarget();
        return;
      }
      cards.forEach(function (c, i) {
        var t = target(i, i === active);
        var move = t.w - c.w;
        c.img.style.width = geo.active.toFixed(2) + 'px';
        gsap.killTweensOf(c);
        c.b0 = c.b; c.p = 0;
        c.amp = Math.abs(move) < MIN_TRANSITION_BEND ? 0
          : (move > 0 ? 1 : -1) * Math.min(BEND_MAX, Math.max(BEND_MIN, Math.abs(move) * BEND_PER_PX));
        // progress drives the bend; created first so the layout tween below paints the fresh value
        gsap.to(c, { p: 1, duration: DURATION, ease: 'none', onUpdate: function () { setBend(c); render(c); },
          onComplete: function () { c.p = 0; c.b = c.b0 = c.amp = 0; render(c); } });
        gsap.to(c, { w: t.w, x: t.x, o: t.o, duration: DURATION, ease: EASE, overwrite: 'auto', onUpdate: function () { render(c); } });
      });
      if (geo.phone) {
        if (scrollTween) scrollTween.kill();
        var s = { v: root.scrollLeft };
        root.style.scrollSnapType = 'none';          // snapping would fight the tween
        scrollTween = gsap.to(s, { v: scrollTarget(), duration: DURATION, ease: EASE,
          onUpdate: function () { root.scrollLeft = s.v; },
          onComplete: function () { scrollTween = null; root.style.scrollSnapType = ''; } });
      }
    }

    function syncAria() {
      cards.forEach(function (c, i) { c.el.setAttribute('aria-pressed', i === active ? 'true' : 'false'); });
    }

    function activate(i) {
      if (i === active) return;
      active = i;
      syncAria();
      layout(true);
    }

    cards.forEach(function (c, i) {
      c.el.addEventListener('mouseenter', function () { if (!phoneMQ.matches) activate(i); });
      c.el.addEventListener('focus', function () { activate(i); });
      c.el.addEventListener('click', function () { activate(i); });
    });
    // back to the first card when a mouse or pen leaves; a finger lifting is not a leave, and the phone scroller keeps its card
    root.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'touch' || phoneMQ.matches) return;
      activate(0);
    });
    // a finger on the scroller takes over from a running scroll tween
    root.addEventListener('touchstart', function () {
      if (scrollTween) { scrollTween.kill(); scrollTween = null; root.style.scrollSnapType = ''; }
    }, { passive: true });

    function relayout() { layout(false); }
    relayout();
    root.classList.add('is-enhanced');
    listen(phoneMQ, relayout);
    var lastW = root.clientWidth, lastH = root.clientHeight;
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        if (root.clientWidth !== lastW || root.clientHeight !== lastH) { lastW = root.clientWidth; lastH = root.clientHeight; relayout(); }
      }).observe(root);
    } else {
      window.addEventListener('resize', relayout);
    }

    var api = {
      length: n,
      index: function () { return active; },
      goTo: function (i) { if (i >= 0 && i < n) activate(i); }
    };
    root.__hoverGallery = api;
    return api;
  }

  window.initHoverGallery = initGallery;

  function initAll() {
    Array.prototype.forEach.call(document.querySelectorAll('.hover-gallery'), function (r) {
      try { initGallery(r); } catch (err) { if (window.console) console.warn('hover gallery init failed', err); }
    });
  }
  var ready = window.mtmReady && window.mtmReady.then ? window.mtmReady : Promise.resolve();
  ready.then(function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
    else initAll();
  });
})();
