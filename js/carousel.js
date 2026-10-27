/* Infinite click carousels: .carousel[data-carousel] > .carousel__item (home page).
   Moves only on a click on a card or ArrowLeft/ArrowRight; never on a timer.
   Every card is laid out by its offset from the current position:
     t = clamp(u / mid, -1, 1)   skewY = 8 * t deg,   scaleX = 1 + 0.25 * t^2
   so the centre card is flat and the cards widen and lean toward the outer edges. The x position is the
   integral of that scale, so widened neighbours keep their gap instead of overlapping.
   Wrapping is done with clones (aria-hidden + inert) appended after the originals. Without JS, with
   prefers-reduced-motion, or when GSAP did not load, nothing here runs and the scroll-snap row stays. */
(function () {
  'use strict';
  var SKEW = 8, WIDEN = 0.25, DURATION = 0.6, EASE = 'sine.inOut';

  function mod(a, n) { return ((a % n) + n) % n; }

  // x of a card whose unwarped offset from the centre is u, for a half-width of mid
  function warp(u, mid) {
    var a = Math.abs(u), side = u < 0 ? -1 : 1;
    if (a <= mid) return u + (u * u * u) / (12 * mid * mid);
    return side * (mid * 13 / 12 + (1 + WIDEN) * (a - mid));
  }

  function initCarousel(root) {
    if (root.__carousel) return root.__carousel;
    var gsap = window.gsap;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !gsap) return null;
    var originals = Array.prototype.slice.call(root.querySelectorAll('.carousel__item'));
    var n = originals.length;
    if (!n) return null;

    root.classList.add('is-enhanced');
    root.setAttribute('tabindex', '0');
    root.scrollLeft = 0;
    originals.forEach(function (el, i) { el.setAttribute('data-carousel-index', String(i)); });

    ['left', 'right'].forEach(function (side) {
      var g = document.createElement('div');
      g.className = 'carousel__glass carousel__glass--' + side;
      g.setAttribute('aria-hidden', 'true');
      root.insertBefore(g, root.firstChild);
    });

    var state = { pos: 0 };   // fractional position, in cards; unbounded
    var target = 0;           // integer slot the carousel is heading for
    var items = originals.slice(), M = n;
    var rootW = 0, itemW = 0, pitch = 0, lastW = -1;

    function clearClones() {
      items.forEach(function (el) { if (el.hasAttribute('data-clone') && el.parentNode) el.parentNode.removeChild(el); });
      items = originals.slice(); M = n;
    }

    function measureAndClone() {
      clearClones();
      rootW = root.clientWidth;
      itemW = originals[0].offsetWidth;
      var gap = parseFloat(getComputedStyle(root).columnGap) || 0;
      pitch = n > 1 ? originals[1].offsetLeft - originals[0].offsetLeft : itemW + gap;
      if (pitch <= 0) pitch = itemW + gap || 1;
      // period must cover the root plus a widened card on each side, with a card of slack
      var need = Math.ceil((rootW + (1 + WIDEN) * itemW) / pitch) + 2;
      var copies = Math.max(1, Math.ceil(need / n));
      for (var c = 1; c < copies; c++) {
        originals.forEach(function (o) {
          var k = o.cloneNode(true);
          k.setAttribute('data-clone', '');
          k.setAttribute('aria-hidden', 'true');
          k.setAttribute('inert', '');
          Array.prototype.forEach.call(k.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
          Array.prototype.forEach.call(k.querySelectorAll('img'), function (i) { i.setAttribute('loading', 'eager'); });
          root.appendChild(k);
          items.push(k);
        });
      }
      M = items.length;
    }

    function render() {
      var mid = rootW / 2, half = M / 2;
      for (var j = 0; j < M; j++) {
        var el = items[j];
        var d = mod(j - state.pos + half, M) - half;
        var u = d * pitch;
        var t = Math.max(-1, Math.min(1, u / mid));
        var x = warp(u, mid);
        var tx = mid - itemW / 2 - el.offsetLeft + x;
        el.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,0,0) skewY(' + (SKEW * t).toFixed(3) + 'deg) scaleX(' + (1 + WIDEN * t * t).toFixed(4) + ')';
      }
    }

    function moveTo(t) {
      if (t === target && state.pos === t) return;
      target = t;
      gsap.to(state, { pos: t, duration: DURATION, ease: EASE, overwrite: true, onUpdate: render, onComplete: render });
    }

    function relayout() {
      gsap.killTweensOf(state);
      state.pos = target;
      measureAndClone();
      render();
    }

    // Clones are inert (so Tab and screen readers skip them), and an inert node is not hit-testable: a click on
    // one lands on the root. Find the card under the pointer from the boxes instead; for a skewed card the
    // box is exact at its mid-height, which is where the cards are.
    function cardAt(e) {
      var el = e.target.closest ? e.target.closest('.carousel__item') : null;
      if (el && root.contains(el)) return el;
      if (e.target !== root) return null;
      for (var j = 0; j < M; j++) {
        var r = items[j].getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return items[j];
      }
      return null;
    }
    root.addEventListener('click', function (e) {
      var el = cardAt(e);
      if (!el) return;
      var j = items.indexOf(el);
      if (j < 0) return;
      var d = mod(j - target + M / 2, M) - M / 2;   // clones map to the nearest copy, so the logical index is right
      if (d) moveTo(target + d);
    });

    root.addEventListener('keydown', function (e) {
      if (e.target !== root || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); moveTo(target + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveTo(target - 1); }
    });

    var api = {
      length: n,
      next: function () { moveTo(target + 1); },
      prev: function () { moveTo(target - 1); },
      goTo: function (i) {
        var d = mod(Math.round(i) - target, n);
        if (d > n / 2) d -= n;
        if (d) moveTo(target + d);
      },
      index: function () { return mod(target, n); }
    };
    root.__carousel = api;

    relayout();
    lastW = root.clientWidth;
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var w = root.clientWidth;
        if (w !== lastW) { lastW = w; relayout(); }
      }).observe(root);
    } else {
      window.addEventListener('resize', function () { relayout(); });
    }
    return api;
  }

  window.initCarousel = initCarousel;

  function initAll() {
    Array.prototype.forEach.call(document.querySelectorAll('.carousel[data-carousel]'), function (r) {
      try { initCarousel(r); } catch (err) { if (window.console) console.warn('carousel init failed', err); }
    });
  }
  var ready = window.mtmReady && window.mtmReady.then ? window.mtmReady : Promise.resolve();
  ready.then(function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
    else initAll();
  });
})();
