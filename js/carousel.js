/* Infinite click carousels: .carousel[data-carousel] > .carousel__item (home page).
   Moves only on a click on a card, ArrowLeft/ArrowRight or a touch swipe; never on a timer.
   Every card is laid out by its offset from the current position:
     t = clamp(u / mid, -1, 1)   skewY = 8 * t deg,   scaleX = 1 + 0.25 * t^2
   so the centre card is flat and the cards widen and lean toward the outer edges. The x position is the
   integral of that scale, so widened neighbours keep their gap instead of overlapping.
   Wrapping is done with clones (aria-hidden + inert) appended after the originals. Without JS, with
   prefers-reduced-motion, or when GSAP did not load, none of that runs and the scroll-snap row stays.
   Previous / next arrows are added in every one of those cases (but never without JS): they call api.prev / api.next, or
   scroll the plain snap row by one item. They sit in a wrapper next to the row, not inside it, so they neither scroll
   with the row nor take part in its swipe and click handling. */
(function () {
  'use strict';
  var SKEW = 8, WIDEN = 0.25, DURATION = 0.6, EASE = 'sine.inOut';
  var SWIPE_VW = 0.06;        // a horizontal drag past 6vw moves one card
  var FLICK_MIN_VW = 0.025;   // ...or a drag past 2.5vw at more than FLICK_SPEED px/ms
  var FLICK_SPEED = 0.35;
  var LABELS = { team: 'Bild', social: 'Beitrag' };   // spoken in the live region: "Bild 2 von 8"

  var ARROW_LABELS = { team: ['Vorheriges Bild', 'Nächstes Bild'], social: ['Vorheriger Beitrag', 'Nächster Beitrag'] };
  var CHEVRON = { prev: 'M15 5l-7 7 7 7', next: 'M9 5l7 7-7 7' };

  function mod(a, n) { return ((a % n) + n) % n; }

  function arrowButton(dir, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'carousel__arrow carousel__arrow--' + dir;
    b.setAttribute('aria-label', label);
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + CHEVRON[dir] +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return b;
  }

  // The plain scroll-snap row (reduced motion, or no GSAP): one item per click, wrapping at the ends.
  function scrollStep(root, dir) {
    var it = root.querySelectorAll('.carousel__item');
    var pitch = it.length > 1 ? it[1].offsetLeft - it[0].offsetLeft : root.clientWidth;
    var max = root.scrollWidth - root.clientWidth, x = root.scrollLeft;
    if (dir > 0 && x >= max - 2) root.scrollTo({ left: 0, behavior: 'auto' });
    else if (dir < 0 && x <= 2) root.scrollTo({ left: max, behavior: 'auto' });
    else root.scrollBy({ left: dir * pitch, behavior: 'auto' });
  }

  // Wrap the row, add the two buttons after it (Tab order: carousel, prev, next). Safe to call twice.
  function addArrows(root, enhanced) {
    if (root.__arrows || !root.parentNode) return;
    var kind = root.getAttribute('data-carousel') || 'team';
    var labels = ARROW_LABELS[kind] || ARROW_LABELS.team;
    var wrap = document.createElement('div');
    wrap.className = 'carousel-wrap carousel-wrap--' + kind;
    root.parentNode.insertBefore(wrap, root);
    wrap.appendChild(root);
    var prev = arrowButton('prev', labels[0]), next = arrowButton('next', labels[1]);
    wrap.appendChild(prev);
    wrap.appendChild(next);
    function go(dir) {
      var api = root.__carousel;
      if (api) { if (dir > 0) api.next(); else api.prev(); }
      else scrollStep(root, dir);
    }
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    root.__arrows = { prev: prev, next: next };
    // a plain row that already fits (four social cards at desktop width) has nothing to scroll, so no arrows
    if (!enhanced) {
      var sync = function () { prev.hidden = next.hidden = root.scrollWidth - root.clientWidth <= 2; };
      sync();
      if (window.ResizeObserver) new ResizeObserver(sync).observe(root);
      else window.addEventListener('resize', sync);
    }
  }

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
    var originals = Array.prototype.slice.call(root.querySelectorAll('.carousel__item'));
    var n = originals.length;
    if (!n) return null;
    addArrows(root, !(reduce || !gsap));
    if (reduce || !gsap) return null;

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
    var lefts = [];           // each card's untransformed offsetLeft; changes only on relayout, so render() never reads layout
    var label = LABELS[root.getAttribute('data-carousel')] || 'Element';
    var announced = 0;

    var live = document.createElement('div');
    live.className = 'carousel__live';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    root.insertBefore(live, root.firstChild);

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
      lefts = items.map(function (el) { return el.offsetLeft; });
    }

    // spoken once a move has finished and only when the card actually changed
    function announce() {
      var i = mod(target, n);
      if (i === announced) return;
      announced = i;
      live.textContent = label + ' ' + (i + 1) + ' von ' + n;
    }

    function render() {
      var mid = rootW / 2, half = M / 2;
      for (var j = 0; j < M; j++) {
        var el = items[j];
        var d = mod(j - state.pos + half, M) - half;
        var u = d * pitch;
        var t = Math.max(-1, Math.min(1, u / mid));
        var x = warp(u, mid);
        var tx = mid - itemW / 2 - lefts[j] + x;
        el.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,0,0) skewY(' + (SKEW * t).toFixed(3) + 'deg) scaleX(' + (1 + WIDEN * t * t).toFixed(4) + ')';
      }
    }

    function moveTo(t) {
      if (t === target && state.pos === t) return;
      target = t;
      gsap.to(state, { pos: t, duration: DURATION, ease: EASE, overwrite: true, onUpdate: render, onComplete: function () { render(); announce(); } });
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

    // Touch swipe. touch-action: pan-y (css) leaves vertical page scroll to the browser, which then sends
    // pointercancel; a horizontal drag reaches us, the cards follow the finger, and on release a drag past
    // SWIPE_VW (or a fast flick) moves one card, otherwise it springs back. Mouse input stays click-only.
    var drag = null, swallowClick = false, swallowTimer = 0;
    root.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      swallowClick = false;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, startPos: state.pos, axis: '', dx: 0, samples: [{ x: e.clientX, t: e.timeStamp }] };
    });
    root.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.axis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (drag.axis === 'x') {
          gsap.killTweensOf(state);
          drag.startPos = state.pos;
          try { root.setPointerCapture(e.pointerId); } catch (err) {}
        }
      }
      if (drag.axis !== 'x') return;
      drag.dx = dx;
      drag.samples.push({ x: e.clientX, t: e.timeStamp });
      state.pos = drag.startPos - dx / pitch;
      render();
    });
    function release(e, cancelled) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null;
      if (d.axis !== 'x') return;
      swallowClick = true;                       // the browser may still follow a drag with a click
      clearTimeout(swallowTimer);
      swallowTimer = setTimeout(function () { swallowClick = false; }, 400);
      var vw = window.innerWidth, dir = d.dx < 0 ? 1 : -1;
      var recent = d.samples.filter(function (p) { return e.timeStamp - p.t <= 100; });
      var first = recent[0] || d.samples[0], last = d.samples[d.samples.length - 1];
      var v = last.t > first.t ? Math.abs(last.x - first.x) / (last.t - first.t) : 0;
      var go = !cancelled && (Math.abs(d.dx) >= SWIPE_VW * vw || (Math.abs(d.dx) >= FLICK_MIN_VW * vw && v >= FLICK_SPEED));
      moveTo(go ? target + dir : target);
    }
    root.addEventListener('pointerup', function (e) { release(e, false); });
    root.addEventListener('pointercancel', function (e) { release(e, true); });
    root.addEventListener('click', function (e) {
      if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); }
    }, true);

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
