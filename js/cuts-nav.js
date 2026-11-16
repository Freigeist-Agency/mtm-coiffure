/* The services photos' nav on phones and tablets (cofounder, 2026-11-16): the same controls as the social slider (js/radial-slider.js,
   the same classes, so the same look): a round "previous" button, six dots, a round "next" button, under the swipeable row of
   photos (.cuts below 1024px). A button moves the row one photo (smoothly, at once under reduced motion); the dark dot is the photo
   at the row's start (the last one once the row is scrolled to its end). Above 1023px the photos are a still staircase and the nav
   is hidden (css/v2.css). The row's pitch is measured on load and on resize; scrolling only reads scrollLeft. */
(function () {
  'use strict';
  var cuts = document.querySelector('.services .cuts');
  if (!cuts) return;
  var items = Array.prototype.slice.call(cuts.children);
  if (items.length < 2) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function button(dir, label, path) {   // as in js/radial-slider.js
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'radial-slider__btn radial-slider__btn--' + dir; b.setAttribute('aria-label', label);
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + path +
      '" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return b;
  }
  var nav = document.createElement('div');
  nav.className = 'cuts-nav';
  var controls = document.createElement('div');
  controls.className = 'radial-slider__controls';
  var prev = button('prev', 'Vorheriges Foto', 'M15 5l-7 7 7 7'), next = button('next', 'Nächstes Foto', 'M9 5l7 7-7 7');
  var dotWrap = document.createElement('div'), dots = [];
  dotWrap.className = 'radial-slider__dots'; dotWrap.setAttribute('aria-hidden', 'true');
  items.forEach(function () { var d = document.createElement('span'); d.className = 'radial-slider__dot'; dotWrap.appendChild(d); dots.push(d); });
  controls.appendChild(prev); controls.appendChild(dotWrap); controls.appendChild(next);
  nav.appendChild(controls);
  cuts.parentNode.insertBefore(nav, cuts.nextSibling);

  var pitch = 1, max = 0, active = -1;
  function measure() { pitch = (items[1].offsetLeft - items[0].offsetLeft) || 1; max = cuts.scrollWidth - cuts.clientWidth; sync(); }
  function index() { var x = cuts.scrollLeft; return x >= max - 2 ? items.length - 1 : Math.max(0, Math.min(items.length - 1, Math.round(x / pitch))); }
  function sync() {
    var i = index();
    if (i === active) return;
    if (active >= 0) dots[active].classList.remove('is-active');
    dots[i].classList.add('is-active'); active = i;
  }
  var ticking = false;
  cuts.addEventListener('scroll', function () { if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; sync(); }); }, { passive: true });
  function go(dir) {
    measure();   // a click: measuring here is cheap and never stale
    var i = Math.max(0, Math.min(items.length - 1, index() + dir));
    cuts.scrollTo({ left: Math.min(i * pitch, max), behavior: reduce ? 'auto' : 'smooth' });
  }
  prev.addEventListener('click', function () { go(-1); });
  next.addEventListener('click', function () { go(1); });
  window.addEventListener('resize', measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(cuts);   // the row's size settles after load (fonts, images): measure again then
  measure();
  window.cutsNav = { index: index, go: go };
})();
