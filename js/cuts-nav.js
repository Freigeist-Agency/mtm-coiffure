/* The services photos' nav on phones and tablets (cofounder, 2026-11-16): the same controls as the social slider (js/radial-slider.js,
   the same classes, so the same look): a round "previous" button, six dots, a round "next" button, under the swipeable row of
   photos (.cuts below 1024px). A button moves the row one photo (smoothly, at once under reduced motion); the dark dot is the photo
   at the row's start. Above 1023px the photos are a still staircase and the nav is hidden (css/v2.css).
   Endless (cofounder, 2026-11-19): below 1024px the row holds a copy of the six photos before and after the real ones (aria-hidden,
   class is-clone). Whenever the row comes to rest inside a copy (scrollend, and 150ms after the last scroll event, never with a finger down),
   it jumps by exactly one set of six to the same picture among the real ones, so the jump cannot be seen and neither swiping nor the
   buttons ever reach an end. The copies are removed at 1024px and up, where the staircase positions the six by nth-child.
   The row's pitch is measured on load, on resize and on a click; scrolling only reads scrollLeft. */
(function () {
  'use strict';
  var cuts = document.querySelector('.services .cuts');
  if (!cuts) return;
  var items = Array.prototype.slice.call(cuts.children);
  var n = items.length;
  if (n < 2) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = window.matchMedia('(max-width: 1023px)');

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

  /* the copies: one set before the real photos, one after */
  var clones = [];
  function copy() {
    var c = this.cloneNode(true);
    c.classList.add('is-clone'); c.setAttribute('aria-hidden', 'true');
    var img = c.querySelector('img'); if (img) img.alt = '';
    clones.push(c); return c;
  }
  function addClones() {
    if (clones.length) return;
    var before = document.createDocumentFragment(), after = document.createDocumentFragment();
    items.forEach(function (li) { before.appendChild(copy.call(li)); });
    items.forEach(function (li) { after.appendChild(copy.call(li)); });
    cuts.insertBefore(before, items[0]); cuts.appendChild(after);
  }
  function removeClones() { clones.forEach(function (c) { c.remove(); }); clones = []; }

  var pitch = 1, set = 0, active = -1;
  function left(el) { return el.getBoundingClientRect().left; }   /* exact (offsetLeft rounds to whole pixels: one set came out 4px long) */
  function looping() { return clones.length > 0; }
  /* where the row starts with photo i (0-5) of the real set */
  function home(i) { return set + i * pitch; }
  function size() {
    pitch = (left(items[1]) - left(items[0])) || 1;
    set = looping() ? left(items[0]) - left(cuts.children[0]) : 0;   /* the width of one set of six, pitch included */
  }
  /* inside a copy: more than half a photo before the real set's first photo or past its last */
  function inCopy(x) { return x < set - pitch / 2 || x > set * 2 - pitch / 2; }
  function measure() {   /* load, resize: the sizes change, so the row goes back to its photo among the real ones */
    var keep = looping() && set ? index() : 0;
    size();
    if (looping() && glide === null && inCopy(cuts.scrollLeft)) jumpTo(home(keep));
    sync();
  }
  function index() {
    var raw = Math.round((cuts.scrollLeft - set) / pitch);
    if (!looping()) { var max = cuts.scrollWidth - cuts.clientWidth; return cuts.scrollLeft >= max - 2 ? n - 1 : Math.max(0, Math.min(n - 1, raw)); }
    return ((raw % n) + n) % n;
  }
  function sync() {
    var i = index();
    if (i === active) return;
    if (active >= 0) dots[active].classList.remove('is-active');
    dots[i].classList.add('is-active'); active = i;
  }
  function jumpTo(x) { cuts.scrollTo({ left: x, behavior: 'instant' }); }
  /* at rest inside a copy: the same picture one set over. During a button's glide it waits until the glide has arrived (some
     browsers send no scroll event for up to a second mid-glide, and a jump then cut the glide short, between two photos) */
  var glide = null, glideUntil = 0;
  function settle() {
    if (!looping() || touching) return;
    var x = cuts.scrollLeft;
    if (glide !== null) {
      if (Math.abs(x - glide) > 1 && performance.now() < glideUntil) { clearTimeout(idle); idle = setTimeout(settle, 150); return; }
      glide = null;
    }
    if (x < set - pitch / 2) jumpTo(x + set);
    else if (x > set * 2 - pitch / 2) jumpTo(x - set);
  }

  var ticking = false, touching = false, idle = 0;
  var hasScrollEnd = 'onscrollend' in window;
  cuts.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; sync(); }); }
    clearTimeout(idle); idle = setTimeout(settle, 150);   /* also with scrollend: Chrome sends none for some programmatic scrolls */
  }, { passive: true });
  if (hasScrollEnd) cuts.addEventListener('scrollend', settle);
  cuts.addEventListener('touchstart', function () { touching = true; }, { passive: true });
  cuts.addEventListener('touchend', function () { touching = false; clearTimeout(idle); idle = setTimeout(settle, 150); }, { passive: true });
  cuts.addEventListener('touchcancel', function () { touching = false; }, { passive: true });

  function go(dir) {
    size();   /* a click: measuring here is cheap and never stale */
    if (!looping()) {
      var max = cuts.scrollWidth - cuts.clientWidth, i = Math.max(0, Math.min(n - 1, index() + dir));
      cuts.scrollTo({ left: Math.min(i * pitch, max), behavior: reduce ? 'auto' : 'smooth' });
      return;
    }
    /* from the photo the row is heading to (a click during a glide adds a photo), moved one set over first if that is a copy */
    var x = cuts.scrollLeft, base = glide !== null ? glide : set + Math.round((x - set) / pitch) * pitch;
    if (inCopy(base)) { var by = base < set ? set : -set; jumpTo(x + by); base += by; }
    glide = base + dir * pitch; glideUntil = performance.now() + 2000;
    cuts.scrollTo({ left: glide, behavior: reduce ? 'instant' : 'smooth' });
    if (reduce) { glide = null; settle(); }
  }
  prev.addEventListener('click', function () { go(-1); });
  next.addEventListener('click', function () { go(1); });

  function mode() {
    if (small.matches && !looping()) { addClones(); size(); jumpTo(home(0)); active = -1; }
    else if (!small.matches && looping()) { removeClones(); glide = null; set = 0; jumpTo(0); active = -1; }
    measure();
  }
  if (small.addEventListener) small.addEventListener('change', mode); else small.addListener(mode);
  window.addEventListener('resize', measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(cuts);   /* the row's size settles after load (fonts, images): measure again then */
  mode();
  window.cutsNav = { index: index, go: go };
})();
