/* Hover accordion gallery: .hover-gallery > button.hover-gallery__card (home page, team photos).
   A line-by-line port of the Figma Make original (references/hover-gallery-make/source/src/App.tsx): same constants,
   same function names (getPanelSizes, setLayout, updateClipPaths, animateTo), same math, same GSAP timeline.
   One card is wide, the rest are narrow; hovering, focusing or clicking a card makes it the wide one and the gallery
   returns to the first card when the pointer leaves.
   Edge bend: what bends are the BOUNDARIES between neighbouring cards, not the cards. Each boundary has one signed
   `bend`; the right edge of card i and the left edge of card i + 1 both read boundariesRef[i].bend, so when the row
   shifts every gap bows the same way. At rest every bend is exactly 0 (straight edges).
   Site-only parts (the Make version has none of them): the aria-pressed sync, the phone snap scroller (<= 720px, 66vw /
   15vw cards, tap scrolls the card to the start), the touch guard on pointerleave, the init-once guard and the
   fallback when GSAP did not load. Each deviation from Make is marked with a `// Make:` or `// site:` comment.
   Uses the global gsap (loaded in index.html); no second GSAP tag. */
(function () {
  'use strict';
  var ACTIVE_RATIO = 460 / 178;
  var MOVE_DURATION = 0.75;
  var CLIP_OVERFLOW = 72;
  var CURVE_STEPS = 24;
  var MIN_TRANSITION_BEND = 10;
  var IMAGE_RADIUS = 5;

  var phoneMQ = window.matchMedia ? window.matchMedia('(max-width: 720px)') : { matches: false };
  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // Make: gsap.set(target, vars). site: without GSAP (failed CDN load) the same three properties are written directly.
  function set(target, vars) {
    if (window.gsap) { window.gsap.set(target, vars); return; }
    if (vars.width !== undefined) target.style.width = vars.width + 'px';
    if (vars.x !== undefined) target.style.transform = 'translate(' + vars.x + 'px, 0px)';
    if (vars.opacity !== undefined) target.style.opacity = vars.opacity;
  }

  function initGallery(gallery) {
    if (gallery.__hoverGallery) return gallery.__hoverGallery;
    // Make: cardRefs and visualRefs come from React refs; here from the DOM, card i <-> photos[i].
    var cardRefs = Array.prototype.slice.call(gallery.querySelectorAll('.hover-gallery__card'));
    var photosLength = cardRefs.length;
    if (!photosLength) return null;
    var visualRefs = cardRefs.map(function (card) { return card.querySelector('.hover-gallery__visual'); });
    var boundariesRef = [];
    for (var b = 0; b < photosLength - 1; b += 1) boundariesRef.push({ bend: 0 });
    var activeRef = 0;
    var timelineRef = null;
    var scrollTween = null; // site: the phone scroller's tween, not part of Make's timeline

    function getPanelSizes() {
      if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) {
        return {
          active: window.innerWidth * 0.66,
          inactive: window.innerWidth * 0.15,
        };
      }

      var style = getComputedStyle(gallery);
      var gap = parseFloat(style.columnGap);
      // Make: gallery.clientWidth has no padding; this gallery has padding-inline (the page gutter), which is not row width.
      var availableWidth = gallery.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - gap * (photosLength - 1);
      var inactive = availableWidth / (photosLength - 1 + ACTIVE_RATIO);

      return { active: inactive * ACTIVE_RATIO, inactive: inactive };
    }

    // site: scrollLeft that puts the active card at the start of the phone scroller (the content width is constant)
    function scrollTarget(activeIndex, sizes) {
      var style = getComputedStyle(gallery);
      var gap = parseFloat(style.columnGap), pad = parseFloat(style.paddingLeft);
      var left = pad + activeIndex * (sizes.inactive + gap);
      var max = pad * 2 + sizes.active + (photosLength - 1) * sizes.inactive + (photosLength - 1) * gap - gallery.clientWidth;
      return Math.max(0, Math.min(left - pad, max));
    }

    function killScrollTween() {
      if (scrollTween) { scrollTween.kill(); scrollTween = null; }
      gallery.style.scrollSnapType = ''; // snapping is switched off while the tween scrolls
    }

    function setLayout(activeIndex) {
      var cards = cardRefs;
      var sizes = getPanelSizes();
      var active = sizes.active;
      var inactive = sizes.inactive;

      cards.forEach(function (card, index) {
        var image = card.querySelector('img');
        var isActive = index === activeIndex;

        set(card, {
          width: isActive ? active : inactive,
        });
        set(image, {
          width: active,
          x: isActive ? 0 : (inactive - active) / 2,
          opacity: isActive ? 1 : 0.78,
        });
        card.style.flex = '0 0 auto'; // Make: .gallery-card has flex: 0 0 auto in CSS; here the no-JS static row uses flex-grow until now
      });

      boundariesRef.forEach(function (boundary) {
        boundary.bend = 0;
      });
      updateClipPaths();
      // site: the phone scroller shows the active card at its start
      if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) gallery.scrollLeft = scrollTarget(activeIndex, sizes);
    }

    function updateClipPaths() {
      cardRefs.forEach(function (card, index) {
        var visual = visualRefs[index];
        if (!card || !visual) return;

        var leftBoundary = index > 0 ? boundariesRef[index - 1].bend : 0;
        var rightBoundary =
          index < photosLength - 1 ? boundariesRef[index].bend : 0;
        var width = card.offsetWidth;
        var height = card.offsetHeight;
        var curveTop = IMAGE_RADIUS;
        var curveHeight = height - IMAGE_RADIUS * 2;
        var curveAt = function (y) {
          return Math.sin(
            Math.PI * Math.max(0, Math.min(1, (y - curveTop) / curveHeight)),
          );
        };
        var leftX = function (y) { return CLIP_OVERFLOW + leftBoundary * curveAt(y); };
        var rightX = function (y) { return CLIP_OVERFLOW + width + rightBoundary * curveAt(y); };
        var path = [
          'M ' + (CLIP_OVERFLOW + IMAGE_RADIUS) + ' 0',
          'L ' + (CLIP_OVERFLOW + width - IMAGE_RADIUS) + ' 0',
          'Q ' + (CLIP_OVERFLOW + width) + ' 0 ' + rightX(curveTop) + ' ' + curveTop,
        ];

        for (var step = 0; step <= CURVE_STEPS; step += 1) {
          var y = curveTop + curveHeight * (step / CURVE_STEPS);
          path.push('L ' + rightX(y) + ' ' + y);
        }

        path.push(
          'Q ' + (CLIP_OVERFLOW + width) + ' ' + height + ' ' + (CLIP_OVERFLOW + width - IMAGE_RADIUS) + ' ' + height,
          'L ' + (CLIP_OVERFLOW + IMAGE_RADIUS) + ' ' + height,
          'Q ' + CLIP_OVERFLOW + ' ' + height + ' ' + leftX(height - IMAGE_RADIUS) + ' ' + (height - IMAGE_RADIUS),
        );

        for (var step2 = CURVE_STEPS; step2 >= 0; step2 -= 1) {
          var y2 = curveTop + curveHeight * (step2 / CURVE_STEPS);
          path.push('L ' + leftX(y2) + ' ' + y2);
        }

        path.push('Q ' + CLIP_OVERFLOW + ' 0 ' + (CLIP_OVERFLOW + IMAGE_RADIUS) + ' 0', 'Z');

        var clipPath = 'path("' + path.join(' ') + '")';
        visual.style.clipPath = clipPath;
        visual.style.webkitClipPath = clipPath;
      });
    }

    function animateTo(nextIndex) {
      if (nextIndex === activeRef) return;

      var cards = cardRefs;
      var sizes = getPanelSizes();
      var active = sizes.active;
      var inactive = sizes.inactive;
      var reduceMotion = reduceMQ.matches;

      activeRef = nextIndex;
      syncAria(); // Make: setActivePhoto(nextIndex), which drives aria-pressed in the JSX
      if (timelineRef) timelineRef.kill();
      killScrollTween();

      // Make: no GSAP fallback. site: without GSAP the final layout is set at once, like reduced motion.
      if (reduceMotion || !window.gsap) {
        setLayout(nextIndex);
        return;
      }
      var gsap = window.gsap;

      var currentWidths = cards.map(function (card) {
        return card.getBoundingClientRect().width;
      });
      var targetWidths = cards.map(function (_, index) {
        return index === nextIndex ? active : inactive;
      });
      var timeline = gsap.timeline({
        onUpdate: updateClipPaths,
        defaults: {
          duration: MOVE_DURATION,
          ease: 'sine.inOut',
          overwrite: 'auto',
        },
      });

      cards.forEach(function (card, index) {
        var image = card.querySelector('img');
        var isActive = index === nextIndex;

        timeline.to(card, { width: isActive ? active : inactive }, 0);
        timeline.to(
          image,
          {
            width: active,
            x: isActive ? 0 : (inactive - active) / 2,
            opacity: isActive ? 1 : 0.78,
          },
          0,
        );
      });

      boundariesRef.forEach(function (boundary, index) {
        var currentPosition = currentWidths
          .slice(0, index + 1)
          .reduce(function (sum, width) { return sum + width; }, 0);
        var targetPosition = targetWidths
          .slice(0, index + 1)
          .reduce(function (sum, width) { return sum + width; }, 0);
        var movement = targetPosition - currentPosition;
        if (Math.abs(movement) < 0.5) {
          timeline.to(boundary, { bend: 0, duration: 0.15 }, 0);
          return;
        }

        var direction =
          Math.abs(boundary.bend) > 0.1
            ? Math.sign(boundary.bend)
            : Math.sign(movement);
        var amplitude = Math.min(56, Math.max(22, Math.abs(movement) * 0.24));
        var restingBend = direction * MIN_TRANSITION_BEND;
        var bend = direction * amplitude;

        boundary.bend =
          Math.abs(boundary.bend) < MIN_TRANSITION_BEND
            ? restingBend
            : boundary.bend;

        timeline.to(
          boundary,
          { bend: bend, duration: MOVE_DURATION / 2, ease: 'sine.inOut' },
          0,
        );
        timeline.to(
          boundary,
          {
            bend: restingBend,
            duration: MOVE_DURATION / 2,
            ease: 'sine.inOut',
          },
          MOVE_DURATION / 2,
        );
        timeline.to(
          boundary,
          { bend: 0, duration: 0.12, ease: 'sine.out' },
          MOVE_DURATION,
        );
      });

      updateClipPaths();
      timelineRef = timeline;

      // site: the phone scroller follows the active card to the start (a separate tween, so Make's timeline is untouched)
      if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) {
        var s = { v: gallery.scrollLeft };
        gallery.style.scrollSnapType = 'none'; // snapping would fight the tween
        scrollTween = gsap.to(s, {
          v: scrollTarget(nextIndex, sizes), duration: MOVE_DURATION, ease: 'sine.inOut',
          onUpdate: function () { gallery.scrollLeft = s.v; },
          onComplete: function () { scrollTween = null; gallery.style.scrollSnapType = ''; },
        });
      }
    }

    // site: Make drives aria-pressed from the React state
    function syncAria() {
      cardRefs.forEach(function (card, index) {
        card.setAttribute('aria-pressed', index === activeRef ? 'true' : 'false');
      });
    }

    cardRefs.forEach(function (card, index) {
      // site: no hover on the phone scroller
      card.addEventListener('mouseenter', function () { if (!phoneMQ.matches) animateTo(index); });
      card.addEventListener('focus', function () { animateTo(index); });
      card.addEventListener('click', function () { animateTo(index); });
    });
    // Make: onMouseLeave={() => animateTo(0)}. site: a finger lifting is not a leave, and the phone scroller keeps its card.
    gallery.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'touch' || phoneMQ.matches) return;
      animateTo(0);
    });
    // site: a finger on the scroller takes over from a running scroll tween
    gallery.addEventListener('touchstart', function () { killScrollTween(); }, { passive: true });

    setLayout(activeRef);
    gallery.classList.add('is-enhanced');

    if (window.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (timelineRef) timelineRef.kill();
        killScrollTween();
        setLayout(activeRef);
      });
      observer.observe(gallery);
    } else {
      window.addEventListener('resize', function () { setLayout(activeRef); }); // site: browsers without ResizeObserver
    }

    var api = {
      length: photosLength,
      index: function () { return activeRef; },
      goTo: function (i) { if (i >= 0 && i < photosLength) animateTo(i); },
    };
    gallery.__hoverGallery = api;
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
