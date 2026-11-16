/* Review card: pinned in the centre of the screen, it grows to fill the screen, then scrolls sideways through a row of reviews, and the
   page moves on (cofounder, 2026-11-13). Figma: the card 68:18 (975x610) grows into 284:240 (1436x859 at 1440), whose row then
   slides one review at a time: 278:143 (the second review centred), 278:157 (the third). Here the row has five reviews, picked at
   random from the page's reviews and shuffled once per page load.
   1. Grow. The card keeps its place in the page (975x610 box). Its .reviews__frame (photo, reviews, button) is made the grown size and
      placed so that, once the card is pinned, it sits centred under the header: 2px in from the sides, 4px below the header and 4px
      above the bottom. A clip-path cuts it back to exactly the card's box, and the scrub opens that clip to the full frame. Nothing is
      stretched: the photo is scaled from "covering the card" to "covering the frame", the review text keeps its 20px size and moves
      20px right as in 284:240, the neighbouring reviews fade in to 50%, and "Termin Buchen" (284:255) fades in over the last 40%.
   2. Row. Four steps, one per review: the row moves left by one pitch (Figma: 547px between reviews at 1440, 452px boxes), the review
      arriving in the centre goes to full opacity and the one leaving to 50% (Figma's 0.5 on every review but the centred one).
   The card pins when its centre is at the centre of the strip below the header; the pin lasts one viewport for the grow and 0.6 of a
   viewport per step, with short holds where a review is centred. Scrolling back reverses everything.
   768px and up with motion allowed (a pin; webflow-motion mobile law); below that, and under reduced motion, the card stays as it was:
   one review at a time, rotated by js/reviews.js. While the row is live, js/reviews.js is held (its 'row' reason) and its list hidden.
   Sizes are measured on refresh only (function values, invalidateOnRefresh); nothing is read while scrolling. */
(function () {
  'use strict';
  var GROW = 1, STEP = 0.5, HOLD = 0.1, END_HOLD = 0.2;   // timeline units: one unit = one viewport of scroll
  var BTN_FROM = 0.6;                                      // the button fades in over the last 40% of the grow
  var ROW = 5;                                             // reviews in the row
  var PITCH = 547 / 420;                                   // Figma: 547px between reviews; a review's text box here is 420 wide (452 less 2 x 16 padding)
  var DIM = 0.5;                                           // Figma: every review but the centred one at 50%
  // 2026-11-13 (cofounder): the grown card fills the whole screen (Figma 284:240 left 2px at the sides) and the reviews sit in its centre
  // (Figma had them 20px right of it). The header turns see-through over it while it covers the header (.is-over-review, css/site.css).
  var COVER_FROM = 0.97;                                   // share of the grow after which the frame counts as covering the header

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    var section = document.querySelector('.reviews'), card = section && section.querySelector('.reviews__card');
    var frame = card && card.querySelector('.reviews__frame');
    if (!gsap || !ST || !frame) return;
    var bg = frame.querySelector('.reviews__bg'), list = frame.querySelector('.reviews__list'), btn = frame.querySelector('.reviews__btn');
    var header = document.querySelector('.site-header');
    var quotes = Array.prototype.slice.call(list.querySelectorAll('.reviews__quote'));
    var picked = shuffle(quotes.slice()).slice(0, Math.min(ROW, quotes.length));   // once per page load: kept across resizes
    gsap.registerPlugin(ST);

    gsap.matchMedia().add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', function () {
      var m = {};
      // the row: copies of the picked reviews, side by side, in a box the size and place of the rotator's list
      var row = document.createElement('div'), track = document.createElement('div');
      row.className = 'reviews__row'; track.className = 'reviews__track';
      row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Kundenbewertungen');
      var items = picked.map(function (q, i) {
        var c = q.cloneNode(true);
        c.removeAttribute('style'); c.removeAttribute('aria-hidden');
        c.style.setProperty('--i', i);
        track.appendChild(c);
        return c;
      });
      row.appendChild(track);
      frame.insertBefore(row, btn);
      list.setAttribute('data-row-live', '');   // js/reviews.js reads this if it starts after us
      if (list.__reviews && list.__reviews.hold) list.__reviews.hold('row', true);

      function measure() {   // before every refresh: the grown frame's size and place relative to the card when pinned, the pitch
        var vw = document.documentElement.clientWidth, vh = window.innerHeight, nav = header ? header.offsetHeight : 50;
        var cw = card.offsetWidth, ch = card.offsetHeight, left = card.getBoundingClientRect().left;
        var W = vw, H = vh;                                    // the whole screen
        var cardTop = vh / 2 - ch / 2;                        // the card's top in the viewport while pinned (centred on the screen)
        m = { cw: cw, ch: ch, W: W, H: H, nav: nav,
              x: -left, y: -cardTop,                           // the frame's offset from the card's top-left: the viewport's top-left
              s: Math.max(cw / W, ch / H), pitch: items[0].offsetWidth * PITCH };
        card.style.setProperty('--rv-w', W + 'px'); card.style.setProperty('--rv-h', H + 'px');
        card.style.setProperty('--rv-x', m.x + 'px'); card.style.setProperty('--rv-y', m.y + 'px');
      }
      function clipStart() {   // the clip that shows exactly the card's box
        var t = -m.y, l = -m.x, r = m.W - (l + m.cw), b = m.H - (t + m.ch);
        return 'inset(' + t + 'px ' + r + 'px ' + b + 'px ' + l + 'px round 20px)';   // 20px corners (cofounder, 2026-11-16; were 5)
      }
      section.classList.add('reviews--live');
      measure();
      ST.addEventListener('refreshInit', measure);

      var steps = items.length - 1;
      var total = GROW + HOLD + steps * (STEP + HOLD) + END_HOLD;
      var tl = gsap.timeline({
        defaults: { ease: 'sine.inOut' },   // sine (cofounder, 2026-11-16: smoother; was power2.inOut)
        scrollTrigger: {
          id: 'review-grow', trigger: card, pin: true, scrub: 0.5,   // clip, scale and slide: lag reads as mass (webflow-motion section 7)
          start: 'center center',
          end: function () { return '+=' + window.innerHeight * total; },
          invalidateOnRefresh: true, refreshPriority: 1   // above the photo pin and the blocks further down: computed first
        }
      });
      // 1. grow
      tl.fromTo(frame, { clipPath: clipStart }, { clipPath: 'inset(0px 0px 0px 0px round 0px)', duration: GROW }, 0)   // square corners at full screen
        .fromTo(bg, { scale: function () { return m.s; } }, { scale: 1, duration: GROW }, 0)
        .fromTo(items.slice(1), { opacity: 0 }, { opacity: DIM, duration: GROW }, 0)   // the neighbours are not in Figma's small card
        .fromTo(btn, { autoAlpha: 0 }, { autoAlpha: 1, duration: GROW * (1 - BTN_FROM), ease: 'sine.out' }, GROW * BTN_FROM);
      // 2. the row, one review per step
      for (var k = 1; k <= steps; k++) {
        var at = GROW + HOLD + (k - 1) * (STEP + HOLD);
        tl.to(track, { x: (function (k) { return function () { return -k * m.pitch; }; })(k), duration: STEP }, at)
          .to(items[k - 1], { opacity: DIM, duration: STEP }, at)
          .to(items[k], { opacity: 1, duration: STEP }, at);
      }
      tl.to({}, { duration: END_HOLD }, total - END_HOLD);   // a short hold on the last review before the page moves on; placed at the end of 'total' (appended, the timeline came out HOLD short of it, so every later step arrived early: 2026-11-16)
      // the header is see-through while the full-screen card covers it: from the grow's end until the card's bottom edge rises past the header
      var main = tl.scrollTrigger;
      var cover = header ? ST.create({
        id: 'review-cover', toggleClass: { targets: header, className: 'is-over-review' },
        start: function () { return main.start + (main.end - main.start) * (GROW * COVER_FROM / total); },
        end: function () { return main.end + window.innerHeight - m.nav; },
        invalidateOnRefresh: true
      }) : null;
      window.reviewGrow = { tl: tl, m: function () { return m; }, items: items, total: total,
        stepAt: function (k) { return k === 0 ? (GROW + HOLD / 2) / total : (GROW + HOLD + (k - 1) * (STEP + HOLD) + STEP + HOLD / 2) / total; } };

      return function () {   // below 768px, or reduced motion switched on: back to the static card and its rotation
        ST.removeEventListener('refreshInit', measure);
        section.classList.remove('reviews--live');
        ['--rv-w', '--rv-h', '--rv-x', '--rv-y'].forEach(function (p) { card.style.removeProperty(p); });
        gsap.set([frame, bg, btn], { clearProps: 'all' });
        row.remove();
        if (cover) cover.kill();
        if (header) header.classList.remove('is-over-review');
        list.removeAttribute('data-row-live');
        if (list.__reviews && list.__reviews.hold) list.__reviews.hold('row', false);
        window.reviewGrow = undefined;
      };
    });
  }

  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
