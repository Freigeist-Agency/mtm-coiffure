/* Curved video-card slider (Social section): .radial-slider > .radial-slider__stage > .radial-slider__card.
   Copied from the client's reference video. The cards sit on a ring seen from inside-front, like the inside of a
   bowl: the centre card is the furthest away and the outer ones swing toward the viewer and turn to face the ring's
   centre. Fitted to the card quads measured in the perspective-corrected video (RMS about 5 units), in units of
   the stage width / 1000 (so 1 unit = 0.1cqw):
     centre card 105 wide (9:16); ring radius R = 280; 27 deg between neighbouring cards; eye distance 725
     card u steps from the centre: theta = 27 u,  x = R sin(theta),  z = R (1 - cos(theta)) toward the eye,
     rotateY(-theta). Past 90 deg a card faces away and its back face is hidden.
   Behaviour: no auto-play. Arrow buttons / ArrowLeft / ArrowRight move one card, restarting a 0.75s power3.out
   tween from the current spot each time (clicks every 0.6s pile up, as in the video). Pointer drag follows the
   pointer 1:1, and on release flings and snaps to a card. Infinite: a ring of M cards, M a multiple of the item
   count, laid out by wrapped offset, so the card that leaves one side re-enters the other where it is edge-on.
   render() writes transforms only and never reads layout (the stage width is cached by a ResizeObserver).
   Without JS the cards stay a plain scroll-snap row. */
(function () {
  'use strict';
  var RING = 280, STEP_DEG = 27, EYE = 725;             // design units, degrees (EYE is the css perspective, kept here for the record)
  var PITCH = 138;                                      // on-screen distance between neighbouring cards at the centre, for drag
  var OUT = 3.7;                                        // cards further out than this are behind the bowl's edge
  var VISIBLE = 8;                                      // cards the ring must hold (offsets -3.7 .. 3.7, with slack)
  var STEP_S = 0.75;                                    // seconds for one card, power3.out
  var DRAG_PX = 6;                                      // movement before the gesture picks its axis
  var MAX_FLING = 3;                                    // cards a fling may add
  var FLING_S = 0.15;                                   // a release at speed v carries v * FLING_S more cards of travel

  var RAD = Math.PI / 180;
  function mod(a, n) { return ((a % n) + n) % n; }
  function easeOut(t) { var q = 1 - t; return 1 - q * q * q; }

  function init(root) {
    if (root.__radialSlider) return root.__radialSlider;
    var stage = root.querySelector('.radial-slider__stage');
    var originals = Array.prototype.slice.call(root.querySelectorAll('.radial-slider__card'));
    var n = originals.length;
    if (!stage || !n) return null;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ring of M = n * copies cards; clones are decoration (aria-hidden, inert) and are never in the tab order
    var copies = Math.max(1, Math.ceil(VISIBLE / n)), M = n * copies;
    var cards = originals.slice();
    for (var c = 1; c < copies; c++) {
      originals.forEach(function (o) {
        var cl = o.cloneNode(true);
        cl.setAttribute('aria-hidden', 'true'); cl.setAttribute('inert', '');
        cl.setAttribute('data-clone', '');
        stage.appendChild(cl); cards.push(cl);
      });
    }
    root.classList.add('is-enhanced');

    var pos = 0;             // fractional position, in cards; unbounded
    var target = 0;          // integer card the slider is heading for
    var k = 0;               // stage width / 1000
    var tween = null;        // { from, to, t0, dur } while a move is running
    var raf = 0, dragging = null;
    var announced = 0, active = -1;

    function button(dir, label, path) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'radial-slider__btn radial-slider__btn--' + dir; b.setAttribute('aria-label', label);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + path +
        '" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      return b;
    }
    // controls: prev, dots, next; a polite live region says "Beitrag 2 von 6"
    var controls = document.createElement('div');
    controls.className = 'radial-slider__controls';
    var prev = button('prev', 'Vorheriger Beitrag', 'M15 5l-7 7 7 7');
    var next = button('next', 'Nächster Beitrag', 'M9 5l7 7-7 7');
    var dotWrap = document.createElement('div');
    dotWrap.className = 'radial-slider__dots'; dotWrap.setAttribute('aria-hidden', 'true');
    var dots = [];
    for (var d = 0; d < n; d++) { var dot = document.createElement('span'); dot.className = 'radial-slider__dot'; dotWrap.appendChild(dot); dots.push(dot); }
    controls.appendChild(prev); controls.appendChild(dotWrap); controls.appendChild(next);
    root.appendChild(controls);
    var live = document.createElement('div');
    live.className = 'radial-slider__live'; live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
    root.appendChild(live);

    function render() {
      if (!k) return;
      var half = M / 2;
      for (var j = 0; j < M; j++) {
        var u = mod(j - pos + half, M) - half;
        var el = cards[j];
        if (u > OUT || u < -OUT) { if (el.__vis !== 0) { el.style.opacity = '0'; el.__vis = 0; } continue; }
        var th = u * STEP_DEG * RAD;
        el.style.transform = 'translate3d(' + (RING * Math.sin(th) * k).toFixed(2) + 'px,0,' + (RING * (1 - Math.cos(th)) * k).toFixed(2) + 'px) rotateY(' + (-u * STEP_DEG).toFixed(2) + 'deg)';
        if (el.__vis !== 1) { el.style.opacity = ''; el.__vis = 1; }
        if (!el.__placed) { el.__placed = true; el.classList.add('is-placed'); }
      }
      var idx = mod(Math.round(pos), n);
      if (idx !== active) {
        if (active >= 0) dots[active].classList.remove('is-active');
        dots[idx].classList.add('is-active'); active = idx;
      }
    }

    function announce() {
      var i = mod(target, n);
      if (i === announced) return;
      announced = i; live.textContent = 'Beitrag ' + (i + 1) + ' von ' + n;
    }

    function frame(now) {
      raf = 0;
      if (!tween) return;
      if (tween.t0 === null) tween.t0 = now;
      var t = Math.min(1, (now - tween.t0) / (tween.dur * 1000));
      pos = tween.from + (tween.to - tween.from) * easeOut(t);
      render();
      if (t >= 1) { pos = tween.to; tween = null; render(); announce(); return; }
      raf = requestAnimationFrame(frame);
    }
    function stop() { tween = null; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    function moveTo(to, dur) {
      target = to;
      if (reduce) { stop(); pos = to; render(); announce(); return; }
      tween = { from: pos, to: to, t0: null, dur: dur || STEP_S };
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function step(dir) { moveTo(target + dir); }

    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });
    root.addEventListener('keydown', function (e) {
      if (e.target !== root || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });

    // Pointer drag. touch-action: pan-y (css) leaves vertical page scroll to the browser, which then sends
    // pointercancel. The axis is decided after DRAG_PX of movement; only a horizontal drag is ours.
    var swallowClick = false, swallowTimer = 0;
    stage.addEventListener('pointerdown', function (e) {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: '', startPos: 0, samples: [{ x: e.clientX, t: e.timeStamp }] };
    });
    stage.addEventListener('pointermove', function (e) {
      var g = dragging;
      if (!g || e.pointerId !== g.id) return;
      var dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.axis) {
        if (Math.abs(dx) < DRAG_PX && Math.abs(dy) < DRAG_PX) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (g.axis === 'x') {
          stop();
          g.startPos = pos; g.x = e.clientX;       // the drag starts where the axis was decided, so the cards do not jump
          dx = 0;
          root.classList.add('is-dragging');
          try { stage.setPointerCapture(e.pointerId); } catch (err) {}
        }
      }
      if (g.axis !== 'x') return;
      g.samples.push({ x: e.clientX, t: e.timeStamp });
      if (g.samples.length > 12) g.samples.shift();
      pos = g.startPos - dx / (PITCH * k);          // 1:1: a card follows the pointer
      render();
    });
    function release(e, cancelled) {
      var g = dragging;
      if (!g || e.pointerId !== g.id) return;
      dragging = null;
      if (g.axis !== 'x') return;
      root.classList.remove('is-dragging');
      swallowClick = true; clearTimeout(swallowTimer);
      swallowTimer = setTimeout(function () { swallowClick = false; }, 400);
      var s = g.samples, last = s[s.length - 1], first = last;
      for (var i = s.length - 1; i >= 0; i--) { if (last.t - s[i].t <= 100) first = s[i]; else break; }
      var v = last.t > first.t ? -(last.x - first.x) / (last.t - first.t) * 1000 / (PITCH * k) : 0;   // cards per second
      if (cancelled || e.timeStamp - last.t > 80) v = 0;   // a hand that stopped before letting go does not fling
      var to = Math.round(pos + Math.max(-MAX_FLING, Math.min(MAX_FLING, v * FLING_S)));
      moveTo(to, Math.min(1.1, STEP_S + 0.08 * Math.abs(to - pos)));
    }
    stage.addEventListener('pointerup', function (e) { release(e, false); });
    stage.addEventListener('pointercancel', function (e) { release(e, true); });
    stage.addEventListener('click', function (e) {
      if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); }
    }, true);
    stage.addEventListener('dragstart', function (e) { e.preventDefault(); });

    // stage width -> px scale for the design units; measured here and on resize, never per frame
    function setK(w) { if (w > 0 && Math.abs(w / 1000 - k) > 1e-6) { k = w / 1000; render(); } }
    setK(stage.clientWidth);
    if (window.ResizeObserver) new ResizeObserver(function (es) { setK(es[0].contentRect.width); }).observe(stage);
    else window.addEventListener('resize', function () { setK(stage.clientWidth); });

    // videos dropped into the slots play only while the slider is on screen, the tab is visible and motion is allowed
    var inView = true;
    function syncVideos() {
      var play = inView && !document.hidden && !reduce;
      var vids = root.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) {
        var v = vids[i];
        if (play) { var pr = v.play && v.play(); if (pr && pr.catch) pr.catch(function () {}); }
        else if (v.pause) v.pause();
      }
    }
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { inView = es[es.length - 1].isIntersecting; syncVideos(); }).observe(root);
    document.addEventListener('visibilitychange', syncVideos);
    syncVideos();

    var api = {
      length: n, ring: M,
      next: function () { step(1); }, prev: function () { step(-1); },
      index: function () { return mod(target, n); },
      pos: function () { return pos; },
      busy: function () { return !!tween || !!dragging; }
    };
    root.__radialSlider = api;
    return api;
  }

  window.initRadialSlider = init;
  function initAll() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-radial-slider]'), function (r) {
      try { init(r); } catch (err) { if (window.console) console.warn('radial slider init failed', err); }
    });
  }
  var ready = window.mtmReady && window.mtmReady.then ? window.mtmReady : Promise.resolve();
  ready.then(function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
    else initAll();
  });
})();
