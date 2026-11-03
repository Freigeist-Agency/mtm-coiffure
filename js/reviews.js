/* Review rotator: .reviews__list holds one figure.reviews__quote per Google review, all stacked in one grid cell
   (so the box height is the tallest review's and never changes). The first review shows without JS; this script
   hides the rest and swaps them in random order. Delete a figure in index.html to drop a review.
   Uses the global gsap (loaded in index.html); no second GSAP tag. Without GSAP the first review just stays. */
(function () {
  'use strict';

  // Motion defaults, not yet approved by the client: change them here only. Times in seconds, offsets in px.
  var OUT_DURATION = 0.3;        // outgoing: opacity 1 -> 0 and y 0 -> OUT_Y
  var OUT_Y = -8;
  var OUT_EASE = 'power2.in';
  var IN_DURATION = 0.45;        // incoming: opacity 0 -> 1 and y IN_Y -> 0, starts when the outgoing one has ended
  var IN_Y = 8;
  var IN_EASE = 'power2.out';
  var HOLD_BASE = 2.5;           // hold per review = HOLD_BASE + HOLD_PER_CHAR * characters, capped at HOLD_MAX
  var HOLD_PER_CHAR = 0.02;
  var HOLD_MAX = 6;

  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function holdFor(item) {
    var chars = item.querySelector('blockquote').textContent.length;   // the review text only
    return Math.min(HOLD_MAX, HOLD_BASE + HOLD_PER_CHAR * chars);
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function init(list) {
    if (list.__reviews) return list.__reviews;
    var gsap = window.gsap;
    var items = Array.prototype.slice.call(list.querySelectorAll('.reviews__quote'));
    if (!gsap || items.length < 2) return null;
    var card = list.closest('.reviews__card') || list;

    var cur = 0;                    // index shown now
    var history = [0];              // every index shown so far, in order (read by tests/reviews.test.mjs)
    var queue = [];                 // indices still to show in this cycle
    var hold = null;                // the running hold (delayedCall); paused/resumed, never rebuilt
    var tl = null;                  // the running swap
    var reasons = { hover: false, focus: false, offscreen: 'IntersectionObserver' in window, hidden: document.hidden };

    items.forEach(function (it, i) {
      if (i) { gsap.set(it, { autoAlpha: 0 }); it.setAttribute('aria-hidden', 'true'); }
    });
    // keyboard users need a way to stop it (focus inside the card pauses); no aria-live, so a swap is never announced
    list.tabIndex = 0;
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Kundenbewertungen');

    function paused() { return reasons.hover || reasons.focus || reasons.offscreen || reasons.hidden; }
    function sync() { if (hold) { if (paused()) hold.pause(); else hold.resume(); } }

    // first cycle starts from the review already on screen; every later cycle is a fresh shuffle that never opens with the one just shown
    function next() {
      if (!queue.length) {
        queue = shuffle(items.map(function (_, i) { return i; }));
        if (queue[queue.length - 1] === cur) { var t = queue[0]; queue[0] = queue[queue.length - 1]; queue[queue.length - 1] = t; }
      }
      return queue.pop();
    }
    queue = shuffle(items.map(function (_, i) { return i; }).filter(function (i) { return i !== cur; }));

    function startHold() {
      hold = gsap.delayedCall(holdFor(items[cur]), advance);
      sync();
    }

    function advance() {
      hold = null;
      var from = items[cur], to = items[next()];
      cur = items.indexOf(to);
      history.push(cur);
      from.setAttribute('aria-hidden', 'true');
      to.removeAttribute('aria-hidden');
      if (reduceMQ.matches) {      // swap instantly, nothing moves
        gsap.set(from, { autoAlpha: 0, clearProps: 'transform' });
        gsap.set(to, { autoAlpha: 1, clearProps: 'transform' });
        startHold();
        return;
      }
      tl = gsap.timeline({ onComplete: startHold });
      tl.to(from, { autoAlpha: 0, y: OUT_Y, duration: OUT_DURATION, ease: OUT_EASE, clearProps: 'transform' })
        .fromTo(to, { autoAlpha: 0, y: IN_Y }, { autoAlpha: 1, y: 0, duration: IN_DURATION, ease: IN_EASE, clearProps: 'transform' });
    }

    // pausing only stops the hold: a swap already under way finishes, so the box is never left half faded
    function set(reason, on) { if (reasons[reason] !== on) { reasons[reason] = on; sync(); } }
    card.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') set('hover', true); });
    card.addEventListener('pointerleave', function () { set('hover', false); });
    card.addEventListener('focusin', function () { set('focus', true); });
    card.addEventListener('focusout', function (e) { if (!card.contains(e.relatedTarget)) set('focus', false); });
    document.addEventListener('visibilitychange', function () { set('hidden', document.hidden); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        set('offscreen', !entries[entries.length - 1].isIntersecting);
      }).observe(card);
    }

    startHold();
    list.__reviews = {
      count: items.length,
      index: function () { return cur; },
      history: function () { return history.slice(); },
      paused: paused,
      reasons: function () { return JSON.parse(JSON.stringify(reasons)); },
    };
    return list.__reviews;
  }

  function boot() {
    var lists = document.querySelectorAll('.reviews__list');
    for (var i = 0; i < lists.length; i++) init(lists[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
